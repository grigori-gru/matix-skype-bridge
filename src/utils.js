const concatStream = require('concat-stream');
const needle = require('needle');
const mime = require('mime-types');
const {parse: urlParse} = require('url');
const fetch = require('node-fetch');
const querystring = require('querystring');
const {AllHtmlEntities: Entities} = require('html-entities');
const entities = new Entities();

const log = require('./modules/log')(module);
const {deskypeify} = require('./lib/skype-lib/skypeify');
const {
    textMatrixType,
    skypeTypePrefix,
    servicePrefix,
    bridge: {domain},
    puppet,
    SKYPE_USERS_TO_IGNORE,
    URL_BASE,
    deduplicationTag,
    deduplicationTagRegex,
    skypePrefix,
    matrixUserTag,
    delim,
    matrixRoomTag,
} = require('./config.js');

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

const sum = (...elems) => elems.join('');

const matrixAliasPat = sum(matrixRoomTag, servicePrefix);

const isMatrixAlias = (alias = '') => alias.includes(matrixAliasPat);

const getPrefix = (matrixTag, prefix) => sum(matrixTag, prefix);

const inviteMessage = isTagged =>
    (isTagged ? 'Ignoring tagged message, it was sent by the bridge' : 'No tag. Start handle');

const tagMessage = isTagged =>
    (isTagged ? 'Ignoring event, it\'s unexpected' : 'Should handle this event.');


const utils = {
    sum,

    // *******Tag part******
    // Helps to check if our message is from our service or not
    tagMatrixMessage: text => sum(text, deduplicationTag),

    tag: (text = '', sender) =>
        autoTagger(sender, utils.tagMatrixMessage)(deskypeify(text)),

    isTaggedMatrixMessage: text => {
        const isTagged = deduplicationTagRegex.test(text);
        log.info(tagMessage(isTagged));
        return isTagged;
    },


    // ********Name/Alias constructor**********
    // Create or transform matrix/skype names, id, alias to form for each other

    // This one should be made over
    getAvatarUrl: id => {
        if (utils.isSkypeId(id)) {
            return `https://avatars.skype.com/v1/avatars/${entities.encode(utils.getNameFromId(id))}/public?returnDefaultImage=false&cacheHeaders=true`;
        }
    },

    getServiceName: (id, prefix = servicePrefix) => sum(prefix, id),

    getNameDomain: name => sum(name, delim, domain),

    getMatrixUser: (id, prefix = servicePrefix) =>
        sum(matrixUserTag, utils.getNameDomain(utils.getServiceName(id, prefix))),

    getRoomAlias: (id, prefix = servicePrefix) =>
        sum(matrixRoomTag, utils.getNameDomain(utils.getServiceName(id, prefix))),

    getSkypeID: (name, prefix = skypePrefix) => sum(prefix, delim, name),

    getNameFromId: id => id.replace(getPrefix(skypePrefix, delim)),

    getMatrixRoomAlias: skypeConverstaion => utils.toMatrixFormat(skypeConverstaion),

    getMatrixRoomId: conversation => utils.toMatrixFormat(conversation).replace(delim, '^'),

    getNameFromSkypeId: name => {
        const prefix = name.includes(skypePrefix) ? skypePrefix : skypeTypePrefix;
        return name.replace(sum(prefix, delim), '');
    },

    toMatrixFormat: str => {
        if (str) {
            return Buffer.from(str).toString('base64');
        }
        log.warn('unexpected data for decode');
    },

    toSkypeFormat: str => {
        if (str) {
            return Buffer.from(str, 'base64').toString('ascii');
        }
        log.warn('unexpected data for decode');
    },


    // ********Skype<>Matrix utils**********
    getIdFromMatrix: (user, prefix = '', matrixTag = matrixUserTag) => {
        const [result] = user.replace(getPrefix(matrixTag, prefix), '').split(delim);
        return result;
    },

    getUserId: (user = '', tag = matrixUserTag) =>
        (user.includes(servicePrefix) ?
            utils.toSkypeFormat(utils.getIdFromMatrix(user, servicePrefix, tag)) :
            utils.getSkypeID(utils.getIdFromMatrix(user))),

    getSkypeMatrixUsers: (skypeCollection = [], matrixRoomUsers) => {
        const usersIds = matrixRoomUsers.map(user => utils.getUserId(user));
        return skypeCollection
            .map(({personId}) => personId)
            .filter(id => usersIds.includes(id));
    },

    getTextContent: (name, text) => sum(name, delim, '\n', text),

    getInvitedUsers: (skypeRoomMembers, matrixRoomMembers) => {
        const result = utils.getMatrixUsers(skypeRoomMembers, '')
            .filter(user => !matrixRoomMembers.includes(user));
        return result.length > 0 ? result : null;
    },

    getSkypeRoomFromAliases: (aliases = []) =>
        utils.getUserId(aliases.find(isMatrixAlias), matrixRoomTag),

    getBody: (content, senderId, html) => {
        const body = {
            body: utils.tag(content, senderId),
            msgtype: textMatrixType,
        };
        // if (html) {
        //     // eslint-disable-next-line
        //     body.formatted_body = html;
        //     body.format = 'org.matrix.custom.html';
        // }
        return body;
    },

    getMatrixUsers: (users, prefix) =>
        users
            .filter(user => !SKYPE_USERS_TO_IGNORE.includes(user))
            .map(user => utils.getMatrixUser(utils.getNameFromSkypeId(user), prefix)),

    getSkypeConverstionType: (type = '') =>
        (type.toLowerCase() === 'conversation' ? 'Skype Direct Message' : 'Skype Group Chat'),

    // **********Predicates***************
    isIgnoreMemberEvent: (puppetId, {membership, state_key: invitedUser}) => {
        const isIgnore = !(membership === 'invite' && invitedUser.includes(servicePrefix) && invitedUser !== puppetId);
        log.info(inviteMessage(isIgnore));
        return isIgnore;
    },

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
