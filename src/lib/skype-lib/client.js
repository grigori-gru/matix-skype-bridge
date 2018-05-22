// const fs = require('fs');
// const tmp = require('tmp');
const log = require('../../modules/log')(module);
const {getRoomName, getSkypeMatrixUsers, getRoomId, getBody, a2b, b2a, getBufferAndType, getAvatarUrl, getNameFromId, isSkypeId, getTextContent} = require('../../utils');
const {deskypeify, skypeify} = require('./skypeify');


module.exports = api => {
    const getContact = async id => {
        const contacts = await api.getContacts();

        return contacts.find(contact =>
            (contact.personId === id || contact.mri === id));
    };

    const getUserData = async sender => {
        const output = {};
        if (!sender) {
            return output;
        }
        const contact = await getContact(sender);

        if (contact) {
            output.senderName = contact.displayName;
            output.avatarUrl = contact.profile.avatarUrl;
        } else if (isSkypeId(sender)) {
            output.senderName = getNameFromId(sender);
            output.avatarUrl = getAvatarUrl(sender);
        } else {
            output.senderName = sender;
        }

        return {...output, senderId: a2b(sender)};
    };

    const getSkypeBotId = () => `8:${api.context.username}`;

    const createSkypeConversation = async (roomName, allUsers) => {
        log.debug('Create Skype conversation with name %s and users:', roomName, allUsers);
        const skypeRoomId = await api.createConversation(allUsers);
        await api.setConversationTopic(skypeRoomId, roomName);
        log.debug('Skype room %s is made', skypeRoomId);

        return a2b(skypeRoomId);
    };

    return {
        downloadImage: url => getBufferAndType(url, {
            cookies: api.context.cookies,
            headers: {
                Authorization: `skype_token ${api.context.skypeToken.value}`,
            },
        }),

        createConversation: async (usersCollection, matrixRoomId) => {
            const roomName = await getRoomName(matrixRoomId);
            const users = Object.keys(usersCollection);
            const contacts = await api.getContacts();
            const skypeMatrixUsers = getSkypeMatrixUsers(contacts, users);
            const allUsers = {
                users: skypeMatrixUsers,
                admins: [getSkypeBotId()],
            };

            return createSkypeConversation(roomName, allUsers);
        },


        sendTextToSkype: (id, text, sender) => {
            try {
                const textContent = skypeify(getTextContent(sender, text));

                return api.sendMessage({textContent}, id);
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
        //                         }, b2a(id)));
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
            const roomId = getRoomId(conversation);
            const body = getBody(content, userData.senderId, html);

            return {body, userData, roomId};
        },

        getSkypeRoomData: async id => {
            try {
                const skypeConversation = await api.getConversation(b2a(id));
                const topic = skypeConversation.type.toLowerCase() === 'conversation' ? 'Skype Direct Message' : 'Skype Group Chat';
                const name = deskypeify(skypeConversation.threadProperties.topic) || topic;
                log.debug('got skype room data', {name, topic});

                return {name, topic};
            } catch (err) {
                throw new Error(err);
            }
        },

        getName: () => api.context.username,

        testOnly: {
            getContact,
            getUserData,
        },
    };
};
