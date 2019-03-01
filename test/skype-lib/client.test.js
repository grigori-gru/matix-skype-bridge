const fs = require('fs').promises;
const {file} = require('tmp-promise');
const log = require('../../src/modules/log')(module);
const chai = require('chai');
const {stub} = require('sinon');
const sinonChai = require('sinon-chai');
const {expect} = chai;
chai.use(sinonChai);
const proxyquire = require('proxyquire');
// const config = require('../../src/config.js');
const {
    getMatrixUser,
    toMatrixRoomFormat,
    toMatrixUserFormat,
    getAvatarUrl,
    getTextContent,
    getBody,
    getMatrixRoomId,
} = require('../../src/utils');

const {skypeify} = require('../../src/lib/skype-lib/skypeify');
const imageEvent = require('../fixtures/skype-image.json');
const messageEvent = require('../fixtures/skype-message.json');

const sendImageStub = stub();
const getConversationStub = stub();
const sendMessageStub = stub();
const getDisplayNameStub = stub();
const getContactsStub = stub();
const getRoomNameStub = stub();
const createConversationStub = stub();
const setConversationTopicStub = stub();
const downloadDataByUrlStub = stub();

const skypeLib = proxyquire('../../src/lib/skype-lib/client',
    {
        '../../utils': {
            getDisplayName: getDisplayNameStub,
            getRoomName: getRoomNameStub,
            getBufferByUrl: downloadDataByUrlStub,
        },
    });

const userIvan = {personId: '8:abcd', mri: '8:abcd', displayName: 'Ivan Ivanov', profile: {avatarUrl: 'http://avatarIvan'}};
const userAscend = {personId: '8:green.streak', mri: '8:green.streak', displayName: 'Ascend', profile: {avatarUrl: 'http://avatarAscend'}};
const userTranslator = {personId: '28:0d5d6cff-595d-49d7-9cf8-973173f5233b', mri: '28:0d5d6cff-595d-49d7-9cf8-973173f5233b', displayName: 'Skype Translator', profile: {avatarUrl: 'http://avatarTranslator'}};
const userSkypebot = {personId: '8:live:test_1', mri: '8:live:test_1', displayName: 'Skypebot test', profile: {avatarUrl: 'http://avatarSkypebot'}};
const userSkype = {personId: '28:concierge', mri: '28:concierge', displayName: 'Skype', profile: {avatarUrl: 'http://avatarSkype'}};
const userBob = {personId: '8:live:bob', mri: '8:live:bob', displayName: 'user Bob', profile: {avatarUrl: 'http://userBobAvatar'}};

const skypeApiMock = {
    contacts: [
        userIvan,
        userAscend,
        userTranslator,
        userSkypebot,
        userSkype,
        userBob,
    ],
    sendImage: sendImageStub,
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
    createConversation: createConversationStub,
    getContacts: getContactsStub,
    getConversation: getConversationStub,
    sendMessage: sendMessageStub,
    context: {
        username: 'skypebot:live',
    },
    setConversationTopic: setConversationTopicStub,
};

getContactsStub.resolves(skypeApiMock.contacts);

const {
    createConversation,
    // sendDocToSkype,
    getPayload,
    getSkypeRoomData,
    testOnly: {
        getContact,
        getUserData,
        saveDataByUrl,
        sendTextToSkype,
    },
} = skypeLib(skypeApiMock);

const {native} = messageEvent.resource;

describe('Client testing', () => {
    it('expect getContact return correct id', async () => {
        const contact = await getContact(userIvan.personId);
        expect(contact).to.be.equal(userIvan);
    });

    it('expect getContact not return correct id with null', async () => {
        const contact = await getContact(null);
        expect(contact).to.be.undefined;
    });

    describe('CreateConversation test', () => {
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
        const matrixRoomName = 'matrixRoomName';
        const skypeConversation = 'skypeConversation';

        it('Expect skype converstion to be created and new room name returned', async () => {
            createConversationStub.resolves(skypeConversation);
            const result = await createConversation(usersCollection, matrixRoomName);

            expect(createConversationStub).to.be.calledWithExactly({
                users: [userBob.personId],
                admins: [`8:${skypeApiMock.context.username}`]});
            expect(setConversationTopicStub).to.be.calledWithExactly(skypeConversation, matrixRoomName);
            expect(result).to.be.equal(toMatrixRoomFormat(skypeConversation));
        });
    });

    describe('getUserData test', () => {
        it('expect getUserData returns both senderName and avatarUrl from contact of skypeBot', async () => {
            const data = await getUserData(userAscend.personId);
            const expected = {
                senderName: userAscend.displayName,
                avatarUrl: userAscend.profile.avatarUrl,
                senderId: toMatrixUserFormat(userAscend.personId),
            };
            expect(data).to.be.deep.equal(expected);
        });
        it('expect getUserData returns tail of senderName and avatarUrl from skype if it\'s not in contacts of skypeBot', async () => {
            const id = '8:live:testUser';
            const data = await getUserData(id, native);
            const expected = {
                senderName: native.imdisplayname,
                avatarUrl: getAvatarUrl(id),
                senderId: toMatrixUserFormat(id),
            };
            expect(data).to.be.deep.equal(expected);
        });
        it('expect getUserData returns senderId as senderName user is not from Skype', async () => {
            const id = 'matrix_user';
            const data = await getUserData(id, native);
            const expected = {
                senderName: native.imdisplayname,
                senderId: toMatrixUserFormat(id),
                // eslint-disable-next-line
                avatarUrl: undefined,
            };
            expect(data).to.be.deep.equal(expected);
        });
    });

    describe('getPayload test', () => {
        it('expect getPayload returns correct from message event', async () => {
            const data = messageEvent.resource;
            const result = await getPayload(data);
            const userData = await getUserData(data.from.raw, native);
            const expected = {
                roomId: getMatrixRoomId(data.conversation),
                userData,
                body: getBody(data.content, userData.senderId, data.html),
            };
            expect(result).to.be.deep.equal(expected);
        });
        it('expect getPayload returns correct from image event', async () => {
            const data = imageEvent.resource;
            const result = await getPayload(data);
            const userData = await getUserData(data.from.raw, native);

            const expected = {
                roomId: getMatrixRoomId(data.conversation),
                userData,
                body: getBody(data.original_file_name, userData.senderId, data.html),
            };
            log.debug(result);
            expect(result).to.be.deep.equal(expected);
        });
    });

    describe('getSkypeRoomData test', () => {
        it('expect getSkypeRoomData returns the same name and topic if no topic has no conversation', async () => {
            const [conversation] = skypeApiMock.conversations;
            const roomId = conversation.id;
            const testRoomId = toMatrixRoomFormat(roomId);
            getConversationStub.callsFake().resolves(conversation);

            const result = await getSkypeRoomData(testRoomId);
            const expected = {
                name: 'Skype Group Chat',
                topic: 'Skype Group Chat',
            };
            expect(getConversationStub).to.be.calledWithExactly(roomId);
            expect(result).to.be.deep.equal(expected);
        });

        it('expect getSkypeRoomData returns correct name and topic', async () => {
            const topic = skypeify('test topic');
            const conversation = {...skypeApiMock.conversations[0], threadProperties: {topic}};
            const roomId = conversation.id;
            const testRoomId = toMatrixRoomFormat(roomId);
            getConversationStub.callsFake().resolves(conversation);

            const result = await getSkypeRoomData(testRoomId);
            const expected = {
                topic: 'Skype Group Chat',
                name: 'test topic',
            };
            expect(getConversationStub).to.be.calledWithExactly(roomId);
            expect(result).to.be.deep.equal(expected);
        });

        it('expect getSkypeRoomData to be thrown', async () => {
            const topic = skypeify('test topic');
            const conversation = {...skypeApiMock.conversations[0], threadProperties: {topic}};
            const roomId = conversation.id;
            const testRoomId = toMatrixRoomFormat(roomId);
            getConversationStub.callsFake().throws();
            try {
                await getSkypeRoomData(testRoomId);
            } catch (err) {
                expect(getConversationStub).to.be.calledWithExactly(roomId);
                expect(err).to.be;
            }
        });
    });

    // it('expect sendDocToSkype to send image and not to have data in config.tmp dir', async () => {
    //     const id = toMatrixUserFormat('8:live:abcd');
    //     const data = {
    //         text: 'text',
    //         url: 'http://testUrl',
    //     };

    //     await sendDocToSkype(id, data);

    //     const expectedMessage = {
    //         name: data.text,
    //     };
    //     const expectedConversationId = toSkypeRoomFormat(id);
    //     expect(writeFileStub).not.to.be.called;
    //     expect(sendImageStub).to.be.calledWithExactly(expectedMessage, expectedConversationId);
    // });

    describe('sendTextToSkype test', () => {
        it('expect sendTextToSkype returns the same name and topic if no topic has no conversation', async () => {
            const id = 'skypeRoomId';
            const text = 'some tesxt';
            const data = {
                sender: 'sender',
            };
            const displayName = `${data.sender}DisplayName`;
            const textContent = skypeify(getTextContent(displayName, text));
            sendMessageStub.resolves();

            await sendTextToSkype(id, text, displayName);

            expect(sendMessageStub).to.be.calledWithExactly({textContent}, id);
            sendMessageStub.resetHistory();
        });

        it('expect sendTextToSkype to be thrown', async () => {
            const id = 'skypeRoomId';
            const text = 'some tesxt';
            const data = {
                sender: 'sender',
            };
            sendMessageStub.throws();
            try {
                const result = await sendTextToSkype(id, text, data);
                expect(result).not.to.be;
            } catch (err) {
                expect(err).to.be;
                expect(sendMessageStub).to.be.thrown;
            }
        });
    });

    describe('Test saveDataByUrl', () => {
        let data;
        const testUrl = 'http://testUrl';
        const dataToSave = 'Some data';

        beforeEach(async () => {
            data = await file();
            downloadDataByUrlStub.returns(dataToSave);
        });

        afterEach(() => {
            data.cleanup();
        });

        it('expect saveDataByUrl to save data', async () => {
            await saveDataByUrl(testUrl, data.path);

            const dataFromTmpFile = await fs.readFile(data.path, {encoding: 'utf-8', flag: 'r'});
            expect(downloadDataByUrlStub).to.be.calledWithExactly(testUrl);
            expect(dataFromTmpFile).to.be.equal(dataToSave);
        });
    });
});
