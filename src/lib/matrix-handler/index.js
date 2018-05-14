const log = require('../../modules/log')(module);
const handlers = require('./handlers');

module.exports = state => (req, _context) => {
    const {handleMatrixMessageEvent, handleMatrixMemberEvent} = handlers(state);
    const data = req.getData();

    switch (data.type) {
        case 'm.room.message':
            log.debug('incoming message. data:', data);
            return handleMatrixMessageEvent(data);
        case 'm.room.member':
            log.debug('incoming message. data:', data);
            return handleMatrixMemberEvent(data);
        default:
            log.debug('ignored a matrix event', data.type);
            break;
    }
};
