const chai = require('chai');
const {stub, createStubInstance} = require('sinon');
const sinonChai = require('sinon-chai');
const {expect} = chai;
chai.use(sinonChai);
const proxyquire = require('proxyquire');
const {getTextContent, a2b} = require('../../src/utils');
const {Bridge} = require('matrix-appservice-bridge');
const log = require('../../src/modules/log')(module);
const {getRoomAlias, tagMatrixMessage} = require('../../src/config').clientData;

// const {data: ghostEventData} = require('../fixtures/matrix/member-ghost.json');
// const {data: puppetEventData} = require('../fixtures/matrix/member-puppet.json');
// const {data: skypebotEventData} = require('../fixtures/matrix/member-skypebot.json');
const {data: textEventData} = require('../fixtures/matrix/text.msg.json');

const Puppet = require('../../src/puppet');
// const handlers = require('../../src/lib/matrix-handler');
const getDisplayNameStub = stub();
const puppetStub = createStubInstance(Puppet);
const bridgeStub = createStubInstance(Bridge);
// const bridgeIntentStub = createStubInstance(Intent);
const sendMessageStub = stub();
// const getBufferAndTypeStub = stub();
const logWarnStub = stub();
// const handleSkypeImageStub = stub();
const getContactsStub = stub();

const userIvan = {personId: '8:abcd', mri: '8:abcd', displayName: 'Ivan Ivanov', profile: {avatarUrl: 'http://avatarIvan'}};
const userAscend = {personId: '8:green.streak', mri: '8:green.streak', displayName: 'Ascend', profile: {avatarUrl: 'http://avatarAscend'}};
const userTranslator = {personId: '28:0d5d6cff-595d-49d7-9cf8-973173f5233b', mri: '28:0d5d6cff-595d-49d7-9cf8-973173f5233b', displayName: 'Skype Translator', profile: {avatarUrl: 'http://avatarTranslator'}};
const userSkypebot = {personId: '8:live:test_1', mri: '8:live:test_1', displayName: 'Skypebot test', profile: {avatarUrl: 'http://avatarSkypebot'}};
const userSkype = {personId: '28:concierge', mri: '28:concierge', displayName: 'Skype', profile: {avatarUrl: 'http://avatarSkype'}};
const userName = {personId: '8:live:name', mri: '8:live:name', displayName: 'name test', profile: {avatarUrl: 'http://avatarName'}};

const matrixRoomId = 'matrixRoomId';

const puppetClientStub = {
    matrixRoomMembers: {
        [matrixRoomId]: [
            '@kryshitelb:test.domain',
            '@skypebot:test.domain',
            '@gv_grudinin:test.domain',
            '@newskypebot:test.domain',
        ],
    },
};
puppetStub.getClient.returns(puppetClientStub);
puppetStub.getMatrixRoomMembers.callsFake(id => puppetClientStub.matrixRoomMembers[id]);

const skypeClientMock = {
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
        {
            id: '19:70e563f7ea0f4d2097adcabe5ba71d13@thread.skype',
            members: [
                userAscend.personId,
                userName.personId,
                userSkypebot.personId,
            ],
            type: 'Thread',
            threadProperties: {},
        },
    ],
    getContacts: getContactsStub,
    getConversation: convId => skypeClientMock.conversations.find(({id}) => id === convId),
    sendMessage: sendMessageStub,
};

const state = {
    skypeClient: skypeClientMock,
    puppet: puppetStub,
    bridge: bridgeStub,

};


const handlers = proxyquire('../../src/lib/matrix-handler/handlers', {
    '../../utils': {
        getDisplayName: getDisplayNameStub,
    },
    '../../modules/log': () => ({
        debug: log.debug,
        warn: logWarnStub,
        error: stub(),
    }),
});

describe('Integ matrix handler test', () => {
    const expectedRoom = 'expectedRoom';
    const {handleMatrixMessageEvent} = handlers(state);
    it('Text message testing', async () => {
        puppetStub.getMatrixRoomById.returns({
            getAliases: () => [
                getRoomAlias(a2b(expectedRoom)),

            ],
        });
        const getDisplayName = sender => `${sender}DisplayName`;
        getDisplayNameStub.callsFake(getDisplayName);
        await handleMatrixMessageEvent(textEventData);
        const text = tagMatrixMessage(textEventData.content.body);
        const expectedText = {textContent: getTextContent(getDisplayName(textEventData.sender), text)};
        expect(sendMessageStub).to.be.calledWithExactly(expectedText, expectedRoom);
    });

    it('Expect undefined returns if no data we get', async () => {
        const msgtype = 'unexpected';
        const messageData = {
            content: {
                msgtype,
            },
        };
        await handleMatrixMessageEvent(messageData);
        expect(logWarnStub).to.be.calledWithExactly('dont know how to handle this msgtype', msgtype);
    });
});
