import React, { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { getState, setState, setUI, upsertGuild, ensureDMChannel, displayName } from '../lib/store.js'
import { api } from '../lib/api.js'
import { wsSend } from '../lib/ws.js'
import { useStore } from '../lib/util.js'
import { Modal, Avatar, confirmDialog, openMenu, lastPointer, Tooltip } from './Common.jsx'
import { UserBadges, BadgeEditorModal, myModPerms } from './Badges.jsx'
import { IconX, IconCopy, IconCheck, IconUserAdd, IconMessage, IconGear, IconMore, IconUsers, IconCrown, IconShield, IconBadge, IconChevronDown } from './Icons.jsx'
import { EMOJI_GROUPS } from './EmojiPicker.jsx'
import { avatarColor } from '../lib/util.js'

export default function Modals() {
  const s = useStore()
  const m = s.ui.modal
  if (!m) return null
  const close = () => setUI({ modal: null })
  switch (m.type) {
    case 'create-guild': return <CreateGuildModal onClose={close} />
    case 'join-guild': return <JoinGuildModal onClose={close} />
    case 'invite': return <InviteModal guildId={m.guildId} onClose={close} />
    case 'create-channel': return <ChannelModal guildId={m.guildId} type0={m.channelType || 'text'} onClose={close} />
    case 'edit-channel': return <ChannelModal channelId={m.channelId} onClose={close} />
    case 'profile': return <ProfileModal userId={m.userId} abovePanel={m.abovePanel} onClose={close} />
    case 'badge-editor': return <BadgeEditorModal userId={m.userId} onClose={close} />
    case 'quick-reaction': return <QuickReactionModal messageId={m.messageId} channelId={m.channelId} onClose={close} />
    case 'confirm': return <ConfirmModal {...m} onClose={close} />
    default: return null
  }
}

function ConfirmModal({ title, body, danger, okLabel, onOk, onClose }) {
  return (
    <Modal onClose={onClose} width={380} compact>
      <h2>{title}</h2>
      {body && <p className="m-sub">{body}</p>}
      <div className="modal-footer">
        <button className="btn ghost" onClick={onClose}>Отмена</button>
        <button className={`btn ${danger ? 'red' : 'primary'}`} onClick={onOk}>{okLabel}</button>
      </div>
    </Modal>
  )
}

function CreateGuildModal({ onClose }) {
  const [name, setName] = useState('')
  const [err, setErr] = useState('')
  const create = async () => {
    try {
      const r = await api('/guilds', { body: { name } })
      const g = r.guild
      upsertGuild(g) 
      const firstText = g.channels.find(c => c.type === 'text')
      setUI({ modal: null, guildId: g.id, channelId: firstText ? firstText.id : null })
    } catch (e) { setErr(e.message) }
  }
  return (
    <Modal onClose={onClose}>
      <h2>Создать свой сервер</h2>
      <p className="m-sub">Сервер — это место, где вы с друзьями сможете проводить время вместе.</p>
      <div className="field-label">Название сервера</div>
      <input className="field-input" placeholder="Идеальный сервер" value={name} onChange={e => setName(e.target.value)} autoFocus onKeyDown={e => e.key === 'Enter' && name.trim().length >= 2 && create()} />
      {err && <div className="auth-error">{err}</div>}
      <div className="modal-footer">
        <button className="btn ghost" onClick={onClose}>Отмена</button>
        <button className="btn green" disabled={name.trim().length < 2} onClick={create}>Создать сервер</button>
      </div>
    </Modal>
  )
}

function JoinGuildModal({ onClose }) {
  const [code, setCode] = useState('')
  const [err, setErr] = useState('')
  const join = async () => {
    try {
      const r = await api('/guilds/join', { body: { code } })
      const g = r.guild
      upsertGuild(g)
      setUI({ modal: null, guildId: g.id, channelId: g.channels.find(c => c.type === 'text')?.id || null })
    } catch (e) { setErr(e.message) }
  }
  return (
    <Modal onClose={onClose}>
      <h2>Присоединиться к серверу</h2>
      <p className="m-sub">Введите код приглашения, чтобы присоединиться к серверу.</p>
      <input className="field-input" placeholder="Введите код приглашения" value={code} onChange={e => setCode(e.target.value)} autoFocus onKeyDown={e => e.key === 'Enter' && code.trim() && join()} />
      {err && <div className="auth-error">{err}</div>}
      <div className="modal-footer">
        <button className="btn ghost" onClick={onClose}>Отмена</button>
        <button className="btn primary" disabled={!code.trim()} onClick={join}>Присоединиться</button>
      </div>
    </Modal>
  )
}

function InviteModal({ guildId, onClose }) {
  const s = useStore()
  const g = s.guilds.find(x => x.id === guildId)
  const [copied, setCopied] = useState(false)
  if (!g) return null
  const code = g.invite_code
  const copy = () => {
    navigator.clipboard?.writeText(code).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <Modal onClose={onClose}>
      <h2>Пригласить друзей на {g.name}</h2>
      <p className="m-sub">Поделись кодом ниже — друзья смогут присоединиться по «Присоединиться к серверу».</p>
      <div className="invite-box">
        <code>{code}</code>
        <button className="btn primary" onClick={copy}>{copied ? <IconCheck size={18} /> : <IconCopy size={18} />}</button>
      </div>
      <div className="modal-footer">
        <button className="btn ghost" onClick={onClose}>Готово</button>
      </div>
    </Modal>
  )
}

function ChannelModal({ guildId, channelId, type0 = 'text', onClose }) {
  const s = useStore()
  const existing = channelId ? findChannel(s, channelId) : null
  const [name, setName] = useState(existing?.name || '')
  const [topic, setTopic] = useState(existing?.topic || '')
  const [type, setType] = useState(existing?.type || type0)
  const [err, setErr] = useState('')
  const gid = guildId || existing?.guild_id
  const save = async () => {
    try {
      if (existing) await api(`/channels/${existing.id}`, { method: 'PATCH', body: { name, topic } })
      else await api(`/guilds/${gid}/channels`, { body: { name, type } })
      onClose()
    } catch (e) { setErr(e.message) }
  }
  return (
    <Modal onClose={onClose}>
      <h2>{existing ? 'Изменить канал' : 'Создать канал'}</h2>
      {!existing && (
        <div style={{ display: 'flex', gap: 8, margin: '16px 0' }}>
          <button className={`btn ${type === 'text' ? 'primary' : 'ghost'}`} onClick={() => setType('text')}># Текстовый</button>
          <button className={`btn ${type === 'voice' ? 'primary' : 'ghost'}`} onClick={() => setType('voice')}>🔊 Голосовой</button>
        </div>
      )}
      <div className="field-label">Название канала</div>
      <input className="field-input" placeholder={type === 'voice' ? 'новый-канал' : 'новая-тема'} value={name} onChange={e => setName(e.target.value)} autoFocus />
      {type === 'text' && <>
        <div className="field-label">Тема (необязательно)</div>
        <input className="field-input" placeholder="О чём этот канал?" value={topic} onChange={e => setTopic(e.target.value)} />
      </>}
      {err && <div className="auth-error">{err}</div>}
      <div className="modal-footer">
        <button className="btn ghost" onClick={onClose}>Отмена</button>
        <button className="btn primary" disabled={!name.trim()} onClick={save}>{existing ? 'Сохранить' : 'Создать канал'}</button>
      </div>
    </Modal>
  )
}
function findChannel(s, id) {
  for (const g of s.guilds) { const c = g.channels.find(c => c.id === id); if (c) return c }
  return null
}

function QuickReactionModal({ messageId, onClose }) {
  const pick = async emoji => {
    await api(`/messages/${messageId}/reactions`, { body: { emoji } }).catch(() => {})
    onClose()
  }
  useEffect(() => {
    const h = e => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [onClose])
  return createPortal(
    <div className="ep-sheet-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="ep-sheet">
        <div className="ep-sheet-grip" />
        <div className="ep-sheet-title">Добавить реакцию</div>
        <div className="ep-scroll thin-scroll">
          {EMOJI_GROUPS.map(([name, list]) => (
            <div key={name}>
              <div className="ep-header">{name}</div>
              <div className="emoji-grid">
                {list.map((e, i) => <button key={i} onClick={() => pick(e)}>{e}</button>)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>, document.body)
}

function ProfileModal({ userId, abovePanel = false, onClose }) {
  const s = useStore()
  const [prof, setProf] = useState(null)
  const [note, setNote] = useState('')
  const [err, setErr] = useState('')
  
  
  const [anchor] = useState(() => lastPointer())
  const load = () => api(`/users/${userId}`).then(r => { setProf(r); setNote(r.note || '') }).catch(e => setErr(e.message))
  useEffect(() => { load() }, [userId])
  const user = s.users[userId] || prof?.user
  if (!user) return null
  const isMe = userId === s.me.id
  const act = async fn => { try { await fn(); load() } catch (e) { setErr(e.message) } }
  const dn = displayName(user)
  const pres = prof?.presence || s.presences[userId] || 'offline'
  const presText = { online: 'В сети', idle: 'Не активен', dnd: 'Не беспокоить', invisible: 'Не в сети', offline: 'Не в сети' }[pres]
  const presColor = { online: 'var(--online)', idle: 'var(--idle)', dnd: 'var(--dnd)', invisible: 'var(--offline)', offline: 'var(--offline)' }[pres]
  const roleLabel = r => r === 'owner' ? 'Владелец' : r === 'admin' ? 'Администратор' : 'Участник'
  const fmtD = ts => ts ? new Date(ts).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }) : ''
  
  const perms = myModPerms(s.me)
  const canMod = !isMe && !user.is_admin && (perms.has('suspend') || perms.has('ban'))
  const restricted = !!(user.banned || user.suspended_until)
  const changeStatus = async status => {
    try {
      await api('/me', { method: 'PATCH', body: { status } })
      const st = getState()
      setState({ me: { ...st.me, status }, users: { ...st.users, [st.me.id]: { ...(st.users[st.me.id] || st.me), status } }, presences: { ...st.presences, [st.me.id]: status } })
      wsSend('presence', { status })
    } catch {}
  }

  const openDM = async id => {
    try {
      const r = await api('/dm', { body: { user_id: id } })
      ensureDMChannel(r.channel)
      setUI({ modal: null, guildId: '@home', channelId: r.channel.id })
    } catch (e) { setErr(e.message) }
  }

  const badge = prof && !isMe
    ? (prof.mutual_guilds.some(g => g.their_role === 'owner')
        ? <span className="role-badge"><IconCrown size={18} style={{ color: '#f0b232' }} /></span>
        : prof.mutual_guilds.some(g => g.their_role === 'admin')
          ? <span className="role-badge"><IconShield size={16} style={{ color: '#8790d8' }} /></span>
          : null)
    : null

  const reqId = rel => (rel === 'incoming' ? getState().incoming : getState().outgoing).find(r => r.user.id === userId)?.id
  const moreMenu = e => openMenu(e, [
    ...(prof?.relationship === 'friend' ? [{ label: 'Удалить из друзей', danger: true, onClick: () => confirmDialog({ title: `Удалить ${user.username} из друзей?`, okLabel: 'Удалить', onOk: () => act(() => api(`/friends/${userId}`, { method: 'DELETE' })) }) }] : []),
    ...(prof?.relationship === 'incoming' ? [
      { label: 'Принять заявку', icon: <IconCheck size={16} />, onClick: () => (async () => {
        try {
          await api(`/friends/requests/${reqId('incoming')}/accept`, { method: 'POST' })
          
          const dm = await api('/dm', { body: { user_id: userId } })
          ensureDMChannel(dm.channel)
          load()
        } catch (e) { setErr(e.message) }
      })() },
      { sep: true },
      { label: 'Отклонить заявку', danger: true, onClick: () => act(() => api(`/friends/requests/${reqId('incoming')}`, { method: 'DELETE' })) },
    ] : []),
    ...(prof?.relationship === 'outgoing' ? [{ label: 'Отменить заявку', onClick: () => act(() => api(`/friends/requests/${reqId('outgoing')}`, { method: 'DELETE' })) }] : []),
    ...(!isMe && ['none'].includes(prof?.relationship) ? [{ label: 'Добавить в друзья', icon: <IconUserAdd size={16} />, onClick: () => act(() => api('/friends/request', { body: { username: user.username } })) }] : []),
    ...(canMod ? [
      { sep: true },
      { label: 'Приостановить на 1 час', onClick: () => act(() => api(`/mod/users/${userId}/suspend`, { method: 'POST', body: { hours: 1 } })) },
      { label: 'Приостановить на 24 часа', onClick: () => confirmDialog({ title: `Приостановить @${user.username}?`, body: 'Пользователь не сможет пользоваться аккаунтом сутки.', okLabel: 'Приостановить', onOk: () => act(() => api(`/mod/users/${userId}/suspend`, { method: 'POST', body: { hours: 24 } })) }) },
      { label: 'Приостановить на 7 дней', onClick: () => confirmDialog({ title: `Приостановить @${user.username}?`, body: 'Пользователь не сможет пользоваться аккаунтом неделю.', okLabel: 'Приостановить', onOk: () => act(() => api(`/mod/users/${userId}/suspend`, { method: 'POST', body: { hours: 168 } })) }) },
      ...(perms.has('ban') ? [{ label: 'Заблокировать аккаунт', danger: true, onClick: () => confirmDialog({ title: `Заблокировать @${user.username}?`, body: 'Полная блокировка учётной записи.', okLabel: 'Заблокировать', onOk: () => act(() => api(`/mod/users/${userId}/ban`, { method: 'POST' })) }) }] : []),
      ...(restricted ? [{ label: 'Снять ограничения', onClick: () => act(() => api(`/mod/users/${userId}/pardon`, { method: 'POST' })) }] : []),
    ] : []),
  ])

  
  
  const W = 320
  const panelEl = abovePanel ? document.querySelector('.user-panel-wrap') : null
  const pr = panelEl?.getBoundingClientRect()
  const left = pr
    ? Math.max(12, Math.min(pr.left + 8, window.innerWidth - W - 12))
    : Math.max(12, Math.min(anchor.x + 12, window.innerWidth - W - 12))
  const style = pr
    ? { left, bottom: Math.max(12, window.innerHeight - pr.top + 8) }
    : { left, top: Math.max(12, Math.min(anchor.y - 60, window.innerHeight - 560)) }

  const banner = user.banner_color
    ? `linear-gradient(135deg, ${user.banner_color}, ${shade(user.banner_color)})`
    : `linear-gradient(135deg, ${avatarColor(user.id)}, ${shade(avatarColor(user.id))})`

  return createPortal(
    <>
      <div className="pp-out-backdrop" onMouseDown={onClose} />
      <div className="pp-pop" style={style}>
        <button className="pp-close" onClick={onClose}><IconX size={16} /></button>
        <div className="pp-body thin-scroll">
          <div className="pp-banner" style={{ background: banner }} />
          <div className="pp-pad">
          <div className="pp-avatar"><Avatar user={user} size={72} showStatus /></div>
          <div className="pp-name">{dn}{badge}</div>
          {user.badges?.length > 0 && <UserBadges ids={user.badges} size={18} className="pp-badges" />}
          <div className="pp-user">@{user.username}{user.pronouns ? ` · ${user.pronouns}` : ''}</div>
          {isMe ? (
            <button className="pp-pres pp-pres-btn" onClick={e => openMenu(e, [
              { label: 'В сети', icon: <span className="st-dot online" />, onClick: () => changeStatus('online') },
              { label: 'Не активен', icon: <span className="st-dot idle" />, onClick: () => changeStatus('idle') },
              { label: 'Не беспокоить', icon: <span className="st-dot dnd" />, onClick: () => changeStatus('dnd') },
              { label: 'Невидимка', icon: <span className="st-dot offline" />, onClick: () => changeStatus('invisible') },
            ])}>
              <span style={{ background: presColor }} />{presText}
              <IconChevronDown size={12} style={{ marginLeft: 2, opacity: .6 }} />
            </button>
          ) : (
            <div className="pp-pres"><span style={{ width: 8, height: 8, borderRadius: '50%', background: presColor, display: 'inline-block', flexShrink: 0 }} />{presText}{prof?.voice_channel ? ' · в голосовом канале' : ''}</div>
          )}
          {restricted && (canMod || isMe) && <div className="pp-restricted">{user.banned ? 'Учётная запись заблокирована' : `Приостановлена до ${new Date(user.suspended_until).toLocaleString('ru-RU')}`}</div>}
          <div className="pp-divider" />
          {user.bio && (
            <div className="pp-block">
              <h4>Обо мне</h4>
              <div className="pp-bio">{user.bio}</div>
            </div>
          )}
          {prof?.friend_since && <div className="pp-meta"><IconCheck size={15} />Друзья с {fmtD(prof.friend_since)}</div>}
          {user.created_at && <div className="pp-meta"><IconUsers size={15} />В Discord с {fmtD(user.created_at)}</div>}
          {prof && !isMe && prof.mutual_guilds.length > 0 && (
            <div className="pp-block">
              <h4>Общие серверы — {prof.mutual_guilds.length}</h4>
              <div className="pp-roles">
                {prof.mutual_guilds.slice(0, 8).map(g => (
                  <span key={g.id} className="pp-role-chip" style={{ cursor: 'pointer' }}
                    onClick={() => {
                      const guild = s.guilds.find(x => x.id === g.id)
                      setUI({ modal: null, guildId: g.id, channelId: guild?.channels.find(c => c.type === 'text')?.id || null })
                    }}>
                    <span style={{ background: g.icon_color || 'var(--brand)' }} />{g.name} · {roleLabel(g.their_role)}
                  </span>
                ))}
              </div>
            </div>
          )}
          {prof && !isMe && prof.mutual_friends.length > 0 && (
            <div className="pp-block">
              <h4>Общие друзья — {prof.mutual_friends.length}</h4>
              <div className="pp-mutual">
                {prof.mutual_friends.slice(0, 10).map(f => (
                  <Tooltip key={f.id} tip={displayName(f)} side="bottom">
                    <Avatar user={f} size={34} showStatus onClick={() => setUI({ modal: { type: 'profile', userId: f.id } })} />
                  </Tooltip>
                ))}
              </div>
            </div>
          )}
          {!isMe && (
            <div className="pp-block">
              <h4>Заметка @{user.username}</h4>
              <input className="pp-note" placeholder="Добавить личную заметку" value={note}
                onChange={e => setNote(e.target.value)}
                onBlur={() => note !== (prof?.note || '') && act(() => api(`/users/${userId}/note`, { method: 'PUT', body: { note } }))} />
            </div>
          )}
          <div className="pp-divider" />
          <div className="pp-actions">
            {isMe ? (
              <>
                <button className="btn primary" style={{ flex: 1 }} onClick={() => setUI({ modal: null, settingsOpen: true, settingsTab: 'profile' })}>
                  <IconGear size={15} style={{ verticalAlign: -2 }} /> Редактировать профиль
                </button>
                {s.me.is_admin && (
                  <button className="pp-icon-btn" title="Выдать себе бейджи (админ)" onClick={() => setUI({ modal: { type: 'badge-editor', userId } })}>
                    <IconBadge size={18} style={{ color: 'var(--yellow)' }} />
                  </button>
                )}
              </>
            ) : (
              <>
                <button className="btn primary" style={{ flex: 1 }} onClick={() => openDM(userId)}>
                  <IconMessage size={15} style={{ verticalAlign: -2 }} /> Сообщение
                </button>
                {prof?.relationship === 'friend'
                  ? <button className="pp-icon-btn" title="Вы друзья" disabled><IconCheck size={18} /></button>
                  : <button className="pp-icon-btn" title="Добавить в друзья" onClick={() => act(() => api('/friends/request', { body: { username: user.username } }))}><IconUserAdd size={18} /></button>}
                {s.me.is_admin && (
                  <button className="pp-icon-btn" title="Выдать бейджи (админ)" onClick={() => setUI({ modal: { type: 'badge-editor', userId } })}>
                    <IconBadge size={18} style={{ color: 'var(--yellow)' }} />
                  </button>
                )}
                <button className="pp-icon-btn" title="Ещё" onClick={moreMenu}><IconMore size={18} /></button>
              </>
            )}
          </div>
          {err && <div className="auth-error" style={{ marginTop: 10 }}>{err}</div>}
          </div>
        </div>
      </div>
    </>, document.body)
}

function shade(hex) {
  
  try {
    const h = hex.replace('#', '')
    const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h.slice(0, 6)
    const n = parseInt(full, 16)
    const r = Math.max(0, (n >> 16) - 40), g = Math.max(0, ((n >> 8) & 0xff) - 40), b = Math.max(0, (n & 0xff) - 40)
    return `rgb(${r},${g},${b})`
  } catch { return '#1e1f22' }
}
