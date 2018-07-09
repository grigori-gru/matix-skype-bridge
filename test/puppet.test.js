const chai = require('chai');
const {stub} = require('sinon');
const sinonChai = require('sinon-chai');
const {expect} = chai;
chai.use(sinonChai);
const proxyquire = require('proxyquire');
const config = require('../src/config.js');
const {getMatrixUser} = require('../src/utils');
const log = require('../src/modules/log')(module);

const readlineStub = stub();
const writeFileStub = stub();
const createClientStub = stub();
const debugStub = stub();
const warnStub = stub();
const errorStub = stub();
const infoStub = stub();

const Puppet = proxyquire('../src/puppet',
    {
        'readline-sync': {
            question: readlineStub,
        },
        'fs': {
            writeFile: writeFileStub,
        },
        'matrix-js-sdk': {
            createClient: createClientStub,
        },
        './modules/log': module => ({
            debug: debugStub,
            warn: warnStub,
            error: errorStub,
            info: infoStub,
        }),
    });
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

const mockClient = {
    getRooms: () => rooms,
    getRoomIdForAlias: getRoomIdForAliasStub,
    joinRoom: joinRoomStub,
    invite: inviteStub,
    credentials: {
        userId: 'userId',
    },
};

const puppet = new Puppet(pathTotestConfig, mockClient);

describe('Puppet testing', () => {
    beforeEach(() => {
        debugStub.callsFake(log.debug);
        warnStub.callsFake(log.warn);
        errorStub.callsFake(log.error);
        infoStub.callsFake(log.info);
    });

    it('associate testing', async () => {
        readlineStub.onCall(0).returns(localpart);
        readlineStub.onCall(1).returns(password);
        createClientStub.returns({loginWithPassword: stub().resolves({'access_token': token})});
        writeFileStub.callsFake().resolves();

        await puppet.associate();
        const expectedJson = JSON.stringify({
            ...config,
            puppet: {
                id,
                localpart,
                token,
            },
        }, null, 2);

        expect(createClientStub).to.be.calledWithExactly(config.bridge.homeserverUrl);
        expect(writeFileStub).to.be.calledWithExactly(pathTotestConfig, expectedJson);
    });

    it('getClient test', () => {
        const client = puppet.getClient();
        expect(client).to.be.deep.equal(mockClient);
    });

    it('getUserId test', () => {
        const client = puppet.getUserId();
        expect(client).to.be.deep.equal(mockClient.credentials.userId);
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
        const msg = 'All members in skype skypeRoom are already joined to Matrix room: ';
        beforeEach(() => {
            inviteStub.reset();
            debugStub.reset();
        });

        it('Expect "invite" don\'t invite anyone if invitedUsers is not defined', async () => {
            await puppet.invite(matrixRoomId);
            expect(debugStub).to.be.calledWithExactly(msg, matrixRoomId);
            expect(inviteStub).not.to.be.called;
        });

        it('Expect "invite" don\'t invite anyone if invitedUsers is empty array', async () => {
            await puppet.invite(matrixRoomId, []);
            expect(debugStub).not.to.be.calledWith(msg);
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
            expect(debugStub).not.to.be.calledWith(msg);
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
