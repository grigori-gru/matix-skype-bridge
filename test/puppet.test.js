const chai = require('chai');
const {stub} = require('sinon');
const sinonChai = require('sinon-chai');
const {expect} = chai;
chai.use(sinonChai);
const config = require('../src/config.js');
const {getMatrixUser} = require('../src/utils');
const testConfig = require('./fixtures/config.json');

const Puppet = require('../src/puppet');

const pathTotestConfig = './fixtures/config.json';

const localpart = 'localpart';
const password = 'password';
const token = 'token';
const id = getMatrixUser(localpart, '');
const matrixRoomId = 'matrixRoomId';
const fakeRoom = 'fake';

const getAliasesStub = stub();
const getRoomIdForAliasStub = stub();
const joinRoomStub = stub();
const inviteStub = stub();

const rooms = [
    {roomId: matrixRoomId, getAliases: getAliasesStub},
    {roomId: 'matrixRoomId2'},
    {roomId: 'matrixRoomId3'},
];

const client = {
    getRooms: () => rooms,
    getRoomIdForAlias: getRoomIdForAliasStub,
    joinRoom: joinRoomStub,
    invite: inviteStub,
    credentials: {
        userId: 'userId',
    },
};

const readline = {
    question: stub(),
};
const fs = {
    writeFile: stub(),
};
const sdk = {
    createClient: stub(),
};

const puppet = new Puppet({client, readline, fs, sdk, pathToConfig: pathTotestConfig, config: testConfig});

describe('Puppet testing', () => {
    it('associate testing', async () => {
        readline.question.onCall(0).returns(localpart);
        readline.question.onCall(1).returns(password);
        sdk.createClient.resolves({loginWithPassword: stub().resolves({'access_token': token})});
        fs.writeFile.resolves();

        await puppet.associate();
        const expectedJson = JSON.stringify({
            ...testConfig,
            puppet: {
                id,
                localpart,
                token,
            },
        }, null, 2);

        expect(sdk.createClient).to.be.calledWithExactly(config.bridge.homeserverUrl);
        expect(fs.writeFile).to.be.calledWithExactly(pathTotestConfig, expectedJson);
    });

    it('getClient test', () => {
        const res = puppet.getClient();
        expect(res).to.be.deep.equal(client);
    });

    it('getUserId test', () => {
        const res = puppet.getUserId();
        expect(res).to.be.deep.equal(client.credentials.userId);
    });

    describe('Test getRoomAliases', () => {
        const aliases = ['aliases'];
        getAliasesStub.returns(aliases);

        it('Expect "getRoomAliases" return array of aliases of searching room if room is found', () => {
            const result = puppet.getRoomAliases(matrixRoomId);
            expect(result).to.be.deep.equal(aliases);
        });

        it('Expect "getRoomAliases" return undefined if room is not found', () => {
            const result = puppet.getRoomAliases(fakeRoom);
            expect(result).not.to.be;
        });
    });

    describe('Test joinRoom', () => {
        it('Expect "joinRoom" return matrix roomId of searching room', async () => {
            const result = await puppet.joinRoom(matrixRoomId);
            expect(result).not.to.be;
        });

        it('Expect "joinRoom" return true if we have "No known servers" error', async () => {
            joinRoomStub.throws(new Error('No known servers'));
            const result = await puppet.joinRoom(fakeRoom);
            expect(result).to.be;
        });

        it('Expect "joinRoom" return true if we have all others error', async () => {
            joinRoomStub.throws(new Error('Another Error'));
            const result = await puppet.joinRoom(fakeRoom);
            expect(result).not.to.be;
        });
    });

    describe('Test getRoom', () => {
        const roomAlias = 'roomAlias';
        const room = {
            'room_id': matrixRoomId,
        };
        getRoomIdForAliasStub.callsFake(alias => {
            if (alias === roomAlias) {
                return room;
            }
            throw new Error();
        });


        it('Expect "getRoom" return roomId of searching room by roomAlias', async () => {
            const result = await puppet.getRoom(roomAlias);
            expect(result).to.be.equal(matrixRoomId);
        });

        it('Expect "getRoom" return undefined if room is not found', async () => {
            const result = await puppet.getRoom(fakeRoom);
            expect(result).not.to.be;
        });
    });

    describe('Test invite', () => {
        beforeEach(() => {
            inviteStub.reset();
        });

        it('Expect "invite" don\'t invite anyone if invitedUsers is not defined', async () => {
            await puppet.invite(matrixRoomId);
            expect(inviteStub).not.to.be.called;
        });

        it('Expect "invite" don\'t invite anyone if invitedUsers is empty array', async () => {
            await puppet.invite(matrixRoomId, []);
            expect(inviteStub).not.to.be.called;
        });

        it('Expect "invite" call all users of from invitedUsers if they are', async () => {
            inviteStub.resolves();
            const usersToInvite = [
                'user1',
                'user2',
                'user3',
            ];

            await puppet.invite(matrixRoomId, usersToInvite);
            expect(inviteStub).to.be.calledWithExactly(matrixRoomId, usersToInvite[0]);
            expect(inviteStub).to.be.calledWithExactly(matrixRoomId, usersToInvite[1]);
            expect(inviteStub).to.be.calledWithExactly(matrixRoomId, usersToInvite[2]);
        });
    });

    describe('Test getMatrixRoomMembers', () => {
        it('Expect "getMatrixRoomMembers" returns empty array if we have not started client yet or no members we have', () => {
            const result = puppet.getMatrixRoomMembers(matrixRoomId);
            expect(result).to.be.deep.equal([]);
        });
    });
});
