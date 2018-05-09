const chai = require('chai');
const {stub} = require('sinon');
const sinonChai = require('sinon-chai');
const {expect} = chai;
chai.use(sinonChai);
const proxyquire = require('proxyquire');
const config = require('../src/config.js');

const readlineStub = stub();
const writeFileStub = stub();
const createClientStub = stub();

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
    });
const pathTotestConfig = './fixtures/config.json';

const puppet = new Puppet(pathTotestConfig);

describe('Puppet testing', () => {
    it('associate testing', async () => {
        const localpart = 'localpart';
        const password = 'password';
        const id = `@${localpart}:${config.bridge.domain}`;
        const token = 'token';

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
});
