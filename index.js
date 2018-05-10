const path = require('path');
const log = require('./src/modules/log')(module);
const {Cli, AppServiceRegistration} = require('matrix-appservice-bridge');

const config = require('./config.json');
const Puppet = require('./src/puppet');
const puppet = new Puppet(path.join(__dirname, './config.json'));
const app = require('./src');

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
        return app();
    },
}).run();
