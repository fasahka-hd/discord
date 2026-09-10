import { getState, setState, mergeUsers, upsertMessage, patchMessage, removeMessage, setUI } from './store.js'
import { voice } from './voice.js'

let ws = null
let refreshHandler = null
export function setRefreshHandler(fn) { refreshHandler = fn }

export function connectWS() {
  if (ws && (ws.readyState === 0 || ws.readyState === 1)) return
  const proto = location.protocol === 'https:' ? 'wss' : 'ws'
  ws = new WebSocket(`${proto}://${location.host}/ws`)
  ws.onopen = () => {
    
    if (everConnected && refreshHandler) refreshHandler()
    everConnected = true
  }
  ws.onmessage = e => {
    let msg
    try { msg = JSON.parse(e.data) } catch { return }
    dispatch(msg)
  }
  ws.onclose = () => { setTimeout(connectWS, 2000) }
}
let everConnected = false
export function wsSend(op, d = {}) {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify({ op, d }))
}

function dispatch(msg) {
  const { t, d } = msg
  const s = getState()
  switch (t) {
    case 'HELLO': break

    case 'PRESENCE':
      setState({ presences: { ...s.presences, [d.user_id]: d.status } })
      break

    case 'ME_UPDATE':
      setState({ me: { ...s.me, ...d.user }, users: { ...s.users, [d.user.id]: { ...s.users[d.user.id], ...d.user } } })
      break

    case 'USER_UPDATE':
      mergeUsers([d.user])
      if (s.me && d.user.id === s.me.id) setState({ me: { ...s.me, ...d.user } })
      break

    case 'MESSAGE_CREATE': {
      mergeUsers([{ id: d.message.author_id }])
      upsertMessage(d.message)
      
      const ui = getState().ui
      const viewing = ui.channelId === d.channel_id && document.visibilityState === 'visible'
      if (viewing) {
        fetch(`/api/channels/${d.channel_id}/read`, { method: 'POST' })
        setState({ reads: { ...getState().reads, [d.channel_id]: Date.now() } })
      }
      touchLastMessage(d.channel_id, d.message, !viewing)
      break
    }
    case 'MESSAGE_UPDATE':
      patchMessage(d.message)
      break
    case 'MESSAGE_DELETE':
      removeMessage(d.id)
      break
    case 'REACTION': {
      const data = getState().messages[d.channel_id]
      if (data) {
        const list = data.list.map(m => {
          if (m.id !== d.message_id) return m
          const rows = m.reactions || []
          const has = rows.find(r => r.emoji === d.emoji && r.user_id === d.user_id)
          let rx
          if (d.remove) rx = rows.filter(r => r !== has)
          else rx = has ? rows : [...rows, { emoji: d.emoji, user_id: d.user_id }]
          return { ...m, reactions: rx }
        })
        setState({ messages: { ...getState().messages, [d.channel_id]: { ...data, list } } })
      }
      break
    }
    case 'TYPING': {
      mergeUsers([d.user])
      const cur = { ...(getState().typing[d.channel_id] || {}) }
      cur[d.user.id] = d.at
      setState({ typing: { ...getState().typing, [d.channel_id]: cur } })
      break
    }
    case 'FRIENDS_UPDATE':
      setState({ friends: d.friends, incoming: d.incoming, outgoing: d.outgoing })
      break
    case 'DM_CREATE': {
      const exists = getState().dms.some(c => c.id === d.channel.id)
      if (!exists) {
        setState({ dms: [{ ...d.channel, last_message: null, unread: 0 }, ...getState().dms] })
      }
      break
    }
    case 'DM_REMOVE': {
      const ui = getState().ui
      if (ui.channelId === d.channel_id) setUI({ channelId: null })
      setState({ dms: getState().dms.filter(c => c.id !== d.channel_id) })
      break
    }
    case 'GUILD_UPDATE': {
      if (!d.guild || !d.guild.id) {
        if (refreshHandler) refreshHandler()
        break
      }
      const guilds = getState().guilds
      const idx = guilds.findIndex(g => g.id === d.guild.id)
      const prev = idx >= 0 ? guilds[idx] : null
      let incoming = d.guild
      if (prev) {
        const oldCh = new Map((prev.channels || []).map(c => [c.id, c]))
        incoming = {
          ...prev,
          ...d.guild,
          my_role: d.guild.my_role ?? prev.my_role,
          channels: (d.guild.channels || []).map(c => {
            const o = oldCh.get(c.id)
            return o ? { ...c, unread: c.unread ?? o.unread, last_message: c.last_message ?? o.last_message } : c
          }),
        }
      }
      const next = idx >= 0 ? guilds.map((g, i) => i === idx ? incoming : g) : [...guilds, incoming]
      setState({ guilds: next })
      break
    }
    case 'GUILD_REMOVE': {
      const guilds = getState().guilds.filter(g => g.id !== d.guild_id)
      const ui = getState().ui
      if (ui.guildId === d.guild_id) setUI({ guildId: '@home', channelId: null })
      setState({ guilds })
      break
    }
    case 'VOICE_STATE': {
      const voiceMap = { ...getState().voice }
      if (d.states.length) voiceMap[d.channel_id] = d.states
      else delete voiceMap[d.channel_id]
      setState({ voice: voiceMap })
      voice.prune(d.channel_id, d.states.map(x => x.user_id))
      break
    }
    case 'VOICE_INIT':
      voice.onInit(d)
      break
    case 'VOICE_SIGNAL':
      voice.onSignal(d)
      break
    case 'STATE_REFRESH':
      refreshHandler && refreshHandler()
      break

    case 'CALL_RING':
      
      if (getState().ui.channelId !== d.channel_id || !voice.channelId) setState({ incomingCall: d })
      break

    case 'ACCOUNT_RESTRICTED':
      try { voice.leave() } catch {}
      setState({ restriction: d, incomingCall: null })
      break
  }
}

function touchLastMessage(channelId, message, incUnread) {
  const s = getState()
  const dmIdx = s.dms.findIndex(c => c.id === channelId)
  if (dmIdx >= 0) {
    const dms = [...s.dms]
    dms[dmIdx] = { ...dms[dmIdx], last_message: message, unread: (dms[dmIdx].unread || 0) + (incUnread ? 1 : 0) }
    dms.sort((a, b) => (b.last_message?.created_at || b.created_at) - (a.last_message?.created_at || a.created_at))
    setState({ dms })
    return
  }
  const guilds = s.guilds.map(g => ({
    ...g,
    channels: g.channels.map(c => c.id === channelId
      ? { ...c, last_message: { id: message.id, author_id: message.author_id, content: message.content, created_at: message.created_at }, unread: (c.unread || 0) + (incUnread ? 1 : 0) }
      : c),
  }))
  setState({ guilds })
}


setInterval(() => {
  const s = getState()
  const now = Date.now()
  let changed = false
  const typing = {}
  for (const [ch, users] of Object.entries(s.typing)) {
    const fresh = Object.fromEntries(Object.entries(users).filter(([, ts]) => now - ts < 6000))
    if (Object.keys(fresh).length) typing[ch] = fresh
    if (Object.keys(fresh).length !== Object.keys(users).length) changed = true
  }
  if (changed) setState({ typing })
}, 2000)
