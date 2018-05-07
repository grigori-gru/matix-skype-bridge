const path = require('path');
const log = require('./src/modules/log')(module);
const {Cli, AppServiceRegistration} = require('matrix-appservice-bridge');

const config = require('./config.json');
const App = require('./src/app');
const Puppet = require('./src/puppet');
const puppet = new Puppet(path.join(__dirname, './config.json'));

new Cli({
    port: config.port,
    registrationPath: config.registrationPath,
    generateRegistration(reg, callback) {
        puppet.associate().then(() => {
            reg.setHomeserverToken(AppServiceRegistration.generateToken());
            reg.setAppServiceToken(AppServiceRegistration.generateToken());
            reg.setSenderLocalpart('skypebot');
            reg.addRegexPattern('users', '@skype_.*', true);
            // originally in puppet reg.setId(AppServiceRegistration.generateToken());
            reg.setId('skype');
            callback(reg);
        }).catch(err => {
            log.error(err.message);
            process.exit(-1);
        });
    },
    run(port) {
        const app = new App(config, puppet);
        log.info('starting matrix client');
        return puppet.startClient()
            .then(() => {
                log.info('starting skype client');
                return app.initThirdPartyClient();
            })
            .then(() =>
                app.bridge.run(port, config)
            )
            .then(() => {
                log.info('Matrix-side listening on port %s', port);
            })
            .catch(err => {
                log.error(err.message);
                process.exit(-1);
            });
    },
}).run();
