const chai = require('chai');
const {stub, createStubInstance} = require('sinon');
const sinonChai = require('sinon-chai');
const {expect} = chai;
chai.use(sinonChai);
const proxyquire = require('proxyquire');
const {getMatrixUser, getRoomAlias, tagMatrixMessage, getTextContent, toMatrixRoomFormat, toMatrixUserFormat} = require('../../src/utils');
const {Bridge, Intent} = require('matrix-appservice-bridge');
const log = require('../../src/modules/log')(module);

const {data: ghostEventData} = require('../fixtures/matrix/member-ghost.json');
const {data: textEventData} = require('../fixtures/matrix/text.msg.json');
const {data: fileEventData} = require('../fixtures/matrix/m.file.json');
const {data: imageEventData} = require('../fixtures/matrix/m.image.json');
const {data: commandTextEventData} = require('../fixtures/matrix/command-text-msg.json');

const Puppet = require('../../src/puppet');
const getDisplayNameStub = stub();
const puppetStub = createStubInstance(Puppet);
const bridgeStub = createStubInstance(Bridge);
const bridgeIntentStub = createStubInstance(Intent);
const joinRoomStub = stub();
bridgeStub.getIntent.returns(bridgeIntentStub);

const sendMessageStub = stub();
const logWarnStub = stub();
const logErrorStub = stub();
const getContactsStub = stub();

const userIvan = {personId: '8:abcd', mri: '8:abcd', displayName: 'Ivan Ivanov', profile: {avatarUrl: 'http://avatarIvan'}};
const userAscend = {personId: '8:live:gv_grudinin', mri: '8:live:gv_grudinin', displayName: 'Ascend', profile: {avatarUrl: 'http://avatarAscend'}};
const userTranslator = {personId: '28:0d5d6cff-595d-49d7-9cf8-973173f5233b', mri: '28:0d5d6cff-595d-49d7-9cf8-973173f5233b', displayName: 'Skype Translator', profile: {avatarUrl: 'http://avatarTranslator'}};
const userSkypebot = {personId: '8:live:test_1', mri: '8:live:test_1', displayName: 'Skypebot test', profile: {avatarUrl: 'http://avatarSkypebot'}};
const userSkype = {personId: '28:concierge', mri: '28:concierge', displayName: 'Skype', profile: {avatarUrl: 'http://avatarSkype'}};
const userBob = {personId: '8:live:bob', mri: '8:live:bob', displayName: 'user Bob', profile: {avatarUrl: 'http://userBobAvatar'}};

const contacts = [
    userIvan,
    userAscend,
    userTranslator,
    userSkypebot,
    userSkype,
    userBob,
];

const matrixRoomId = 'matrixRoomId';
const testUrl = 'http://testUrl';

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
puppetStub.getUserId.returns(getMatrixUser('newskypebot'));
puppetStub.getHttpUrl.returns(testUrl);

const createConversationStub = stub();
const setConversationTopicStub = stub();
const addMemberToConversationStub = stub();
const sendImageStub = stub();

const skypeClientMock = {
    contacts,
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
                userBob.personId,
                userSkypebot.personId,
            ],
            type: 'Thread',
            threadProperties: {},
        },
    ],
    context: {
        username: 'skypebot:live',
    },
    getContacts: getContactsStub,
    getConversation: convId => skypeClientMock.conversations.find(({id}) => id === convId),
    sendMessage: sendMessageStub,
    createConversation: createConversationStub,
    setConversationTopic: setConversationTopicStub,
    addMemberToConversation: addMemberToConversationStub,
    sendImage: sendImageStub,
};

getContactsStub.resolves(skypeClientMock.contacts);

const usersCollection = {
    [getMatrixUser('skypebot', '')]: {
        'avatar_url': 'url',
        'displayname': 'skypebot',
    },
    [getMatrixUser('user', '')]: {
        'avatar_url': 'url',
        'displayname': 'user',
    },
    [getMatrixUser(toMatrixUserFormat(userBob.personId))]: {
        'avatar_url': userBob.profile.avatarUrl,
        'displayname': userBob.displayName,
    },
    [getMatrixUser('newSkypebot', '')]: {
        'avatar_url': 'url',
        'displayname': 'newSkypebot',
    },
};

const bridgeBot = {
    getClient: () => ({joinRoom: joinRoomStub}),
    getUserId: () => getMatrixUser('skypebot'),
    getJoinedMembers: stub().returns(usersCollection),
};
bridgeStub.getBot.returns(bridgeBot);


const state = {
    skypeClient: skypeClientMock,
    puppet: puppetStub,
    bridge: bridgeStub,
};

const logDebugStub = stub();
const setRoomAliasStub = stub();
const getRoomNameStub = stub();
const logInfoStub = stub();
const downloadDataByUrlStub = stub();

const handlers = proxyquire('../../src/lib/matrix-handler/handlers', {
    '../../utils': {
        'getDisplayName': getDisplayNameStub,
        'setRoomAlias': setRoomAliasStub,
        'getRoomName': getRoomNameStub,
        'getBufferByUrl': downloadDataByUrlStub,
        '@global': true,
    },
    '../../modules/log': module => ({
        'debug': logDebugStub,
        'warn': logWarnStub,
        'error': logErrorStub,
        'info': logInfoStub,
        '@global': true,
    }),
});
// logDebugStub.callsFake(log.debug);

const {handleMatrixMessageEvent, handleMatrixMemberEvent, testOnly: {getMatrixPayload}} = handlers(state);
const skypeRoomName = 'skypeRoomName';

describe('Matrix handler integ testing', () => {
    const existRoom = 'existRoom';

    beforeEach(() => {
        logDebugStub.callsFake(log.debug);
        logErrorStub.callsFake(log.error);
        logInfoStub.callsFake(log.info);
        logWarnStub.callsFake(log.warn);
    });

    afterEach(() => {
        logDebugStub.reset();
        logErrorStub.reset();
        logInfoStub.reset();
        logWarnStub.reset();
    });

    describe('Integ message matrix handler test', () => {
        afterEach(() => {
            puppetStub.getRoomAliases.reset();
            sendMessageStub.reset();
            sendImageStub.reset();
        });

        it('Text message testing', async () => {
            puppetStub.getRoomAliases.returns([getRoomAlias(toMatrixRoomFormat(existRoom))]);
            const getDisplayName = sender => `${sender}DisplayName`;
            getDisplayNameStub.callsFake(getDisplayName);
            await handleMatrixMessageEvent(textEventData);

            const text = tagMatrixMessage(textEventData.content.body);
            const expectedText = {textContent: getTextContent(getDisplayName(textEventData.sender), text)};

            expect(sendMessageStub).to.be.calledWithExactly(expectedText, existRoom);
            expect(sendImageStub).not.to.be.called;
        });

        it('Expect undefined returns if no data we get', async () => {
            const msgtype = 'unexpected';
            const messageData = {
                content: {
                    msgtype,
                },
            };

            await handleMatrixMessageEvent(messageData);

            expect(sendMessageStub).not.to.be.called;
            expect(sendImageStub).not.to.be.called;
        });
    });

    describe('Integ jiraBot command message matrix handler test', () => {
        afterEach(() => {
            puppetStub.getRoomAliases.reset();
            sendMessageStub.reset();
            sendImageStub.reset();
        });

        it('command text message testing', async () => {
            puppetStub.getRoomAliases.returns([getRoomAlias(toMatrixRoomFormat(existRoom))]);
            const getDisplayName = sender => `${sender}DisplayName`;
            getDisplayNameStub.callsFake(getDisplayName);

            await handleMatrixMessageEvent(commandTextEventData);

            const text = tagMatrixMessage(commandTextEventData.content.formatted_body);
            const expectedText = {textContent: getTextContent(getDisplayName(commandTextEventData.sender), text)};

            expect(sendMessageStub).to.be.calledWithExactly(expectedText, existRoom);
            expect(sendImageStub).not.to.be.called;
        });
    });

    describe('Integ matrix member event handler test', () => {
        afterEach(() => {
            logDebugStub.reset();
            puppetStub.getRoomAliases.reset();
            joinRoomStub.reset();
        });

        it('Handle invite ghost event if skype conversation is already exists', async () => {
            const {room_id: matrixRoomId} = ghostEventData;
            getRoomNameStub.returns(skypeRoomName);

            puppetStub.getRoomAliases.returns([getRoomAlias(toMatrixRoomFormat(existRoom))]);

            await handleMatrixMemberEvent(ghostEventData);

            expect(logDebugStub).not.to.be.calledWithExactly('ignored a matrix event');
            expect(addMemberToConversationStub).to.be.calledWithExactly(matrixRoomId, userAscend.personId);
            expect(joinRoomStub).not.to.be.called;
        });

        it('Handle invite ghost event', async () => {
            const {room_id: matrixRoomId} = ghostEventData;
            const newSkypeConversation = 'newSkypeConversation';
            getRoomNameStub.returns(skypeRoomName);
            createConversationStub.returns(newSkypeConversation);

            await handleMatrixMemberEvent(ghostEventData);

            expect(logErrorStub).not.to.be.called;
            expect(logDebugStub).not.to.be.calledWithExactly('ignored a matrix event');
            expect(bridgeBot.getJoinedMembers).to.be.calledWithExactly(matrixRoomId);
            expect(joinRoomStub).to.be.calledWithExactly(matrixRoomId);
            expect(createConversationStub).to.be.calledWithExactly({
                users: [userBob.personId],
                admins: [`8:${skypeClientMock.context.username}`]});

            expect(setRoomAliasStub).to.be.calledWithExactly(matrixRoomId,
                getRoomAlias(toMatrixRoomFormat(newSkypeConversation)));
        });
    });

    describe('Integ matrix file test', () => {
        afterEach(() => {
            sendMessageStub.reset();
            sendImageStub.reset();
            logErrorStub.reset();
        });

        it('Expect file from matrix to be send to skype', async () => {
            const data = await getMatrixPayload(fileEventData);
            log.debug(data);
            const {skypeConversation, displayName, url} = data;

            await handleMatrixMessageEvent(fileEventData);

            expect(sendImageStub).not.to.be.calledWithExactly({skypeConversation, body: url, displayName});
            expect(sendMessageStub).to.be.called;
        });
    });

    describe('Integ matrix image test', () => {
        afterEach(() => {
            sendMessageStub.reset();
            sendImageStub.reset();
            logErrorStub.reset();
        });

        it('Expect image from matrix to be send to skype', async () => {
            await handleMatrixMessageEvent(imageEventData);

            expect(logErrorStub).not.to.be.called;
            expect(sendMessageStub).not.to.be.called;
            expect(sendImageStub).to.be.called;
        });
    });
});

