const chai = require('chai');
const {stub} = require('sinon');
const sinonChai = require('sinon-chai');
const {expect} = chai;
chai.use(sinonChai);
const proxyquire = require('proxyquire');
// const imageEvent = require('../fixtures/skype-image.json');
const {resource: eventData} = require('../fixtures/skype-sent.json');
const {resource: messageData} = require('../fixtures/skype-message.json');
const clientLib = require('../../src/lib/skype-lib/client');

const inviteSkypeConversationMembersStub = stub();
const sendSkypeMessageStub = stub();
const handleSkypeImageStub = stub();
const getContactsStub = stub();

const userIvan = {personId: '8:abcd', mri: '8:abcd', displayName: 'Ivan Ivanov', profile: {avatarUrl: 'http://avatarIvan'}};
const userAscend = {personId: '8:green.streak', mri: '8:green.streak', displayName: 'Ascend', profile: {avatarUrl: 'http://avatarAscend'}};
const userTranslator = {personId: '28:0d5d6cff-595d-49d7-9cf8-973173f5233b', mri: '28:0d5d6cff-595d-49d7-9cf8-973173f5233b', displayName: 'Skype Translator', profile: {avatarUrl: 'http://avatarTranslator'}};
const userSkypebot = {personId: '8:live:test_1', mri: '8:live:test_1', displayName: 'Skypebot test', profile: {avatarUrl: 'http://avatarSkypebot'}};
const userSkype = {personId: '28:concierge', mri: '28:concierge', displayName: 'Skype', profile: {avatarUrl: 'http://avatarSkype'}};
const userName = {personId: '8:live:name', mri: '8:live:name', displayName: 'name test', profile: {avatarUrl: 'http://avatarName'}};

const state = {
    bridge: {},
    puppet: {},

    skypeClient: {
        contacts: [
            userIvan,
            userAscend,
            userTranslator,
            userSkypebot,
            userSkype,
            userName,
        ],
        // sendImage: sendImageStub,
        conversations: [
            {
                id: '19:6047833599b1405f8c1e0bf3ed307c9e@thread.skype',
                members: [
                    userIvan.personId,
                    userAscend.personId,
                    userSkypebot.personId,
                ],
                type: 'Thread',
                threadProperties: {},
            },
        ],
        getContacts: getContactsStub,
        // getConversation: getConversationStub,
        // sendMessage: sendMessageStub,
    },
};

getContactsStub.resolves(state.skypeClient.contacts);

const {getPayload} = clientLib(state.skypeClient);

const handlers = proxyquire('../../src/lib/skype-handler/handlers',
    {
        './lib': state => ({
            inviteSkypeConversationMembers: inviteSkypeConversationMembersStub,
            sendSkypeMessage: sendSkypeMessageStub,
            handleSkypeImage: handleSkypeImageStub,
        }),
    });
const {messageHandler, sentHandler} = handlers(state);

describe('Skype Handler testing', () => {
    it('expect messageHandler returns with message event', async () => {
        await messageHandler(messageData);
        const {raw: sender} = messageData.from;
        const expectedMessage = await getPayload({...messageData, sender});
        expect(sendSkypeMessageStub).to.be.calledWithExactly(expectedMessage);
        expect(inviteSkypeConversationMembersStub).to.be.calledWithExactly(messageData.conversation);
        sendSkypeMessageStub.resetHistory();
        inviteSkypeConversationMembersStub.resetHistory();
    });
    // it('expect imageHandler returns with message event', () => {
    //     await messageHandler(messageData);
    //     const {raw: sender} = messageData.from;
    //     const expectedMessage = await getPayload({...messageData, sender});
    //     expect(sendSkypeMessageStub).to.be.calledWithExactly(expectedMessage);
    //     expect(inviteSkypeConversationMembersStub).to.be.calledWithExactly(messageData.conversation);
    //     sendSkypeMessageStub.resetHistory();
    //     inviteSkypeConversationMembersStub.resetHistory();
    // });
    it('expect messageHandlerStub returns with message event', async () => {
        await sentHandler(eventData);
        const expectedMessage = await getPayload({...messageData});
        expect(sendSkypeMessageStub).to.be.calledWithExactly(expectedMessage);
        expect(inviteSkypeConversationMembersStub).not.to.be.called;
        sendSkypeMessageStub.resetHistory();
    });
});
