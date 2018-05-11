const chai = require('chai');
const {stub} = require('sinon');
const sinonChai = require('sinon-chai');
const {expect} = chai;
chai.use(sinonChai);
const proxyquire = require('proxyquire');
const config = require('../../src/config.js');
const {a2b, b2a, getNameFromId, getAvatarUrl, getTextContent} = require('../../src/utils');
const fs = require('fs');
const writeFileStub = stub();
const {skypeify} = require('../../src/lib/skype-lib/skypeify');

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
    sendImageMessageAsPuppetToThirdPartyRoomWithId,
    getPayload,
    getSkypeRoomData,
    testOnly: {
        getContact,
        getSkypeOutputData,
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

    describe('getSkypeOutputData test', () => {
        it('expect getSkypeOutputData returns both senderName and avatarUrl from contact of skypeBot', async () => {
            const data = await getSkypeOutputData(userAscend.personId);
            const expected = {
                senderName: userAscend.displayName,
                avatarUrl: userAscend.profile.avatarUrl,
            };
            expect(data).to.be.deep.equal(expected);
        });
        it('expect getSkypeOutputData returns tail of senderName and avatarUrl from skype if it\'s not in contacts of skypeBot', async () => {
            const id = '8:live:testUser';
            const data = await getSkypeOutputData(id);
            const expected = {
                senderName: getNameFromId(id),
                avatarUrl: getAvatarUrl(id),
            };
            expect(data).to.be.deep.equal(expected);
        });
        it('expect getSkypeOutputData returns senderId as senderName user is not from Skype', async () => {
            const id = 'matrix_user';
            const data = await getSkypeOutputData(id);
            const expected = {
                senderName: id,
            };
            expect(data).to.be.deep.equal(expected);
        });
    });

    describe('getPayload test', () => {
        it('expect getPayload returns sender id and "getSkypeOutputData" if data have sender', async () => {
            const sender = userIvan.personId;
            const data = {
                roomId: 'someRoomName',
                content: 'content',
                sender,
                type: 'RichText',
            };
            const result = await getPayload(data);
            const outputData = await getSkypeOutputData(data.sender);
            const expected = {
                roomId: data.roomId,
                senderId: a2b(data.sender),
                ...outputData,
            };
            expect(result).to.be.deep.equal(expected);
        });
        it('expect getPayload returns senderid with null and no "getSkypeOutputData" if data have no sender or it\'s null', async () => {
            const data = {
                roomId: 'someRoomName',
                content: 'content',
                sender: null,
                type: 'RichText',
            };
            const result = await getPayload(data);
            const expected = {
                roomId: data.roomId,
                senderId: null,
            };
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

    it('expect sendImageMessageAsPuppetToThirdPartyRoomWithId to send image and not to have data in config.tmp dir', async () => {
        const id = a2b('8:live:abcd');
        const data = {
            text: 'text',
            url: 'http://testUrl',
        };

        await sendImageMessageAsPuppetToThirdPartyRoomWithId(id, data);

        const expectedMessage = {
            file: config.tmpPath,
            name: data.text,
        };
        const expectedConversationId = b2a(id);
        const files = fs.readdirSync(config.tmpPath);
        expect(writeFileStub).not.to.be.called;
        expect(sendImageStub).to.be.calledWithExactly(expectedMessage, expectedConversationId);
        expect(files).to.be.empty;
    });

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

            await sendTextToSkype(id, text, data);

            expect(getDisplayNameStub).to.be.calledWithExactly(data.sender);
            expect(sendMessageStub).to.be.calledWithExactly(b2a(id), {textContent});
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
