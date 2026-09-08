// Bridge so REST handlers can push events through the WS hub without circular imports.
let sender = () => {}
export function setSender(fn) { sender = fn }
export function sendToUsers(userIds, msg) { sender(userIds, msg) }
export function broadcastAll(msg) { sender(null, msg) }
