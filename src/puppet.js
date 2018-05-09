const Promise = require('bluebird');
const matrixSdk = require('matrix-js-sdk');
const fs = require('fs');
const readline = require('readline-sync');
const config = require('./config.js');
const log = require('./modules/log')(module);

module.exports = class Puppet {
    constructor(jsonFile) {
        this.jsonFile = jsonFile;
        this.client = null;
        this.thirdPartyRooms = {};
    }

    /**
     * Reads the config file, creates a matrix client, connects, and waits for sync
     *
     * @returns {Promise} Returns a promise resolving the MatrixClient
     */
    startClient() {
        return matrixSdk.createClient({
            baseUrl: config.bridge.homeserverUrl,
            userId: config.puppet.id,
            accessToken: config.puppet.token,
        }).then(_matrixClient => {
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
     * Returns the MatrixClient
     *
     * @returns {MatrixClient} an instance of MatrixClient
     */
    getClient() {
        return this.client;
    }

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
        await fs.writeFile(this.jsonFile, JSON.stringify({
            ...config,
            puppet: {
                id,
                localpart,
                token: accessDat.access_token,
            },
        }, null, 2));
        log.info(`Updated config file ${this.jsonFile}`);
    }

    /**
     * Save a third party room id
     *
     * @param {string} matrixRoomId matrix room id
     * @param {string} thirdPartyRoomId third party room id
     */
    saveThirdPartyRoomId(matrixRoomId, thirdPartyRoomId) {
        this.thirdPartyRooms[matrixRoomId] = thirdPartyRoomId;
    }
};
