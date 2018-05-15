// const fs = require('fs');
// const tmp = require('tmp');
const log = require('../../modules/log')(module);
const {getRoomId, getBody, getDisplayName, a2b, b2a, download, getAvatarUrl, getNameFromId, isSkypeId, getTextContent} = require('../../utils');
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

    return {
        downloadImage: url => download.getBufferAndType(url, {
            cookies: api.context.cookies,
            headers: {
                Authorization: `skype_token ${api.context.skypeToken.value}`,
            },
        }),

        createSkypeConversation: ({topic, allUsers}) =>
            api.createConversation(allUsers)
                .then(id =>
                    api.setConversationTopic(id, topic)
                        .then(() => id)),


        getSkypeBotId: () => `8:${api.context.username}`,

        getThirdPartyUserDataById: id => getUserData(b2a(id)),

        sendTextToSkype: async (id, text, {sender}) => {
            try {
                const displayName = await getDisplayName(sender);
                const textContent = skypeify(getTextContent(displayName, text));
                await api.sendMessage(b2a(id), {textContent});
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
        //             download.getBufferAndType(data.url).then(({buffer, type}) => {
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


        getPayload: async ({content, conversation, sender, html}) => {
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

        testOnly: {
            getContact,
            getUserData,
        },
    };
};
