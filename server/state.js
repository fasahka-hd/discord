// In-memory presence + voice state shared between REST and WS layers.
export const presence = new Map() // userId -> { status, connCount }

export function addPresence(userId, status = 'online') {
  const p = presence.get(userId)
  if (p) { p.connCount++; p.status = status }
  else presence.set(userId, { status, connCount: 1 })
}
export function removePresence(userId) {
  const p = presence.get(userId)
  if (!p) return
  p.connCount--
  if (p.connCount <= 0) presence.delete(userId)
}
export function setStatus(userId, status) {
  const p = presence.get(userId)
  if (p) p.status = status
}
export function isOnline(userId) { return presence.has(userId) }
export function getStatus(userId) { return presence.get(userId)?.status ?? 'offline' }

// voice: channelId -> Map<userId, {muted, deafened, video}>
export const voice = new Map()

export function voiceJoin(channelId, userId, meta = {}) {
  let room = voice.get(channelId)
  if (!room) { room = new Map(); voice.set(channelId, room) }
  room.set(userId, { muted: false, deafened: false, video: false, ...meta })
}
export function voiceLeave(channelId, userId) {
  const room = voice.get(channelId)
  if (!room) return
  room.delete(userId)
  if (room.size === 0) voice.delete(channelId)
}
export function voiceUpdate(channelId, userId, patch) {
  const room = voice.get(channelId)
  const st = room?.get(userId)
  if (st) Object.assign(st, patch)
}
export function voiceSnapshot() {
  const out = {}
  for (const [ch, room] of voice) out[ch] = [...room.entries()].map(([u, s]) => ({ user_id: u, ...s }))
  return out
}
export function userVoiceChannel(userId) {
  for (const [ch, room] of voice) if (room.has(userId)) return ch
  return null
}
export function moveUserVoice(oldCh, newCh, userId) {
  if (oldCh && oldCh !== newCh) voiceLeave(oldCh, userId)
  if (newCh) voiceJoin(newCh, userId)
}
