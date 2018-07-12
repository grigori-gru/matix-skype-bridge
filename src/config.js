const path = require('path');

const configPath = process.env.NODE_ENV ? './' : './test/fixtures/';

const confgigFilepath = path.resolve(configPath, 'config.json');

const config = require(confgigFilepath);

const delim = ':';
const skypeTypePrefix = '8';
const skypeUserPrefix = 'live';
const skypePrefix = skypeTypePrefix.concat(delim, skypeUserPrefix);

module.exports = {
    ...config,
    URL_BASE: `${config.bridge.homeserverUrl}/_matrix/client/r0`,
    servicePrefix: 'skype_',
    deduplicationTag: config.deduplicationTag || ' \ufeff',
    deduplicationTagRegex: new RegExp(config.deduplicationTagPattern || ' \\ufeff$'),
    matrixUserTag: '@',
    matrixRoomTag: '#',
    skypePrefix,
    skypeTypePrefix,
    delim,
    textMatrixType: 'm.text',
    fileMatrixType: 'm.file',
    imageMatrixType: 'm.image',
    fullImgPathParams: ['views', 'imgpsh_fullsize'],
};
