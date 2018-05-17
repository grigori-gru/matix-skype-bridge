const log = require('../../modules/log')(module);
const {a2b, b2a, setRoomAlias, getSkypeMatrixUsers, isInviteNewUserEvent} = require('../../utils');
const config = require('../../config');
const {domain} = config.bridge;
const skypeApi = require('../skype-lib/client');
const {servicePrefix, tagMatrixMessage, getRoomAlias} = config.clientData;

module.exports = state => {
    const {puppet, bridge, skypeClient} = state;
    const {createConversation, sendTextToSkype, sendImageToSkype} = skypeApi(skypeClient);

    const getThirdPartyRoomIdFromMatrixRoomId = matrixRoomId => {
        const patt = new RegExp(`^#${servicePrefix}(.+)$`);
        const room = puppet.getClient().getRoom(matrixRoomId);
        log.debug('reducing array of aliases to a 3prid');
        return room.getAliases().reduce((result, alias) => {
            const localpart = alias.replace(`:${domain}`, '');
            const matches = localpart.match(patt);
            return matches ? matches[1] : result;
        }, null);
    };

    const inviteUserToSkypeConversation = async (invitedUser, matrixRoomId) => {
        const skypeRoomId = b2a(getThirdPartyRoomIdFromMatrixRoomId(matrixRoomId));
        const contacts = await skypeClient.getContacts();
        const [skypeUser] = getSkypeMatrixUsers(contacts, [invitedUser]);

        if (skypeUser) {
            return skypeClient.addMemberToConversation(skypeRoomId, skypeUser);
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
                if (puppet.isJoined(matrixRoomId)) {
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
                const skypeRoomId = await createConversation(usersCollection, matrixRoomId);
                const alias = getRoomAlias(a2b(skypeRoomId));
                return setRoomAlias(matrixRoomId, alias);
            } catch (err) {
                log.error(err);
            }
        },

        handleMatrixMessageEvent: data => {
            const {room_id: roomId, content: {body, msgtype}} = data;
            try {
                const thirdPartyRoomId = getThirdPartyRoomIdFromMatrixRoomId(roomId);
                switch (msgtype) {
                    case 'm.text': {
                        const msg = tagMatrixMessage(body);
                        log.debug('text message from riot');
                        return sendTextToSkype(thirdPartyRoomId, msg, data.sender);
                    }
                    case 'm.image': {
                        log.debug('picture message from riot');

                        const url = puppet.getClient().mxcUrlToHttp(data.content.url);
                        return sendImageToSkype(thirdPartyRoomId, {
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
