const clientData = require('../skype-lib/client');
const {deskypeify} = require('../skype-lib/skypeify');
const log = require('../../modules/log')(module);
const lib = require('./lib');
const {isMatrixMessage, isMatrixImage} = require('../../utils');

module.exports = state => {
    const {
        downloadImage,
        getPayload,
    } = clientData(state.skypeClient);

    const {
        inviteSkypeConversationMembers,
        sendSkypeMessage,
        handleSkypeImage,
    } = lib(state);

    const textHandler = async data => {
        try {
            const payload = await getPayload(data);
            const text = deskypeify(data.content);
            if (isMatrixMessage(payload, text)) {
                log.debug('it is from matrix, so just ignore it.');
                return;
            }

            log.debug('it is from 3rd party client');
            return sendSkypeMessage({...payload, text});
        } catch (err) {
            log.error('sentHandler error', err);
        }
    };

    return {
        sentHandler: textHandler,

        messageHandler: async data => {
            try {
                const sender = data.from.raw;
                await textHandler({...data, sender});

                await inviteSkypeConversationMembers(data.conversation);
            } catch (err) {
                log.error('messageHandler error', err);
            }
        },

        imageHandler: data => {
            const name = data.original_file_name;
            const sender = data.from.raw;
            const url = `${data.uri}/views/imgpsh_fullsize`;
            // TODO: make normal data parse for img handler
            const payload = getPayload({...data, sender});
            payload.text = name;
            payload.path = '';
            if (isMatrixImage(payload)) {
                log.debug('it is from matrix, so just ignore it.');
                return;
            }

            return downloadImage(url).then(({buffer, type}) => {
                payload.buffer = buffer;
                payload.mimetype = type;
                return handleSkypeImage(payload);
            }).catch(err => {
                log.error(err);
                payload.text = `[Image] (${name}) ${url}`;
                return sendSkypeMessage(payload);
            });
        },
    };
};
