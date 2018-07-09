const path = require('path');
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

const setGhostAvatar = async (ghostIntent, avatarUrl) => {
    const client = ghostIntent.getClient();
    log.debug('downloading avatar from public web', avatarUrl);
    const {buffer, type} = await getBufferAndType(avatarUrl);
    const opts = {
        name: path.basename(avatarUrl),
        type,
        rawResponse: false,
    };

    const {content_uri: contentUri} = await client.uploadContent(buffer, opts);
    log.debug('uploaded avatar and got back content uri', contentUri);

    return ghostIntent.setAvatarUrl(contentUri);
};

const updateIntentProfile = async (ghostIntent, {senderId, senderName, avatarUrl}) => {
    const client = ghostIntent.getClient();

    const {avatar_url: currentAvatarUrl, displayName} = await ghostIntent.getProfileInfo(client.credentials.userId);
    const promiseList = [];

    if (!displayName && senderName) {
        promiseList.push(ghostIntent.setDisplayName(senderName));
    }
    if (!currentAvatarUrl && avatarUrl) {
        promiseList.push(setGhostAvatar(ghostIntent, avatarUrl));
    }

    return Promise.all(promiseList);
};

const getContent = async (client, {buffer, type}, name) => {
    try {
        const uploadContentInfo = await client.uploadContent(buffer, {name, type, rawResponse: false});
        log.debug('uploadContentInfo for skype image %s is ', name, uploadContentInfo);

        return uploadContentInfo.content_uri || uploadContentInfo;
    } catch (err) {
        log.error('uploadContent error', err);
    }
};

module.exports = state => {
    const {puppet, skypeClient, bridge} = state;
    const {getSkypeRoomData, getPayload, getSkypeReqOptions} = skypeLib(skypeClient);

    const getUserClient = async (roomId, userData) => {
        const {senderId, senderName} = userData;
        log.debug('get user client for skype user %s (%s)', senderId, senderName);
        try {
            const ghostIntent = bridge.getIntent(getMatrixUser(senderId));

            await updateIntentProfile(ghostIntent, userData);
            await ghostIntent.join(roomId);

            return ghostIntent.getClient();
        } catch (err) {
            log.warn('Can\'t get Intent for user %s. Error: ', toSkypeFormat(senderId), err);

            return puppet.getClient();
        }
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

    const sendImageMessage = async ({userData, body: {body}}, matrixRoomId, url) => {
        const client = await getUserClient(matrixRoomId, userData);
        const imgData = await downloadImage(url);
        log.debug('Image data for %s received', url);

        const imageOpts = getImageOpts(imgData);
        const content = await getContent(client, imgData, body);
        return content ?
            client.sendImageMessage(matrixRoomId, content, imageOpts, body) :
            client.sendMessage(matrixRoomId, getBody(url, userData.senderId));
    };

    const sendTextMessage = async ({body, userData}, matrixRoomId) => {
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

    const handleData = async (data, func) => {
        try {
            const payload = await getPayload(data);
            const {body, userData, roomId} = payload;
            const matrixRoomId = await getMatrixRoom(roomId);

            log.debug('sending message with body', body);
            log.debug('from skype to Matrix room', roomId);
            log.debug('as Matrix intent', userData);

            await func(payload, matrixRoomId, data.uri);

            return inviteSkypeConversationMembers(data.conversation, matrixRoomId);
        } catch (error) {
            log.error('Error in %s', func.name, error);
        }
    };

    return {
        messageHandler: data => handleData(data, sendTextMessage),

        imageHandler: data => handleData(data, sendImageMessage),

        // TODO maybe try to send if error received
        // const body = getImgLinkBody(fileName, uri, payload.userData.senderId);
        // return sendMessage(matrixRoomId, body);
        testOnly: {
            getUserClient,
        },
    };
};
