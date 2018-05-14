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
                const {raw: sender} = data.from;
                await textHandler({...data, sender});
                await inviteSkypeConversationMembers(data.conversation);
            } catch (err) {
                log.error('messageHandler error', err);
            }
        },

        imageHandler: async data => {
            const name = data.original_file_name;
            const {raw: sender} = data.from;
            const url = `${data.uri}/views/imgpsh_fullsize`;
            const payload = {
                ...await getPayload({...data, sender}),
                text: name,
                path: '',
            };
            if (isMatrixImage(payload)) {
                log.debug('it is from matrix, so just ignore it.');
                return;
            }
            try {
                const {buffer, type} = await downloadImage(url);
                return handleSkypeImage({payload, buffer, type});
            } catch (err) {
                log.error(err);
                const text = `[Image] (${name}) ${url}`;
                return sendSkypeMessage({...payload, text});
            }
        },
    };
};
