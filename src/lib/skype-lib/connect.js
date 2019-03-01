const skypeHttp = require('skype-http');
const log = require('../../modules/log')(module);

module.exports = async auth => {
    const opts = {
        credentials: auth,
        verbose: true,
    };

    try {
        log.info('starting skype client');
        const api = await skypeHttp.connect(opts);
        await api.listen();
        log.info('setting status online');
        await api.setStatus('Online');
        return api;
    } catch (err) {
        log.error('Skype connection failed\n', err);
        process.exit(0);
    }
};
