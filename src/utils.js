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

const tagMessage = isTagged => (isTagged ? 'Ignoring event, it\'s unexpected' : 'Should handle this event.');


// *******Tag part******
// Helps to check if our message is from our service or not
const tagMatrixMessage = text => sum(text, deduplicationTag);

const tag = (text = '', sender) =>
    autoTagger(sender, tagMatrixMessage)(deskypeify(text));

const isTaggedMatrixMessage = text => {
    const isTagged = deduplicationTagRegex.test(text);
    log.info(tagMessage(isTagged));
    return isTagged;
};

// ********Name/Alias constructor**********
// Create or transform matrix/skype names, id, alias to form for each other

const getServiceName = (id, prefix = servicePrefix) => sum(prefix, id);

const getNameDomain = name => sum(name, delim, domain);

const getMatrixUser = (id, prefix = servicePrefix) =>
    sum(matrixUserTag, getNameDomain(getServiceName(id, prefix)));

const getRoomAlias = (id, prefix = servicePrefix) =>
    sum(matrixRoomTag, getNameDomain(getServiceName(id, prefix)));

const getSkypeID = (name, prefix = skypePrefix) => sum(prefix, delim, name);

const getNameFromId = id => id.replace(getPrefix(skypePrefix, delim));

// const getMatrixRoomAlias = skypeConverstaion => toMatrixFormat(skypeConverstaion);

const getNameFromSkypeId = name => {
    const prefix = name.includes(skypePrefix) ? skypePrefix : skypeTypePrefix;
    return name.replace(sum(prefix, delim), '');
};

const toMatrixFormat = str => {
    if (str) {
        return Buffer.from(str).toString('base64');
    }
    log.warn('unexpected data for decode');
};

const toSkypeFormat = str => {
    if (str) {
        return Buffer.from(str, 'base64').toString('ascii');
    }
    log.warn('unexpected data for decode');
};

const getMatrixRoomId = conversation => toMatrixFormat(conversation).replace(delim, '^');

// **********Predicates***************
const isIgnoreMemberEvent = (puppetId, {membership, state_key: invitedUser}) => {
    const isIgnore = !(membership === 'invite' && invitedUser.includes(servicePrefix) && invitedUser !== puppetId);
    log.info(inviteMessage(isIgnore));
    return isIgnore;
};

const isTypeErrorMessage = err =>
    ['ressource.messageType', 'EventMessage.resourceType'].reduce((acc, val) =>
        acc || err.stack.includes(val), false);

const isMessageFromSkypeBot = (data, skypeClient) =>
    data.from.username === skypeClient.context.username;

const isSkypeId = id => id.includes(delim);


// ********Skype<>Matrix utils**********
const getIdFromMatrix = (user, prefix = '', matrixTag = matrixUserTag) => {
    const [result] = user.replace(getPrefix(matrixTag, prefix), '').split(delim);
    return result;
};

const getUserId = (user = '', tag = matrixUserTag) =>
    (user.includes(servicePrefix) ?
        toSkypeFormat(getIdFromMatrix(user, servicePrefix, tag)) :
        getSkypeID(getIdFromMatrix(user)));

const getSkypeMatrixUsers = (skypeCollection = [], matrixRoomUsers) => {
    const usersIds = matrixRoomUsers.map(user => getUserId(user));
    return skypeCollection
        .map(({personId}) => personId)
        .filter(id => usersIds.includes(id));
};

const getTextContent = (name, text) => sum(name, delim, '\n', text);


const getSkypeRoomFromAliases = aliases =>
    (aliases ? getUserId(aliases.find(isMatrixAlias), matrixRoomTag) : aliases);

const getBody = (content, senderId, html) => {
    const body = {
        body: tag(content, senderId),
        msgtype: textMatrixType,
    };
    // if (html) {
    //     // eslint-disable-next-line
    //     body.formatted_body = html;
    //     body.format = 'org.matrix.custom.html';
    // }
    return body;
};

const getMatrixUsers = (users, prefix) =>
    users
        .filter(user => !SKYPE_USERS_TO_IGNORE.includes(user))
        .map(user => getMatrixUser(getNameFromSkypeId(user), prefix));

const getInvitedUsers = (skypeRoomMembers, matrixRoomMembers) => {
    const result = getMatrixUsers(skypeRoomMembers, '')
        .filter(user => !matrixRoomMembers.includes(user));
    return result.length > 0 ? result : null;
};

const getSkypeConverstionType = (type = '') =>
    (type.toLowerCase() === 'conversation' ? 'Skype Direct Message' : 'Skype Group Chat');

// This one should be made over
const getAvatarUrl = id => {
    if (isSkypeId(id)) {
        return `https://avatars.skype.com/v1/avatars/${entities.encode(getNameFromId(id))}/public?returnDefaultImage=false&cacheHeaders=true`;
    }
};


// *************Request part**********
// getting and setting matrix components, download image
const setRoomAlias = (roomId, alias) => {
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
};

const getDisplayName = matrixId => {
    const url = getUrl(matrixId, 'getDisplayUrl');
    return fetch(url)
        .then(body =>
            (body.status === 200 ? body.json() : null))
        .then(res =>
            (res ? res.displayname : res));
};

const getNameToSkype = sender =>
    getDisplayName(sender)
        .then(displayname => {
            const result = displayname || sender;
            log.debug('Display name for user %s in skype is %s', sender, result);
            return result;
        });

const getRoomName = roomId => {
    const query = querystring.stringify({'access_token': puppet.token});
    const url = `${URL_BASE}/rooms/${roomId}/state/m.room.name?${query}`;
    return fetch(url)
        .then(res => res.json())
        .then(({name}) => {
            const result = name || 'Bingo-boom conversation';
            log.debug('Display name for roomId %s in skype is %s', roomId, result);
            return result;
        });
};

const getBufferAndType = (url, data) =>
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
        });

// TODO: it's outdated now
// isMatrixMessage: content => isTaggedMatrixMessage(deskypeify(content)),
// isMatrixImage: ({original_file_name: name, path}) =>
//     (isTaggedMatrixMessage(name) || isFilenameTagged(path)),

module.exports = {
    tagMatrixMessage,
    sum,
    tag,
    isTaggedMatrixMessage,
    getAvatarUrl,
    getServiceName,
    getMatrixUser,
    getRoomAlias,
    getSkypeID,
    getNameFromId,
    getMatrixRoomId,
    getNameFromSkypeId,
    toMatrixFormat,
    toSkypeFormat,
    getIdFromMatrix,
    getUserId,
    getSkypeMatrixUsers,
    getTextContent,
    getInvitedUsers,
    getSkypeRoomFromAliases,
    getBody,
    getMatrixUsers,
    getSkypeConverstionType,
    isIgnoreMemberEvent,
    isTypeErrorMessage,
    isMessageFromSkypeBot,
    setRoomAlias,
    getDisplayName,
    getNameToSkype,
    getRoomName,
    getBufferAndType,
};
