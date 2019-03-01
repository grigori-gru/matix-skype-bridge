const htmlToText = require('html-to-text');
const mime = require('mime-types');
const {parse: urlParse} = require('url');
const fetch = require('node-fetch');
const querystring = require('querystring');
const {AllHtmlEntities: Entities} = require('html-entities');
const entities = new Entities();
const {encode, decode} = require('base32');

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
    fullImgPathParams,
} = require('./config.js');

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

const getFullSizeImgUrl = url => [url, ...fullImgPathParams].join('/');

// ********Name/Alias constructor**********
// Create or transform matrix/skype names, id, alias to form for each other

const getServiceName = (id, prefix = servicePrefix) => sum(prefix, id);

const getNameDomain = name => sum(name, delim, domain);

const getMatrixUser = (id, prefix = servicePrefix) =>
    sum(matrixUserTag, getNameDomain(getServiceName(id, prefix)));

const getDefaultMatrixUser = id => getMatrixUser(id, '');

const getRoomAlias = (id, prefix = servicePrefix) =>
    sum(matrixRoomTag, getNameDomain(getServiceName(id, prefix)));

const getSkypeID = (name, prefix = skypePrefix) => sum(prefix, delim, name);

const getNameFromSkypeId = name => {
    const prefix = name.includes(skypePrefix) ? skypePrefix : skypeTypePrefix;
    return name.replace(sum(prefix, delim), '');
};

const toMatrixUserFormat = str => {
    if (str) {
        return encode(str);
    }
    log.warn('unexpected data for decode');
};

const toMatrixRoomFormat = str => {
    if (str) {
        return Buffer.from(str).toString('base64');
    }
    log.warn('unexpected data for decode');
};

const toSkypeRoomFormat = str => {
    if (str) {
        return Buffer.from(str, 'base64').toString('ascii');
    }
    log.warn('unexpected data for decode');
};

const toSkypeUserFormat = str => {
    if (str) {
        return decode(str);
    }
    log.warn('unexpected data for decode');
};

const getMatrixRoomId = conversation => toMatrixRoomFormat(conversation).replace(delim, '^');

// const getImgLink = (fileName, uri) =>
//     `[Image] (${fileName}) ${uri}`;


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

const getUserId = (user = '', tag = matrixUserTag, func = toSkypeUserFormat) =>
    (user.includes(servicePrefix) ?
        func(getIdFromMatrix(user, servicePrefix, tag)) :
        getSkypeID(getIdFromMatrix(user)));

const getSkypeMatrixUsers = (skypeCollection = [], matrixRoomUsers) => {
    const usersIds = matrixRoomUsers.map(user => getUserId(user));

    return skypeCollection
        .map(({personId}) => personId)
        .filter(id => usersIds.includes(id));
};

const getTextContent = (name, text) => sum(name, delim, '\n', text);


const getSkypeRoomFromAliases = aliases =>
    (aliases ? getUserId(aliases.find(isMatrixAlias), matrixRoomTag, toSkypeRoomFormat) : aliases);

const getBody = (content, senderId) => ({
    body: tag(content, senderId),
    msgtype: textMatrixType,
});

const getMatrixUsers = (users, prefix) =>
    users
        .filter(user => !SKYPE_USERS_TO_IGNORE.includes(user))
        .map(user => getMatrixUser(getNameFromSkypeId(user), prefix));

const getInvitedUsers = async (skypeRoomMembers, matrixRoomMembers) => {
    const users = getMatrixUsers(skypeRoomMembers, '')
        .filter(user => !matrixRoomMembers.includes(user));
    // eslint-disable-next-line
    const realMatrixUsers = await Promise.all(users.map(isRealMatrixUser));
    const result = realMatrixUsers.filter(Boolean);

    return result.length > 0 ? result : null;
};

const getSkypeConverstionType = (type = '') =>
    (type.toLowerCase() === 'conversation' ? 'Skype Direct Message' : 'Skype Group Chat');

// This one should be made over
const getAvatarUrl = id => {
    if (isSkypeId(id)) {
        return `https://avatars.skype.com/v1/avatars/${entities.encode(getNameFromSkypeId(id))}/public?returnDefaultImage=false&cacheHeaders=true`;
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
            (res ? res.displayname : res))
        .catch(err => {
            log.error(err);
        });
};

const isRealMatrixUser = async matrixUserId => {
    const isReal = await getDisplayName(matrixUserId);

    return isReal ? matrixUserId : isReal;
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

const getBufferByUrl = (url, data) =>
    fetch(url)
        .then(res => res.buffer());

const getBufferAndType = async (url, data) => {
    const res = await fetch(url, data);
    const buffer = await res.buffer();
    const contentType = await res.headers.get('content-type') || mime.lookup(urlParse(url).pathname);
    const type = contentType.split(';');
    return {buffer, type};
};

const getImageOpts = ({buffer, type}) =>
    ({size: buffer.length, mymetype: type});

const parseHTML = data =>
    (data ? htmlToText.fromString(data).trim() : data);

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
    getMatrixRoomId,
    getNameFromSkypeId,
    toMatrixUserFormat,
    toMatrixRoomFormat,
    toSkypeRoomFormat,
    toSkypeUserFormat,
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
    getBufferByUrl,
    getFullSizeImgUrl,
    getImageOpts,
    htmlToText: parseHTML,
    getDefaultMatrixUser,
};
