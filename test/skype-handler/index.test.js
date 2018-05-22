const chai = require('chai');
const {stub} = require('sinon');
const sinonChai = require('sinon-chai');
const {expect} = chai;
chai.use(sinonChai);
const proxyquire = require('proxyquire');
const imageEvent = require('../fixtures/skype-image.json');
const matrixEvent = require('../fixtures/skype-sent.json');
const messageEvent = require('../fixtures/skype-message.json');
const inputEvent = require('../fixtures/skype-input.json');

const messageHandlerStub = stub();
const imageHandlerStub = stub();
const debugSpy = stub();

const skypeClient = {
    context: {
        username: 'live:ignore_1',
    },
};
const state = {skypeClient};

const handlers = proxyquire('../../src/lib/skype-handler',
    {
        './handlers': state => ({
            messageHandler: messageHandlerStub,
            imageHandler: imageHandlerStub,
        }),
        '../../modules/log': () => ({
            debug: debugSpy,
        }),
    });
const skypeEventHandler = handlers.skypeEventHandler(state);

describe('Skype event testing', () => {
    it('expect imageHandler returns with message event', () => {
        skypeEventHandler(imageEvent);
        expect(imageHandlerStub).to.be.calledWithExactly(imageEvent.resource);
        imageHandlerStub.resetHistory();
    });

    it('expect messageHandlerStub returns with message event', () => {
        skypeEventHandler(messageEvent);
        expect(messageHandlerStub).to.be.calledWithExactly(messageEvent.resource);
        messageHandlerStub.resetHistory();
    });

    it('expect no handlers to be return with not allowed event', () => {
        skypeEventHandler(inputEvent);
        expect(messageHandlerStub).not.to.be.called;
        expect(imageHandlerStub).not.to.be.called;
    });

    it('expect no handlers to be return with skypebot message', () => {
        skypeEventHandler(matrixEvent);
        expect(messageHandlerStub).not.to.be.called;
        expect(imageHandlerStub).not.to.be.called;
        expect(debugSpy).to.have.been.calledWithExactly('it is from matrix, so just ignore it.');
    });
});
