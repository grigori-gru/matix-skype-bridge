const path = require('path');
// const fs = require('fs');

const log = require('../../modules/log')(module);
const skypeLib = require('../skype-lib/client');
const {
    toSkypeFormat,
    getRoomAlias,
    getServiceName: getRoomAliasName,
    getMatrixUser,
    getBufferAndType,
    getInvitedUsers,
} = require('../../utils');

module.exports = state => {
    const {puppet, skypeClient, bridge} = state;
    const {getSkypeRoomData, getPayload} = skypeLib(skypeClient);

    const setGhostAvatar = async (ghostIntent, avatarUrl) => {
        const client = ghostIntent.getClient();
        log.debug('downloading avatar from public web', avatarUrl);
        const {buffer, type} = await getBufferAndType(avatarUrl);
        const opts = {
            name: path.basename(avatarUrl),
            type,
            rawResponse: false,
        };
        log.debug(client);
        const {content_uri: contentUri} = await client.uploadContent(buffer, opts);
        log.debug('uploaded avatar and got back content uri', contentUri);

        return ghostIntent.setAvatarUrl(contentUri);
    };

    const getIntentFomSkypeSender = async (roomId, userId, name, avatarUrl) => {
        log.debug('this message was not sent by me');
        const ghostIntent = bridge.getIntent(getMatrixUser(userId));
        const client = ghostIntent.getClient();

        const {avatar_url: currentAvatarUrl, displayName} = await ghostIntent.getProfileInfo(client.credentials.userId);
        const promiseList = [];

        if (!displayName && name) {
            promiseList.push(ghostIntent.setDisplayName(name));
        }
        if (!currentAvatarUrl && avatarUrl) {
            promiseList.push(setGhostAvatar(ghostIntent, avatarUrl));
        }

        await Promise.all(promiseList);
        await ghostIntent.join(roomId);

        return ghostIntent.getClient();
    };

    const getUserClient = (roomId, userData, doNotTryToGetRemoteUserStoreData) => {
        const {senderId, senderName, avatarUrl} = userData;
        log.debug('get user client for skype user %s (%s)', toSkypeFormat(senderId), senderName);

        return senderId ?
            getIntentFomSkypeSender(roomId, senderId, senderName, avatarUrl) :
            puppet.getClient();
    };

    const createRoom = async skypeRoomId => {
        const roomAliasName = getRoomAliasName(skypeRoomId);
        log.debug('creating room !!!!', `>>>>${roomAliasName}<<<<`);
        const skypeRoomData = await getSkypeRoomData(skypeRoomId);
        const options = {
            ...skypeRoomData,
            'room_alias_name': roomAliasName,
        };
        const botIntent = bridge.getIntent();
        const {room_id: newRoomId} = await botIntent.createRoom({createAsClient: true, options});
        log.debug('room created', newRoomId, roomAliasName);
        log.debug('making puppet join room', newRoomId);
        const isServerError = await puppet.joinRoom(newRoomId);

        if (isServerError) {
            const botClient = botIntent.getClient();
            await botClient.deleteAlias(getRoomAlias(skypeRoomId));
            log.warn('deleted alias... trying again to get or create room.');

            // eslint-disable-next-line
            return getMatrixRoom(skypeRoomId);
        }

        return newRoomId;
    };

    const getMatrixRoom = async skypeRoomId => {
        const roomAlias = getRoomAlias(skypeRoomId);
        log.debug('looking up room with alias', roomAlias);
        const curRoomId = await puppet.getRoom(roomAlias);

        return curRoomId || createRoom(skypeRoomId);
    };

    // TODO: image handle will be next
    // const handleSkypeImage = async data => {
    //     log.debug('handling skype image message', data);
    //     const {
    //         roomId,
    //         senderName,
    //         senderId,
    //         avatarUrl,
    //         text,
    //         // either one is fine
    //         url, path, buffer,
    //         h,
    //         w,
    //         type: mimetype,
    //     } = data;

    //     const matrixRoomId = await getMatrixRoom(roomId);
    //     const client = await getUserClient(matrixRoomId, senderId, senderName, avatarUrl);
    //     if (!senderId) {
    //         log.debug('this message was sent by me, but did it come from a matrix client or a skype client?');
    //     }

    //     const upload = (buffer, opts) => client.uploadContent(buffer, Object.assign({
    //         name: text,
    //         type: mimetype,
    //         rawResponse: false,
    //     }, opts || {})).then(res =>
    //         ({
    //             'content_uri': res.content_uri || res,
    //             'size': buffer.length,
    //         }));

    //     let promise;
    //     if (url) {
    //         promise = () =>
    //             getBufferAndType(url).then(({buffer, type}) =>
    //                 upload(buffer, {type: mimetype || type}));
    //     } else if (path) {
    //         promise = () =>
    //             Promise.promisify(fs.readFile)(path).then(buffer =>
    //                 upload(buffer));
    //     } else if (buffer) {
    //         promise = () => upload(buffer);
    //     } else {
    //         promise = Promise.reject(new Error('missing url or path'));
    //     }

    //     const tag = autoTagger(senderId, tagMatrixMessage);

    //     promise().then(({content_uri: content, size}) => {
    //         log.debug('uploaded to', content);
    //         const msg = tag(text);
    //         const opts = {mimetype, h, w, size};
    //         return client.sendImageMessage(matrixRoomId, content, opts, msg);
    //     }, err => {
    //         log.warn('upload error', err);

    //         const opts = {
    //             body: tag(url || path || text),
    //             msgtype: textMatrixType,
    //         };
    //         return client.sendMessage(matrixRoomId, opts);
    //     });
    // };

    const sendMessage = async ({body, userData, roomId}, matrixRoomId) => {
        log.debug('sending message with body', body);
        log.debug('from skype to Matrix room', roomId);
        log.debug('as Matrix intent', userData);

        const client = await getUserClient(matrixRoomId, userData);
        return client.sendMessage(matrixRoomId, body);
    };

    const inviteSkypeConversationMembers = async (skypeRoom, matrixRoomId) => {
        // TODO: find a better way to invite real matrix according to skype conversation member
        try {
            const {members: skypeRoomMembers} = await skypeClient.getConversation(skypeRoom);
            const matrixRoomMembers = puppet.getMatrixRoomMembers(matrixRoomId);
            const invitedUsers = getInvitedUsers(skypeRoomMembers, matrixRoomMembers);
            log.debug('invitedUsers', invitedUsers);

            return puppet.invite(matrixRoomId, invitedUsers);
        } catch (err) {
            log.error('inviteSkypeConversationMembers error', err);
        }
    };

    return {
        messageHandler: async data => {
            try {
                const payload = await getPayload(data);
                const matrixRoomId = await getMatrixRoom(payload.roomId);
                await sendMessage(payload, matrixRoomId);

                return inviteSkypeConversationMembers(data.conversation, matrixRoomId);
            } catch (err) {
                log.error('messageHandler error', err);
            }
        },

        // imageHandler: async data => {
        //     const name = data.original_file_name;
        //     const payload = {
        //         ...await getPayload(data),
        //         text: name,
        //         path: '',
        //     };
        //     const url = `${data.uri}/views/imgpsh_fullsize`;
        //     try {
        //         // const {buffer, type} = await downloadImage(url);
        //         // return handleSkypeImage({payload, buffer, type});
        //     } catch (err) {
        //         log.error(err);
        //         const text = `[Image] (${name}) ${url}`;
        //         return sendMessage({...payload, text});
        //     }
        // },
        testOnly: {
            getIntentFomSkypeSender,
        },
    };
};
