const concatStream = require('concat-stream');
const needle = require('needle');
const mime = require('mime-types');
const urlParse = require('url').parse;
const fetch = require('node-fetch');
const querystring = require('querystring');
const {AllHtmlEntities: Entities} = require('html-entities');
const entities = new Entities();
const log = require('./modules/log')(module);
const {servicePrefix, bridge, puppet, SKYPE_USERS_TO_IGNORE, URL_BASE, deduplicationTag, deduplicationTagRegex, skypePrefix, matrixUserPrefix, delim, matrixRoomAliasPrefix} = require('./config.js');
const {domain} = bridge;
const {deskypeify} = require('./lib/skype-lib/skypeify');

const patt = new RegExp(`^#${servicePrefix}(.+)$`);
// // check if tag is right before file extension
// const FILENAME_TAG_PATTERN = /^.+_mx_\..+$/;

// const isFilenameTagged = filepath => !!filepath.match(FILENAME_TAG_PATTERN);

// tag the message to know it was sent by the bridge

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

const autoTagger = (sender, func) => text =>
    (sender ? text : func(text));

const getUrl = (arg, type) => {
    const encodeArg = encodeURIComponent(arg);
    const result = {
        setRoomUrl: `${URL_BASE}/directory/room/${encodeArg}?${querystring.stringify({'access_token': puppet.token})}`,
        getDisplayUrl: `${URL_BASE}/profile/${encodeArg}/displayname`,
    };
    return result[type];
};

const sum = (...elems) => ''.concat(...elems);

const utils = {
    sum,
    // *******Tag part******
    // Helps to check if our message is from our service or not
    tagMatrixMessage: text => `${text}${deduplicationTag}`,

    tag: (text = '', sender) =>
        autoTagger(sender, utils.tagMatrixMessage)(deskypeify(text)),

    tagMessage: isTagged =>
        (isTagged ? 'Ignoring tagged message, it was sent by the bridge' : 'No tag. Start handle'),

    isTaggedMatrixMessage: text => {
        const isTagged = deduplicationTagRegex.test(text);
        log.info(utils.tagMessage(isTagged));
        return isTagged;
    },


    // ********Name/Alias constructor**********
    // Create or transform matrix/skype names, id, alias to form for each other
    getServiceName: (id, prefix = servicePrefix) => sum(prefix, id),

    getNameDomain: name => sum(name, delim, domain),

    getMatrixUser: (id, prefix = servicePrefix) =>
        sum(matrixUserPrefix, utils.getNameDomain(utils.getServiceName(id, prefix))),

    getRoomAlias: (id, prefix = servicePrefix) =>
        sum(matrixRoomAliasPrefix, utils.getNameDomain(utils.getServiceName(id, prefix))),

    getSkypeID: name => sum(skypePrefix, delim, name),

    getNameFromId: id => id.substr(id.indexOf(delim) + 1),

    getAvatarUrl: id => `https://avatars.skype.com/v1/avatars/${entities.encode(utils.getNameFromId(id))}/public?returnDefaultImage=false&cacheHeaders=true`,

    getMatrixRoomAlias: skypeConverstaion => utils.toMatrixFormat(skypeConverstaion),

    getMatrixRoomId: conversation => utils.toMatrixFormat(conversation).replace(delim, '^'),

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


    // ********Skype<>Matrix utils**********
    getIdFromMatrix: (user, prefix = '') => {
        const [result] = user.replace(sum(matrixUserPrefix, prefix), '').split(delim);
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

    getTextContent: (name, text) => sum(name, delim, '\n', text),

    getInvitedUsers: (skypeRoomMembers, matrixRoomMembers) => {
        const result = utils.getMatrixUsers(skypeRoomMembers)
            .filter(user => !matrixRoomMembers.includes(user));
        return result.length > 0 ? result : null;
    },

    getSkypeRoomFromAliases: aliases => {
        if (!aliases) {
            return;
        }
        const result = aliases.reduce((result, alias) => {
            const localpart = alias.replace(sum(delim, domain), '');
            const matches = localpart.match(patt);
            return matches ? matches[1] : result;
        }, null);
        return utils.toSkypeFormat(result);
    },

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


    // **********Predicates***************
    isInviteNewUserEvent: (puppetId, {membership, state_key: invitedUser}) =>
        (membership === 'invite' && invitedUser.includes(servicePrefix) && invitedUser !== puppetId),

    isTypeErrorMessage: err =>
        ['ressource.messageType', 'EventMessage.resourceType'].reduce((acc, val) =>
            acc || err.stack.includes(val), false),

    isMessageFromSkypeBot: (data, skypeClient) =>
        data.from.username === skypeClient.context.username,

    isSkypeId: id => id.includes(delim),


    // *************Request part**********
    // getting and setting matrix components, download image
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
                `@${user.split(delim).pop()}:${domain}`),

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

    // TODO: it's outdated now
    // isMatrixMessage: content => isTaggedMatrixMessage(deskypeify(content)),

    // isMatrixImage: ({original_file_name: name, path}) =>
    //     (isTaggedMatrixMessage(name) || isFilenameTagged(path)),
};

module.exports = utils;
