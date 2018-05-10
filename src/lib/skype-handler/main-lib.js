const path = require('path');
const fs = require('fs');
const {RemoteUser} = require('matrix-appservice-bridge');

const log = require('../../modules/log')(module);
const config = require('../../config');
const {autoTagger, isFilenameTagged, download} = require('../../utils');
const clientData = require('../skype-lib/client');

const {
    getRoomAliasFromThirdPartyRoomId,
    tagMatrixMessage,
    getRoomAliasLocalPartFromThirdPartyRoomId,
    isTaggedMatrixMessage,
    getGhostUserFromThirdPartySenderId,
    allowNullSenderName,
} = config.clientData;

module.exports = state => {
    const {puppet, skypeClient, bridge} = state;

    const {
        getThirdPartyUserDataById,
        getThirdPartyRoomDataById,
    } = clientData(skypeClient);


    const setGhostAvatar = (ghostIntent, avatarUrl) => {
        const client = ghostIntent.getClient();

        return ghostIntent.getProfileInfo(client.credentials.userId, 'avatar_url').then(({avatar_url: avatarUrl}) => {
            if (avatarUrl) {
                log.debug('refusing to overwrite existing avatar');
                return null;
            }
            log.debug('downloading avatar from public web', avatarUrl);
            return download.getBufferAndType(avatarUrl).then(({buffer, type}) => {
                const opts = {
                    name: path.basename(avatarUrl),
                    type,
                    rawResponse: false,
                };
                return client.uploadContent(buffer, opts);
            }).then(res => {
                const contentUri = res.content_uri;
                log.debug('uploaded avatar and got back content uri', contentUri);
                return ghostIntent.setAvatarUrl(contentUri);
            });
        });
    };

    const getIntentFromThirdPartySenderId = (userId, name, avatarUrl) => {
        const ghostIntent = bridge.getIntent(getGhostUserFromThirdPartySenderId(userId));

        const promiseList = [];
        if (name) {
            promiseList.push(ghostIntent.setDisplayName(name));
        }
        if (avatarUrl) {
            promiseList.push(setGhostAvatar(ghostIntent, avatarUrl));
        }

        return Promise.all(promiseList).then(() => ghostIntent);
    };

    const getOrInitRemoteUserStoreDataFromThirdPartyUserId = thirdPartyUserId => {
        const userStore = bridge.getUserStore();
        return userStore.getRemoteUser(thirdPartyUserId).then(rUser => {
            if (rUser) {
                log.debug('found existing remote user in store', rUser);
                return rUser;
            }
            log.debug('did not find existing remote user in store, we must create it now');
            return getThirdPartyUserDataById(thirdPartyUserId).then(thirdPartyUserData => {
                log.debug('got 3p user data:', thirdPartyUserData);
                return new RemoteUser(thirdPartyUserId, {
                    senderName: thirdPartyUserData.senderName,
                }).then(rUser => userStore.setRemoteUser(rUser)).then(() => userStore.getRemoteUser(thirdPartyUserId))
                    .then(rUser => rUser);
            });
        });
    };


    const getUserClient = (roomId, senderId, senderName, avatarUrl, doNotTryToGetRemoteUserStoreData) => {
        log.debug('get user client for third party user %s (%s)', senderId, senderName);

        if (!senderId) {
            return Promise.resolve(puppet.getClient());
        }
        if (!senderName && !allowNullSenderName) {
            if (doNotTryToGetRemoteUserStoreData) {
                throw new Error('preventing an endless loop');
            }

            log.debug('no senderName provided with payload, will check store');
            return getOrInitRemoteUserStoreDataFromThirdPartyUserId(senderId).then(remoteUser => {
                log.debug('got remote user from store, with a possible client API call in there somewhere', remoteUser);
                log.debug('will retry now');
                const senderName = remoteUser.get('senderName');
                return getUserClient(roomId, senderId, senderName, avatarUrl, true);
            });
        }

        log.debug('this message was not sent by me');
        return getIntentFromThirdPartySenderId(senderId, senderName, avatarUrl)
            .then(ghostIntent => ghostIntent.join(roomId).then(() => ghostIntent.getClient()));
    };


    const handleThirdPartyRoomImageMessage = data => {
        log.debug('handling third party room image message', data);
        const {
            roomId,
            senderName,
            senderId,
            avatarUrl,
            text,
            // either one is fine
            url, path, buffer,
            h,
            w,
            mimetype,
        } = data;

        return getOrCreateMatrixRoomFromThirdPartyRoomId(roomId).then(matrixRoomId =>
            getUserClient(matrixRoomId, senderId, senderName, avatarUrl).then(client => {
                if (!senderId) {
                    log.debug('this message was sent by me, but did it come from a matrix client or a 3rd party client?');
                    log.debug('if it came from a 3rd party client, we want to repeat it as a \'notice\' type message');
                    log.debug('if it came from a matrix client, then it\'s already in the client, sending again would dupe');
                    log.debug('we use a tag on the end of messages to determine if it came from matrix');

                    if (typeof text === 'undefined') {
                        log.debug('we can\'t know if this message is from matrix or not, so just ignore it');
                        return;
                    } else if (isTaggedMatrixMessage(text) || isFilenameTagged(path)) {
                        log.debug('it is from matrix, so just ignore it.');
                        return;
                    }
                    log.debug('it is from 3rd party client');
                }

                const upload = (buffer, opts) => client.uploadContent(buffer, Object.assign({
                    name: text,
                    type: mimetype,
                    rawResponse: false,
                }, opts || {})).then(res =>
                    ({
                        'content_uri': res.content_uri || res,
                        'size': buffer.length,
                    }));

                let promise;
                if (url) {
                    promise = () =>
                        download.getBufferAndType(url).then(({buffer, type}) =>
                            upload(buffer, {type: mimetype || type}));
                } else if (path) {
                    promise = () =>
                        Promise.promisify(fs.readFile)(path).then(buffer =>
                            upload(buffer));
                } else if (buffer) {
                    promise = () => upload(buffer);
                } else {
                    promise = Promise.reject(new Error('missing url or path'));
                }

                const tag = autoTagger(senderId, tagMatrixMessage);

                promise().then(({content_uri: content, size}) => {
                    log.debug('uploaded to', content);
                    const msg = tag(text);
                    const opts = {mimetype, h, w, size};
                    return client.sendImageMessage(matrixRoomId, content, opts, msg);
                }, err => {
                    log.log.warn('upload error', err);

                    const opts = {
                        body: tag(url || path || text),
                        msgtype: 'm.text',
                    };
                    return client.sendMessage(matrixRoomId, opts);
                });
            }));
    };

    const getIntentFromApplicationServerBot = () => bridge.getIntent();


    const getOrCreateMatrixRoomFromThirdPartyRoomId = thirdPartyRoomId => {
        const roomAlias = getRoomAliasFromThirdPartyRoomId(thirdPartyRoomId);
        const roomAliasName = getRoomAliasLocalPartFromThirdPartyRoomId(thirdPartyRoomId);
        log.debug('looking up', thirdPartyRoomId);
        const puppetClient = puppet.getClient();
        const botIntent = getIntentFromApplicationServerBot();
        const botClient = botIntent.getClient();

        return puppetClient.getRoomIdForAlias(roomAlias).then(({room_id: roomId}) => {
            log.debug('found matrix room via alias. room_id:', roomId);
            return roomId;
        }, _err => {
            log.debug('the room doesn\'t exist. we need to create it for the first time');
            return Promise.resolve(getThirdPartyRoomDataById(thirdPartyRoomId)).then(thirdPartyRoomData => {
                log.debug('got 3p room data', thirdPartyRoomData);
                const {name, topic} = thirdPartyRoomData;
                log.debug('creating room !!!!', `>>>>${roomAliasName}<<<<`, name, topic);
                return botIntent.createRoom({
                    // bot won't auto-join the room in this case
                    createAsClient: true,
                    options: {
                        name, topic, 'room_alias_name': roomAliasName,
                    },
                }).then(({room_id: roomId}) => {
                    log.debug('room created', roomId, roomAliasName);
                    return roomId;
                });
            });
        }).then(matrixRoomId => {
            log.debug('making puppet join room', matrixRoomId);
            return puppetClient.joinRoom(matrixRoomId).catch(err => {
                if (err.message === 'No known servers') {
                    log.log.warn('we cannot use this room anymore because you cannot currently rejoin an empty room (synapse limitation? riot throws this error too). we need to de-alias it now so a new room gets created that we can actually use.');
                    return botClient.deleteAlias(roomAlias).then(() => {
                        log.log.warn('deleted alias... trying again to get or create room.');
                        return getOrCreateMatrixRoomFromThirdPartyRoomId(thirdPartyRoomId);
                    });
                }
                log.log.warn('ignoring error from puppet join room: ', err.message);
                return matrixRoomId;
            });
        })
            .then(matrixRoomId => {
                puppet.saveThirdPartyRoomId(matrixRoomId, thirdPartyRoomId);
                return matrixRoomId;
            });
    };


    const handleThirdPartyRoomMessage = thirdPartyRoomMessageData => {
        log.debug('handling third party room message', thirdPartyRoomMessageData);
        const {
            roomId,
            senderName,
            senderId,
            avatarUrl,
            text,
            html,
        } = thirdPartyRoomMessageData;

        return getOrCreateMatrixRoomFromThirdPartyRoomId(roomId)
            .then(matrixRoomId => getUserClient(matrixRoomId, senderId, senderName, avatarUrl)
                .then(client => {
                    if (!senderId) {
                        log.debug('this message was sent by me, but did it come from a matrix client or a 3rd party client?');
                        log.debug('if it came from a 3rd party client, we want to repeat it as a \'notice\' type message');
                        log.debug('if it came from a matrix client, then it\'s already in the client, sending again would dupe');
                        log.debug('we use a tag on the end of messages to determine if it came from matrix');

                        if (isTaggedMatrixMessage(text)) {
                            log.debug('it is from matrix, so just ignore it.');
                            return;
                        }
                        log.debug('it is from 3rd party client');
                    }
                    const tag = autoTagger(senderId, tagMatrixMessage);

                    if (html) {
                        return client.sendMessage(matrixRoomId, {
                            'body': tag(text),
                            'formatted_body': html,
                            'format': 'org.matrix.custom.html',
                            'msgtype': 'm.text',
                        });
                    }
                    return client.sendMessage(matrixRoomId, {
                        body: tag(text),
                        msgtype: 'm.text',
                    });
                })).catch(err => {
                log.error('handleThirdPartyRoomMessage', err);
            });
    };

    return {
        getOrCreateMatrixRoomFromThirdPartyRoomId,
        handleThirdPartyRoomMessage,
        handleThirdPartyRoomImageMessage,
    };
};
