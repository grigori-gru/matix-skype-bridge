// const chai = require('chai');
// const {stub} = require('sinon');
// const sinonChai = require('sinon-chai');
// const {expect} = chai;
// chai.use(sinonChai);
// const proxyquire = require('proxyquire');
// const imageEvent = require('../fixtures/skype-image.json');
// const sentEvent = require('../fixtures/skype-sent.json');
// const messageEvent = require('../fixtures/skype-message.json');
// const inputEvent = require('../fixtures/skype-input.json');

// const sentHandlerStub = stub();
// const messageHandlerStub = stub();
// const imageHandlerStub = stub();

// const state = {
//     bridge: {},
//     puppet: {},
//     skypeClient: {
//         context: {
//             username: 'live:ignore_1',
//         },
//     },
// };

// const {testOnly} = proxyquire('../../src/lib/skype-handler/lib',
//     {
//         './handlers': state => ({
//             sentHandler: sentHandlerStub,
//             messageHandler: messageHandlerStub,
//             imageHandler: imageHandlerStub,
//         }),
//     });
// const {getOrCreateMatrixRoom} = testOnly(state);
// describe('Skype Handler testing', () => {
//     it('expect sentHandler returns with message event', async () => {
//         const matrixRoom = await getOrCreateMatrixRoom();
//         expect(sentHandlerStub).to.be.calledWithExactly(sentEvent.resource);
//         sentHandlerStub.resetHistory();
//     });
// });
