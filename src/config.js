const path = require('path');

const env = process.env.NODE_ENV || 'development';
const log = require('./modules/log')(module);

const configPath = {
    development: './',
    test: './test/fixtures/',
};

const confgigFilepath = path.resolve(configPath[env], 'config.json');
log.debug(confgigFilepath);

const config = require(confgigFilepath);

const deduplicationTag = config.deduplicationTag || ' \ufeff';
const deduplicationTagRegex = new RegExp(config.deduplicationTagPattern || ' \\ufeff$');

const tagMatrixMessage = text => `${text}${deduplicationTag}`;
const isTaggedMatrixMessage = text => deduplicationTagRegex.test(text);
const servicePrefix = 'skype';
const getRoomAliasLocalPartFromThirdPartyRoomId = id => `${servicePrefix}_${id}`;
const getGhostUserFromThirdPartySenderId = id => `@${servicePrefix}_${id}:${config.domain}`;
const getRoomAliasFromThirdPartyRoomId = id => `#${getRoomAliasLocalPartFromThirdPartyRoomId(id)}:${config.domain}`;
const allowNullSenderName = false;
const clientData = {
    servicePrefix,
    tagMatrixMessage,
    getRoomAliasLocalPartFromThirdPartyRoomId,
    isTaggedMatrixMessage,
    getGhostUserFromThirdPartySenderId,
    getRoomAliasFromThirdPartyRoomId,
    allowNullSenderName,
};

module.exports = ({...config, clientData});
