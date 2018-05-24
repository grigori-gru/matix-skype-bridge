const Promise = require('bluebird');
const matrixSdk = require('matrix-js-sdk');
const fs = require('fs');
const readline = require('readline-sync');
const config = require('./config.js');
const log = require('./modules/log')(module);

module.exports = class Puppet {
    /**
     *
     * @param {string} pathToConfig path to config file
     */
    constructor(pathToConfig) {
        this.pathToConfig = pathToConfig;
        this.client = null;
        this.skypeRooms = {};
    }

    /**
     * Reads the config file, creates a matrix client, connects, and waits for sync
     *
     * @returns {Promise} Returns a promise resolving the MatrixClient
     */
    async startClient() {
        const _matrixClient = await matrixSdk.createClient({
            baseUrl: config.bridge.homeserverUrl,
            userId: config.puppet.id,
            accessToken: config.puppet.token,
        });
        this.client = _matrixClient;
        this.client.startClient();
        return new Promise((resolve, _reject) => {
            this.matrixRoomMembers = {};
            this.client.on('RoomState.members', (event, state, _member) => {
                this.matrixRoomMembers[state.roomId] = Object.keys(state.members);
            });

            this.client.on('sync', state => {
                if (state === 'PREPARED') {
                    log.info('synced');
                    resolve();
                }
            });
        });
    }

    /**
     * Get the list of matrix room members
     *
     * @param {string} roomId matrix room id
     * @returns {Array} List of room members
     */
    getMatrixRoomMembers(roomId) {
        return this.matrixRoomMembers[roomId] || [];
    }

    /**
     * @returns {string} matrix userId
     */
    getUserId() {
        return this.client.credentials.userId;
    }

    /**
     * Returns the MatrixClient
     *
     * @returns {MatrixClient} an instance of MatrixClient
     */
    getClient() {
        return this.client;
    }
    /**
     * Returns matrixRoomId byAlias
     *
     * @param {string} roomAlias matrix room alias
     * @returns {string} matrix roomId
     */
    async getRoom(roomAlias) {
        try {
            const {room_id: roomId} = await this.client.getRoomIdForAlias(roomAlias);
            log.debug('found matrix room via alias. room_id:', roomId);

            return roomId;
        } catch (err) {
            log.debug('the room doesn\'t exist. we need to create it for the first time');
        }
    }

    /**
     *
     * @param {string} matrixRoomId matrix roomId
     *
     * @returns {string|undefined} Returns matrix roomId alaises or undefined if no room is according to matrxRoomId
     */
    getRoomAliases(matrixRoomId) {
        const room = this.client.getRooms()
            .find(({roomId}) => roomId === matrixRoomId);
        return room ? room.getAliases : room;
    }

    /**
     *
     * @param {string} matrixRoomId matrix roomId
     *
     * @returns {undefined|string} return undefined if puppet have joined room or err.message is not 'No known servers' returns this error message if it is
     */
    async joinRoom(matrixRoomId) {
        try {
            await this.client.joinRoom(matrixRoomId);
            return;
        } catch (err) {
            if (err.message === 'No known servers') {
                log.warn('we cannot use this room anymore because you cannot currently rejoin an empty room (synapse limitation? riot throws this error too). we need to de-alias it now so a new room gets created that we can actually use.');

                return err.message;
            }
            log.warn('ignoring error from puppet join room: ', err.message);
        }
    }

    /**
     *
     * @param {*} matrixRoomId matrix roomId
     * @param {*} invitedUsers users to invite to matrix room
     *
     * @returns {Promise} async invite all users to matrix room
     */
    invite(matrixRoomId, invitedUsers) {
        if (!invitedUsers) {
            log.debug('All members in skype skypeRoom are already joined to Matrix room: ', matrixRoomId);
            return;
        }
        log.info('Users to invite', invitedUsers);
        return Promise.all(invitedUsers.map(user =>
            this.client.invite(matrixRoomId, user)
                .then(() => log.debug('New user %s invited to room %s', user, matrixRoomId))));
    }

    /**
     * Method for creating puppet data and adding to config file
     */
    async associate() {
        log.info([
            'This bridge performs matrix user puppeting.',
            'This means that the bridge logs in as your user and acts on your behalf',
        ].join('\n'));
        const localpart = readline.question('Enter your user\'s localpart\n');
        const id = `@${localpart}:${config.bridge.domain}`;
        const password = readline.question(`Enter password for ${id}\n`);
        const matrixClient = matrixSdk.createClient(config.bridge.homeserverUrl);
        const accessDat = await matrixClient.loginWithPassword(id, password);
        log.info('log in success');
        await fs.writeFile(this.pathToConfig, JSON.stringify({
            ...config,
            puppet: {
                id,
                localpart,
                token: accessDat.access_token,
            },
        }, null, 2));
        log.info(`Updated config file ${this.pathToConfig}`);
    }

    /**
     * Save a skype conversation id
     *
     * @param {string} matrixRoomId matrix room id
     * @param {string} skypeConversationId skype conversation id
     */
    saveRoom(matrixRoomId, skypeConversationId) {
        this.skypeRooms[matrixRoomId] = skypeConversationId;
    }
};
