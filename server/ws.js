import { WebSocketServer } from 'ws'
import { verify, COOKIE, publicUser, restrictionOf } from './auth.js'
import { get, all, run } from './db.js'
import { setSender, sendToUsers } from './hub.js'
import { addPresence, removePresence, setStatus, getStatus, presence, voice, voiceJoin, voiceLeave, voiceUpdate, userVoiceChannel } from './state.js'
import { channelById, canAccess, postSystemMessage } from './api.js'

const conns = new Map()   // ws -> { userId }
const byUser = new Map()  // userId -> Set<ws>

/* DM call tracking: channelId -> { startedAt, starterId, waiterId, waitTimer } */
const dmCall = new Map()

function fmtCallDuration(ms) {
  const s = Math.round(ms / 1000)
  if (s < 60) return `${Math.max(1, s)} секунд`
  const m = Math.round(s / 60)
  if (m < 60) return `${m} минут`
  const h = Math.floor(m / 60), mm = m % 60
  const hs = h === 1 ? 'час' : (h >= 5 && h <= 20 ? 'часа' : 'часов')
  return `${h} ${hs}${mm ? ` ${mm} минут` : ''}`
}
function onVoiceJoinDM(ch, userId) {
  const other = all('SELECT user_id FROM dm_recipients WHERE channel_id = ? AND user_id != ?', [ch.id, userId]).map(r => r.user_id)[0]
  if (!other) return
  const meta = dmCall.get(ch.id) || {}
  const room = voice.get(ch.id)
  if (room && room.has(other)) {
    // the other side is here → the call is connected
    if (!meta.startedAt) {
      meta.startedAt = Date.now()
      meta.starterId = meta.starterId || meta.waiterId || userId
      meta.waiterId = null
      if (meta.waitTimer) { clearTimeout(meta.waitTimer); meta.waitTimer = null }
      dmCall.set(ch.id, meta)
      const starter = get('SELECT username FROM users WHERE id = ?', [meta.starterId])
      if (starter) postSystemMessage(ch.id, userId, `📞 **${starter.username}** начал(а) голосовой звонок.`)
    }
  } else {
    // waiting for the other side to pick up
    meta.waiterId = userId
    meta.startedAt = null
    if (!meta.waitTimer) {
      meta.waitTimer = setTimeout(() => {
        meta.waitTimer = null
        const r = voice.get(ch.id)
        if (r && r.has(userId) && !r.has(other)) {
          const caller = get('SELECT username FROM users WHERE id = ?', [userId])
          const callee = get('SELECT username FROM users WHERE id = ?', [other])
          if (caller && callee) postSystemMessage(ch.id, userId, `📞 **${caller.username}** позвонил(а), но **${callee.username}** не ответил(а).`)
        }
        dmCall.delete(ch.id)
      }, 30000)
    }
    dmCall.set(ch.id, meta)
  }
}
function onVoiceLeaveDM(ch, userId) {
  const meta = dmCall.get(ch.id)
  if (!meta) return
  if (meta.waitTimer) clearTimeout(meta.waitTimer)
  if (meta.startedAt) {
    const dur = Date.now() - meta.startedAt
    const starter = get('SELECT username FROM users WHERE id = ?', [meta.starterId || userId])
    if (starter) postSystemMessage(ch.id, userId, `**${starter.username}** начал(а) звонок продолжительностью ${fmtCallDuration(dur)}.`)
  }
  dmCall.delete(ch.id)
}

function userConns(userId) { return byUser.get(userId) || new Set() }
function send(ws, obj) { if (ws.readyState === 1) ws.send(JSON.stringify(obj)) }
function sendToAll(msg) { sendToUsers(null, msg) }

function audienceOf(ch) {
  if (!ch) return []
  if (ch.guild_id) return all('SELECT user_id FROM guild_members WHERE guild_id = ?', ch.guild_id).map(r => r.user_id)
  return all('SELECT user_id FROM dm_recipients WHERE channel_id = ?', ch.id).map(r => r.user_id)
}

export function attachWS(httpServer) {
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' })

  setSender((userIds, msg) => {
    const data = JSON.stringify(msg)
    if (userIds === null) { for (const ws of conns.keys()) if (ws.readyState === 1) ws.send(data); return }
    for (const id of userIds) for (const ws of userConns(id)) if (ws.readyState === 1) ws.send(data)
  })

  wss.on('connection', (ws, req) => {
    const cookies = {}
    for (const part of (req.headers.cookie || '').split(';')) {
      const [k, ...v] = part.trim().split('=')
      if (k) cookies[k] = decodeURIComponent(v.join('='))
    }
    const payload = verify(cookies[COOKIE])
    if (!payload) { ws.close(4001, 'unauthorized'); return }
    const user = get('SELECT * FROM users WHERE id = ?', [payload.id])
    if (!user) { ws.close(4001, 'unauthorized'); return }
    const restriction = restrictionOf(user)
    if (restriction) { send(ws, { t: 'ACCOUNT_RESTRICTED', d: { action: restriction.action, until: restriction.until || null } }); ws.close(4003, 'restricted'); return }

    conns.set(ws, { userId: user.id })
    if (!byUser.has(user.id)) byUser.set(user.id, new Set())
    byUser.get(user.id).add(ws)

    const wasOffline = !presence.has(user.id)
    // keep the user's chosen status (dnd/idle) across reconnects; only a fresh
    // connection marks them online if their stored status is the default
    const chosen = ['online', 'idle', 'dnd', 'invisible'].includes(user.status) ? user.status : 'online'
    addPresence(user.id, wasOffline ? chosen : getStatus(user.id))
    if (wasOffline) sendToAll({ t: 'PRESENCE', d: { user_id: user.id, status: getStatus(user.id) } })

    ws.on('message', raw => {
      let msg
      try { msg = JSON.parse(raw) } catch { return }
      handle(ws, user.id, msg)
    })
    ws.on('close', () => {
      const meta = conns.get(ws); conns.delete(ws)
      if (!meta) return
      userConns(meta.userId).delete(ws)
      const remaining = userConns(meta.userId).size
      const vc = userVoiceChannel(meta.userId)
      if (vc && !remaining) {
        voiceLeave(vc, meta.userId); broadcastVoice(vc)
        if (!vc.guild_id) onVoiceLeaveDM(vc, meta.userId)
      }
      removePresence(meta.userId)
      if (!presence.has(meta.userId)) sendToAll({ t: 'PRESENCE', d: { user_id: meta.userId, status: 'offline' } })
    })
    send(ws, { t: 'HELLO', d: { user_id: user.id, status: getStatus(user.id) } })
  })
}

function handle(ws, userId, msg) {
  const { op, d = {} } = msg || {}
  switch (op) {
    case 'ping': return send(ws, { t: 'PONG' })

    case 'presence': {
      if (!['online', 'idle', 'dnd', 'invisible'].includes(d.status)) return
      setStatus(userId, d.status)
      run('UPDATE users SET status = ? WHERE id = ?', [d.status, userId])
      sendToAll({ t: 'PRESENCE', d: { user_id: userId, status: d.status } })
      return
    }

    case 'typing': {
      const user = get('SELECT * FROM users WHERE id = ?', [userId])
      const ch = channelById(d.channel_id)
      if (!ch || !canAccess(user, ch)) return
      const u = { id: user.id, username: user.username, discriminator: user.discriminator, avatar: user.avatar }
      for (const id of audienceOf(ch)) {
        if (id === userId) continue
        for (const c of userConns(id)) send(c, { t: 'TYPING', d: { channel_id: ch.id, user: u, at: Date.now() } })
      }
      return
    }

    case 'voice:join': {
      const user = get('SELECT * FROM users WHERE id = ?', [userId])
      const ch = channelById(d.channel_id)
      if (!ch || !canAccess(user, ch)) return
      const oldChId = userVoiceChannel(userId)
      if (oldChId === ch.id) return
      if (oldChId) {
        voiceLeave(oldChId, userId)
        const oldCh = channelById(oldChId)
        if (oldCh && !oldCh.guild_id) onVoiceLeaveDM(oldCh, userId)
        broadcastVoice(oldChId)
      }
      voiceJoin(ch.id, userId)
      broadcastVoice(ch.id)
      if (!ch.guild_id) onVoiceJoinDM(ch, userId)
      const peers = [...(voice.get(ch.id)?.keys() || [])].filter(id => id !== userId)
      send(ws, { t: 'VOICE_INIT', d: { channel_id: ch.id, peers } })
      return
    }

    case 'voice:leave': {
      const chId = userVoiceChannel(userId)
      if (!chId) return
      voiceLeave(chId, userId)
      const ch = channelById(chId)
      if (ch && !ch.guild_id) onVoiceLeaveDM(ch, userId)
      broadcastVoice(chId)
      send(ws, { t: 'VOICE_INIT', d: { channel_id: null, peers: [] } })
      return
    }

    case 'voice:mute': {
      const ch = userVoiceChannel(userId)
      if (!ch) return
      voiceUpdate(ch, userId, { muted: !!d.muted, deafened: !!d.deafened })
      broadcastVoice(ch)
      return
    }


    case 'voice:signal': {
      for (const c of userConns(d.to)) send(c, { t: 'VOICE_SIGNAL', d: { from: userId, data: d.data } })
      return
    }

    /* DM call: notify the other participant that someone is ringing them */
    case 'call:ring': {
      const ch = channelById(d.channel_id)
      if (!ch || ch.guild_id || ch.type !== 'dm') return
      const user = get('SELECT * FROM users WHERE id = ?', [userId])
      if (!user || !canAccess(user, ch)) return
      const restriction = restrictionOf(user)
      if (restriction) return
      const other = all('SELECT user_id FROM dm_recipients WHERE channel_id = ? AND user_id != ?', [ch.id, userId]).map(r => r.user_id)[0]
      if (!other) return
      for (const c of userConns(other)) send(c, { t: 'CALL_RING', d: { channel_id: ch.id, from: publicUser(user) } })
      return
    }
  }
}

function broadcastVoice(channelId) {
  const ch = channelById(channelId)
  const states = [...(voice.get(channelId)?.entries() || [])].map(([user_id, s]) => ({ user_id, ...s }))
  const payload = { t: 'VOICE_STATE', d: { channel_id: channelId, states } }
  for (const id of audienceOf(ch)) for (const c of userConns(id)) send(c, payload)
}
