const nock = require('nock');
const {expect} = require('chai');
const {getMatrixUser, getSkypeID, getRoomAlias, setRoomAlias, isInviteNewUserEvent, isTypeErrorMessage, getSkypeRoomFromAliases, getDisplayName, toMatrixFormat, getSkypeMatrixUsers, getRoomName, getIdFromMatrix, getId, getMatrixUsers, getNameToSkype} = require('../src/utils');
const {puppet, bridge, URL_BASE} = require('../src/config.js');
const {data: ghostEventData} = require('./fixtures/matrix/member-ghost.json');
const {data: puppetEventData} = require('./fixtures/matrix/member-puppet.json');
const {data: skypebotEventData} = require('./fixtures/matrix/member-skypebot.json');


describe('Utils test', () => {
    const sender = '@senderName:mvs';
    const expectedData = 'correct';
    const roomId = '!npBatwRCSuXWushCFs:matrix.bingo-boom.ru';

    // eslint-disable-next-line
    before(() => {
        nock(URL_BASE)
            .get(`/profile/${encodeURIComponent(sender)}/displayname`)
            .times(2)
            .reply(200, {displayname: expectedData})
            .get(`/rooms/${roomId}/state/m.room.name`)
            .query({'access_token': puppet.token})
            .reply(200, {name: expectedData});
    });

    it('Test correct getDisplayName', async () => {
        const result = await getDisplayName(sender);
        expect(result).to.equal(expectedData);
    });

    it('Test getId', () => {
        const skypeUser1 = getMatrixUser(toMatrixFormat('8:live:abcd'));
        const skypeUser2 = getMatrixUser(toMatrixFormat('8:live:abcd_dcba'));
        const users = [skypeUser1, '@gv_grudinin:matrix:bingo-boom.ru', skypeUser2];

        // eslint-disable-next-line
        const result = users.map(user => getId(user));
        const expected = ['8:live:abcd', '8:live:gv_grudinin', '8:live:abcd_dcba'];
        expect(result).to.deep.equal(expected);
    });

    it('Test getIdFromMatrix', () => {
        const user = '@skype_user:matrix.bingo-boom.ru';
        const expected = 'user';
        const result = getIdFromMatrix(user, 'skype_');
        expect(result).to.equal(expected);
    });

    it('Test getMatrixUsers', () => {
        const users = [
            'a:b:c',
            'a:b',
            'a',
            '8:live:ignore_1',
            '8:live:ignore_2',
        ];
        const expected = [
            `@c:${bridge.domain}`,
            `@b:${bridge.domain}`,
            `@a:${bridge.domain}`,
        ];

        const result = getMatrixUsers(users);
        expect(result).deep.equal(expected);
    });

    it('Get coorrect display name', async () => {
        const result = await getNameToSkype(sender);
        expect(result).to.equal(expectedData);
    });

    it('Get room name', async () => {
        const result = await getRoomName(roomId);
        expect(result).to.equal(expectedData);
    });

    it('Test getSkypeMatrixUsers', () => {
        const clientCollection = [
            {personId: '8:live:skypebottest_2'},
            {personId: '8:live:abcdefg'},
            {personId: '8:live:hijk'},
        ];
        const users = clientCollection.map(({personId}) => getMatrixUser(toMatrixFormat(personId)));
        const result = getSkypeMatrixUsers(clientCollection, users);
        const expected = [
            '8:live:skypebottest_2',
            '8:live:abcdefg',
            '8:live:hijk',
        ];
        expect(result).to.deep.equal(expected);
    });

    it('Test getSkypeMatrixUsers', () => {
        const clientCollection = [
            {personId: '8:live:skypebottest_2'},
            {personId: '8:live:abcdefg'},
            {personId: '8:live:hijk'},
        ];
        const users = [
            `@skype_${toMatrixFormat('8:live:skypebottest_2')}:${bridge.domain}`,
            `@skype_${toMatrixFormat('8:live:abcdefg')}:${bridge.domain}`,
            `@skype_${toMatrixFormat('8:live:hijk')}:${bridge.domain}`,
        ];
        const result = getSkypeMatrixUsers(clientCollection, users);
        const expected = [
            getSkypeID('skypebottest_2'),
            getSkypeID('abcdefg'),
            getSkypeID('hijk'),
        ];
        expect(result).to.deep.equal(expected);
    });
    describe('Test getSkypeMatrixUsers', () => {
        const roomAliases = [
            getRoomAlias(toMatrixFormat('failAlias')),
            getRoomAlias(toMatrixFormat('failAlias2')),
        ];

        it('Expect getSkypeMatrixUsers return alias name for correct alias', () => {
            const expected = 'correctAlias';
            const expectedAlias = getRoomAlias(toMatrixFormat(expected));
            const result = getSkypeRoomFromAliases([...roomAliases, expectedAlias]);
            expect(result).to.deep.equal(expected);
        });

        it('Expect getSkypeMatrixUsers return nothing if no alias match pattern', () => {
            const result = getSkypeRoomFromAliases(roomAliases);
            expect(result).not.to.be;
        });

        it('Expect getSkypeMatrixUsers return nothing if no alias or empty array as argument we get', () => {
            const result = getSkypeRoomFromAliases(null);
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

    describe('Test isInviteNewUserEvent', () => {
        const puppetId = '@newskypebot:test.domain';

        it('Expect to be truth if we get event for inviting new user', () => {
            const result = isInviteNewUserEvent(puppetId, ghostEventData);
            expect(result).to.be.true;
        });

        it('Expect to be false if we get event for inviting puppet', () => {
            const result = isInviteNewUserEvent(puppetId, puppetEventData);
            expect(result).not.to.be;
        });

        it('Expect to be false if we get event for inviting bot', () => {
            const result = isInviteNewUserEvent(puppetId, skypebotEventData);
            expect(result).not.to.be;
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
});
