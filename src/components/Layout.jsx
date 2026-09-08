import React, { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { getState, setState, setUI, myVoiceChannel, myVoiceState, dmOtherUser, displayName } from '../lib/store.js'
import { api } from '../lib/api.js'
import { useStore } from '../lib/util.js'
import { wsSend } from '../lib/ws.js'
import { voice } from '../lib/voice.js'
import { Avatar, Tooltip, openMenu, confirmDialog } from './Common.jsx'
import { DiscordLogo, IconHash, IconSpeaker, IconPeople, IconGear, IconMic, IconMicOff, IconHeadphones, IconHeadphoneOff, IconPlus, IconChevronDown, IconUserAdd, IconMessage, IconLogout, IconPhone, IconPhoneOff, IconSearch, IconX, IconCrown, IconShield, IconTrash, IconMonitor } from './Icons.jsx'
import Chat from './Chat.jsx'
import Friends from './Friends.jsx'
import Modals from './Modals.jsx'
import ServerList, { leaveGuild } from './ServerList.jsx'
import { ContextMenuHost } from './Common.jsx'

export default function Layout() {
  const s = useStore()
  useEffect(() => {
    document.body.classList.toggle('theme-light', s.ui.theme === 'light')
    try { localStorage.setItem('dsh_theme', s.ui.theme) } catch {}
  }, [s.ui.theme])
  const guild = s.ui.guildId !== '@home' ? s.guilds.find(g => g.id === s.ui.guildId) : null
  const showChat = !!s.ui.channelId
  return (
    <div className="app">
      <ServerList />
      {guild ? <GuildSidebar guild={guild} /> : <HomeSidebar />}
      {showChat
        ? <Chat />
        : guild ? <EmptyView guild={guild} /> : <Friends />}
      <Modals />
      <IncomingCallModal />
      <ContextMenuHost />
    </div>
  )
}

/* ================= incoming DM call ================= */
function IncomingCallModal() {
  const s = useStore()
  const call = s.incomingCall
  useEffect(() => {
    if (!call) return
    const t = setTimeout(() => setState({ incomingCall: null }), 30000)
    return () => clearTimeout(t)
  }, [call])
  if (!call) return null
  const caller = s.users[call.from?.id] || call.from
  if (!caller) return null
  const accept = () => {
    setState({ incomingCall: null })
    if (voice.channelId && voice.channelId !== call.channel_id) voice.leave()
    voice.join(call.channel_id)
    setUI({ guildId: '@home', channelId: call.channel_id })
  }
  const decline = () => setState({ incomingCall: null })
  return createPortal(
    <div className="ic-backdrop">
      <div className="ic-card">
        <div className="ic-label">Входящий звонок</div>
        <div className="ic-sub">Голосовой звонок от</div>
        <div className="ic-avatar"><span className="ic-pulse" /><Avatar user={caller} size={72} /></div>
        <div className="ic-name">{displayName(caller)}</div>
        <div className="ic-user">@{caller.username}</div>
        <div className="ic-btns">
          <Tooltip tip="Отклонить" side="bottom"><button className="ic-btn decline" onClick={decline}><IconPhoneOff size={24} /></button></Tooltip>
          <Tooltip tip="Принять" side="bottom"><button className="ic-btn accept" onClick={accept}><IconPhone size={24} /></button></Tooltip>
        </div>
      </div>
    </div>, document.body)
}

function EmptyView({ guild }) {
  return (
    <div className="chat" style={{ display: 'grid', placeItems: 'center' }}>
      <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
        <div style={{ fontSize: 48, marginBottom: 8 }}>💬</div>
        <div style={{ fontSize: 16, color: 'var(--text-header)', fontWeight: 600 }}>{guild.name}</div>
        <div style={{ marginTop: 4 }}>Выберите канал слева, чтобы начать общение</div>
      </div>
    </div>
  )
}

/* ================= Home (DM) sidebar ================= */
function HomeSidebar() {
  const s = useStore()
  const [q, setQ] = useState('')
  const me = s.me
  const dms = s.dms.filter(c => {
    if (!q) return true
    const other = otherUser(c)
    return other && other.username.toLowerCase().includes(q.toLowerCase())
  })
  function otherUser(c) {
    const id = (c.recipients || []).find(r => r !== me.id)
    return s.users[id]
  }
  const friendsUnread = s.incoming.length
  return (
    <aside className="channel-sidebar">
      <div style={{ padding: 8, flexShrink: 0 }}>
        <div style={{ position: 'relative' }}>
          <input className="field-input" style={{ background: 'var(--bg-darkest)', padding: '6px 8px', fontSize: 14 }} placeholder="Найти или начать беседу"
            value={q} onChange={e => setQ(e.target.value)} />
        </div>
      </div>
      <div className="channel-list" style={{ padding: '0 8px' }}>
        <Tooltip side="right" tip="Друзья">
          <div className={`channel-item ${!s.ui.channelId ? 'active' : ''}`} style={{ marginBottom: 2 }}
            onClick={() => setUI({ guildId: '@home', channelId: null })}>
            <IconPeople size={22} /> <span className="name">Друзья</span>
            {friendsUnread > 0 && <span className="unread-badge">{friendsUnread}</span>}
          </div>
        </Tooltip>
        <div className="channel-category" style={{ paddingTop: 14 }}>
          <span>Личные сообщения</span>
        </div>
        {dms.map(c => {
          const other = otherUser(c)
          if (!other) return null
          const vc = s.voice[c.id]
          return (
            <div key={c.id} className={`channel-item ${s.ui.channelId === c.id ? 'active' : ''}`}
              onClick={() => setUI({ guildId: '@home', channelId: c.id })}
              onContextMenu={e => openMenu(e, [
                { label: 'Закрыть беседу', danger: true, icon: <IconX size={16} />, onClick: () => confirmDialog({ title: 'Закрыть беседу?', body: 'История сообщений будет удалена безвозвратно.', okLabel: 'Закрыть', onOk: () => api(`/dm/${c.id}`, { method: 'DELETE' }).catch(() => {}) }) },
              ])}>
              <Avatar user={other} size={32} showStatus onClick={e => { e.stopPropagation(); setUI({ modal: { type: 'profile', userId: other.id } }) }} />
              <span className="name" style={{ color: s.ui.channelId === c.id ? 'var(--text-header)' : undefined }}>{displayName(other)}</span>
              {vc && <IconSpeaker size={16} style={{ color: 'var(--green)' }} />}
              {c.unread > 0 && <span className="unread-badge">{c.unread}</span>}
            </div>
          )
        })}
        {dms.length === 0 && <div style={{ padding: '8px 8px', color: 'var(--text-faint)', fontSize: 13 }}>Пока нет бесед.<br />Добавьте друзей — и начните общение!</div>}
      </div>
      <UserPanel />
    </aside>
  )
}

/* ================= Guild sidebar ================= */
function GuildSidebar({ guild }) {
  const s = useStore()
  const isOwner = guild.my_role === 'owner' || guild.members.find(m => m.user_id === s.me.id)?.role === 'owner'
  const myRole = guild.members.find(m => m.user_id === s.me.id)?.role || guild.my_role
  const canManage = ['owner', 'admin'].includes(myRole)
  const text = guild.channels.filter(c => c.type === 'text')
  const voiceChs = guild.channels.filter(c => c.type === 'voice')
  // collapsible categories (persisted per guild)
  const [collapsed, setCollapsed] = useState(() => {
    try { return JSON.parse(localStorage.getItem('dsh_collapse') || '{}') } catch { return {} }
  })
  const toggleCat = key => {
    const next = { ...collapsed, [key]: !collapsed[key] }
    setCollapsed(next)
    try { localStorage.setItem('dsh_collapse', JSON.stringify(next)) } catch {}
  }
  const textKey = `${guild.id}:text`, voiceKey = `${guild.id}:voice`

  const openChannel = c => setUI({ channelId: c.id })
  const joinVoice = async c => {
    if (myVoiceChannel() === c.id) { voice.leave(); return }
    await voice.join(c.id)
  }

  return (
    <aside className="channel-sidebar">
      <div className="guild-header" onClick={e => openMenu(e, [
        { label: 'Создать канал', icon: <IconPlus size={16} />, onClick: () => setUI({ modal: { type: 'create-channel', guildId: guild.id } }) },
        { label: 'Пригласить людей', icon: <IconUserAdd size={16} />, onClick: () => setUI({ modal: { type: 'invite', guildId: guild.id } }) },
        { sep: true },
        { label: 'Настройки сервера', icon: <IconGear size={16} />, onClick: () => setUI({ modal: { type: 'guild-settings', guildId: guild.id } }) },
        { sep: true },
        { label: 'Выйти с сервера', danger: true, onClick: () => leaveGuild(guild) },
      ])}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{guild.name}</span>
        <IconChevronDown size={16} />
      </div>
      <div className="channel-list">
        <div className="channel-category" onClick={() => toggleCat(textKey)} title="Свернуть / развернуть">
          <IconChevronDown size={12} style={collapsed[textKey] ? { transform: 'rotate(-90deg)', transition: 'transform .15s' } : { transition: 'transform .15s' }} />
          <span>Текстовые каналы</span>
          {canManage && <span className="plus clickable" onClick={e => { e.stopPropagation(); setUI({ modal: { type: 'create-channel', guildId: guild.id, channelType: 'text' } }) }}><IconPlus size={16} /></span>}
        </div>
        {!collapsed[textKey] && <>
          {text.map(c => (
            <div key={c.id} className={`channel-item ${s.ui.channelId === c.id ? 'active' : ''} ${c.unread > 0 ? 'unread' : ''}`}
              onClick={() => openChannel(c)}
              onContextMenu={e => openMenu(e, channelMenu(c, canManage))}>
              <IconHash size={20} style={{ color: 'var(--text-faint)', flexShrink: 0 }} />
              <span className="name">{c.name}</span>
              {c.unread > 0 && <span className="unread-badge">{c.unread}</span>}
            </div>
          ))}
          {text.length === 0 && <div style={{ padding: '4px 8px', color: 'var(--text-faint)', fontSize: 13 }}>Нет текстовых каналов</div>}
        </>}
        <div className="channel-category" style={{ marginTop: 8 }} onClick={() => toggleCat(voiceKey)} title="Свернуть / развернуть">
          <IconChevronDown size={12} style={collapsed[voiceKey] ? { transform: 'rotate(-90deg)', transition: 'transform .15s' } : { transition: 'transform .15s' }} />
          <span>Голосовые каналы</span>
          {canManage && <span className="plus clickable" onClick={e => { e.stopPropagation(); setUI({ modal: { type: 'create-channel', guildId: guild.id, channelType: 'voice' } }) }}><IconPlus size={16} /></span>}
        </div>
        {!collapsed[voiceKey] && <>
          {voiceChs.map(c => {
            const members = s.voice[c.id] || []
            return (
              <React.Fragment key={c.id}>
                <div className={`channel-item ${myVoiceChannel() === c.id ? 'active' : ''}`}
                  onClick={() => joinVoice(c)}
                  onContextMenu={e => openMenu(e, channelMenu(c, canManage))}>
                  <IconSpeaker size={20} style={{ color: 'var(--text-faint)', flexShrink: 0 }} />
                  <span className="name">{c.name}</span>
                </div>
                {members.length > 0 && (
                  <div className="voice-members">
                    {members.map(m => {
                      const u = s.users[m.user_id]
                      if (!u) return null
                      return (
                        <div key={m.user_id} className={`voice-member ${m.muted ? 'muted' : ''}`}
                          onClick={() => setUI({ modal: { type: 'profile', userId: m.user_id } })}>
                          <Avatar user={u} size={20} speaking={!!s.speaking[m.user_id]} />
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{displayName(u)}</span>
                          <span style={{ marginLeft: 'auto', display: 'flex', gap: 3 }}>
                            {m.deafened && <IconHeadphoneOff size={13} style={{ color: 'var(--red)' }} />}
                            {m.muted && <IconMicOff size={13} style={{ color: 'var(--red)' }} />}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </React.Fragment>
            )
          })}
          {voiceChs.length === 0 && <div style={{ padding: '4px 8px', color: 'var(--text-faint)', fontSize: 13 }}>Нет голосовых каналов</div>}
        </>}
      </div>
      <UserPanel />
    </aside>
  )
}

function channelMenu(c, canManage) {
  const items = []
  if (canManage) {
    items.push({ label: 'Изменить канал', icon: <IconGear size={16} />, onClick: () => setUI({ modal: { type: 'edit-channel', channelId: c.id } }) })
    items.push({ sep: true })
    items.push({ label: 'Удалить канал', danger: true, icon: <IconTrash size={16} />, onClick: () => confirmDialog({ title: `Удалить #${c.name}?`, body: 'Удаление канала необратимо.', okLabel: 'Удалить канал', onOk: () => api(`/channels/${c.id}`, { method: 'DELETE' }).catch(e => alert(e.message)) }) })
  }
  return items
}

/* ================= User panel ================= */
function UserPanel() {
  const s = useStore()
  const me = s.users[s.me.id] || s.me
  const vs = myVoiceState()
  const micMuted = s.voiceLocal.muted
  const deaf = s.voiceLocal.deafened

  const toggleMic = () => voice.setMuted(!micMuted)
  const toggleDeaf = () => voice.setDeafened(!deaf)

  const dmCh = vs ? findChannel(vs.channel_id) : null
  return (
    <>
      {vs && (dmCh?.type === 'dm' ? <CallPanel vs={vs} ch={dmCh} /> : <VoicePanel vs={vs} />)}
      <div className="user-panel-wrap">
        <div className="user-panel">
          <div className="me" title="Клик — профиль, ПКМ — статус"
            onClick={() => setUI({ modal: { type: 'profile', userId: me.id, abovePanel: true } })}
            onContextMenu={e => openMenu(e, [
              { label: 'В сети', onClick: () => setStatus('online') },
              { label: 'Не активен', onClick: () => setStatus('idle') },
              { label: 'Не беспокоить', onClick: () => setStatus('dnd') },
              { label: 'Невидимка', onClick: () => setStatus('invisible') },
              { sep: true },
              { label: 'Открыть профиль', onClick: () => setUI({ modal: { type: 'profile', userId: me.id, abovePanel: true } }) },
              { label: 'Настройки', icon: <IconGear size={16} />, onClick: () => setUI({ settingsOpen: true, settingsTab: 'profile' }) },
              { sep: true },
              { label: 'Выйти', danger: true, icon: <IconLogout size={16} />, onClick: async () => { await api('/logout', { method: 'POST' }); location.reload() } },
            ])}>
            <Avatar user={me} size={40} showStatus status={me.status === 'invisible' ? 'invisible' : (s.presences[me.id] || me.status)} />
            <div style={{ minWidth: 0 }}>
              <div className="uname">{displayName(me)}</div>
              <div className="ustatus">{statusLabel(s.presences[me.id] || me.status)}</div>
            </div>
          </div>
          <Tooltip tip={micMuted ? 'Включить микрофон' : 'Выключить микрофон'} side="top">
            <button className={`icon-btn ${micMuted ? 'danger' : ''}`} onClick={toggleMic} style={micMuted ? { color: 'var(--red)' } : {}}>
              {micMuted ? <IconMicOff size={20} /> : <IconMic size={20} />}
            </button>
          </Tooltip>
          <Tooltip tip={deaf ? 'Включить звук' : 'Выключить звук'} side="top">
            <button className={`icon-btn ${deaf ? 'danger' : ''}`} onClick={toggleDeaf} style={deaf ? { color: 'var(--red)' } : {}}>
              {deaf ? <IconHeadphoneOff size={20} /> : <IconHeadphones size={20} />}
            </button>
          </Tooltip>
          <Tooltip tip="Пользовательские настройки" side="top">
            <button className="icon-btn" onClick={() => setUI({ settingsOpen: true, settingsTab: 'profile' })}>
              <IconGear size={20} />
            </button>
          </Tooltip>
        </div>
      </div>
    </>
  )
}

async function setStatus(status) {
  try {
    await api('/me', { method: 'PATCH', body: { status } })
    wsSend('presence', { status })
  } catch {}
}

function VoicePanel({ vs }) {
  const s = useStore()
  const [elapsed, setElapsed] = useState('0:00')
  useEffect(() => {
    const t = setInterval(() => setElapsed(fmtDur(Date.now() - voice.connectedAt)), 1000)
    return () => clearInterval(t)
  }, [])
  const ch = findChannel(vs.channel_id)
  const guild = ch?.guild_id ? s.guilds.find(g => g.id === ch.guild_id) : null
  const name = ch ? (ch.type === 'dm' ? otherDmName(ch) : ch.name) : '—'
  return (
    <div className="voice-panel">
      <div className="vp-top">
        <IconSpeaker size={16} />
        <span style={{ flex: 1 }}>Голосовое соединение</span>
        <span className="voice-timer">{elapsed}</span>
      </div>
      <div className="vp-channel">
        <span>{guild ? `${guild.name} / ` : ''}{name}</span>
        <Tooltip tip="Отключиться" side="top">
          <button className="icon-btn" onClick={() => voice.leave()}><IconPhoneOff size={18} /></button>
        </Tooltip>
      </div>
    </div>
  )
}
/* ---------- DM call panel (bottom-left, shown while in a DM voice call) ---------- */
function CallPanel({ vs, ch }) {
  const s = useStore()
  const me = s.users[s.me.id] || s.me
  const other = dmOtherUser(ch)
  const [elapsed, setElapsed] = useState('0:00')
  useEffect(() => {
    const t = setInterval(() => setElapsed(fmtDur(Date.now() - voice.connectedAt)), 1000)
    return () => clearInterval(t)
  }, [])
  const micMuted = s.voiceLocal.muted
  const deaf = s.voiceLocal.deafened
  const share = s.screenShare
  return (
    <div className="call-panel">
      <div className="cp-row">
        <Avatar user={me} size={28} speaking={!!s.speaking[me.id]} />
        {other && <Avatar user={other} size={28} speaking={!!s.speaking[other.id]} />}
        <div className="cp-info">
          <div className="cp-name">{other ? displayName(other) : 'Звонок'}</div>
          <div className="cp-timer">Голосовой звонок · {elapsed}</div>
        </div>
        <div className="cp-btns">
          <Tooltip tip={micMuted ? 'Включить микрофон' : 'Выключить микрофон'} side="top">
            <button className={`call-btn ${micMuted ? 'off' : ''}`} onClick={() => voice.setMuted(!micMuted)}>
              {micMuted ? <IconMicOff size={14} /> : <IconMic size={14} />}
            </button>
          </Tooltip>
          <Tooltip tip={deaf ? 'Включить звук' : 'Выключить звук'} side="top">
            <button className={`call-btn ${deaf ? 'off' : ''}`} onClick={() => voice.setDeafened(!deaf)}>
              {deaf ? <IconHeadphoneOff size={14} /> : <IconHeadphones size={14} />}
            </button>
          </Tooltip>
          <Tooltip tip={share?.mine ? 'Остановить демонстрацию' : 'Демонстрация экрана'} side="top">
            <button className={`call-btn ${share?.mine ? 'active' : ''}`} onClick={() => (share?.mine ? voice.stopScreenShare() : voice.shareScreen())}>
              <IconMonitor size={14} />
            </button>
          </Tooltip>
          <Tooltip tip="Отключиться" side="top">
            <button className="call-btn end" onClick={() => voice.leave()}><IconPhoneOff size={14} /></button>
          </Tooltip>
        </div>
      </div>
    </div>
  )
}

function otherDmName(ch) {
  const s = getState()
  const id = (ch.recipients || []).find(r => r !== s.me.id)
  return s.users[id]?.username || 'Беседа'
}
function findChannel(id) {
  const s = getState()
  const dm = s.dms.find(c => c.id === id)
  if (dm) return dm
  for (const g of s.guilds) { const c = g.channels.find(c => c.id === id); if (c) return c }
  return null
}
function fmtDur(ms) {
  const sec = Math.floor(ms / 1000)
  const m = Math.floor(sec / 60), h = Math.floor(m / 60)
  const pad = x => String(x).padStart(2, '0')
  return h ? `${h}:${pad(m % 60)}:${pad(sec % 60)}` : `${m}:${pad(sec % 60)}`
}
function statusLabel(st) {
  return { online: 'В сети', idle: 'Не активен', dnd: 'Не беспокоить', invisible: 'Невидимка', offline: 'Не в сети' }[st] || 'Не в сети'
}
