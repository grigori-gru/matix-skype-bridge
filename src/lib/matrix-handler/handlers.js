const log = require('../../modules/log')(module);
const {a2b, b2a, setRoomAlias, getSkypeMatrixUsers, getRoomName} = require('../../utils');
const config = require('../../config');
const {domain} = config.bridge;
const clientData = require('../skype-lib/client');

const {
    servicePrefix,
    tagMatrixMessage,
    isTaggedMatrixMessage,
    getRoomAliasFromThirdPartyRoomId,
} = config.clientData;


module.exports = state => {
    const {puppet, bridge, skypeClient} = state;

    const {
        createConversationWithTopic,
        sendTextToSkype,
        sendImageMessageAsPuppetToThirdPartyRoomWithId,
    } = clientData(state.skypeClient);

    const getThirdPartyRoomIdFromMatrixRoomId = matrixRoomId => {
        const patt = new RegExp(`^#${servicePrefix}_(.+)$`);
        const room = puppet.getClient().getRoom(matrixRoomId);
        log.debug('reducing array of alases to a 3prid');
        return room.getAliases().reduce((result, alias) => {
            const localpart = alias.replace(`:${domain}`, '');
            const matches = localpart.match(patt);
            return matches ? matches[1] : result;
        }, null);
    };

    const invitePuppetUserToSkypeConversation = async (invitedUser, matrixRoomId) => {
        const skypeRoomId = b2a(getThirdPartyRoomIdFromMatrixRoomId(matrixRoomId));
        const contacts = await skypeClient.getContacts();
        const [skypeUser] = getSkypeMatrixUsers(contacts, [invitedUser]);

        if (skypeUser) {
            return skypeClient.addMemberToConversation(skypeRoomId, skypeUser);
        }
    };

    return {
        handleMatrixMemberEvent: data => {
            const {room_id: matrixRoomId, membership, state_key: invitedUser} = data;
            const puppetClient = puppet.getClient();

            if (membership === 'invite' && invitedUser.includes(`${servicePrefix}_`) && invitedUser !== puppetClient.getUserId()) {
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
                const onRoomNameAndUserCollection = async (usersCollection, roomName) => {
                    const users = Object.keys(usersCollection);
                    const contacts = await skypeClient.getContacts();
                    const skypeMatrixUsers = getSkypeMatrixUsers(contacts, users);
                    const allUsers = {users: skypeMatrixUsers, admins: [skypeClient.getSkypeBotId()]};
                    return createConversationWithTopic({topic: roomName, allUsers});
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
        },

        handleMatrixMessageEvent: data => {
            const {room_id: roomId, content: {body, msgtype}} = data;
            if (isTaggedMatrixMessage(body)) {
                log.debug('ignoring tagged message, it was sent by the bridge');
                return;
            }
            try {
                const thirdPartyRoomId = getThirdPartyRoomIdFromMatrixRoomId(roomId);
                switch (msgtype) {
                    case 'm.text': {
                        const msg = tagMatrixMessage(body);
                        log.debug('text message from riot');
                        return sendTextToSkype(thirdPartyRoomId, msg, data);
                    }
                    case 'm.image': {
                        log.debug('picture message from riot');

                        const url = puppet.getClient().mxcUrlToHttp(data.content.url);
                        return sendImageMessageAsPuppetToThirdPartyRoomWithId(thirdPartyRoomId, {
                            url,
                            text: tagMatrixMessage(body),
                        }, data);
                    }
                    default:
                        throw new Error('dont know how to handle this msgtype', msgtype);
                }
            } catch (err) {
                log.error('handleMatrixMessageEvent', err);
            }
        },
    };
};
