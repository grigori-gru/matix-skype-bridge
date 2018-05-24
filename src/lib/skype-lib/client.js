// const fs = require('fs');
// const tmp = require('tmp');
const log = require('../../modules/log')(module);
const {deskypeify, skypeify} = require('./skypeify');
const {skypeTypePrefix} = require('../../config');
const {
    getSkypeConverstionType,
    getSkypeMatrixUsers,
    getMatrixRoomId,
    getBody,
    toMatrixFormat,
    toSkypeFormat,
    getAvatarUrl,
    getNameFromId,
    getTextContent,
    getSkypeID,
} = require('../../utils');

module.exports = api => {
    const getContact = async id => {
        const contacts = await api.getContacts();

        return contacts.find(contact =>
            (contact.personId === id || contact.mri === id));
    };

    const getUserData = async sender => {
        if (!sender) {
            return {};
        }
        const contact = await getContact(sender);

        const senderName = contact ? contact.displayName : getNameFromId(sender);
        const avatarUrl = contact ? contact.profile.avatarUrl : getAvatarUrl(sender);
        const senderId = toMatrixFormat(sender);

        return {senderName, avatarUrl, senderId};
    };

    const getSkypeBotId = () => getSkypeID(api.context.username, skypeTypePrefix);

    const createSkypeConversation = async (roomName, allUsers) => {
        log.debug('Create Skype conversation with name %s and users:', roomName, allUsers);
        const skypeRoomId = await api.createConversation(allUsers);
        await api.setConversationTopic(skypeRoomId, roomName);
        log.debug('Skype room %s is made', skypeRoomId);

        return toMatrixFormat(skypeRoomId);
    };

    return {
        // TODO: next time
        // downloadImage: url => getBufferAndType(url, {
        //     cookies: api.context.cookies,
        //     headers: {
        //         Authorization: `skype_token ${api.context.skypeToken.value}`,
        //     },
        // }),

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


        sendTextToSkype: async (conversationId, text, sender) => {
            try {
                const textContent = skypeify(getTextContent(sender, text));
                await api.sendMessage({textContent}, conversationId);
                log.info('Message %s from %s succesfully sent to conversation %s', text, sender, conversationId);
            } catch (error) {
                throw new Error(error);
            }
        },

        // TODO: try to change
        // sendImageToSkype: (id, data) => {
        //     let cleanup = () => {};
        //     return new Promise((resolve, reject) => {
        //         tmp.file((err, path, fd, cleanupCallback) => {
        //             if (err) {
        //                 reject(err);
        //             }
        //             cleanup = cleanupCallback;
        //             const tmpFile = fs.createWriteStream(path);
        //             getBufferAndType(data.url).then(({buffer, type}) => {
        //                 tmpFile.write(buffer, err => {
        //                     if (err) {
        //                         reject(err);
        //                         return;
        //                     }
        //                     tmpFile.close(() => {
        //                         resolve(api.sendImage({
        //                             file: path,
        //                             name: data.text,
        //                         }, toSkypeFormat(id)));
        //                     });
        //                 });
        //             });
        //         });
        //     }).finally(() => {
        //         cleanup();
        //     });
        // },


        getPayload: async ({content, conversation, from: {raw: sender}, html}) => {
            const userData = await getUserData(sender);
            const roomId = getMatrixRoomId(conversation);
            const body = getBody(content, userData.senderId, html);

            return {body, userData, roomId};
        },

        getSkypeRoomData: async id => {
            try {
                const skypeConversation = await api.getConversation(toSkypeFormat(id));
                const topic = getSkypeConverstionType(skypeConversation.type);
                const name = deskypeify(skypeConversation.threadProperties.topic) || topic;
                log.debug('got skype room data', {name, topic});

                return {name, topic};
            } catch (err) {
                throw new Error(err);
            }
        },

        testOnly: {
            getContact,
            getUserData,
        },
    };
};
