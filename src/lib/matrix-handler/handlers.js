const log = require('../../modules/log')(module);
const {setRoomAlias, getSkypeMatrixUsers, isInviteNewUserEvent, getSkypeRoomFromAliases} = require('../../utils');
const config = require('../../config');
const skypeApi = require('../skype-lib/client');
const {tagMatrixMessage, getRoomAlias} = config.clientData;

module.exports = state => {
    const {puppet, bridge, skypeClient} = state;
    const {createConversation, sendTextToSkype, sendImageToSkype} = skypeApi(skypeClient);

    const getSkypeConversation = matrixRoomId => {
        const room = puppet.getMatrixRoomById(matrixRoomId);
        return getSkypeRoomFromAliases(room);
    };

    const inviteUserToSkypeConversation = async (invitedUser, skypeConversation) => {
        const contacts = await skypeClient.getContacts();
        const [skypeUser] = getSkypeMatrixUsers(contacts, [invitedUser]);

        if (skypeUser) {
            return skypeClient.addMemberToConversation(skypeConversation, skypeUser);
        }
    };

    return {
        handleMatrixMemberEvent: async data => {
            const {room_id: matrixRoomId, state_key: invitedUser} = data;
            try {
                if (!isInviteNewUserEvent(puppet, data)) {
                    log.debug('ignored a matrix event');
                    return;
                }
                const skypeConversation = getSkypeConversation(matrixRoomId);
                if (skypeConversation) {
                    return inviteUserToSkypeConversation(invitedUser, matrixRoomId);
                }

                const bot = bridge.getBot();
                const botClient = bot.getClient();
                const invitedUserIntent = bridge.getIntent(invitedUser);

                await invitedUserIntent.join(matrixRoomId);
                await invitedUserIntent.invite(matrixRoomId, puppet.getUserId());
                await invitedUserIntent.invite(matrixRoomId, bot.getUserId());
                await puppet.joinRoom(matrixRoomId);
                await botClient.joinRoom(matrixRoomId);

                const usersCollection = await bot.getJoinedMembers(matrixRoomId);
                const newSkypeConversation = await createConversation(usersCollection, matrixRoomId);
                const alias = getRoomAlias(newSkypeConversation);
                return setRoomAlias(matrixRoomId, alias);
            } catch (err) {
                log.error(err);
            }
        },

        handleMatrixMessageEvent: data => {
            const {room_id: roomId, content: {body, msgtype}} = data;
            try {
                const skypeConversation = getSkypeConversation(roomId);
                switch (msgtype) {
                    case 'm.text': {
                        const msg = tagMatrixMessage(body);
                        log.debug('text message from riot');
                        return sendTextToSkype(skypeConversation, msg, data.sender);
                    }
                    case 'm.image': {
                        log.debug('image message from riot');

                        const url = puppet.getClient().mxcUrlToHttp(data.content.url);
                        return sendImageToSkype(skypeConversation, {
                            url,
                            text: tagMatrixMessage(body),
                        }, data);
                    }
                    default:
                        log.warn('dont know how to handle this msgtype', msgtype);
                        return;
                }
            } catch (err) {
                log.error('handleMatrixMessageEvent', err);
            }
        },
    };
};
