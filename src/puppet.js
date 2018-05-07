const Promise = require('bluebird');
const matrixSdk = require('matrix-js-sdk');
const fs = require('fs');
const read = Promise.promisify(require('read'));
const whyPuppeting = 'https://github.com/kfatehi/matrix-appservice-imessage/commit/8a832051f79a94d7330be9e252eea78f76d774bc';
const config = require('../config.json');
const log = require('./src/modules/log')(module);

class Puppet {
    constructor(jsonFile) {
        this.jsonFile = jsonFile;
        this.config = config;
        this.id = null;
        this.client = null;
        this.thirdPartyRooms = {};
        this.app = null;
    }

    /**
     * Reads the config file, creates a matrix client, connects, and waits for sync
     *
     * @returns {Promise} Returns a promise resolving the MatrixClient
     */
    startClient() {
        this.id = config.puppet.id;
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

                this.client.on('Room.receipt', (event, room) => {
                    if (this.app === null) {
                        return;
                    }

                    if (room.roomId in this.thirdPartyRooms) {
                        const content = event.getContent();
                        const readEvent = content.find(eventId => eventId['m.read'] === this.id);
                        if (readEvent) {
                            log.info('Receive a read event from ourself');
                            return this.app.sendReadReceiptAsPuppetToThirdPartyRoomWithId(
                                this.thirdPartyRooms[room.roomId]
                            );
                        }
                    }
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

    associate() {
        log.info([
            'This bridge performs matrix user puppeting.',
            'This means that the bridge logs in as your user and acts on your behalf',
            `For the rationale, see ${whyPuppeting}`,
        ].join('\n'));
        log.info('Enter your user\'s localpart');
        return read({silent: false}).then(localpart => {
            const id = `@${localpart}:${config.bridge.domain}`;
            log.info('Enter password for ', id);
            return read({silent: true, replace: '*'}).then(password => ({localpart, id, password}));
        }).then(({localpart, id, password}) => {
            const matrixClient = matrixSdk.createClient(config.bridge.homeserverUrl);
            return matrixClient.loginWithPassword(id, password).then(accessDat => {
                log.info('log in success');
                return fs.writeFile(this.jsonFile, JSON.stringify(Object.assign({}, config, {
                    puppet: {
                        id,
                        localpart,
                        token: accessDat.access_token,
                    },
                }), null, 2)).then(() => {
                    log.info(`Updated config file ${this.jsonFile}`);
                });
            });
        });
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

    /**
     * Set the App object
     *
     * @param {MatrixPuppetBridgeBase} app the App object
     */
    setApp(app) {
        this.app = app;
    }
}

module.exports = Puppet;
