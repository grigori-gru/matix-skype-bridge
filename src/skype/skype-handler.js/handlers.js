const log = require('./modules/log')(module);
const {a2b} = require('./utils');
const lib = require('./lib');

module.exports = state => {
    const {
        handleSkypeMessage,
        handleSkypeImage,
        inviteSkypeConversationMembers,
    } = lib(state);

    return {
        sentHandler: data => {
            log.debug('sent', data);
            const {type, conversation, content} = data;
            const roomId = a2b(conversation);
            return handleSkypeMessage({
                type,
                roomId,
                sender: null,
                content,
            });
        },

        messageHandler: data => {
            log.debug('message', data);
            const {
                type,
                from: {raw},
                conversation,
                content,
            } = data;
            const roomId = a2b(conversation);

            return handleSkypeMessage({
                type,
                roomId,
                sender: raw,
                content,
            })
                .then(() =>
                    inviteSkypeConversationMembers(roomId, conversation))
                .catch(err =>
                    log.error('Error in skype message event', err));
        },

        imageHandler: data => {
            const {
                type,
                from: {raw},
                conversation,
                uri,
                original_file_name: name,
            } = data;
            return handleSkypeImage({
                type,
                roomId: a2b(conversation),
                sender: raw,
                url: `${uri}/views/imgpsh_fullsize`,
                name,
            });
        },
    };
};

