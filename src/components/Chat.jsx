import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { getState, setUI, setState, myVoiceChannel, channelById, dmOtherUser, setMessages, prependMessages, upsertMessage, displayName, ensureDMChannel } from '../lib/store.js'
import { api } from '../lib/api.js'
import { useStore, avatarColor } from '../lib/util.js'
import { wsSend } from '../lib/ws.js'
import { voice } from '../lib/voice.js'
import { Avatar, Tooltip, openMenu, confirmDialog } from './Common.jsx'
import { UserBadges } from './Badges.jsx'
import { chatBadges } from '../../shared/badges.js'
import { IconHash, IconSpeaker, IconPeople, IconSearch, IconPhone, IconPhoneOff, IconPlus, IconSmile, IconReply, IconPencil, IconTrash, IconMore, IconX, IconFile, IconDownload, IconPin, IconMic, IconMicOff, IconHeadphones, IconHeadphoneOff, IconCrown, IconShield, IconMonitor, IconUser } from './Icons.jsx'
import EmojiPicker from './EmojiPicker.jsx'
import { fmtTime, fmtDay, escapeReg, fmtBytes } from '../lib/util.js'

const QUICK_EMOJIS = ['👍', '❤️', '😂', '😮']

export default function Chat() {
  const s = useStore()
  const ch = channelById(s.ui.channelId)
  const chId = ch?.id
  const markRead = useCallback(() => {
    if (!chId) return
    api(`/channels/${chId}/read`, { method: 'POST' }).catch(() => {})
    const st = getState()
    setState({
      reads: { ...st.reads, [chId]: Date.now() },
      dms: st.dms.map(c => c.id === chId ? { ...c, unread: 0 } : c),
      guilds: st.guilds.map(g => ({ ...g, channels: g.channels.map(c => c.id === chId ? { ...c, unread: 0 } : c) })),
    })
  }, [chId])

  useEffect(() => { markRead() }, [chId])

  if (!ch) return null
  const isDM = ch.type === 'dm'
  const other = isDM ? dmOtherUser(ch) : null
  const guild = ch._guild
  const inVoice = myVoiceChannel() === ch.id

  return (
    <section className="chat">
      <header className="chat-header">
        {isDM
          ? <>
              <Avatar user={other} size={24} showStatus onClick={() => other && setUI({ modal: { type: 'profile', userId: other.id } })} />
              <span style={{ cursor: 'pointer' }} onClick={() => other && setUI({ modal: { type: 'profile', userId: other.id } })}>{displayName(other)}</span>
            </>
          : <>
              {ch.type === 'voice' ? <IconSpeaker size={22} style={{ color: 'var(--text-faint)' }} /> : <IconHash size={22} style={{ color: 'var(--text-faint)' }} />}
              <span>{ch.name}</span>
              {ch.topic && <span className="topic">{ch.topic}</span>}
            </>}
        <span className="spacer" />
        <SearchBox channelId={ch.id} />
        {isDM && <Tooltip tip={inVoice ? 'Отключиться от звонка' : 'Начать голосовой звонок'} side="bottom">
          <button className={`icon-btn ${inVoice ? 'active' : ''}`} style={inVoice ? { color: 'var(--green)' } : {}}
            onClick={() => {
              if (inVoice) { voice.leave(); return }
              voice.join(ch.id).then(ok => { if (ok) wsSend('call:ring', { channel_id: ch.id }) })
            }}>
            {inVoice ? <IconPhoneOff size={22} /> : <IconPhone size={22} />}
          </button>
        </Tooltip>}
        {!isDM && <Tooltip tip={s.ui.showMembers ? 'Скрыть список участников' : 'Показать список участников'} side="bottom">
          <button className={`icon-btn ${s.ui.showMembers ? 'active' : ''}`} onClick={() => setUI({ showMembers: !s.ui.showMembers })}>
            <IconPeople size={22} />
          </button>
        </Tooltip>}
      </header>
      <div className="chat-body">
        <div className="chat-main">
          {isDM && inVoice && <CallBar ch={ch} other={other} />}
          <MessageList ch={ch} />
          <Composer ch={ch} />
        </div>
        {!isDM && s.ui.showMembers && <Members guild={guild} />}
        {isDM && other && <DmProfile other={other} channelId={ch.id} />}
      </div>
    </section>
  )
}


function DmProfile({ other, channelId }) {
  const s = useStore()
  
  const pres = s.presences[other.id] || 'offline'
  const presText = { online: 'В сети', idle: 'Не активен', dnd: 'Не беспокоить', invisible: 'Не в сети', offline: 'Не в сети' }[pres]
  const presColor = { online: 'var(--online)', idle: 'var(--idle)', dnd: 'var(--dnd)', invisible: 'var(--offline)', offline: 'var(--offline)' }[pres]
  const mutual = s.guilds.filter(g => (g.members || []).some(m => m.user_id === other.id))
  return (
    <aside className="dm-profile thin-scroll">
      <div className="dmp-banner" style={{ background: `linear-gradient(135deg, ${other.banner_color || avatarColor(other.id)}, ${(other.banner_color || avatarColor(other.id)).slice(0, 7)}cc)` }} />
      <div className="dmp-body">
        <div className="dmp-avatar"><Avatar user={other} size={76} showStatus /></div>
        <div className="dmp-name">{displayName(other)}</div>
        {other.badges?.length > 0 && <UserBadges ids={other.badges} size={18} className="dmp-badges" />}
        <div className="dmp-handle">@{other.username}{other.pronouns ? ` · ${other.pronouns}` : ''}</div>
        <div className="dmp-pres"><span style={{ background: presColor }} />{presText}</div>
        <div className="dmp-block">
          <h4>Общие серверы — {mutual.length}</h4>
          {mutual.length
            ? <div className="dmp-servers">{mutual.map(g => (
              <span key={g.id} className="pp-role-chip" style={{ cursor: 'pointer' }}
                onClick={() => setUI({ modal: null, guildId: g.id, channelId: g.channels.find(c => c.type === 'text')?.id || null })}>
                <span style={{ background: g.icon_color || 'var(--brand)' }} />{g.name}
              </span>
            ))}</div>
            : <div className="dmp-value muted">Общих серверов нет</div>}
        </div>
        {other.created_at && (
          <div className="dmp-block">
            <h4>В Discord с</h4>
            <div className="dmp-value">{new Date(other.created_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
          </div>
        )}
      </div>
    </aside>
  )
}


function CallBar({ ch, other }) {
  const s = useStore()
  const me = s.users[s.me.id] || s.me
  const [elapsed, setElapsed] = useState('0:00')
  useEffect(() => {
    const t = setInterval(() => { if (voice.connectedAt) setElapsed(cvDur(Date.now() - voice.connectedAt)) }, 1000)
    return () => clearInterval(t)
  }, [])
  const micMuted = s.voiceLocal.muted
  const deaf = s.voiceLocal.deafened
  const share = s.screenShare
  const otherIn = !!(other && (s.voice[ch.id] || []).some(m => m.user_id === other.id))
  const shareUser = share ? (share.mine ? me : s.users[share.userId]) : null

  return (
    <div className="callcard-wrap">
      <div className="callcard">
        <div className="cc-avatars">
          <Avatar user={me} size={56} speaking={!!s.speaking[me.id]} />
          {other && <Avatar user={other} size={56} speaking={!!s.speaking[other.id]} />}
        </div>
        <div className="cc-info">
          <div className="cc-title" style={{ cursor: 'pointer' }} onClick={() => other && setUI({ modal: { type: 'profile', userId: other.id } })}>{other ? displayName(other) : 'Звонок'}</div>
          <div className={`cc-sub ${otherIn ? '' : 'ringing'}`}>
            {otherIn
              ? <>Голосовой звонок · <span className="cc-timer">{elapsed}</span></>
              : <>Звоним<span className="cc-dots"><i /><i /><i /></span></>}
          </div>
        </div>
        <div className="cc-btns">
          <Tooltip tip={deaf ? 'Включить звук' : 'Выключить звук'} side="bottom">
            <button className={`cc-btn ${deaf ? 'off' : ''}`} onClick={() => voice.setDeafened(!deaf)}>
              {deaf ? <IconHeadphoneOff size={19} /> : <IconHeadphones size={19} />}
            </button>
          </Tooltip>
          <Tooltip tip={micMuted ? 'Включить микрофон' : 'Выключить микрофон'} side="bottom">
            <button className={`cc-btn ${micMuted ? 'off' : ''}`} onClick={() => voice.setMuted(!micMuted)}>
              {micMuted ? <IconMicOff size={19} /> : <IconMic size={19} />}
            </button>
          </Tooltip>
          <Tooltip tip={share?.mine ? 'Остановить демонстрацию' : 'Демонстрация экрана'} side="bottom">
            <button className={`cc-btn ${share?.mine ? 'active' : ''}`} onClick={() => (share?.mine ? voice.stopScreenShare() : voice.shareScreen())}>
              <IconMonitor size={19} />
            </button>
          </Tooltip>
          <Tooltip tip="Отключиться" side="bottom">
            <button className="cc-btn end" onClick={() => voice.leave()}><IconPhoneOff size={19} /></button>
          </Tooltip>
        </div>
      </div>
      {share && (
        <div className="share-strip">
          <div className="share-head">
            <span>{share.mine ? 'Вы демонстрируете экран' : `${displayName(shareUser)} демонстрирует экран`}</span>
            {share.mine && <button className="icon-btn" title="Остановить демонстрацию" onClick={() => voice.stopScreenShare()}><IconX size={14} /></button>}
          </div>
          <ShareVideo stream={share.stream} muted={!!share.mine} />
        </div>
      )}
    </div>
  )
}

function ShareVideo({ stream, muted }) {
  const ref = useRef(null)
  useEffect(() => { if (ref.current) ref.current.srcObject = stream }, [stream])
  return <video ref={ref} autoPlay playsInline muted={muted} className="share-video" />
}

function cvDur(ms) {
  const sec = Math.floor(ms / 1000)
  const m = Math.floor(sec / 60), h = Math.floor(m / 60)
  const pad = x => String(x).padStart(2, '0')
  return h ? `${h}:${pad(m % 60)}:${pad(sec % 60)}` : `${m}:${pad(sec % 60)}`
}


function MessageList({ ch }) {
  const s = useStore()
  const data = s.messages[ch.id]
  const boxRef = useRef(null)
  const bottomRef = useRef(true)
  const [loading, setLoading] = useState(false)
  const [jump, setJump] = useState(false)

  useEffect(() => {
    if (!data?.loaded) {
      setLoading(true)
      api(`/channels/${ch.id}/messages?limit=50`)
        .then(r => setMessages(ch.id, r.messages, r.has_more))
        .catch(() => {})
        .finally(() => setLoading(false))
    }
    bottomRef.current = true
  }, [ch.id])

  useEffect(() => {
    const el = boxRef.current
    if (el && bottomRef.current) el.scrollTop = el.scrollHeight
  }, [data?.list.length, ch.id])

  const onScroll = async () => {
    const el = boxRef.current
    if (!el) return
    bottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120
    setJump(!bottomRef.current && (data?.list.length || 0) > 0)
    if (el.scrollTop < 60 && data?.has_more && !loading) {
      setLoading(true)
      const first = data.list[0]
      try {
        const r = await api(`/channels/${ch.id}/messages?limit=50&before=${first.created_at}`)
        const prevH = el.scrollHeight
        prependMessages(ch.id, r.messages.filter(m => !data.list.some(x => x.id === m.id)), r.has_more)
        requestAnimationFrame(() => { el.scrollTop = el.scrollHeight - prevH })
      } finally { setLoading(false) }
    }
  }

  const list = data?.list || []
  const me = s.me
  const myNames = useMemo(() => {
    const names = new Set()
    for (const u of Object.values(s.users)) if (u?.username) names.add(u.username)
    return names
  }, [s.users])

  return (
    <div className="messages" ref={boxRef} onScroll={onScroll} style={{ position: 'relative' }}>
      {loading && !list.length && <div style={{ padding: 20 }}><div className="spinner" /></div>}
      {!loading && !list.length && <ChannelWelcome ch={ch} />}
      {list.map((m, i) => {
        const prev = list[i - 1]
        const grouped = prev && prev.author_id === m.author_id && m.created_at - prev.created_at < 5 * 60e3 && !m.reply_to && !prev.reply_to
        const showDate = !prev || new Date(prev.created_at).toDateString() !== new Date(m.created_at).toDateString()
        
        if ((m.content || '').startsWith('[SYS]')) {
          return (
            <React.Fragment key={m.id}>
              {showDate && <div className="date-divider">{fmtDay(m.created_at)}</div>}
              <div className="msg sys-row">
                <span className="sys-icon"><IconPhone size={14} /></span>
                <span className="sys-text"><Rich content={m.content.slice(5)} mentionNames={myNames} me={me} /></span>
                <span className="sys-ts">{fmtTime(m.created_at)}</span>
              </div>
            </React.Fragment>
          )
        }
        return (
          <React.Fragment key={m.id}>
            {showDate && <div className="date-divider">{fmtDay(m.created_at)}</div>}
            <Message m={m} ch={ch} grouped={!!grouped} me={me} mentionNames={myNames}
              prev={prev} />
          </React.Fragment>
        )
      })}
      {jump && (
        <button className="btn white" style={{ position: 'sticky', bottom: 8, alignSelf: 'center', borderRadius: 20, boxShadow: '0 2px 10px rgba(0,0,0,.3)' }}
          onClick={() => { const el = boxRef.current; el.scrollTop = el.scrollHeight; bottomRef.current = true }}>
          ⬇ К последним сообщениям
        </button>
      )}
    </div>
  )
}

function ChannelWelcome({ ch }) {
  const s = useStore()
  if (ch.type === 'dm') {
    const other = dmOtherUser(ch)
    return (
      <div className="welcome">
        <Avatar user={other} size={68} />
        <h1>Начало беседы</h1>
        <p>Это самое начало вашей беседы с <b style={{ color: 'var(--text-header)' }}>{other?.username}</b>.</p>
      </div>
    )
  }
  return (
    <div className="welcome">
      <div style={{ width: 68, height: 68, borderRadius: '50%', background: 'var(--bg-active)', display: 'grid', placeItems: 'center', color: 'var(--text-header)' }}>
        <IconHash size={36} />
      </div>
      <h1>Добро пожаловать на #{ch.name}!</h1>
      <p>Это начало канала <b style={{ color: 'var(--text-header)' }}>#{ch.name}</b>.</p>
    </div>
  )
}


function Message({ m, ch, grouped, me, mentionNames }) {
  const s = useStore()
  const author = s.users[m.author_id] || { id: m.author_id, username: '???' }
  const isMine = m.author_id === me.id
  const [editing, setEditing] = useState(false)
  const [editText, setEditText] = useState(m.content)
  const replyMsg = m.reply_to ? (s.messages[ch.id]?.list.find(x => x.id === m.reply_to)) : null
  const replyAuthor = replyMsg ? s.users[replyMsg.author_id] : null
  const mentionsMe = (m.content && new RegExp(`@(${escapeReg(me.username)})(?![\\p{L}\\p{N}_.\\-])`, 'iu').test(m.content)) || /@everyone|@here/i.test(m.content || '')

  const authorRole = useMemo(() => {
    if (!ch._guild) return null
    if (ch._guild.owner_id === m.author_id) return 'owner'
    if (ch._guild.members.find(x => x.user_id === m.author_id)?.role === 'admin') return 'admin'
    return null
  }, [ch, m.author_id])
  const roleColor = authorRole === 'owner' ? '#f0b232' : authorRole === 'admin' ? '#5865f2' : null

  const saveEdit = async () => {
    setEditing(false)
    const text = editText.trim()
    if (text === m.content) return
    try { await api(`/messages/${m.id}`, { method: 'PATCH', body: { content: text } }) } catch (e) { alert(e.message) }
  }

  const menu = e => openMenu(e, [
    { label: 'Ответить', icon: <IconReply size={16} />, onClick: () => setUI({ replyTo: m }) },
    { label: 'Добавить реакцию', icon: <IconSmile size={16} />, onClick: () => setUI({ modal: { type: 'quick-reaction', messageId: m.id, channelId: ch.id } }) },
    ...(isMine ? [{ label: 'Изменить', icon: <IconPencil size={16} />, onClick: () => { setEditText(m.content); setEditing(true) } }] : []),
    { label: 'Копировать текст', onClick: () => navigator.clipboard?.writeText(m.content) },
    ...(isMine || ['owner', 'admin'].includes(ch._guild?.members.find(x => x.user_id === me.id)?.role)
      ? [{ sep: true }, { label: 'Удалить сообщение', danger: true, icon: <IconTrash size={16} />, onClick: () => confirmDialog({ title: 'Удалить сообщение?', body: 'Это действие необратимо.', okLabel: 'Удалить', onOk: () => api(`/messages/${m.id}`, { method: 'DELETE' }).catch(() => {}) }) }]
      : []),
  ])

  const groupedAuthor = author
  return (
    <div className={`msg ${grouped ? 'grouped' : ''} ${mentionsMe ? 'mention-me' : ''}`} onContextMenu={menu} data-id={m.id}>
      {!grouped && <div className="gutter"><Avatar user={groupedAuthor} size={40} onClick={() => setUI({ modal: { type: 'profile', userId: m.author_id } })} /></div>}
      {grouped && <div className="timestamp-hover">{fmtTime(m.created_at)}</div>}
      {m.reply_to && (
        <div className="reply-preview" style={{ marginLeft: 0 }} onClick={() => {
          const el = document.querySelector(`.msg[data-id="${m.reply_to}"]`)
          el?.scrollIntoView({ block: 'center' }); el?.animate([{ background: 'rgba(88,101,242,.3)' }, {}], { duration: 1200 })
        }}>
          <svg width="33" height="16" viewBox="0 0 33 16" style={{ position: 'absolute', left: -40, top: -2 }}><path stroke="rgba(255,255,255,.3)" fill="none" d="M20.5 16H21C9.5 16 9.5 8 9.5 8H1.5M1.5 8 6 3.5M1.5 8 6 12.5" strokeWidth="1.5" /></svg>
          <Avatar user={replyAuthor || { username: '?' }} size={16} onClick={e => { e.stopPropagation(); replyAuthor && setUI({ modal: { type: 'profile', userId: replyAuthor.id } }) }} />
          <span className="reply-author" style={{ color: replyAuthor?.id === m.author_id ? 'var(--text-normal)' : undefined, cursor: 'pointer' }}
            onClick={e => { e.stopPropagation(); replyAuthor && setUI({ modal: { type: 'profile', userId: replyAuthor.id } }) }}>{displayName(replyAuthor) }</span>
          <span className="reply-text">{(replyMsg?.content || 'Сообщение удалено').slice(0, 100)}</span>
        </div>
      )}
      {!grouped && (
        <div className="author-row">
          <span className="author" style={roleColor ? { color: roleColor } : {}} onClick={() => setUI({ modal: { type: 'profile', userId: m.author_id } })}>{displayName(author)}</span>
          {authorRole === 'owner' && <Tooltip tip="Владелец сервера" side="bottom"><span className="role-badge"><IconCrown size={16} style={{ color: '#f0b232' }} /></span></Tooltip>}
          {authorRole === 'admin' && <Tooltip tip="Администратор сервера" side="bottom"><span className="role-badge"><IconShield size={14} style={{ color: '#8790d8' }} /></span></Tooltip>}
          <UserBadges ids={chatBadges(author?.badges)} size={15} className="msg-badges" />
          <span className="msg-ts">{fmtTime(m.created_at)}</span>
        </div>
      )}
      {editing ? (
        <div>
          <textarea className="field-input" style={{ background: 'var(--bg-darkest)', minHeight: 44, resize: 'vertical' }} value={editText}
            onChange={e => setEditText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveEdit() } if (e.key === 'Escape') setEditing(false) }}
            autoFocus />
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>esc чтобы <span className="clickable" onClick={() => setEditing(false)}>отменить</span> · enter чтобы <span className="clickable" style={{ color: 'var(--text-link)' }} onClick={saveEdit}>сохранить</span></div>
        </div>
      ) : (
        <>
          {m.content && <div className="content"><Rich content={m.content} mentionNames={mentionNames} me={me} /></div>}
          {m.edited_at && <span className="edited">(изменено)</span>}
        </>
      )}
      {m.attachments?.map((a, i) => <Attachment key={i} a={a} />)}
      {m.reactions?.length > 0 && <Reactions m={m} ch={ch} me={me} />}
      <div className="msg-actions">
        {QUICK_EMOJIS.map(e => (
          <Tooltip key={e} tip={e} side="bottom">
            <button className="qa-emoji" onClick={() => api(`/messages/${m.id}/reactions`, { body: { emoji: e } }).catch(() => {})}>{e}</button>
          </Tooltip>
        ))}
        <Tooltip tip="Добавить реакцию" side="bottom">
          <button onClick={() => setUI({ modal: { type: 'quick-reaction', messageId: m.id, channelId: ch.id } })}><IconSmile size={18} /></button>
        </Tooltip>
        <Tooltip tip="Ответить" side="bottom">
          <button onClick={() => setUI({ replyTo: m })}><IconReply size={18} /></button>
        </Tooltip>
        <Tooltip tip="Ещё" side="bottom">
          <button onClick={e => menu(e)}><IconMore size={18} /></button>
        </Tooltip>
      </div>
    </div>
  )
}

function Attachment({ a }) {
  const s = useStore()
  const isImg = (a.type || '').startsWith('image/') || /\.(png|jpe?g|gif|webp|avif)$/i.test(a.name || '')
  if (isImg) return <div className="attachments"><img className="attach-img" src={a.url} alt={a.name} onClick={() => setUI({ lightbox: a.url })} /></div>
  return (
    <div className="attachments">
      <div className="attach-file">
        <IconFile size={24} style={{ color: 'var(--text-muted)' }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="fname"><a href={a.url} download={a.name}>{a.name}</a></div>
          <div className="fsize">{fmtBytes(a.size)}</div>
        </div>
        <a href={a.url} download={a.name} className="icon-btn" title="Скачать"><IconDownload size={20} /></a>
      </div>
    </div>
  )
}

function Reactions({ m, ch, me }) {
  const grouped = {}
  for (const r of m.reactions) {
    grouped[r.emoji] = grouped[r.emoji] || []
    grouped[r.emoji].push(r.user_id)
  }
  const toggle = emoji => api(`/messages/${m.id}/reactions`, { body: { emoji } }).catch(() => {})
  return (
    <div className="reactions">
      {Object.entries(grouped).map(([emoji, users]) => (
        <button key={emoji} className={`reaction ${users.includes(me.id) ? 'mine' : ''}`} onClick={() => toggle(emoji)}
          title={users.map(u => getState().users[u]?.username || '?').join(', ')}>
          <span>{emoji}</span><span className="count">{users.length}</span>
        </button>
      ))}
      <button className="reaction" style={{ padding: '2px 6px' }} onClick={() => setUI({ modal: { type: 'quick-reaction', messageId: m.id, channelId: ch.id } })}><IconSmile size={14} /></button>
    </div>
  )
}


export function Rich({ content, mentionNames, me }) {
  const parts = []
  
  const blocks = content.split(/```/)
  blocks.forEach((b, bi) => {
    if (bi % 2 === 1) {
      const nl = b.indexOf('\n')
      const code = nl > -1 && nl < 20 ? b.slice(nl + 1) : b
      parts.push(<pre className="codeblock" key={'b' + bi}>{code}</pre>)
      return
    }
    const tokens = b.split(/(\*\*[^*]+\*\*|\*[^*\n]+\*|__[^_]+__|~~[^~]+~~|`[^`\n]+`|https?:\/\/[^\s<]+|@[a-zA-Z0-9_.\u0410-\u042f\u0430-\u044fёЁ_-]+|@everyone|@here)/g)
    tokens.forEach((t, i) => {
      const k = bi + ':' + i
      if (!t) return
      if (t.startsWith('http')) parts.push(<a key={k} href={t} target="_blank" rel="noreferrer">{t}</a>)
      else if (t.startsWith('`')) parts.push(<code className="inline" key={k}>{t.slice(1, -1)}</code>)
      else if (t.startsWith('**')) parts.push(<b key={k}>{t.slice(2, -2)}</b>)
      else if (t.startsWith('__')) parts.push(<u key={k}>{t.slice(2, -2)}</u>)
      else if (t.startsWith('~~')) parts.push(<s key={k}>{t.slice(2, -2)}</s>)
      else if (t.startsWith('*')) parts.push(<i key={k}>{t.slice(1, -1)}</i>)
      else if (t.startsWith('@')) {
        const name = t.slice(1)
        const known = mentionNames.has(name) || name === 'everyone' || name === 'here'
        if (known) parts.push(<span key={k} className="mention" onClick={() => {
          const u = Object.values(getState().users).find(x => x.username === name)
          if (u) setUI({ modal: { type: 'profile', userId: u.id } })
        }}>{t}</span>)
        else parts.push(t)
      }
      else parts.push(t)
    })
  })
  return <>{parts}</>
}


function Composer({ ch }) {
  const s = useStore()
  const [text, setText] = useState('')
  const [files, setFiles] = useState([])
  const [emojiOpen, setEmojiOpen] = useState(false)
  const [mentionQuery, setMentionQuery] = useState(null)
  const [mentionIdx, setMentionIdx] = useState(0)
  const taRef = useRef(null)
  const fileRef = useRef(null)
  const lastTyping = useRef(0)
  const replyTo = s.ui.replyTo

  useEffect(() => { setText(''); setFiles([]); setUI({ replyTo: null }) }, [ch.id])

  const resize = () => {
    const el = taRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 200) + 'px'
  }

  const send = async () => {
    const content = text.trim()
    if (!content && !files.length) return
    const payload = { content, attachments: files.map(f => ({ name: f.name, type: f.type, size: f.size, url: f.url })), reply_to: replyTo?.id || null }
    setText(''); setFiles([]); resize(); setUI({ replyTo: null })
    try {
      const r = await api(`/channels/${ch.id}/messages`, { body: payload })
      
      const st = getState()
      if (!st.messages[ch.id]?.list.some(m => m.id === r.message.id)) upsertMessage(r.message)
    } catch (e) { alert(e.message); setText(content) }
  }

  const onKey = e => {
    if (mentionOpen) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setMentionIdx(i => (i + 1) % mentionUsers.length); return }
      if (e.key === 'ArrowUp') { e.preventDefault(); setMentionIdx(i => (i - 1 + mentionUsers.length) % mentionUsers.length); return }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); pickMention(mentionUsers[mentionIdx] || mentionUsers[0]); return }
      if (e.key === 'Escape') { setMentionQuery(null); return }
    }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
  }

  const onChange = e => {
    setText(e.target.value)
    resize()
    const now = Date.now()
    if (now - lastTyping.current > 5000) { lastTyping.current = now; wsSend('typing', { channel_id: ch.id }) }
    const m = /@([a-zA-Z0-9_.\u0410-\u042f\u0430-\u044fёЁ_-]*)$/.exec(e.target.value)
    setMentionQuery(m ? m[1].toLowerCase() : null)
    setMentionIdx(0)
  }

  const mentionUsers = useMemo(() => {
    if (mentionQuery === null) return []
    const st = getState()
    let pool = Object.values(st.users)
    if (ch._guild) {
      const ids = new Set(ch._guild.members.map(m => m.user_id))
      pool = pool.filter(u => ids.has(u.id))
    } else {
      pool = pool.filter(u => (ch.recipients || []).includes(u.id))
    }
    return pool.filter(u => u.id !== st.me.id && u.username.toLowerCase().startsWith(mentionQuery)).slice(0, 6)
  }, [mentionQuery, ch])
  const mentionOpen = mentionQuery !== null && mentionUsers.length > 0

  const pickMention = u => {
    setText(t => t.replace(/@([a-zA-Z0-9_.\u0410-\u042f\u0430-\u044fёЁ_-]*)$/, '@' + u.username + ' '))
    setMentionQuery(null)
    taRef.current?.focus()
  }

  
  const addFiles = arr => {
    for (const f of [...arr]) {
      if (!f || f.size > 2 * 1024 * 1024) { if (f) alert(`Файл ${f.name} больше 2 МБ`); continue }
      const reader = new FileReader()
      reader.onload = () => setFiles(fs => (fs.length >= 4 ? fs : [...fs, { name: f.name, type: f.type, size: f.size, url: reader.result }]))
      reader.readAsDataURL(f)
    }
  }
  const onFiles = e => { addFiles(e.target.files || []); e.target.value = '' }
  const onPaste = e => {
    const files = [...(e.clipboardData?.files || [])]
    if (files.length) { e.preventDefault(); addFiles(files) }
  }
  const dragDepth = useRef(0)
  const [dragOver, setDragOver] = useState(false)
  const onDragEnter = e => {
    if (!e.dataTransfer?.types?.includes('Files')) return
    e.preventDefault()
    dragDepth.current++
    setDragOver(true)
  }
  const onDragLeave = () => {
    dragDepth.current = Math.max(0, dragDepth.current - 1)
    if (!dragDepth.current) setDragOver(false)
  }
  const onDrop = e => {
    if (!e.dataTransfer?.files?.length) return
    e.preventDefault()
    dragDepth.current = 0
    setDragOver(false)
    addFiles(e.dataTransfer.files)
  }

  const typing = s.typing[ch.id]
  const typingUsers = typing ? Object.keys(typing).map(id => s.users[id]).filter(Boolean) : []

  return (
    <div className={`composer-wrap ${dragOver ? 'drag-over' : ''}`}
      onDragEnter={onDragEnter} onDragOver={e => e.preventDefault()} onDragLeave={onDragLeave} onDrop={onDrop}>
      {dragOver && <div className="drop-hint">Отпустите, чтобы вставить файлы</div>}
      <div className="typing-line">
        {typingUsers.length > 0 && (
          <>
            <span className="typing-dots"><span /><span /><span /></span>
            <span><b>{typingUsers.map(u => u.username).join(', ')}</b> {typingUsers.length === 1 ? 'печатает…' : 'печатают…'}</span>
          </>
        )}
      </div>
      {files.length > 0 && (
        <div className="pending-attachments">
          {files.map((f, i) => (
            <div className="pa" key={i}>
              {f.type.startsWith('image/') ? <img src={f.url} alt="" /> : <IconFile size={20} />}
              <span style={{ maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
              <button onClick={() => setFiles(fs => fs.filter((_, j) => j !== i))}><IconX size={14} /></button>
            </div>
          ))}
        </div>
      )}
      {replyTo && (
        <div className="reply-bar">
          <span>Ответ для</span><b>{getState().users[replyTo.author_id]?.username || '???'}</b>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{replyTo.content}</span>
          <button className="icon-btn" style={{ width: 18, height: 18 }} onClick={() => setUI({ replyTo: null })}><IconX size={14} /></button>
        </div>
      )}
      <div className={`composer ${replyTo ? 'with-reply' : ''}`} style={{ position: 'relative' }}>
        <label className="attach-btn" title="Прикрепить файл (или перетащите / вставьте из буфера обмена)">
          <IconPlus size={18} />
          <input ref={fileRef} type="file" multiple hidden onChange={onFiles} />
        </label>
        <textarea ref={taRef} rows={1} placeholder={ch.type === 'dm' ? `Написать @${displayName(dmOtherUser(ch))}` : `Написать в #${ch.name}`}
          value={text} onChange={onChange} onKeyDown={onKey} onPaste={onPaste} />
        {mentionOpen && (
          <div className="mention-menu">
            <div className="ep-header">Упомянуть участника</div>
            <div style={{ padding: '0 8px 8px' }}>
              {mentionUsers.map((u, i) => (
                <div key={u.id} ref={i === mentionIdx ? el => el?.scrollIntoView({ block: 'nearest' }) : null}
                  className={`mention-item ${i === mentionIdx ? 'active' : ''}`}
                  onMouseEnter={() => setMentionIdx(i)}
                  onMouseDown={e => { e.preventDefault(); pickMention(u) }}>
                  <Avatar user={u} size={24} /> <span className="name">{displayName(u)}</span>
                  <span className="mention-handle">@{u.username}</span>
                </div>
              ))}
            </div>
            <div className="mention-hint"><kbd>↑</kbd><kbd>↓</kbd> выбор · <kbd>Enter</kbd> вставить</div>
          </div>
        )}
        <div className="right-btns" style={{ position: 'relative' }}>
          <Tooltip tip="Эмодзи" side="top">
            <button onClick={() => setEmojiOpen(o => !o)}><IconSmile size={22} /></button>
          </Tooltip>
          {emojiOpen && <EmojiPicker onPick={e => { setText(t => t + e); resize(); taRef.current?.focus() }} onClose={() => setEmojiOpen(false)} />}
        </div>
      </div>
    </div>
  )
}


function Members({ guild }) {
  const s = useStore()
  if (!guild) return null
  const members = guild.members.map(m => ({ ...m, user: s.users[m.user_id] })).filter(m => m.user)
  const online = members.filter(m => (s.presences[m.user_id] || 'offline') !== 'offline' && s.presences[m.user_id] !== 'invisible')
  const offline = members.filter(m => !online.includes(m))
  const voiceIds = new Set(Object.values(s.voice).flat().map(v => v.user_id))
  const inVoice = members.filter(m => voiceIds.has(m.user_id) && !online.includes(m))

  const renderMember = (m, off = false) => {
    const role = m.role
    const color = role === 'owner' ? '#f0b232' : role === 'admin' ? '#5865f2' : undefined
    const vstate = Object.values(s.voice).flat().find(v => v.user_id === m.user_id)
    return (
      <div key={m.user_id} className={`member ${off ? 'offline' : ''}`}
        onClick={() => setUI({ modal: { type: 'profile', userId: m.user_id } })}
        onContextMenu={e => openMenu(e, memberMenu(m, guild, s))}>
        <Avatar user={m.user} size={32} showStatus speaking={!!s.speaking[m.user_id]} />
        <div className="m-col">
          <span className="m-name" style={color ? { color } : {}}>
            {displayName(m.user)}
            {role === 'owner' && <Tooltip tip="Владелец сервера" side="right"><IconCrown size={16} className="role-badge" style={{ color: '#f0b232' }} /></Tooltip>}
            {role === 'admin' && <Tooltip tip="Администратор сервера" side="right"><IconShield size={14} className="role-badge" style={{ color: '#8790d8' }} /></Tooltip>}
          </span>
          {m.user.badges?.length > 0 && <UserBadges ids={chatBadges(m.user.badges).slice(0, 4)} size={13} className="m-badges" />}
        </div>
        {vstate && <span className="vc-badge">{vstate.deafened ? <IconHeadphoneOff size={14} style={{ color: 'var(--red)' }} /> : vstate.muted ? <IconMicOff size={14} style={{ color: 'var(--red)' }} /> : <IconMic size={14} />}</span>}
      </div>
    )
  }
  return (
    <aside className="members">
      {online.length > 0 && <div className="member-category">В сети — {online.length}</div>}
      {online.map(m => renderMember(m))}
      {inVoice.length > 0 && <div className="member-category">В голосовом канале</div>}
      {inVoice.map(m => renderMember(m))}
      {offline.length > 0 && <div className="member-category">Не в сети — {offline.length}</div>}
      {offline.map(m => renderMember(m, true))}
    </aside>
  )
}

function memberMenu(m, guild, s) {
  const me = s.me
  const myRole = guild.members.find(x => x.user_id === me.id)?.role
  const items = [
    { label: 'Открыть профиль', onClick: () => setUI({ modal: { type: 'profile', userId: m.user_id } }) },
    { label: 'Написать сообщение', icon: <IconReply size={16} />, onClick: async () => { try { const r = await api('/dm', { body: { user_id: m.user_id } }); ensureDMChannel(r.channel); setUI({ guildId: '@home', channelId: r.channel.id }) } catch (e) { alert(e.message) } } },
  ]
  if (m.user_id !== me.id) {
    items.push({ sep: true })
    if (['owner', 'admin'].includes(myRole) && m.user_id !== guild.owner_id) {
      items.push({ label: 'Выгнать с сервера', danger: true, onClick: () => confirmDialog({ title: `Выгнать ${m.user.username}?`, okLabel: 'Выгнать', onOk: () => api(`/guilds/${guild.id}/members/${m.user_id}`, { method: 'DELETE' }).catch(e => alert(e.message)) }) })
    }
    if (myRole === 'owner' && m.user_id !== guild.owner_id) {
      items.push({ label: m.role === 'admin' ? 'Снять администратора' : 'Назначить администратором', icon: <IconPin size={16} />, onClick: () => api(`/guilds/${guild.id}/members/${m.user_id}/role`, { body: { role: m.role === 'admin' ? 'member' : 'admin' } }).catch(e => alert(e.message)) })
    }
  }
  return items
}


function SearchBox({ channelId }) {
  const [q, setQ] = useState('')
  const [res, setRes] = useState(null)
  const timer = useRef(null)
  const run = query => {
    clearTimeout(timer.current)
    if (query.length < 2) { setRes(null); return }
    timer.current = setTimeout(async () => {
      try {
        const r = await api(`/search?q=${encodeURIComponent(query)}`)
        setRes(r)
      } catch {}
    }, 250)
  }
  return (
    <div style={{ position: 'relative' }}>
      <input className="search-input" placeholder="Поиск" value={q}
        onChange={e => { setQ(e.target.value); run(e.target.value) }}
        onBlur={() => setTimeout(() => setRes(null), 200)} />
      {res && (
        <div className="search-results">
          {res.users.map(u => (
            <div key={u.id} className="sr-item" onMouseDown={() => setUI({ modal: { type: 'profile', userId: u.id } })}>
              <b>{u.username}</b> <span className="sr-ch">пользователь</span>
            </div>
          ))}
          {res.messages.map(m => {
            const ch = channelById(m.channel_id)
            const label = ch ? (ch.type === 'dm' ? 'ЛС' : `#${ch.name}`) : '?'
            return (
              <div key={m.id} className="sr-item" onMouseDown={() => { setUI({ channelId: m.channel_id, guildId: ch?._guild?.id || '@home' }) }}>
                <div className="sr-ch">{label} · {getState().users[m.author_id]?.username || '?'}</div>
                <div>{m.content.slice(0, 120)}</div>
              </div>
            )
          })}
          {!res.users.length && !res.messages.length && <div className="sr-item sr-ch">Ничего не найдено</div>}
        </div>
      )}
    </div>
  )
}
