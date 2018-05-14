const handlers = require('./handlers');
const {isTypeErrorMessage} = require('../../utils');
const log = require('../../modules/log')(module);

const isMessageFromSkypeBot = (data, state) =>
    data.from.username === state.skypeClient.context.username;

module.exports = {
    skypeEventHandler: state => ({resource}) => {
        const {sentHandler, messageHandler, imageHandler} = handlers(state);
        switch (resource.type) {
            case 'Text':
            case 'RichText':
                if (isMessageFromSkypeBot(resource, state)) {
                    // TODO: add correct function to determine what kind of check do we make
                    if (resource.content.slice(-1) !== '\ufeff') {
                        log.debug('sent event data in skype', resource);
                        return sentHandler(resource);
                    }
                } else {
                    log.debug('message event data in skype', resource);
                    return messageHandler(resource);
                }
                break;
            case 'RichText/UriObject':
                log.debug('image event data in skype', resource);
                return imageHandler(resource);
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
