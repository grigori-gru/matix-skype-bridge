const fs = require('fs');
const tmp = require('tmp');
const log = require('../../modules/log')(module);
const {getDisplayName, a2b, b2a, download, getAvatarUrl, getNameFromId, isSkypeId} = require('../../utils');
const {deskypeify, skypeify} = require('./skypeify');


module.exports = api => {
    const getContact = id => api.contacts.find(contact =>
        (contact.personId === id || contact.mri === id));

    const getSkypeOutputData = senderId => {
        const contact = getContact(senderId);
        const output = {};

        if (contact) {
            output.senderName = contact.displayName;
            output.avatarUrl = contact.profile.avatarUrl;
        } else if (isSkypeId(senderId)) {
            output.senderName = getNameFromId(senderId);
            output.avatarUrl = getAvatarUrl(senderId);
        } else {
            output.senderName = senderId;
        }

        return output;
    };

    return {
        downloadImage: url => download.getBufferAndType(url, {
            cookies: api.context.cookies,
            headers: {
                Authorization: `skype_token ${api.context.skypeToken.value}`,
            },
        }),

        createConversationWithTopic: ({topic, allUsers}) =>
            api.createConversation(allUsers)
                .then(id =>
                    api.setConversationTopic(id, topic)
                        .then(() => id)),


        getSkypeBotId: () => `8:${api.context.username}`,

        getThirdPartyUserDataById: id => getSkypeOutputData(b2a(id)),

        sendMessageAsPuppetToThirdPartyRoomWithId: (id, text, {sender}) =>
            getDisplayName(sender)
                .then(displayName => `${displayName}:\n${text}`)
                .then(textWithSenderName => api.sendMessage(b2a(id), {
                    textContent: skypeify(textWithSenderName),
                })),

        // TODO: try to change
        sendImageMessageAsPuppetToThirdPartyRoomWithId: (id, data) => {
            let cleanup = () => {};
            return new Promise((resolve, reject) => {
                tmp.file((err, path, fd, cleanupCallback) => {
                    if (err) {
                        reject(err);
                    }
                    cleanup = cleanupCallback;
                    const tmpFile = fs.createWriteStream(path);
                    download.getBufferAndType(data.url).then(({buffer, type}) => {
                        tmpFile.write(buffer, err => {
                            if (err) {
                                reject(err);
                                return;
                            }
                            tmpFile.close(() => {
                                resolve(api.sendImage({
                                    file: path,
                                    name: data.text,
                                }, b2a(id)));
                            });
                        });
                    });
                });
            }).finally(() => {
                cleanup();
            });
        },


        getPayload: data => {
            const payload = {
                roomId: data.roomId.replace(':', '^'),
            };
            return data.sender ?
                {...payload, ...getSkypeOutputData(data.sender), senderId: a2b(data.sender)} :
                {...payload, senderId: null};
        },

        getThirdPartyRoomDataById: id => {
            const raw = b2a(id);
            const contact = api.contacts.find(contact =>
                (contact.personId === raw || contact.mri === raw));
            if (contact) {
                return Promise.resolve({
                    name: deskypeify(contact.displayName),
                    topic: 'Skype Direct Message',
                });
            }
            return new Promise((resolve, reject) => {
                api.getConversation(raw).then(res => {
                    resolve({
                        name: deskypeify(res.threadProperties.topic),
                        topic: res.type.toLowerCase() === 'conversation' ? 'Skype Direct Message' : 'Skype Group Chat',
                    });
                }).catch(err => {
                    reject(err);
                });
            });
        },

        testOnly: {
            getContact,
            getSkypeOutputData,
        },
    };
};
