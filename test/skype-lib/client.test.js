const chai = require('chai');
const {stub} = require('sinon');
const sinonChai = require('sinon-chai');
const {expect} = chai;
chai.use(sinonChai);
const proxyquire = require('proxyquire');
const config = require('../../src/config.js');
const {a2b, b2a} = require('../../src/utils');
const fs = require('fs');

// const readlineStub = stub();
const writeFileStub = stub();
// const createClientStub = stub();

const skypeLib = proxyquire('../../src/lib/skype-lib/client',
    {
        'fs': {
            writeFile: writeFileStub,
        },
    });
const sendImageStub = stub();

const skypeApiMock = {
    contacts: [],
    sendImage: sendImageStub,
};

const {sendImageMessageAsPuppetToThirdPartyRoomWithId} = skypeLib(skypeApiMock);

describe('Client testing', () => {
    it('getContact', async () => {});

    it('expect sendImageMessageAsPuppetToThirdPartyRoomWithId to send image and not to have data in tmp dir', async () => {
        const id = a2b('8:live:abcd');
        const data = {
            text: 'text',
            url: 'http://testUrl',
        };

        sendImageMessageAsPuppetToThirdPartyRoomWithId(id, data);

        const expectedMessage = {
            file: config.tmpPath,
            name: data.text,
        };
        const expectedConversationId = b2a(id);
        const files = fs.readdirSync(config.tmpPath);

        expect(sendImageStub).to.be.calledWithExactly(expectedMessage, expectedConversationId);
        expect(files).to.be.empty;
    });
});
