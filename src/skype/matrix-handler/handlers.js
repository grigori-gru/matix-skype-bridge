const {a2b, b2a, setRoomAlias, getSkypeMatrixUsers, getRoomName} = require('./utils');
const config = require('./config.js');
const {domain} = config.bridge;
const clientData = require('../skype/client');

const {
    servicePrefix,
    tagMatrixMessage,
    isTaggedMatrixMessage,
    getRoomAliasFromThirdPartyRoomId,
} = config.clientData;

const log = require('./modules/log')(module);

module.exports = state => {
    const {puppet, bridge, skypeClient} = state;

    const {
        createConversationWithTopic,
        sendMessageAsPuppetToThirdPartyRoomWithId,
        sendImageMessageAsPuppetToThirdPartyRoomWithId,
        addMemberToConversation,
    } = clientData(state.skypeApi);

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

    const invitePuppetUserToSkypeConversation = (invitedUser, matrixRoomId) => {
        const skypeRoomId = b2a(getThirdPartyRoomIdFromMatrixRoomId(matrixRoomId));
        const [skypeUser] = getSkypeMatrixUsers(skypeClient.contacts, [invitedUser]);

        if (skypeUser) {
            return addMemberToConversation(skypeRoomId, skypeUser);
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
                const onRoomNameAndUserCollection = (usersCollection, roomName) => {
                    const users = Object.keys(usersCollection);
                    const skypeMatrixUsers = getSkypeMatrixUsers(skypeClient.contacts, users);
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
        },

    }
};
