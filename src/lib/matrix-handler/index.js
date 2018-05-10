const log = require('../../modules/log')(module);
const handlers = require('./handlers');

module.exports = state => (req, _context) => {
    const {handleMatrixMessageEvent, handleMatrixMemberEvent} = handlers(state);

    const data = req.getData();

    if (data.type === 'm.room.message') {
        log.debug('incoming message. data:', data);
        return handleMatrixMessageEvent(data);
    } else if (data.type === 'm.room.member') {
        log.debug('incoming message. data:', data);
        return handleMatrixMemberEvent(data);
    }
    log.debug('ignored a matrix event', data.type);
};
