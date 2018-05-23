const nock = require('nock');
const {expect} = require('chai');
const {servicePrefix, SKYPE_USERS_TO_IGNORE, matrixUserTag, delim, skypePrefix, puppet, URL_BASE, skypeTypePrefix} = require('../src/config.js');
const {data: ghostEventData} = require('./fixtures/matrix/member-ghost.json');
const {data: puppetEventData} = require('./fixtures/matrix/member-puppet.json');
const {data: skypebotEventData} = require('./fixtures/matrix/member-skypebot.json');
// const log = require('../src/modules/log')(module);

const {
    getInvitedUsers,
    getNameFromSkypeId,
    isTaggedMatrixMessage,
    sum,
    getMatrixUser,
    getSkypeID,
    getRoomAlias,
    setRoomAlias,
    isIgnoreMemberEvent,
    isTypeErrorMessage,
    getSkypeRoomFromAliases,
    getDisplayName,
    toMatrixFormat,
    getSkypeMatrixUsers,
    getRoomName,
    getIdFromMatrix,
    getUserId,
    getMatrixUsers,
    getNameToSkype,
    tagMatrixMessage,
} = require('../src/utils');


describe('Utils test', () => {
    const expectedData = 'correct';
    const roomId = '!npBatwRCSuXWushCFs:matrix.bingo-boom.ru';
    const name = 'name';
    const name2 = 'name2';
    const name3 = 'name3';
    const name4 = 'name4';

    const testSkypeId1 = getSkypeID(name);
    const testSkypeId2 = getSkypeID(name2);
    const testSkypeId3 = getSkypeID(name3);
    // eslint-disable-next-line
    before(() => {
        nock(URL_BASE)
            .get(`/profile/${encodeURIComponent(name)}/displayname`)
            .times(2)
            .reply(200, {displayname: expectedData})
            .get(`/rooms/${roomId}/state/m.room.name`)
            .query({'access_token': puppet.token})
            .reply(200, {name: expectedData});
    });

    it('sum', () => {
        const result = sum(matrixUserTag, skypePrefix, delim, name);
        const expected = `${matrixUserTag}${skypePrefix}${delim}${name}`;
        expect(result).to.be.equal(expected);
    });

    describe('Test getIdFromMatrix', () => {
        it('expect we get name of matrix user if it\'s from skype', () => {
            const user = getMatrixUser(name);
            const result = getIdFromMatrix(user, servicePrefix);
            expect(result).to.equal(name);
        });
        it('expect we get name of matrix user if it\'s default matrix user', () => {
            const user = getMatrixUser(name, '');
            const result = getIdFromMatrix(user);
            expect(result).to.equal(name);
        });
    });

    it('Test correct getDisplayName', async () => {
        const result = await getDisplayName(name);
        expect(result).to.equal(expectedData);
    });

    describe('test getNameFromSkypeId', () => {
        it('expect to be ok from default prefix', () => {
            const matrixUser = getSkypeID(name);
            const expectedName = getNameFromSkypeId(matrixUser);
            expect(expectedName).to.be.equal(name);
        });

        it('expect to be ok from typePrefix', () => {
            const matrixUser = getSkypeID(name, skypeTypePrefix);
            const expectedName = getNameFromSkypeId(matrixUser);
            expect(expectedName).to.be.equal(name);
        });
    });

    it('Test getUserId', () => {
        const skypeUser1 = getMatrixUser(toMatrixFormat(testSkypeId1));
        const skypeUser2 = getMatrixUser(toMatrixFormat(testSkypeId2));
        const skypeUser3 = getMatrixUser((name3), '');
        const users = [skypeUser1, skypeUser2, skypeUser3];
        // eslint-disable-next-line
        const result = users.map(user => getUserId(user));
        const expected = [testSkypeId1, testSkypeId2, testSkypeId3];
        expect(result).to.deep.equal(expected);
    });

    it('Test getMatrixUsers', () => {
        const users = [
            ...SKYPE_USERS_TO_IGNORE,
            getSkypeID(name),
            getSkypeID(name2, skypeTypePrefix),
        ];
        const result = getMatrixUsers(users);

        const expected = [
            getMatrixUser(name),
            getMatrixUser(name2),
        ];

        expect(result).deep.equal(expected);
    });

    it('Get coorrect display name', async () => {
        const result = await getNameToSkype(name);
        expect(result).to.equal(expectedData);
    });

    describe('test getInvitedUsers', () => {
        it('expect to invite user for skype converstion if he is not in matrix room but his puppet in', () => {
            const skypeUsers = [
                ...SKYPE_USERS_TO_IGNORE,
                getSkypeID(name),
                getSkypeID(name2),
            ];
            const matrixRoomUsers = [
                getMatrixUser(name2),
                getMatrixUser(name, ''),
                getMatrixUser(SKYPE_USERS_TO_IGNORE[0]),
            ];
            const result = getInvitedUsers(skypeUsers, matrixRoomUsers);
            const expected = [
                getMatrixUser(name2, ''),
            ];
            expect(result).to.be.deep.equal(expected);
        });
    });

    it('Get room name', async () => {
        const result = await getRoomName(roomId);
        expect(result).to.equal(expectedData);
    });

    describe('Test getSkypeMatrixUsers', () => {
        const toMatrix = ({personId}) => getMatrixUser(toMatrixFormat(personId));
        const clientCollection = [
            {personId: testSkypeId1},
            {personId: testSkypeId2},
        ];
        const matrixUsers = clientCollection.map(toMatrix);
        it('expect getSkypeMatrixUsers return skuypeId\'s of matrixUsers which are inside matrixRoom and skype contacts', () => {
            const skypeCollection = [...clientCollection, {personId: testSkypeId3}];
            const matrixRoomUsers = [...matrixUsers, getMatrixUser(toMatrixFormat(name4))];
            const result = getSkypeMatrixUsers(skypeCollection, matrixRoomUsers);

            const expected = [testSkypeId1, testSkypeId2];
            expect(result).to.deep.equal(expected);
        });

        it('expect getSkypeMatrixUsers return empty array if no skypeId\'s we put', () => {
            // eslint-disable-next-line
            const result = getSkypeMatrixUsers(undefined, matrixUsers);

            const expected = [];
            expect(result).to.deep.equal(expected);
        });
    });

    describe('Test getSkypeRoomFromAliases', () => {
        const roomAliases = [
            getRoomAlias(toMatrixFormat(name), ''),
            getRoomAlias(toMatrixFormat(name2), ''),
        ];
        const expectedAlias = getRoomAlias(toMatrixFormat(name3));

        it('Expect getSkypeRoomFromAliases return alias name for correct alias', () => {
            const result = getSkypeRoomFromAliases([...roomAliases, expectedAlias]);
            expect(result).to.deep.equal(name3);
        });

        it('Expect getSkypeRoomFromAliases return nothing if no alias match pattern', () => {
            const result = getSkypeRoomFromAliases(roomAliases);
            expect(result).not.to.be;
        });

        it('Expect getSkypeRoomFromAliases return nothing if no alias or empty array as argument we get', () => {
            // eslint-disable-next-line
            const result = getSkypeRoomFromAliases(undefined);
            expect(result).not.to.be;
            const result1 = getSkypeRoomFromAliases([]);
            expect(result1).not.to.be;
        });
    });

    describe('Error exeption test', () => {
        const errMsg1 = new Error(`poll: An error happened while processing the polled messages
            caused by Error: Unknown ressource.messageType ("ThreadActivity/AddMember") for resource:`);
        const errMsg2 = new Error(` poll: An error happened while processing the polled messages
            caused by Error: Unknown EventMessage.resourceType ("ThreadUpdate") for Event:`);

        it('expect isTypeErrorMessage return true', () => {
            const result = isTypeErrorMessage(errMsg1);
            expect(result).to.be.true;
            const result1 = isTypeErrorMessage(errMsg2);
            expect(result1).to.be.true;
        });
    });

    it('test empty data to toMatrixFormat', () => {
        const result = toMatrixFormat(null);
        expect(result).not.to.be;
    });

    describe('Test isIgnoreMemberEvent', () => {
        const puppetName = 'newskypebot';
        const puppetId = getMatrixUser(puppetName);

        it('Expect to be truth if we get event for inviting new user', () => {
            const result = isIgnoreMemberEvent(puppetId, ghostEventData);
            expect(result).not.to.be;
        });

        it('Expect to be false if we get event for inviting puppet', () => {
            const result = isIgnoreMemberEvent(puppetId, puppetEventData);
            expect(result).to.be;
        });

        it('Expect to be false if we get event for inviting bot', () => {
            const result = isIgnoreMemberEvent(puppetId, skypebotEventData);
            expect(result).to.be;
        });
    });

    describe('Test setRoomAlias', () => {
        const alias1 = getRoomAlias('aliasForRoom');
        const alias2 = getRoomAlias('aliasForRoom2');
        const body = {'room_id': roomId};

        before(() => {
            const isExpectedBody = data => data.room_id === body.room_id;
            nock(URL_BASE)
                .put(`/directory/room/${encodeURIComponent(alias1)}`, isExpectedBody)
                .times(10)
                .query({'access_token': puppet.token})
                .reply(200)
                .put(`/directory/room/${encodeURIComponent(alias2)}`, isExpectedBody)
                .times(10)
                .query({'access_token': puppet.token})
                .reply(200)
                .put(/directory\/room\/(.*)/, isExpectedBody)
                .times(5)
                .query({'access_token': puppet.token})
                .replyWithError({'message': 'something awful happened', 'code': 404});
        });

        it('Expect to get 200 if we put first alias for expected room', async () => {
            const result = await setRoomAlias(roomId, alias1);
            expect(result).to.be.equal(200);
        });

        it('Expect to get 200 if we put second alias for the same expected room', async () => {
            const result = await setRoomAlias(roomId, alias2);
            expect(result).to.be.equal(200);
        });

        it('Expect to get error if we put unexpected room', async () => {
            try {
                const result = await setRoomAlias('fakeRoom', alias2);

                expect(result).not.to.be;
            } catch (error) {
                expect(error).to.be;
            }
        });
    });

    describe('Test isTagMatrixMessage', () => {
        it('expect msg not to be tagged', () => {
            const text = 'text';
            const result = isTaggedMatrixMessage(text);
            expect(result).to.be.false;

            const func = () => isTaggedMatrixMessage(text) || '!!!';
            expect(func()).to.be.equal('!!!');
        });

        it('expect msg to be tagged', () => {
            const text = tagMatrixMessage('text');
            const result = isTaggedMatrixMessage(text);
            expect(result).to.be.true;
        });
    });
});
