const handlers = require('./handlers');

module.exports = state => event => {
    const {sentHandler, messageHandler, imageHandler} = handlers(state);
    if (event && event.resource) {
        const data = event.resource;
        switch (data.type) {
            case 'Text':
            case 'RichText':
            // TODO: try to change this one
                if (data.from.username === state.skypeApi.context.username) {
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
};
