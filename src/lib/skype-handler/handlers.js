const path = require('path');
// const fs = require('fs');

const log = require('../../modules/log')(module);
const skypeLib = require('../skype-lib/client');
const {
    getBody,
    toSkypeFormat,
    getRoomAlias,
    getServiceName: getRoomAliasName,
    getMatrixUser,
    getBufferAndType,
    getInvitedUsers,
    getFullSizeImgUrl,
    getImageOpts,
    // getImgLinkBody,
} = require('../../utils');

module.exports = state => {
    const {puppet, skypeClient, bridge} = state;
    const {getSkypeRoomData, getPayload, getSkypeReqOptions} = skypeLib(skypeClient);

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

    const downloadImage = url => {
        const fullSizeUrl = getFullSizeImgUrl(url);
        const reqOptions = getSkypeReqOptions();
        return getBufferAndType(fullSizeUrl, reqOptions);
    };

    const getContent = async (client, {buffer, type}, name) => {
        const uploadContentInfo = await client.uploadContent(buffer, {name, type, rawResponse: false});
        log.debug('uploadContentInfo for skype image %s is ', name, uploadContentInfo);

        return uploadContentInfo.content_uri || uploadContentInfo;
    };

    const handleSkypeImage = async ({userData, body: {body}}, matrixRoomId, url) => {
        const client = await getUserClient(matrixRoomId, userData);

        try {
            const imgData = await downloadImage(url);
            log.debug('Image data received');
            const imageOpts = getImageOpts(imgData);
            const content = await getContent(client, imgData, body);

            return client.sendImageMessage(matrixRoomId, content, imageOpts, body);
        } catch (err) {
            log.warn('upload error', err);
            const errBody = getBody(url, userData.senderId);

            return client.sendMessage(matrixRoomId, errBody);
        }
    };

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

        imageHandler: async data => {
            const payload = await getPayload(data);

            try {
                const matrixRoomId = await getMatrixRoom(payload.roomId);
                return handleSkypeImage(payload, matrixRoomId, data.uri);
            } catch (err) {
                log.error('imageHandler Error', err);
                // const body = getImgLinkBody(fileName, uri, payload.userData.senderId);

                // return sendMessage(matrixRoomId, body);
            }
        },
        testOnly: {
            getIntentFomSkypeSender,
        },
    };
};
