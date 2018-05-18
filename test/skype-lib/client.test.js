const log = require('../../src/modules/log')(module);
const chai = require('chai');
const {stub} = require('sinon');
const sinonChai = require('sinon-chai');
const {expect} = chai;
chai.use(sinonChai);
const proxyquire = require('proxyquire');
// const config = require('../../src/config.js');
const {a2b, getNameFromId, getAvatarUrl, getTextContent, getBody, getRoomId} = require('../../src/utils');
// const fs = require('fs');
const writeFileStub = stub();
const {skypeify} = require('../../src/lib/skype-lib/skypeify');
const imageEvent = require('../fixtures/skype-image.json');
const messageEvent = require('../fixtures/skype-message.json');

const sendImageStub = stub();
const getConversationStub = stub();
const sendMessageStub = stub();
const getDisplayNameStub = stub();
const getContactsStub = stub();

const skypeLib = proxyquire('../../src/lib/skype-lib/client',
    {
        'fs': {
            writeFile: writeFileStub,
        },
        '../../utils': {
            getDisplayName: getDisplayNameStub,
        },
    });

const userIvan = {personId: '8:abcd', mri: '8:abcd', displayName: 'Ivan Ivanov', profile: {avatarUrl: 'http://avatarIvan'}};
const userAscend = {personId: '8:green.streak', mri: '8:green.streak', displayName: 'Ascend', profile: {avatarUrl: 'http://avatarAscend'}};
const userTranslator = {personId: '28:0d5d6cff-595d-49d7-9cf8-973173f5233b', mri: '28:0d5d6cff-595d-49d7-9cf8-973173f5233b', displayName: 'Skype Translator', profile: {avatarUrl: 'http://avatarTranslator'}};
const userSkypebot = {personId: '8:live:test_1', mri: '8:live:test_1', displayName: 'Skypebot test', profile: {avatarUrl: 'http://avatarSkypebot'}};
const userSkype = {personId: '28:concierge', mri: '28:concierge', displayName: 'Skype', profile: {avatarUrl: 'http://avatarSkype'}};
const userName = {personId: '8:live:name', mri: '8:live:name', displayName: 'name test', profile: {avatarUrl: 'http://avatarName'}};

const skypeApiMock = {
    contacts: [
        userIvan,
        userAscend,
        userTranslator,
        userSkypebot,
        userSkype,
        userName,
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
    getContacts: getContactsStub,
    getConversation: getConversationStub,
    sendMessage: sendMessageStub,
};

getContactsStub.resolves(skypeApiMock.contacts);

const {
    sendTextToSkype,
    // sendImageToSkype,
    getPayload,
    getSkypeRoomData,
    testOnly: {
        getContact,
        getUserData,
    },
} = skypeLib(skypeApiMock);

describe('Client testing', () => {
    it('expect getContact return correct id', async () => {
        const contact = await getContact(userIvan.personId);
        expect(contact).to.be.equal(userIvan);
    });

    it('expect getContact not return correct id with null', async () => {
        const contact = await getContact(null);
        expect(contact).to.be.undefined;
    });

    describe('getUserData test', () => {
        it('expect getUserData returns both senderName and avatarUrl from contact of skypeBot', async () => {
            const data = await getUserData(userAscend.personId);
            const expected = {
                senderName: userAscend.displayName,
                avatarUrl: userAscend.profile.avatarUrl,
                senderId: a2b(userAscend.personId),
            };
            expect(data).to.be.deep.equal(expected);
        });
        it('expect getUserData returns tail of senderName and avatarUrl from skype if it\'s not in contacts of skypeBot', async () => {
            const id = '8:live:testUser';
            const data = await getUserData(id);
            const expected = {
                senderName: getNameFromId(id),
                avatarUrl: getAvatarUrl(id),
                senderId: a2b(id),
            };
            expect(data).to.be.deep.equal(expected);
        });
        it('expect getUserData returns senderId as senderName user is not from Skype', async () => {
            const id = 'matrix_user';
            const data = await getUserData(id);
            const expected = {
                senderName: id,
                senderId: a2b(id),
            };
            expect(data).to.be.deep.equal(expected);
        });
        it('expect getUserData returns empty object if no sender we have', async () => {
            const data = await getUserData(null);
            const expected = {};
            expect(data).to.be.deep.equal(expected);
        });
    });

    describe('getPayload test', () => {
        it('expect getPayload returns correct from message event', async () => {
            const data = messageEvent.resource;
            const result = await getPayload(data);
            const userData = await getUserData(data.from.raw);
            const expected = {
                roomId: getRoomId(data.conversation),
                userData,
                body: getBody(data.content, userData.senderId, data.html),
            };
            expect(result).to.be.deep.equal(expected);
        });
        it('expect getPayload returns correct from image event', async () => {
            const data = imageEvent.resource;
            const result = await getPayload(data);
            const userData = await getUserData(data.from.raw);

            const expected = {
                roomId: getRoomId(data.conversation),
                userData,
                body: getBody(data.content, userData.senderId, data.html),
            };
            log.debug(result);
            expect(result).to.be.deep.equal(expected);
        });
    });

    describe('getSkypeRoomData test', () => {
        it('expect getSkypeRoomData returns the same name and topic if no topic has no conversation', async () => {
            const [conversation] = skypeApiMock.conversations;
            const roomId = conversation.id;
            const testRoomId = a2b(roomId);
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
            const testRoomId = a2b(roomId);
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
            const testRoomId = a2b(roomId);
            getConversationStub.callsFake().throws();
            try {
                await getSkypeRoomData(testRoomId);
            } catch (err) {
                expect(getConversationStub).to.be.calledWithExactly(roomId);
                expect(err).to.be;
            }
        });
    });

    // it('expect sendImageToSkype to send image and not to have data in config.tmp dir', async () => {
    //     const id = a2b('8:live:abcd');
    //     const data = {
    //         text: 'text',
    //         url: 'http://testUrl',
    //     };

    //     await sendImageToSkype(id, data);

    //     const expectedMessage = {
    //         file: config.tmpPath,
    //         name: data.text,
    //     };
    //     const expectedConversationId = b2a(id);
    //     const files = fs.readdirSync(config.tmpPath);
    //     expect(writeFileStub).not.to.be.called;
    //     expect(sendImageStub).to.be.calledWithExactly(expectedMessage, expectedConversationId);
    //     expect(files).to.be.empty;
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
            getDisplayNameStub.callsFake().resolves(displayName);
            sendMessageStub.resolves();

            await sendTextToSkype(id, text, data.sender);

            expect(getDisplayNameStub).to.be.calledWithExactly(data.sender);
            expect(sendMessageStub).to.be.calledWithExactly({textContent}, id);
            sendMessageStub.resetHistory();
        });

        it('expect sendTextToSkype to be thrown', async () => {
            const id = 'skypeRoomId';
            const text = 'some tesxt';
            const data = {
                sender: 'sender',
            };
            getDisplayNameStub.callsFake().throws();
            try {
                await sendTextToSkype(id, text, data);
            } catch (err) {
                expect(err).to.be;
                expect(sendMessageStub).not.to.be.called;
            }
        });
    });
});
