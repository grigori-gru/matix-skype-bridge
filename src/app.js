const {Bridge} = require('matrix-appservice-bridge');
const path = require('path');

const config = require('./config');
const skypeEventHandler = require('./skype-handler');
const matrixEventHandler = require('./skype/matrix-handler');
const log = require('./modules/log')(module);
const skypeConnect = require('./skype/connect');
const Puppet = require('./puppet');
const puppet = new Puppet(path.join(__dirname, './config.json'));


module.exports = async () => {
    log.info('starting matrix client');
    await puppet.startClient();

    const skypeClient = await skypeConnect(config.skype);

    const controller = {
        onUserQuery: queriedUser => {
            log.info('got user query', queriedUser);
            // auto provision users w no additional data
            return {};
        },
        onEvent: matrixEventHandler({puppet, skypeClient}),
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
    const bridge = new Bridge({...config.bridge, controller});

    bridge.run(config.port, config);

    skypeClient.on('event', skypeEventHandler({bridge, puppet, skypeClient}));
    skypeClient.on('error', err =>
        log.error('An error was detected:\n', err));
};
