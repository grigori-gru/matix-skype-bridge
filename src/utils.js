const concatStream = require('concat-stream');
const needle = require('needle');
const mime = require('mime-types');
const urlParse = require('url').parse;
const fetch = require('node-fetch');
const querystring = require('querystring');
const {AllHtmlEntities: Entities} = require('html-entities');
const entities = new Entities();
const log = require('./modules/log')(module);
const {servicePrefix, bridge, puppet, SKYPE_USERS_TO_IGNORE, URL_BASE, deduplicationTag, deduplicationTagRegex} = require('./config.js');
const {domain} = bridge;
const {deskypeify} = require('./lib/skype-lib/skypeify');

const patt = new RegExp(`^#${servicePrefix}(.+)$`);
// // check if tag is right before file extension
// const FILENAME_TAG_PATTERN = /^.+_mx_\..+$/;

// const isFilenameTagged = filepath => !!filepath.match(FILENAME_TAG_PATTERN);

// tag the message to know it was sent by the bridge
const autoTagger = (sender, func) => text =>
    (sender ? text : func(text));

const downloadGetBufferAndHeaders = (url, data) =>
    new Promise((resolve, reject) => {
        let headers = {
            'content-type': 'application/octet-stream',
        };
        const stream = needle.get(url, data);
        stream.on('header', (_s, _h) => {
            headers = _h;
        });
        stream.pipe(concatStream(buffer => {
            resolve({buffer, headers});
        })).on('error', reject);
    });

const getUrl = (arg, type) => {
    const encodeArg = encodeURIComponent(arg);
    const result = {
        setRoomUrl: `${URL_BASE}/directory/room/${encodeArg}?${querystring.stringify({'access_token': puppet.token})}`,
        getDisplayUrl: `${URL_BASE}/profile/${encodeArg}/displayname`,
    };
    return result[type];
};

const utils = {
    tagMatrixMessage: text => `${text}${deduplicationTag}`,

    tag: (text = '', sender) =>
        autoTagger(sender, utils.tagMatrixMessage)(deskypeify(text)),

    isTaggedMatrixMessage: text => deduplicationTagRegex.test(text),

    getRoomAliasName: id => `${servicePrefix}${id}`,

    getMatrixUser: (id, prefix = servicePrefix) => `@${servicePrefix}${id}:${domain}`,

    getRoomAlias: id => `#${utils.getRoomAliasName(id)}:${domain}`,

    getSkypeID: name => `8:live:${name}`,

    isInviteNewUserEvent: (puppetId, {membership, state_key: invitedUser}) => {
        log.debug(puppetId);
        log.debug(invitedUser);
        const result = (membership === 'invite' && invitedUser.includes(`${servicePrefix}`) && invitedUser !== puppetId);
        log.debug(result);
        return result;
    },

    isTypeErrorMessage: err =>
        ['ressource.messageType', 'EventMessage.resourceType'].reduce((acc, val) =>
            acc || err.stack.includes(val), false),

    getTextContent: (name, text) => `${name}:\n${text}`,

    isSkypeId: id => id.includes(':'),

    getNameFromId: id => id.substr(id.indexOf(':') + 1),

    getAvatarUrl: id => `https://avatars.skype.com/v1/avatars/${entities.encode(utils.getNameFromId(id))}/public?returnDefaultImage=false&cacheHeaders=true`,

    toMatrixFormat: str => {
        if (str) {
            return new Buffer(str).toString('base64');
        }
        log.warn('unexpected data for decode');
    },
    toSkypeFormat: str => {
        if (str) {
            return new Buffer(str, 'base64').toString('ascii');
        }
        log.warn('unexpected data for decode');
    },

    getMatrixRoomAlias: skypeConverstaion => utils.toMatrixFormat(skypeConverstaion),

    setRoomAlias: (roomId, alias) => {
        const url = getUrl(alias, 'setRoomUrl');
        const body = {'room_id': roomId};
        log.debug('roomId', roomId);
        return fetch(url, {
            method: 'PUT',
            body: JSON.stringify(body),
            headers: {'Content-Type': 'application/json'},
        })
            .then(res => {
                log.debug('Request for setting alias name %s for room %s in matrix have status %s ', alias, roomId, res.status);
                return res.status;
            });
    },

    getDisplayName: matrixId => {
        const url = getUrl(matrixId, 'getDisplayUrl');
        return fetch(url)
            .then(body =>
                (body.status === 200 ? body.json() : null))
            .then(res =>
                (res ? res.displayname : res));
    },

    getNameToSkype: sender =>
        utils.getDisplayName(sender)
            .then(displayname => {
                const result = displayname || sender;
                log.debug('Display name for user %s in skype is %s', sender, result);
                return result;
            }),

    getRoomName: roomId => {
        const query = querystring.stringify({'access_token': puppet.token});
        const url = `${URL_BASE}/rooms/${roomId}/state/m.room.name?${query}`;
        return fetch(url)
            .then(res => res.json())
            .then(({name}) => {
                const result = name || 'Bingo-boom conversation';
                log.debug('Display name for roomId %s in skype is %s', roomId, result);
                return result;
            });
    },

    getMatrixUsers: users =>
        users
            .filter(user => !SKYPE_USERS_TO_IGNORE.includes(user))
            .map(user =>
                `@${user.split(':').pop()}:${domain}`),

    getInvitedUsers: (skypeRoomMembers, matrixRoomMembers) => {
        const result = utils.getMatrixUsers(skypeRoomMembers)
            .filter(user => !matrixRoomMembers.includes(user));
        return result.length > 0 ? result : null;
    },

    getBufferAndType: (url, data) =>
        downloadGetBufferAndHeaders(url, data)
            .then(({buffer, headers}) => {
                let type;
                const contentType = headers['content-type'];
                if (contentType) {
                    type = contentType;
                } else {
                    type = mime.lookup(urlParse(url).pathname);
                }
                [type] = type.split(';');
                return {buffer, type};
            }),


    getIdFromMatrix: (user, prefix = '') => {
        const [result] = user.replace(`@${prefix}`, '').split(':');
        return result;
    },

    getId: user =>
        (user.includes(servicePrefix) ?
            utils.toSkypeFormat(utils.getIdFromMatrix(user, servicePrefix)) :
            utils.getSkypeID(utils.getIdFromMatrix(user))),

    getSkypeMatrixUsers: (skypeCollection = [], matrixRoomUsers) => {
        const usersIds = matrixRoomUsers.map(user => utils.getId(user));
        return skypeCollection
            .map(({personId}) => personId)
            .filter(id => usersIds.includes(id));
    },

    // TODO: it's outdated now
    // isMatrixMessage: content => isTaggedMatrixMessage(deskypeify(content)),

    // isMatrixImage: ({original_file_name: name, path}) =>
    //     (isTaggedMatrixMessage(name) || isFilenameTagged(path)),

    getRoomId: conversation => utils.toMatrixFormat(conversation).replace(':', '^'),

    getBody: (content, senderId, html) => {
        const body = {
            body: utils.tag(content, senderId),
            msgtype: 'm.text',
        };
        // if (html) {
        //     // eslint-disable-next-line
        //     body.formatted_body = html;
        //     body.format = 'org.matrix.custom.html';
        // }
        return body;
    },
    isMessageFromSkypeBot: (data, skypeClient) =>
        data.from.username === skypeClient.context.username,

    getSkypeRoomFromAliases: aliases => {
        if (!aliases) {
            return;
        }
        const result = aliases.reduce((result, alias) => {
            const localpart = alias.replace(`:${domain}`, '');
            const matches = localpart.match(patt);
            return matches ? matches[1] : result;
        }, null);
        return utils.toSkypeFormat(result);
    },
};

module.exports = utils;
