const handlers = require('./handlers');
const {isTypeErrorMessage} = require('../../utils');
const log = require('../../modules/log')(module);

module.exports = state => ({
    skypeEventHandler: event => {
        const {sentHandler, messageHandler, imageHandler} = handlers(state);
        if (event && event.resource) {
            const data = event.resource;
            switch (data.type) {
                case 'Text':
                case 'RichText':
                // TODO: try to change this one
                    if (data.from.username === state.skypeClient.context.username) {
                    // the lib currently hides this kind from us. but i want it.
                        if (data.content.slice(-1) !== '\ufeff') {
                            return sentHandler(data);
                        }
                    } else {
                        return messageHandler(data);
                    }
                    break;
                case 'RichText/UriObject':
                    return imageHandler(data);
            }
        }
    },
    skypeErrorHandler: err => {
        if (!isTypeErrorMessage(err)) {
            log.error('An error was detected:\n', err);
        }
    },
});
