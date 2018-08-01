const log = require('../../modules/log')(module);
const skypeApi = require('../skype-lib/client');
const {getRoomName,
    tagMatrixMessage,
    getRoomAlias,
    getDisplayName,
    setRoomAlias,
    getSkypeMatrixUsers,
    getSkypeRoomFromAliases,
    htmlToText,
} = require('../../utils');

module.exports = ({puppet, bridge, skypeClient}) => {
    const {createConversation, handleMessage} = skypeApi(skypeClient);

    const getSkypeConversation = matrixRoomId => {
        const roomAliases = puppet.getRoomAliases(matrixRoomId);
        log.debug('matrixRoomId %s has aliases: ', matrixRoomId, roomAliases);

        return getSkypeRoomFromAliases(roomAliases);
    };

    const inviteUserToSkypeConversation = async (invitedUser, skypeConversation) => {
        const contacts = await skypeClient.getContacts();
        const [skypeUser] = getSkypeMatrixUsers(contacts, [invitedUser]);

        if (skypeUser) {
            return skypeClient.addMemberToConversation(skypeConversation, skypeUser);
        }
    };

    const getJoinedUsers = async (invitedUser, matrixRoomId) => {
        const bot = bridge.getBot();
        const botClient = bot.getClient();
        const invitedUserIntent = bridge.getIntent(invitedUser);

        await invitedUserIntent.join(matrixRoomId);
        await invitedUserIntent.invite(matrixRoomId, puppet.getUserId());
        await invitedUserIntent.invite(matrixRoomId, bot.getUserId());
        await puppet.joinRoom(matrixRoomId);
        await botClient.joinRoom(matrixRoomId);

        return bot.getJoinedMembers(matrixRoomId);
    };

    const createSkypeConversation = async (invitedUser, matrixRoomId) => {
        const matrixRoomJoinedUsers = await getJoinedUsers(invitedUser, matrixRoomId);
        const roomName = await getRoomName(matrixRoomId);
        const newSkypeConversation = await createConversation(matrixRoomJoinedUsers, roomName);
        const alias = getRoomAlias(newSkypeConversation);

        return setRoomAlias(matrixRoomId, alias);
    };

    const getMatrixPayload = async ({
        room_id: matrixRoomId,
        sender,
        content: {
            body,
            msgtype,
            url,
            formatted_body: commandBody,
        }}) => {
        const displayName = await getDisplayName(sender);
        const msgBody = htmlToText(commandBody) || body;

        return {
            skypeConversation: getSkypeConversation(matrixRoomId),
            body: tagMatrixMessage(msgBody),
            url: url ? puppet.getHttpUrl(url) : url,
            displayName,
            msgtype,
        };
    };

    return {
        handleMatrixMemberEvent: ({room_id: matrixRoomId, state_key: invitedUser}) => {
            try {
                const skypeConversation = getSkypeConversation(matrixRoomId);
                const action = skypeConversation ? inviteUserToSkypeConversation : createSkypeConversation;

                return action(invitedUser, matrixRoomId);
            } catch (err) {
                log.error('handleMatrixMemberEvent', err);
            }
        },

        handleMatrixMessageEvent: async data => {
            try {
                const payload = await getMatrixPayload(data);
                log.info('message from riot with msgtype: ', payload.msgtype);

                return handleMessage(payload);
            } catch (err) {
                log.error('handleMatrixMessageEvent', err);
            }
        },
        testOnly: {getMatrixPayload},
    };
};
