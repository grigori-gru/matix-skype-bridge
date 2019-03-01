const {Bridge} = require('matrix-appservice-bridge');

const log = require('./modules/log')(module);
const config = require('./config');
const {skypeEventHandler, skypeErrorHandler} = require('./lib/skype-handler');
const matrixEventHandler = require('./lib/matrix-handler');
const skypeConnect = require('./lib/skype-lib/connect');

module.exports = async function app(puppet) {
    log.info('starting matrix client');
    await puppet.startClient();
    log.info('matrix client started!!!');
    this.skypeClient = await skypeConnect(config.skype);
    log.info('skype client started!!!');

    const handleMatrixEvent = data =>
        matrixEventHandler({puppet, skypeClient: this.skypeClient, bridge: this.bridge})(data);

    const controller = {
        onUserQuery: queriedUser => {
            log.info('got user query', queriedUser);
            // auto provision users w no additional data
            return {};
        },
        onEvent: handleMatrixEvent,
        onAliasQuery: () => {
            log.info('on alias query');
        },
        thirdPartyLookup: {
            protocols: [config.servicePrefix],
            getProtocol: () => log.info('get proto'),
            getLocation: () => log.info('get loc'),
            getUser: () => log.info('get user'),
        },
    };

    this.bridge = new Bridge({...config.bridge, controller});

    await this.bridge.run(config.port, config);

    this.skypeClient.on('event', skypeEventHandler({bridge: this.bridge, puppet, skypeClient: this.skypeClient}));
    this.skypeClient.on('error', async err => {
        if (
            err.stack.includes('You must create an endpoint before performing this operation') ||
            err.stack.includes('The provided registration token is expired, and no authentication ticket was provided.')
        ) {
            log.error(err);
            log.warn('Skypeclient should reconnect');
            this.skypeClient = await skypeConnect(config.skype);
        } else {
            return skypeErrorHandler(err);
        }
    });
};
