// const fs = require('fs');
const fs = require('fs').promises;
const {file} = require('tmp-promise');
const log = require('../../modules/log')(module);
const {deskypeify, skypeify} = require('./skypeify');
const {skypeTypePrefix, textMatrixType, fileMatrixType, imageMatrixType} = require('../../config');
const {
    getBufferByUrl,
    getSkypeConverstionType,
    getSkypeMatrixUsers,
    getMatrixRoomId,
    getBody,
    toMatrixRoomFormat,
    toMatrixUserFormat,
    toSkypeRoomFormat,
    getAvatarUrl,
    getTextContent,
    getSkypeID,
} = require('../../utils');

module.exports = api => {
    const getContact = async id => {
        const contacts = await api.getContacts();

        return contacts.find(contact =>
            (contact.personId === id || contact.mri === id));
    };

    const getUserData = async (sender, native) => {
        const contact = await getContact(sender);

        const senderName = contact ? contact.displayName : native.imdisplayname;
        const avatarUrl = contact ? contact.profile.avatarUrl : getAvatarUrl(sender);
        const senderId = toMatrixUserFormat(sender);

        return {senderName, avatarUrl, senderId};
    };

    const getSkypeBotId = () => getSkypeID(api.context.username, skypeTypePrefix);

    const createSkypeConversation = async (roomName, allUsers) => {
        log.debug('Create Skype conversation with name %s and users:', roomName, allUsers);
        const skypeRoomId = await api.createConversation(allUsers);
        await api.setConversationTopic(skypeRoomId, roomName);
        log.debug('Skype room %s is made', skypeRoomId);

        return toMatrixRoomFormat(skypeRoomId);
    };

    const saveDataByUrl = async (url, path) => {
        const buffer = await getBufferByUrl(url);
        await fs.writeFile(path, buffer);
    };

    const sendDocToSkype = async (converstionId, {text: name, url}) => {
        // log.debug('Sending doc to skype', data);
        const {path, cleanup} = await file();
        try {
            await saveDataByUrl(url, path);
            await api.sendImage({file: path, name}, converstionId);

            log.info('Doc by url %s is sent to skype converstion %s', url, converstionId);
        } catch (err) {
            log.error('Error in sending message to skype', err);
        } finally {
            cleanup();
        }
    };

    const sendTextToSkype = async (conversationId, text, sender) => {
        try {
            const textContent = skypeify(getTextContent(sender, text));
            await api.sendMessage({textContent}, conversationId);
            log.info('Message %s from %s succesfully sent to conversation %s', text, sender, conversationId);
        } catch (error) {
            throw new Error(error);
        }
    };

    const textHandler = ({skypeConversation, displayName, body}) =>
        sendTextToSkype(skypeConversation, body, displayName);

    const fileHandler = data =>
        textHandler({...data, body: data.url});

    const imageHandler = ({skypeConversation, body: text, url}) =>
        sendDocToSkype(skypeConversation, {url, text});

    const unknownTypeWarn = msgtype => () =>
        log.warn('dont know how to handle this msgtype', msgtype);

    const handlers = {
        [textMatrixType]: textHandler,
        [fileMatrixType]: fileHandler,
        [imageMatrixType]: imageHandler,
    };

    return {
        getSkypeReqOptions: () => ({
            // cookies: api.context.cookies,
            headers: {
                Authorization: `skype_token ${api.context.skypeToken.value}`,
            },
        }),

        getSkypeConversationUsers: async conversation => {
            try {
                const skypeConversation = await api.getConversation(conversation);

                return skypeConversation.members;
            } catch (err) {
                log.error('No conversation %s in skype', conversation);
                log.error(err);
            }
        },

        createConversation: async (usersCollection, roomName) => {
            const users = Object.keys(usersCollection);
            const contacts = await api.getContacts();
            const skypeMatrixUsers = getSkypeMatrixUsers(contacts, users);
            const allUsers = {
                users: skypeMatrixUsers,
                admins: [getSkypeBotId()],
            };

            return createSkypeConversation(roomName, allUsers);
        },


        getPayload: async ({content, conversation, from: {raw: sender}, original_file_name: fileName, native}) => {
            const userData = sender ? await getUserData(sender, native) : {};
            const roomId = getMatrixRoomId(conversation);
            const body = getBody(content || fileName, userData.senderId);

            return {body, userData, roomId};
        },

        getSkypeRoomData: async id => {
            try {
                const skypeConversation = await api.getConversation(toSkypeRoomFormat(id));
                const topic = getSkypeConverstionType(skypeConversation.type);
                const name = deskypeify(skypeConversation.threadProperties.topic) || topic;
                log.debug('got skype room data', {name, topic});

                return {name, topic};
            } catch (err) {
                throw new Error(err);
            }
        },

        handleMessage: ({msgtype, ...payload}) => {
            const action = handlers[msgtype] || unknownTypeWarn(msgtype);

            return action(payload);
        },

        testOnly: {
            getContact,
            getUserData,
            saveDataByUrl,
            sendTextToSkype,
        },
    };
};
