const handlers = require('./handlers');
const {isMessageFromSkypeBot, isTypeErrorMessage} = require('../../utils');
const log = require('../../modules/log')(module);

module.exports = {
    skypeEventHandler: state => ({resource: data}) => {
        const {messageHandler, imageHandler} = handlers(state);
        if (isMessageFromSkypeBot(data, state.skypeClient)) {
            log.debug('it is from matrix, so just ignore it.');
            return;
        }

        switch (data.type) {
            case 'Text':
            case 'RichText':
                log.debug('message event data in skype', data);

                return messageHandler(data);
            case 'RichText/UriObject':
                log.debug('It is from skype! Image event data in skype', data);

                return imageHandler(data);
            default:
                break;
        }
    },
    skypeErrorHandler: err => {
        if (!isTypeErrorMessage(err)) {
            log.error('An error was detected:\n', err);
        }
    },
};
