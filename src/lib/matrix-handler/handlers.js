const log = require('../../modules/log')(module);
const skypeApi = require('../skype-lib/client');
const {textMatrixType} = require('../../config');
const {getRoomName,
    tagMatrixMessage,
    getRoomAlias,
    getDisplayName,
    setRoomAlias,
    getSkypeMatrixUsers,
    getSkypeRoomFromAliases,
} = require('../../utils');

module.exports = ({puppet, bridge, skypeClient}) => {
    const {createConversation, sendTextToSkype} = skypeApi(skypeClient);

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

    return {
        handleMatrixMemberEvent: ({room_id: matrixRoomId, state_key: invitedUser}) => {
            try {
                const skypeConversation = getSkypeConversation(matrixRoomId);
                const action = skypeConversation ? inviteUserToSkypeConversation : createSkypeConversation;

                return action(invitedUser, matrixRoomId);
            } catch (err) {
                log.error(err);
            }
        },

        handleMatrixMessageEvent: async ({sender, room_id: matrixRoomId, content: {body, msgtype}}) => {
            try {
                const skypeConversation = getSkypeConversation(matrixRoomId);
                log.info('Skype conversation for matrix room %s is %s', matrixRoomId, skypeConversation);

                switch (msgtype) {
                    case textMatrixType: {
                        log.debug('text message from riot');
                        const msg = tagMatrixMessage(body);
                        const displayName = await getDisplayName(sender);

                        return sendTextToSkype(skypeConversation, msg, displayName);
                    }
                    // case 'm.image': {
                    //     log.debug('image message from riot');

                    //     const url = puppet.getClient().mxcUrlToHttp(data.content.url);

                    //     return sendImageToSkype(skypeConversation, {
                    //         url,
                    //         text: tagMatrixMessage(body),
                    //     }, data);
                    // }
                    default:
                        log.warn('dont know how to handle this msgtype', msgtype);
                }
            } catch (err) {
                log.error('handleMatrixMessageEvent', err);
            }
        },
    };
};
