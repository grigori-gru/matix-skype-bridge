const log = require('../../modules/log')(module);
const handlers = require('./handlers');
const {isTaggedMatrixMessage} = require('../../utils');

module.exports = state => (req, _context) => {
    const {handleMatrixMessageEvent, handleMatrixMemberEvent} = handlers(state);
    const data = req.getData();

    switch (data.type) {
        case 'm.room.message':
            log.debug('incoming message. data:', data);
            if (isTaggedMatrixMessage(data.content.body)) {
                log.debug('ignoring tagged message, it was sent by the bridge');
                return;
            }
            return handleMatrixMessageEvent(data);
        case 'm.room.member':
            log.debug('incoming message. data:', data);
            return handleMatrixMemberEvent(data);
        default:
            break;
    }
};
