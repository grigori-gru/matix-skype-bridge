const clientData = require('../skype-lib/client');
const {deskypeify} = require('../skype-lib/skypeify');
const {getMatrixUsers} = require('../../utils');
const log = require('../../modules/log')(module);
const mainLib = require('./main-lib');

module.exports = state => {
    const {
        downloadImage,
        getPayload,
    } = clientData(state.skypeClient);

    const {
        getOrCreateMatrixRoomFromThirdPartyRoomId,
        handleThirdPartyRoomMessage,
        handleThirdPartyRoomImageMessage,
    } = mainLib(state);

    return {
        inviteSkypeConversationMembers: (roomId, conversation) => {
            let matrixMembers;

            return state.skypeClient.getConversation(conversation)
                .then(skypeRoom => {
                    const {members} = skypeRoom;
                    matrixMembers = getMatrixUsers(members);
                    return getOrCreateMatrixRoomFromThirdPartyRoomId(roomId);
                })
                .then(matrixRoomId => {
                    const roomMembers = state.puppet.getMatrixRoomMembers(matrixRoomId);
                    const filteredUsers = matrixMembers.filter(user => !roomMembers.includes(user));
                    if (filteredUsers.length === 0) {
                        log.debug('All members in skype conversation are already joined in Matrix room: ', matrixRoomId);
                    } else {
                        return Promise.all(filteredUsers.map(user => state.puppet.client.invite(matrixRoomId, user)))
                            .then(() => log.debug('New users invited to room: ', roomId));
                    }
                })
                .catch(err => log.error(err));
        },

        handleSkypeMessage: data => {
            const payload = getPayload(data);
            payload.text = deskypeify(data.content);
            return handleThirdPartyRoomMessage(payload);
        },

        handleSkypeImage: data => {
            const payload = getPayload(data);
            payload.text = data.name;
            payload.path = '';
            // needed to not create internal errors
            return downloadImage(data.url).then(({buffer, type}) => {
                payload.buffer = buffer;
                payload.mimetype = type;
                return handleThirdPartyRoomImageMessage(payload);
            }).catch(err => {
                log.error(err);
                payload.text = `[Image] (${data.name}) ${data.url}`;
                return handleThirdPartyRoomMessage(payload);
            });
        },
    };
};
