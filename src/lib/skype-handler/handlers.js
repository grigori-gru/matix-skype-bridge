const log = require('../../modules/log')(module);
const {a2b} = require('../../utils');
const lib = require('./lib');

module.exports = state => {
    const {
        handleSentEvent,
        handleMessageEvent,
        handleImageEvent,
    } = lib(state);

    return {
        sentHandler: data => {
            log.debug('sent event data in skype', data);
            const {type, conversation, content} = data;
            const roomId = a2b(conversation);
            return handleSentEvent({
                type,
                roomId,
                sender: null,
                content,
            });
        },

        messageHandler: data => {
            log.debug('message event data in skype', data);
            const {
                type,
                from: {raw},
                conversation,
                content,
            } = data;
            const roomId = a2b(conversation);

            return handleMessageEvent({
                type,
                roomId,
                sender: raw,
                content,
                conversation,
            });
        },

        imageHandler: data => {
            log.debug('image event data in skype', data);
            const {
                type,
                from: {raw},
                conversation,
                uri,
                original_file_name: name,
            } = data;
            return handleImageEvent({
                type,
                roomId: a2b(conversation),
                sender: raw,
                url: `${uri}/views/imgpsh_fullsize`,
                name,
            });
        },
    };
};

