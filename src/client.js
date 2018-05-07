const skypeHttp = require('skype-http');
const log = require('./src/modules/log')(module);
// look at
// https://github.com/ocilo/skype-http/blob/master/src/example/main.ts
// const EventEmitter = require('events');

const {download, entities} = require('./utils');

const connect = auth => {
    const opts = {
        credentials: auth,
        verbose: true,
    };

    return skypeHttp.connect(opts)
        .then(api => {
            return api.getContacts().then(contacts => {
                this.contacts = contacts;
                log.debug(`got ${contacts.length} contacts`);

                log.debug('listening for events');
                return api.listen();
            });
        })
        .then(() => {
            log.debug('setting status online');
            return this.api.setStatus('Online');
        })
        .catch(err => {
            log.debug(err);
            process.exit(0);
        });
}


module.exports = {

    sendMessage(threadId, msg) {
        return this.api.sendMessage(msg, threadId);
    }

    sendPictureMessage(threadId, data) {
        this.selfSentFiles.push(data.name);
        return this.api.sendImage({
            file: data.file,
            name: data.name,
        }, threadId).catch(() => {
            this.removeSelfSentFile(data.name);
            this.api.sendMessage({
                textContent: `[Image] <a href="${entities.encode(data.url)}">${entities.encode(data.name)}</a>`,
            }, threadId);
        });
    }

    getJoinUrl(id) {
        return this.api.getJoinUrl(id);
    }

    getContact(id) {
        const contact = this.contacts.find(contact =>
            (contact.personId === id || contact.mri === id));
        return contact;
    }

    getConversation(id) {
        return this.api.getConversation(id);
    }

    downloadImage(url) {
        return download.getBufferAndType(url, {
            cookies: this.api.context.cookies,
            headers: {
                Authorization: `skype_token ${this.api.context.skypeToken.value}`,
            },
        });
    }

    // Using next client Api

    createConversationWithTopic({topic, allUsers}) {
        return this.api.createConversation(allUsers)
            .then(id =>
                this.api.setConversationTopic(id, topic)
                    .then(() => id));
    }


    addMemberToConversation(converstionId, memberId) {
        return this.api.addMemberToConversation(converstionId, memberId);
    }

    getSkypeBotId() {
        return `8:${this.api.context.username}`;
    }
}

module.exports = Client;
