const skypeHttp = require('skype-http');
const log = require('../../modules/log')(module);

module.exports = async auth => {
    const opts = {
        credentials: auth,
        verbose: true,
    };

    try {
        log.info('starting matrix client');
        const api = await skypeHttp.connect(opts);
        await api.listen();
        log.debug('setting status online');
        await api.setStatus('Online');
        return api;
    } catch (err) {
        log.error(err);
        process.exit(0);
    }
};
