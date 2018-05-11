const fs = require('fs');
const tmp = require('tmp-promise');
const log = require('../../modules/log')(module);
const {getDisplayName, a2b, b2a, download, entities} = require('../../utils');
const {deskypeify, skypeify} = require('./skypeify');

module.exports = api => {
    const getContact = id => api.contacts.find(contact =>
        (contact.personId === id || contact.mri === id));

    const getThirdPartyUserDataByIdNoPromise = (api, thirdPartySender) => {
        const contact = getContact(thirdPartySender);
        const payload = {};
        if (contact) {
            payload.senderName = contact.displayName;
            payload.avatarUrl = contact.profile.avatarUrl;
        } else if (thirdPartySender.indexOf(':') > -1) {
            payload.senderName = thirdPartySender.substr(thirdPartySender.indexOf(':') + 1);
            payload.avatarUrl = `https://avatars.skype.com/v1/avatars/${entities.encode(payload.senderName)}/public?returnDefaultImage=false&cacheHeaders=true`;
        } else {
            payload.senderName = thirdPartySender;
        }
        return payload;
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

        addMemberToConversation: (converstionId, memberId) => api.addMemberToConversation(converstionId, memberId),

        getSkypeBotId: () => `8:${api.context.username}`,

        sendMessageAsPuppetToThirdPartyRoomWithId: (id, text, {sender}) =>
            getDisplayName(sender)
                .then(displayName => `${displayName}:\n${text}`)
                .then(textWithSenderName => api.sendMessage(b2a(id), {
                    textContent: skypeify(textWithSenderName),
                })),


        sendImageMessageAsPuppetToThirdPartyRoomWithId: async (id, {url, text}) => {
            try {
                const {err, path, cleanup} = await tmp.file();
                if (err) {
                    throw new Error(err);
                }
                const tmpFile = fs.createWriteStream(path);
                const {buffer} = await download.getBufferAndType(url);
                tmpFile.write(buffer, err => {
                    if (err) {
                        throw new Error(err);
                    }
                    tmpFile.end(() => {
                        api.sendImage({
                            file: path,
                            name: text,
                        }, b2a(id));
                    });
                });
                cleanup();
            } catch (err) {
                return err;
            }
        },

        getThirdPartyUserDataById: id => {
            const raw = b2a(id);
            return Promise.resolve(getThirdPartyUserDataByIdNoPromise(api, raw));
        },

        getPayload: data => {
            const payload = {
                roomId: data.roomId.replace(':', '^'),
            };
            if (data.sender) {
                payload.senderId = a2b(data.sender);
                Object.assign(payload, getThirdPartyUserDataByIdNoPromise(api, data.sender));
            } else {
                payload.senderId = null;
            }
            log.debug(payload);
            return payload;
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
            getThirdPartyUserDataByIdNoPromise,
        },
    };
};
