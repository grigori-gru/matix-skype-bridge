const {Bridge, RemoteUser} = require('matrix-appservice-bridge');
const path = require('path');
const fs = require('fs');
const tmp = require('tmp');

const config = require('../config.json');
const log = require('./src/modules/log')(module);
const {skypeify, deskypeify} = require('./skypeify');
const {autoTagger, isFilenameTagged, a2b, b2a, setRoomAlias, getSkypeMatrixUsers, getMatrixUsers, getDisplayName, getRoomName, download, entities} = require('./utils');

const {domain} = config.bridge;

const getServicePrefix = () => 'skype';
const getRoomAliasLocalPartFromThirdPartyRoomId = id => `${getServicePrefix()}_${id}`;
const defaultDeduplicationTag = () => ' \ufeff';
const defaultDeduplicationTagPattern = () => ' \\ufeff$';
const deduplicationTag = config.deduplicationTag || defaultDeduplicationTag();
const deduplicationTagPattern = config.deduplicationTagPattern || defaultDeduplicationTagPattern();
const deduplicationTagRegex = new RegExp(deduplicationTagPattern);
const tagMatrixMessage = text => `${text}${deduplicationTag}`;
const isTaggedMatrixMessage = text => deduplicationTagRegex.test(text);

const getGhostUserFromThirdPartySenderId = id => `@${getServicePrefix()}_${id}:${domain}`;
const getRoomAliasFromThirdPartyRoomId = id => `#${getRoomAliasLocalPartFromThirdPartyRoomId(id)}:${domain}`;

module.exports = (puppet, baseBridge, skypeClient) => {
    const setupBridge = config =>
        new Bridge(Object.assign({}, config.bridge, {
            controller: {
                onUserQuery: queriedUser => {
                    log.info('got user query', queriedUser);
                    // auto provision users w no additional data
                    return {};
                },
                onEvent: handleMatrixEvent,
                onAliasQuery: () => {
                    log.info('on alias query');
                },
                thirdPartyLookup: {
                    protocols: [getServicePrefix()],
                    getProtocol: () => log.info('get proto'),
                    getLocation: () => log.info('get loc'),
                    getUser: () => log.info('get user'),
                },
            },
        }));
    const bridge = baseBridge || setupBridge(config);

    const getThirdPartyRoomIdFromMatrixRoomId = matrixRoomId => {
        const patt = new RegExp(`^#${getServicePrefix()}_(.+)$`);
        const room = puppet.getClient().getRoom(matrixRoomId);
        log.debug('reducing array of alases to a 3prid');
        return room.getAliases().reduce((result, alias) => {
            const localpart = alias.replace(`:${domain}`, '');
            const matches = localpart.match(patt);
            return matches ? matches[1] : result;
        }, null);
    };

    const invitePuppetUserToSkypeConversation = (invitedUser, matrixRoomId) => {
        const skypeRoomId = b2a(getThirdPartyRoomIdFromMatrixRoomId(matrixRoomId));
        const [skypeUser] = getSkypeMatrixUsers(skypeClient.contacts, [invitedUser]);

        if (skypeUser) {
            return skypeClient.addMemberToConversation(skypeRoomId, skypeUser);
        }
    };

    const handleMatrixMemberEvent = data => {
        const {room_id: matrixRoomId, membership, state_key: invitedUser} = data;
        const puppetClient = puppet.getClient();

        if (membership === 'invite' && invitedUser.includes('skype_') && invitedUser !== puppetClient.getUserId()) {
            const bot = bridge.getBot();
            const botClient = bot.getClient();
            const isJoined = puppetClient.getRooms()
                .find(({roomId}) => roomId === matrixRoomId);
            const invitedUserIntent = bridge.getIntent(invitedUser);

            if (isJoined) {
                return invitePuppetUserToSkypeConversation(invitedUser, matrixRoomId)
                    .catch(err =>
                        log.error(err));
            }
            const onRoomNameAndUserCollection = (usersCollection, roomName) => {
                const users = Object.keys(usersCollection);
                const skypeMatrixUsers = getSkypeMatrixUsers(skypeClient.contacts, users);
                const allUsers = {users: skypeMatrixUsers, admins: [skypeClient.getSkypeBotId()]};
                return skypeClient.createConversationWithTopic({topic: roomName, allUsers});
            };


            return invitedUserIntent.join(matrixRoomId)
                .then(() =>
                    invitedUserIntent.invite(matrixRoomId, puppetClient.getUserId()))
                .then(() =>
                    puppetClient.joinRoom(matrixRoomId))
                .then(() =>
                    invitedUserIntent.invite(matrixRoomId, bot.getUserId()))
                .then(() =>
                    botClient.joinRoom(matrixRoomId))
                .then(() =>
                    getRoomName(matrixRoomId))
                .then(roomName =>
                    bot.getJoinedMembers(matrixRoomId)
                        .then(usersCollection =>
                            onRoomNameAndUserCollection(usersCollection, roomName)))
                .then(skypeRoomId => {
                    log.debug('Skype room %s is made', skypeRoomId);
                    const alias = getRoomAliasFromThirdPartyRoomId(a2b(skypeRoomId));
                    return setRoomAlias(matrixRoomId, alias);
                })
                .catch(err =>
                    log.error(err));
        }
        return log.debug('ignored a matrix event');
    };

    const sendImageMessageAsPuppetToThirdPartyRoomWithId = (id, data) => {
        let cleanup = () => {};
        return new Promise((resolve, reject) => {
            tmp.file((err, path, fd, cleanupCallback) => {
                cleanup = cleanupCallback;
                const tmpFile = fs.createWriteStream(path);
                download.getBufferAndType(data.url).then(({buffer, type}) => {
                    tmpFile.write(buffer, err => {
                        if (err) {
                            reject(err);
                            return;
                        }
                        tmpFile.close(() => {
                            resolve(skypeClient.sendPictureMessage(b2a(id), {
                                file: path,
                                name: data.text,
                                url: data.url,
                            }));
                        });
                    });
                });
            });
        }).finally(() => {
            cleanup();
        });
    };

    const sendMessageAsPuppetToThirdPartyRoomWithId = (id, text, {sender}) => getDisplayName(sender)
        .then(displayName => `${displayName}:\n${text}`)
        .then(textWithSenderName => skypeClient.sendMessage(b2a(id), {
            textContent: skypeify(textWithSenderName),
        }));

    const handleMatrixMessageEvent = data => {
        const {room_id: roomId, content: {body, msgtype}} = data;

        let promise;

        if (isTaggedMatrixMessage(body)) {
            log.debug('ignoring tagged message, it was sent by the bridge');
            return;
        }

        const thirdPartyRoomId = getThirdPartyRoomIdFromMatrixRoomId(roomId);

        const msg = tagMatrixMessage(body);

        if (msgtype === 'm.text') {
            promise = () => sendMessageAsPuppetToThirdPartyRoomWithId(thirdPartyRoomId, msg, data);
        } else if (msgtype === 'm.image') {
            log.debug('picture message from riot');

            const url = puppet.getClient().mxcUrlToHttp(data.content.url);
            promise = () => sendImageMessageAsPuppetToThirdPartyRoomWithId(thirdPartyRoomId, {
                url, text: tagMatrixMessage(body),
                mimetype: data.content.log.debug.mimetype,
                width: data.content.log.debug.w,
                height: data.content.log.debug.h,
                size: data.content.log.debug.size,
            }, data);
        } else {
            promise = () => Promise.reject(new Error('dont know how to handle this msgtype', msgtype));
        }

        return promise().catch(err => {
            log.error('handleMatrixMessageEvent', err);
        });
    };

    const handleMatrixEvent = (req, _context) => {
        const data = req.getData();
        if (data.type === 'm.room.message') {
            log.debug('incoming message. data:', data);
            return handleMatrixMessageEvent(data);
        } else if (data.type === 'm.room.member') {
            log.debug('incoming message. data:', data);
            return handleMatrixMemberEvent(data);
        }
        return log.debug('ignored a matrix event', data.type);
    };


    const allowNullSenderName = false;
    log.debug('initialized');

    // puppet.setApp(this)
    const getThirdPartyUserDataById = id => {
        const raw = b2a(id);
        return Promise.resolve(getThirdPartyUserDataByIdNoPromise(raw));
    };
    const getThirdPartyRoomDataById = id => {
        const raw = b2a(id);
        const contact = skypeClient.getContact(raw);
        if (contact) {
            return Promise.resolve({
                name: deskypeify(contact.displayName),
                topic: 'Skype Direct Message',
            });
        }
        return new Promise((resolve, reject) => {
            skypeClient.getConversation(raw).then(res => {
                resolve({
                    name: deskypeify(res.threadProperties.topic),
                    topic: res.type.toLowerCase() === 'conversation' ? 'Skype Direct Message' : 'Skype Group Chat',
                });
            }).catch(err => {
                reject(err);
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

    const getIntentFromApplicationServerBot = () => bridge.getIntent();

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

    const getOrCreateMatrixRoomFromThirdPartyRoomId = thirdPartyRoomId => {
        const roomAlias = getRoomAliasFromThirdPartyRoomId(thirdPartyRoomId);
        const roomAliasName = getRoomAliasLocalPartFromThirdPartyRoomId(thirdPartyRoomId);
        log.debug('looking up', thirdPartyRoomId);
        const puppetClient = puppet.getClient();
        const botIntent = getIntentFromApplicationServerBot();
        const botClient = botIntent.getClient();
        const puppetUserId = puppetClient.credentials.userId;

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
            return puppetClient.joinRoom(matrixRoomId).then(() => {
            }, err => {
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

    const handleThirdPartyRoomImageMessage = thirdPartyRoomImageMessageData => {
        log.debug('handling third party room image message', thirdPartyRoomImageMessageData);
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
        } = thirdPartyRoomImageMessageData;

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
                            'msgtype': 'm.text'
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

    const sentHandler = data => {
        log.debug('sent', data);
        const {type, conversation, content} = data;
        const roomId = a2b(conversation);
        return handleSkypeMessage({
            type,
            roomId,
            sender: null,
            content,
        });
    };

    const messageHandler = data => {
        log.debug('message', data);
        const {
            type,
            from: {raw},
            conversation,
            content,
        } = data;
        const roomId = a2b(conversation);

        return handleSkypeMessage({
            type,
            roomId,
            sender: raw,
            content,
        })
            .then(() =>
                inviteSkypeConversationMembers(roomId, conversation))
            .catch(err =>
                log.error('Error in skype message event', err));
    };

    const imageHandler = data => {
        const {
            type,
            from: {raw},
            conversation,
            uri,
            original_file_name: name,
        } = data;
        return handleSkypeImage({
            type,
            roomId: a2b(conversation),
            sender: raw,
            url: `${uri}/views/imgpsh_fullsize`,
            name,
        });
    };

    const eventEvent = event => {
        if (event && event.resource) {
            const data = event.resource;
            switch (data.type) {
                case 'Text':
                case 'RichText':
                // TODO: try to change this one
                    if (data.from.username === api.context.username) {
                    // the lib currently hides this kind from us. but i want it.
                        if (data.content.slice(-1) !== '\ufeff') {
                            return sentHandler(data);
                        }
                    } else {
                        return messageHandler(data);
                    }
                    break;
                case 'RichText/UriObject':
                    if (!removeSelfSentFile(data.original_file_name)) {
                        if (data.from.username === api.context.username) {
                            data.from.raw = null;
                        }
                        return imageHandler(data);
                    }
                    break;
            }
        }
    };

    const errorEvent = err => {
        log.error('An error was detected:\n', err);
    };

    const initThirdPartyClient = async () => {
        skypeClient = await skypeClient(config.skype);

        skypeClient.on('error', errorEvent);
        skypeClient.on('event', eventEvent);

        return skypeClient.connect();
    };
    const getJoinUrl = id => skypeClient.getJoinUrl(id)
        .catch(err => log.error(err));
    const inviteSkypeConversationMembers = (roomId, conversation) => {
        let matrixMembers;

        return skypeClient.getConversation(conversation)
            .then(skypeRoom => {
                const {members} = skypeRoom;
                matrixMembers = getMatrixUsers(members);
                return getOrCreateMatrixRoomFromThirdPartyRoomId(roomId);
            })
            .then(matrixRoomId => {
                const roomMembers = puppet.getMatrixRoomMembers(matrixRoomId);
                const filteredUsers = matrixMembers.filter(user => !roomMembers.includes(user));
                if (filteredUsers.length === 0) {
                    log.debug('All members in skype conversation are already joined in Matrix room: ', matrixRoomId);
                } else {
                    return Promise.all(filteredUsers.map(user => puppet.client.invite(matrixRoomId, user)))
                        .then(() => log.debug('New users invited to room: ', roomId));
                }
            })
            .catch(err => log.error(err));
    };

    const getThirdPartyUserDataByIdNoPromise = thirdPartySender => {
        const contact = skypeClient.getContact(thirdPartySender);
        const payload = {};
        if (contact) {
            payload.senderName = contact.displayName;
            payload.avatarUrl = contact.profile.avatarUrl;
        } else if (thirdPartySender.indexOf(':') > -1) {
            payload.senderName = thirdPartySender.substr(thirdPartySender.indexOf(':') + 1);
            payload.avatarUrl = `https://avatars.skype.com/v1/avatars/${entities.encode(payload.senderName)}/public?returnDefaultImage=false&cacheHeaders=true`;
        } else {
            payload.senderName = thirdPartySender;
        }
        return payload;
    };

    const getPayload = data => {
        const payload = {
            roomId: data.roomId.replace(':', '^'),
        };
        if (data.sender) {
            payload.senderId = a2b(data.sender);
            Object.assign(payload, getThirdPartyUserDataByIdNoPromise(data.sender));
        } else {
            payload.senderId = null;
        }
        log.debug(payload);
        return payload;
    };

    const handleSkypeMessage = data => {
        const payload = getPayload(data);
        payload.text = deskypeify(data.content);
        return handleThirdPartyRoomMessage(payload);
    };
    const handleSkypeImage = data => {
        const payload = getPayload(data);
        payload.text = data.name;
        payload.path = '';
        // needed to not create internal errors
        return skypeClient.downloadImage(data.url).then(({buffer, type}) => {
            payload.buffer = buffer;
            payload.mimetype = type;
            return handleThirdPartyRoomImageMessage(payload);
        }).catch(err => {
            log.error(err);
            payload.text = `[Image] (${data.name}) ${data.url}`;
            return handleThirdPartyRoomMessage(payload);
        });
    };
};
