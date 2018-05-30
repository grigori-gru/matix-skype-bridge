const chai = require('chai');
const {stub, createStubInstance} = require('sinon');
const sinonChai = require('sinon-chai');
const {expect} = chai;
chai.use(sinonChai);
const proxyquire = require('proxyquire');
// const imageEvent = require('../fixtures/skype-image.json');
const {resource: messageData} = require('../fixtures/skype-message.json');
const clientLib = require('../../src/lib/skype-lib/client');
const Puppet = require('../../src/puppet');
const {Bridge, Intent} = require('matrix-appservice-bridge');
const {getMatrixUsers, getRoomAlias} = require('../../src/utils');
const log = require('../../src/modules/log')(module);

const puppetStub = createStubInstance(Puppet);
const bridgeStub = createStubInstance(Bridge);
const bridgeIntentStub = createStubInstance(Intent);
const sendMessageStub = stub();
const getBufferAndTypeStub = stub();

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
    // sendMessage: sendMessageStub,
};

const state = {
    skypeClient: skypeClientMock,
    puppet: puppetStub,
    bridge: bridgeStub,

};

getContactsStub.resolves(state.skypeClient.contacts);

const {getPayload} = clientLib(state.skypeClient);

const logErrorStub = stub();
const handlers = proxyquire('../../src/lib/skype-handler/handlers', {
    '../../utils': {
        getBufferAndType: getBufferAndTypeStub,
    },
    '../../modules/log': () => ({
        error: logErrorStub,
        debug: log.debug,
        info: log.info,
        warn: log.warn,
    }),
});
const {messageHandler, testOnly: {getIntentFomSkypeSender}} = handlers(state);

describe('Skype Handler testing', () => {
    beforeEach(() => {
        bridgeStub.getIntent.returns(bridgeIntentStub);

        bridgeIntentStub.setDisplayName.reset();
        bridgeIntentStub.join.reset();
        sendMessageStub.reset();
        puppetStub.getRoom.reset();
    });

    it('expect messageHandler returns with message event', async () => {
        const {body, roomId} = await getPayload(messageData);
        const roomAlias = getRoomAlias(roomId);

        puppetStub.getRoom.withArgs(roomAlias).returns(matrixRoomId);
        bridgeStub.getIntent.returns(bridgeIntentStub);
        bridgeIntentStub.getClient.returns({credentials: {userId: 'userId'}, sendMessage: sendMessageStub});
        bridgeIntentStub.getProfileInfo.withArgs('userId').returns({'avatar_url': 'currentAvatarUrl', 'displayName': 'displayName'});
        await messageHandler(messageData);

        expect(bridgeIntentStub.setDisplayName).not.to.be.called;
        expect(getBufferAndTypeStub).not.to.be.called;
        expect(bridgeIntentStub.join).to.be.calledWithExactly(matrixRoomId);
        expect(sendMessageStub).to.be.calledWithExactly(matrixRoomId, body);

        const {members} = skypeClientMock.getConversation(messageData.conversation);
        expect(puppetStub.invite).to.be.calledWithExactly(matrixRoomId, getMatrixUsers(members, ''));
    });

    it('expect messageHandler to have throw error inside and not to return anything or to be thrown', async () => {
        puppetStub.getRoom.throws();
        const result = await messageHandler(messageData);
        expect(result).not.to.be;

        expect(bridgeIntentStub.setDisplayName).not.to.be.called;
        expect(bridgeIntentStub.join).not.to.be.called;
        expect(sendMessageStub).not.to.be.called;
        expect(logErrorStub).to.be.calledWith('messageHandler error');
    });

    it('expect creating room if no room is', async () => {
        const {body} = await getPayload(messageData);

        puppetStub.getRoom.resolves(null);
        bridgeIntentStub.getClient.returns({credentials: {userId: 'userId'}, sendMessage: sendMessageStub});
        bridgeIntentStub.getProfileInfo.withArgs('userId').returns({'avatar_url': 'currentAvatarUrl', 'displayName': 'displayName'});
        bridgeIntentStub.createRoom.returns({'room_id': matrixRoomId});
        await messageHandler(messageData);

        expect(bridgeIntentStub.setDisplayName).not.to.be.called;
        expect(getBufferAndTypeStub).not.to.be.called;
        expect(bridgeIntentStub.join).to.be.calledWithExactly(matrixRoomId);
        expect(sendMessageStub).to.be.calledWithExactly(matrixRoomId, body);
        const {members} = skypeClientMock.getConversation(messageData.conversation);
        expect(puppetStub.invite).to.be.calledWithExactly(matrixRoomId, getMatrixUsers(members, ''));
    });

    it('expect getIntentFromSkype to create new name and avatar', async () => {
        const contentUrl = 'result';
        const client = {credentials: {userId: 'fake'}, uploadContent: () => ({'content_uri': contentUrl})};
        bridgeIntentStub.getClient.returns(client);
        bridgeIntentStub.getProfileInfo.withArgs('fake').returns({});
        bridgeIntentStub.setDisplayName.resolves();
        getBufferAndTypeStub.resolves({buffer: 'buffer', type: 'type'});
        await getIntentFomSkypeSender(matrixRoomId, 'userId', 'name', 'htttp://avatarUrl');

        expect(bridgeIntentStub.setAvatarUrl).to.be.calledWithExactly(contentUrl);
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
});
