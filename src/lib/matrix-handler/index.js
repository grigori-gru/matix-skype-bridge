const log = require('../../modules/log')(module);
const handlers = require('./handlers');
const {isTaggedMatrixMessage, isIgnoreMemberEvent} = require('../../utils');

module.exports = state => (req, _context) => {
    const {handleMatrixMessageEvent, handleMatrixMemberEvent} = handlers(state);
    const data = req.getData();

    switch (data.type) {
        case 'm.room.message':
            log.debug('incoming message event. data:', data);
            return isTaggedMatrixMessage(data.content.body) || handleMatrixMessageEvent(data);
        case 'm.room.member':
            log.debug('incoming member event. data:', data);
            return isIgnoreMemberEvent(state.puppet.getUserId(), data) || handleMatrixMemberEvent(data);
        default:
            break;
    }
};
