const nock = require('nock');
const {expect} = require('chai');
const {servicePrefix, SKYPE_USERS_TO_IGNORE, matrixUserTag, delim, skypePrefix, puppet, URL_BASE, skypeTypePrefix, fullImgPathParams} = require('../src/config.js');
const {data: ghostEventData} = require('./fixtures/matrix/member-ghost.json');
const {data: puppetEventData} = require('./fixtures/matrix/member-puppet.json');
const {data: skypebotEventData} = require('./fixtures/matrix/member-skypebot.json');
const path = require('path');
const fs = require('fs').promises;

const utils = require('../src/utils');

describe('Utils test', () => {
    const expectedData = 'correct';
    const roomId = '!npBatwRCSuXWushCFs:matrix.bingo-boom.ru';
    const name = 'name';
    const name2 = 'name2';
    const name3 = 'name3';
    const name4 = 'name4';

    const testSkypeId1 = utils.getSkypeID(name);
    const testSkypeId2 = utils.getSkypeID(name2);
    const testSkypeId3 = utils.getSkypeID(name3);
    before(() => {
        nock(URL_BASE)
            .get(`/profile/${encodeURIComponent(name)}/displayname`)
            .times(2)
            .reply(200, {displayname: expectedData})
            .get(`/profile/${encodeURIComponent(utils.getDefaultMatrixUser(name))}/displayname`)
            .times(2)
            .reply(200, {displayname: expectedData})
            .get(`/rooms/${roomId}/state/m.room.name`)
            .query({'access_token': puppet.token})
            .reply(200, {name: expectedData});
    });

    it('sum', () => {
        const result = utils.sum(matrixUserTag, skypePrefix, delim, name);
        const expected = `${matrixUserTag}${skypePrefix}${delim}${name}`;
        expect(result).to.be.equal(expected);
    });

    describe('Test getIdFromMatrix', () => {
        it('expect we get name of matrix user if it\'s from skype', () => {
            const user = utils.getMatrixUser(name);
            const result = utils.getIdFromMatrix(user, servicePrefix);
            expect(result).to.equal(name);
        });
        it('expect we get name of matrix user if it\'s default matrix user', () => {
            const user = utils.getMatrixUser(name, '');
            const result = utils.getIdFromMatrix(user);
            expect(result).to.equal(name);
        });
    });

    it('Test correct getDisplayName', async () => {
        const result = await utils.getDisplayName(name);
        expect(result).to.equal(expectedData);
    });

    describe('test getNameFromSkypeId', () => {
        it('expect to be ok from default prefix', () => {
            const matrixUser = utils.getSkypeID(name);
            const expectedName = utils.getNameFromSkypeId(matrixUser);
            expect(expectedName).to.be.equal(name);
        });

        it('expect to be ok from typePrefix', () => {
            const matrixUser = utils.getSkypeID(name, skypeTypePrefix);
            const expectedName = utils.getNameFromSkypeId(matrixUser);
            expect(expectedName).to.be.equal(name);
        });
    });

    it('Test getUserId', () => {
        const skypeUser1 = utils.getMatrixUser(utils.toMatrixUserFormat(testSkypeId1));
        const skypeUser2 = utils.getMatrixUser(utils.toMatrixUserFormat(testSkypeId2));
        const skypeUser3 = utils.getMatrixUser((name3), '');
        const users = [skypeUser1, skypeUser2, skypeUser3];
        // eslint-disable-next-line
        const result = users.map(user => utils.getUserId(user));
        const expected = [testSkypeId1, testSkypeId2, testSkypeId3];
        expect(result).to.deep.equal(expected);
    });

    it('Test getMatrixUsers', () => {
        const users = [
            ...SKYPE_USERS_TO_IGNORE,
            utils.getSkypeID(name),
            utils.getSkypeID(name2, skypeTypePrefix),
        ];
        const result = utils.getMatrixUsers(users);

        const expected = [
            utils.getMatrixUser(name),
            utils.getMatrixUser(name2),
        ];

        expect(result).deep.equal(expected);
    });

    it('Get coorrect display name', async () => {
        const result = await utils.getNameToSkype(name);
        expect(result).to.equal(expectedData);
    });

    describe('test getInvitedUsers', () => {
        it('expect to invite user for skype converstion if he is not in matrix room but his puppet in', async () => {
            const skypeUsers = [
                ...SKYPE_USERS_TO_IGNORE,
                utils.getSkypeID(name),
                utils.getSkypeID(name2),
            ];
            const matrixRoomUsers = [
                utils.getDefaultMatrixUser(name2),
                utils.getMatrixUser(name),
                utils.getMatrixUser(SKYPE_USERS_TO_IGNORE[0]),
            ];
            const result = await utils.getInvitedUsers(skypeUsers, matrixRoomUsers);
            const expected = [
                utils.getDefaultMatrixUser(name),
            ];
            expect(result).to.be.deep.equal(expected);
        });
    });

    it('Get room name', async () => {
        const result = await utils.getRoomName(roomId);
        expect(result).to.equal(expectedData);
    });

    describe('Test getSkypeMatrixUsers', () => {
        const toMatrix = ({personId}) => utils.getMatrixUser(utils.toMatrixUserFormat(personId));
        const clientCollection = [
            {personId: testSkypeId1},
            {personId: testSkypeId2},
        ];
        const matrixUsers = clientCollection.map(toMatrix);
        it('expect getSkypeMatrixUsers return skuypeId\'s of matrixUsers which are inside matrixRoom and skype contacts', () => {
            const skypeCollection = [...clientCollection, {personId: testSkypeId3}];
            const matrixRoomUsers = [...matrixUsers, utils.getMatrixUser(utils.toMatrixUserFormat(name4))];
            const result = utils.getSkypeMatrixUsers(skypeCollection, matrixRoomUsers);

            const expected = [testSkypeId1, testSkypeId2];
            expect(result).to.deep.equal(expected);
        });

        it('expect getSkypeMatrixUsers return empty array if no skypeId\'s we put', () => {
            // eslint-disable-next-line
            const result = utils.getSkypeMatrixUsers(undefined, matrixUsers);

            const expected = [];
            expect(result).to.deep.equal(expected);
        });
    });

    describe('Test getSkypeRoomFromAliases', () => {
        const roomAliases = [
            utils.getRoomAlias(utils.toMatrixUserFormat(name), ''),
            utils.getRoomAlias(utils.toMatrixUserFormat(name2), ''),
        ];
        const expectedAlias = utils.getRoomAlias(utils.toMatrixRoomFormat(name3));

        it('Expect getSkypeRoomFromAliases return alias name for correct alias', () => {
            const result = utils.getSkypeRoomFromAliases([...roomAliases, expectedAlias]);
            expect(result).to.deep.equal(name3);
        });

        it('Expect getSkypeRoomFromAliases return nothing if no alias match pattern', () => {
            const result = utils.getSkypeRoomFromAliases(roomAliases);
            expect(result).not.to.be;
        });

        it('Expect getSkypeRoomFromAliases return nothing if no alias or empty array as argument we get', () => {
            // eslint-disable-next-line
            const result = utils.getSkypeRoomFromAliases(undefined);
            expect(result).not.to.be;
            const result1 = utils.getSkypeRoomFromAliases([]);
            expect(result1).not.to.be;
        });
    });

    describe('Error exeption test', () => {
        const errMsg1 = new Error(`poll: An error happened while processing the polled messages
            caused by Error: Unknown ressource.messageType ("ThreadActivity/AddMember") for resource:`);
        const errMsg2 = new Error(` poll: An error happened while processing the polled messages
            caused by Error: Unknown EventMessage.resourceType ("ThreadUpdate") for Event:`);

        it('expect isTypeErrorMessage return true', () => {
            const result = utils.isTypeErrorMessage(errMsg1);
            expect(result).to.be.true;
            const result1 = utils.isTypeErrorMessage(errMsg2);
            expect(result1).to.be.true;
        });
    });

    it('test empty data to utils.toMatrixUserFormat', () => {
        const result = utils.toMatrixUserFormat(null);
        expect(result).not.to.be;
    });

    describe('Test isIgnoreMemberEvent', () => {
        const puppetName = 'newskypebot';
        const puppetId = utils.getMatrixUser(puppetName);

        it('Expect to be truth if we get event for inviting new user', () => {
            const result = utils.isIgnoreMemberEvent(puppetId, ghostEventData);
            expect(result).not.to.be;
        });

        it('Expect to be false if we get event for inviting puppet', () => {
            const result = utils.isIgnoreMemberEvent(puppetId, puppetEventData);
            expect(result).to.be;
        });

        it('Expect to be false if we get event for inviting bot', () => {
            const result = utils.isIgnoreMemberEvent(puppetId, skypebotEventData);
            expect(result).to.be;
        });
    });

    describe('Test setRoomAlias', () => {
        const alias1 = utils.getRoomAlias('aliasForRoom');
        const alias2 = utils.getRoomAlias('aliasForRoom2');
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
            const result = await utils.setRoomAlias(roomId, alias1);
            expect(result).to.be.equal(200);
        });

        it('Expect to get 200 if we put second alias for the same expected room', async () => {
            const result = await utils.setRoomAlias(roomId, alias2);
            expect(result).to.be.equal(200);
        });

        it('Expect to get error if we put unexpected room', async () => {
            try {
                const result = await utils.setRoomAlias('fakeRoom', alias2);

                expect(result).not.to.be;
            } catch (error) {
                expect(error).to.be;
            }
        });
    });

    describe('Test isTagMatrixMessage', () => {
        it('expect msg not to be tagged', () => {
            const text = 'text';
            const result = utils.isTaggedMatrixMessage(text);
            expect(result).to.be.false;

            const func = () => utils.isTaggedMatrixMessage(text) || '!!!';
            expect(func()).to.be.equal('!!!');
        });

        it('expect msg to be tagged', () => {
            const text = utils.tagMatrixMessage('text');
            const result = utils.isTaggedMatrixMessage(text);
            expect(result).to.be.true;
        });
    });

    describe('Test getFullSizeImgUrl', () => {
        const url = 'https://api.asm.skype.com/v1/objects/0mjfdklbnd';
        it('Expect get correct url', () => {
            const result = utils.getFullSizeImgUrl(url);
            const [p1, p2] = fullImgPathParams;
            const expectedUrl = `${url}/${p1}/${p2}`;
            expect(result).to.be.equal(expectedUrl);
        });
    });
    describe('Test correct getBuf using fetch and native js', () => {
        const testImagePath = path.resolve(__dirname, './fixtures/test-image.jpg');
        const testUrl = 'http://some/test/url';
        const headers = {'Content-Type': 'image/jpeg'};

        beforeEach(() => {
            nock(testUrl)
                .get('')
                .replyWithFile(200, testImagePath, headers);
        });

        it('expect function return correct buffer and type by url', async () => {
            const {buffer, type} = await utils.getBufferAndType(testUrl);
            const expectedBuffer = await fs.readFile(testImagePath);

            expect(Object.keys(buffer).length).to.be.equal(Object.keys(expectedBuffer).length);
            expect(type).to.be.deep.equal([headers['Content-Type']]);
        });

        it('expect function return correct buffer and type by url', async () => {
            const buffer = await utils.getBufferByUrl(testUrl);
            const expectedBuffer = await fs.readFile(testImagePath);

            expect(Object.keys(buffer).length).to.be.equal(Object.keys(expectedBuffer).length);
        });
    });

    describe('Test htmlToText', () => {
        // eslint-disable-next-line
        const html = `\n    <h5>Use "!kick" command to kick all members from all rooms which last activity are older 01.01.2018<br>\n    example:</h5>\n        &nbsp;&nbsp;&nbsp;&nbsp;<font color="green"><strong>!kick</strong></font><br>\n        &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Пользователь @example:matrix.bingo-boom.ru исключен из комнаты BBCOM-1931<br>\n        &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Пользователь @example_too:matrix.bingo-boom.ru исключен из комнаты BBCOM-1931<br>\n        &nbsp;&nbsp;&nbsp;&nbsp;<font color="green"><strong>If no rooms are outdated you\'ll get next message</strong></font><br>\n        &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;User <font color="green"><strong>"user"</strong></font> has no outdated rooms<br>\n    <h5>Use "!comment" command to comment in jira issue<br>\n    example:</h5>\n        &nbsp;&nbsp;&nbsp;&nbsp;<font color="green"><strong>!comment some text</strong></font><br>\n        &nbsp;&nbsp;&nbsp;&nbsp;text "<font color="green">some text</font>" will be shown in jira comments<br>\n    <h5>Use "!assign" command to assign jira issue<br>\n    example:</h5>\n        &nbsp;&nbsp;&nbsp;&nbsp;<font color="green"><strong>!assign mv_nosak</strong></font>\n        or <font color="green"><strong>!assign Носак</strong></font><br>\n        &nbsp;&nbsp;&nbsp;&nbsp;user \'<font color="green">mv_nosak</font>\' will become assignee for the issue<br><br>\n        &nbsp;&nbsp;&nbsp;&nbsp;<font color="green"><strong>!assign</strong></font><br>\n        &nbsp;&nbsp;&nbsp;&nbsp;you will become assignee for the issue\n    <h5>Use "!move" command to view list of available transitions<br>\n    example:</h5>\n        &nbsp;&nbsp;&nbsp;&nbsp;<font color="green"><strong>!move</strong></font><br>\n        &nbsp;&nbsp;&nbsp;&nbsp;you will see a list:<br>\n        &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;1) Done<br>\n        &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;2) On hold<br>\n        &nbsp;&nbsp;&nbsp;&nbsp;Use <font color="green"><strong>"!move done"</strong></font> or\n        <font color="green"><strong>"!move 1"</strong></font>\n    <h5>Use "!spec" command to add watcher for issue<br>\n    example:</h5>\n        &nbsp;&nbsp;&nbsp;&nbsp;<font color="green"><strong>!spec mv_nosak</strong></font>\n        or <font color="green"><strong>!spec Носак</strong></font><br>\n        &nbsp;&nbsp;&nbsp;&nbsp;user \'<font color="green">mv_nosak</font>\' was added in watchers for the issue<br><br>\n    <h5>Use "!prio" command to changed priority issue<br>\n    example:</h5>\n        &nbsp;&nbsp;&nbsp;&nbsp;<font color="green"><strong>!prio</strong></font><br>\n        &nbsp;&nbsp;&nbsp;&nbsp;you will see a list:<br>\n        &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;1) Блокирующий<br>\n        &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;2) Критический<br>\n        &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;3) Highest<br>\n        &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;...<br>\n        &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;7) Lowest<br>\n        &nbsp;&nbsp;&nbsp;&nbsp;Use <font color="green"><strong>"!prio Lowest"</strong></font> or\n        <font color="green"><strong>"!prio 7"</strong></font>\n    <h5>Use "!op" command to give moderator rights (admins only)<br>\n    example:</h5>\n        &nbsp;&nbsp;&nbsp;&nbsp;<font color="green"><strong>!op mv_nosak</strong></font><br>\n        &nbsp;&nbsp;&nbsp;&nbsp;user \'<font color="green">mv_nosak</font>\' will become the moderator of the room<br><br>\n    <h5>Use "!invite" command to invite you in room (admins only)<br>\n    example:</h5>\n        &nbsp;&nbsp;&nbsp;&nbsp;<font color="green"><strong>!invite BBCOM-101</strong></font>\n        or <font color="green"><strong>!invite #BBCOM-101:matrix.bingo-boom.ru</strong></font><br>\n        &nbsp;&nbsp;&nbsp;&nbsp;Bot invite you in room for issue <font color="green">BBCOM-101</font><br><br>\n    If you have administrator status, you can invite the bot into the room and he will not be denied:)\n    `;

        const expectedText = `USE "!KICK" COMMAND TO KICK ALL MEMBERS FROM ALL ROOMS WHICH LAST ACTIVITY ARE
OLDER 01.01.2018
EXAMPLE:
!kick
Пользователь @example:matrix.bingo-boom.ru исключен из комнаты BBCOM-1931
Пользователь @example_too:matrix.bingo-boom.ru исключен из комнаты BBCOM-1931
If no rooms are outdated you'll get next message
User "user" has no outdated rooms
USE "!COMMENT" COMMAND TO COMMENT IN JIRA ISSUE
EXAMPLE:
!comment some text
text "some text" will be shown in jira comments
USE "!ASSIGN" COMMAND TO ASSIGN JIRA ISSUE
EXAMPLE:
!assign mv_nosakor !assign Носак
user 'mv_nosak' will become assignee for the issue

!assign
you will become assignee for the issue USE "!MOVE" COMMAND TO VIEW LIST OF
AVAILABLE TRANSITIONS
EXAMPLE:
!move
you will see a list:
1) Done
2) On hold
Use "!move done" or "!move 1" USE "!SPEC" COMMAND TO ADD WATCHER FOR ISSUE
EXAMPLE:
!spec mv_nosakor !spec Носак
user 'mv_nosak' was added in watchers for the issue

USE "!PRIO" COMMAND TO CHANGED PRIORITY ISSUE
EXAMPLE:
!prio
you will see a list:
1) Блокирующий
2) Критический
3) Highest
...
7) Lowest
Use "!prio Lowest" or "!prio 7" USE "!OP" COMMAND TO GIVE MODERATOR RIGHTS
(ADMINS ONLY)
EXAMPLE:
!op mv_nosak
user 'mv_nosak' will become the moderator of the room

USE "!INVITE" COMMAND TO INVITE YOU IN ROOM (ADMINS ONLY)
EXAMPLE:
!invite BBCOM-101or !invite #BBCOM-101:matrix.bingo-boom.ru
Bot invite you in room for issue BBCOM-101

If you have administrator status, you can invite the bot into the room and he
will not be denied:)`;

        it('expect correct convert if html exists', () => {
            const text = utils.htmlToText(html);

            expect(text).to.be.equal(expectedText);
        });

        it('Expect empty output if no data', () => {
            const text = utils.htmlToText();

            expect(text).to.be.undefined;
        });
    });
});
