const path = require('path');

const env = process.env.NODE_ENV || 'development';

const configPath = {
    development: './',
    test: './test/fixtures/',
};

const confgigFilepath = path.resolve(configPath[env], 'config.json');

const config = require(confgigFilepath);

module.exports = ({
    ...config,
    URL_BASE: `${config.bridge.homeserverUrl}/_matrix/client/r0`,
    servicePrefix: 'skype_',
    deduplicationTag: config.deduplicationTag || ' \ufeff',
    deduplicationTagRegex: new RegExp(config.deduplicationTagPattern || ' \\ufeff$'),
    skypePrefix: '8:live',
    matrixUserPrefix: '@',
    matrixRoomAliasPrefix: '#',
    delim: ':',
});
