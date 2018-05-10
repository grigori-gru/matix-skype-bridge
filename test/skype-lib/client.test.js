const chai = require('chai');
const {stub} = require('sinon');
const sinonChai = require('sinon-chai');
const {expect} = chai;
chai.use(sinonChai);
const proxyquire = require('proxyquire');
const config = require('../../src/config.js');
const {a2b, b2a, getNameFromId, getAvatarUrl} = require('../../src/utils');
const fs = require('fs');
const writeFileStub = stub();

const skypeLib = proxyquire('../../src/lib/skype-lib/client',
    {
        'fs': {
            writeFile: writeFileStub,
        },
    });
const sendImageStub = stub();

const userIvan = {personId: '8:abcd', mri: '8:abcd', displayName: 'Ivan Ivanov', profile: {avatarUrl: 'http://avatarIvan'}};
const userAscend = {personId: '8:green.streak', mri: '8:green.streak', displayName: 'Ascend', profile: {avatarUrl: 'http://avatarAscend'}};
const userTranslator = {personId: '28:0d5d6cff-595d-49d7-9cf8-973173f5233b', mri: '28:0d5d6cff-595d-49d7-9cf8-973173f5233b', displayName: 'Skype Translator', profile: {avatarUrl: 'http://avatarTranslator'}}
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
};

const {
    sendImageMessageAsPuppetToThirdPartyRoomWithId,
    getPayload,
    testOnly: {
        getContact,
        getSkypeOutputData,
    },
} = skypeLib(skypeApiMock);

describe('Client testing', () => {
    it('expect getContact return correct id', () => {
        const contact = getContact(userIvan.personId);
        expect(contact).to.be.equal(userIvan);
    });

    it('expect getContact not return correct id with null', () => {
        const contact = getContact(null);
        expect(contact).to.be.undefined;
    });

    describe('getSkypeOutputData test', () => {
        it('expect getSkypeOutputData returns both senderName and avatarUrl from contact of skypeBot', () => {
            const data = getSkypeOutputData(userAscend.personId);
            const expected = {
                senderName: userAscend.displayName,
                avatarUrl: userAscend.profile.avatarUrl,
            };
            expect(data).to.be.deep.equal(expected);
        });
        it('expect getSkypeOutputData returns tail of senderName and avatarUrl from skype if it\'s not in contacts of skypeBot', () => {
            const id = '8:live:testUser';
            const data = getSkypeOutputData(id);
            const expected = {
                senderName: getNameFromId(id),
                avatarUrl: getAvatarUrl(id),
            };
            expect(data).to.be.deep.equal(expected);
        });
        it('expect getSkypeOutputData returns senderId as senderName user is not from Skype', () => {
            const id = 'matrix_user';
            const data = getSkypeOutputData(id);
            const expected = {
                senderName: id,
            };
            expect(data).to.be.deep.equal(expected);
        });
    });

    describe('getPayload test', () => {
        it('expect getPayload returns sender id and "getSkypeOutputData" if data have sender', () => {
            const sender = userIvan.personId;
            const data = {
                roomId: 'someRoomName',
                content: 'content',
                sender,
                type: 'RichText',
            };
            const result = getPayload(data);
            const expected = {
                roomId: data.roomId,
                senderId: a2b(data.sender),
                ...getSkypeOutputData(data.sender),
            };
            expect(result).to.be.deep.equal(expected);
        });
        it('expect getPayload returns senderid with null and no "getSkypeOutputData" if data have no sender or it\'s null', () => {
            const data = {
                roomId: 'someRoomName',
                content: 'content',
                sender: null,
                type: 'RichText',
            };
            const result = getPayload(data);
            const expected = {
                roomId: data.roomId,
                senderId: null,
            };
            expect(result).to.be.deep.equal(expected);
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

    it('expect ')
});
