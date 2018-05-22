const log = require('../../modules/log')(module);
const {tagMatrixMessage, getRoomAlias, getDisplayName, setRoomAlias, getSkypeMatrixUsers, isInviteNewUserEvent, getSkypeRoomFromAliases} = require('../../utils');
const skypeApi = require('../skype-lib/client');

module.exports = ({puppet, bridge, skypeClient}) => {
    const {createConversation, sendTextToSkype, sendImageToSkype} = skypeApi(skypeClient);

    const getSkypeConversation = matrixRoomId => {
        const room = puppet.getMatrixRoomById(matrixRoomId);
        if (room) {
            return getSkypeRoomFromAliases(room.getAliases());
        }
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
            try {
                const {room_id: matrixRoomId, state_key: invitedUser} = data;

                if (!isInviteNewUserEvent(puppet.getUserId(), data)) {
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

        handleMatrixMessageEvent: async data => {
            const {room_id: roomId, content: {body, msgtype}} = data;
            try {
                const skypeConversation = getSkypeConversation(roomId);
                switch (msgtype) {
                    case 'm.text': {
                        const msg = tagMatrixMessage(body);
                        log.debug('text message from riot');
                        const displayName = await getDisplayName(data.sender);

                        return sendTextToSkype(skypeConversation, msg, displayName);
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
                }
            } catch (err) {
                log.error('handleMatrixMessageEvent', err);
            }
        },
    };
};
