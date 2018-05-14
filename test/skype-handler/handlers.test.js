const chai = require('chai');
const {stub} = require('sinon');
const sinonChai = require('sinon-chai');
const {expect} = chai;
chai.use(sinonChai);
const proxyquire = require('proxyquire');
const imageEvent = require('../fixtures/skype-image.json');
const sentEvent = require('../fixtures/skype-sent.json');
const messageEvent = require('../fixtures/skype-message.json');
const inputEvent = require('../fixtures/skype-input.json');

const inviteSkypeConversationMembersStub = stub();
const sendSkypeMessageStub = stub();
const handleSkypeImageStub = stub();

const state = {
    bridge: {},
    puppet: {},
    skypeClient: {
        context: {
            username: 'live:ignore_1',
        },
    },
};

const {messageHandler, imageHandler} = proxyquire('../../src/lib/skype-handler/handlers',
    {
        './lib': state => ({
            inviteSkypeConversationMembers: inviteSkypeConversationMembersStub,
            sendSkypeMessage: sendSkypeMessageStub,
            handleSkypeImage: handleSkypeImageStub,
        }),
    });

describe('Skype Handler testing', () => {
    it('expect messageHandler returns with message event', () => {
        skypeEventHandler(state)(sentEvent);
        expect(sentHandlerStub).to.be.calledWithExactly(sentEvent.resource);
        sentHandlerStub.resetHistory();
    });
    it('expect imageHandler returns with message event', () => {
        skypeEventHandler(state)(imageEvent);
        expect(imageHandlerStub).to.be.calledWithExactly(imageEvent.resource);
        imageHandlerStub.resetHistory();
    });
    it('expect messageHandlerStub returns with message event', () => {
        skypeEventHandler(state)(messageEvent);
        expect(messageHandlerStub).to.be.calledWithExactly(messageEvent.resource);
        messageHandlerStub.resetHistory();
    });
    it('expect sentHandler returns with message event', () => {
        skypeEventHandler(state)(inputEvent);
        expect(messageHandlerStub).not.to.be.called;
        expect(sentHandlerStub).not.to.be.called;
        expect(imageHandlerStub).not.to.be.called;
    });
});
