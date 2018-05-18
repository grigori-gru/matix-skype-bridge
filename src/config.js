const path = require('path');

const env = process.env.NODE_ENV || 'development';

const configPath = {
    development: './',
    test: './test/fixtures/',
};

const confgigFilepath = path.resolve(configPath[env], 'config.json');

const config = require(confgigFilepath);

const deduplicationTag = config.deduplicationTag || ' \ufeff';
const deduplicationTagRegex = new RegExp(config.deduplicationTagPattern || ' \\ufeff$');

const tagMatrixMessage = text => `${text}${deduplicationTag}`;
const isTaggedMatrixMessage = text => deduplicationTagRegex.test(text);
const servicePrefix = 'skype_';
const getRoomAliasName = id => `${servicePrefix}${id}`;
const getGhostUser = id => `@${servicePrefix}${id}:${config.bridge.domain}`;
const getRoomAlias = id =>
    `#${getRoomAliasName(id)}:${config.bridge.domain}`;
const allowNullSenderName = false;

const getSkypeID = name => `8:live:${name}`;

const clientData = {
    servicePrefix,
    tagMatrixMessage,
    getRoomAliasName,
    isTaggedMatrixMessage,
    getGhostUser,
    getRoomAlias,
    allowNullSenderName,
    getSkypeID,
};

const URL_BASE = `${config.bridge.homeserverUrl}/_matrix/client/r0`;

const tmpPath = path.resolve(__dirname, '..', 'tmp');

module.exports = ({...config, clientData, tmpPath, URL_BASE});
