import React, { useState } from 'react'
import { getState, setUI, displayName, ensureDMChannel } from '../lib/store.js'
import { api } from '../lib/api.js'
import { useStore } from '../lib/util.js'
import { Avatar, openMenu, confirmDialog } from './Common.jsx'
import { UserBadges } from './Badges.jsx'
import { IconMessage, IconX, IconCheck, IconUserAdd, IconPlus } from './Icons.jsx'

const TABS = [
  ['online', 'Онлайн'],
  ['all', 'Все'],
  ['pending', 'В ожидании'],
  ['add', 'Добавить друга'],
]

export default function Friends() {
  const s = useStore()
  const tab = s.ui.friendsTab || 'online'
  const [addQ, setAddQ] = useState('')
  const [addErr, setAddErr] = useState('')
  const [addOk, setAddOk] = useState('')

  const onlineCount = s.friends.filter(f => {
    const st = s.presences[f.id] || 'offline'
    return st !== 'offline' && st !== 'invisible'
  }).length

  const sendRequest = async e => {
    e.preventDefault()
    setAddErr(''); setAddOk('')
    const name = addQ.trim()
    if (!name) return
    try {
      await api('/friends/request', { body: { username: name } })
      setAddOk(`Заявка для «${name}» отправлена!`)
      setAddQ('')
    } catch (ex) { setAddErr(ex.message) }
  }

  let rows = []
  if (tab === 'online') rows = s.friends.filter(f => { const st = s.presences[f.id] || 'offline'; return st !== 'offline' && st !== 'invisible' })
  else if (tab === 'all') rows = s.friends
  else if (tab === 'pending') rows = [...s.incoming.map(i => ({ ...i, kind: 'in' })), ...s.outgoing.map(o => ({ ...o, kind: 'out' }))]

  return (
    <div className="friends-page">
      <header className="friends-header">
        <IconUserAdd size={22} style={{ color: 'var(--text-muted)', display: 'none' }} />
        <span style={{ fontWeight: 600, color: 'var(--text-header)', marginRight: 8 }}>Друзья</span>
        {TABS.map(([id, label]) => (
          <React.Fragment key={id}>
            {id === 'add' && <span style={{ width: 1, height: 24, background: 'var(--bg-active)', margin: '0 4px' }} />}
            <button className={`friends-tab ${tab === id ? (id === 'add' ? 'solid' : 'active') : ''}`}
              style={id === 'add' && tab === id ? { background: 'var(--brand)', color: '#fff' } : {}}
              onClick={() => setUI({ friendsTab: id })}>{label}</button>
          </React.Fragment>
        ))}
        <span style={{ flex: 1 }} />
      </header>

      {tab === 'add' ? (
        <div className="add-friend-panel">
          <h3>ДОБАВИТЬ ДРУГА</h3>
          <p className="hint">Вы можете добавить друга по имени пользователя. Друзья могут видеть, в сети вы или нет, и добавлять вас в серверы.</p>
          <form className="add-friend-form" onSubmit={sendRequest}>
            <input placeholder="Введите имя пользователя" value={addQ} onChange={e => { setAddQ(e.target.value); setAddErr(''); setAddOk('') }} autoFocus />
            <button className="btn green" disabled={!addQ.trim()}>Отправить заявку</button>
          </form>
          {addErr && <div className="add-friend-error">{addErr}</div>}
          {addOk && <div style={{ color: 'var(--green)', fontSize: 14, marginBottom: 12 }}>{addOk}</div>}
        </div>
      ) : (
        <div className="friends-list">
          {tab !== 'add' && rows.length === 0 && (
            <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--text-muted)' }}>
              <div style={{ fontSize: 48 }}>🎭</div>
              <div style={{ fontSize: 16, color: 'var(--text-header)', fontWeight: 600, margin: '8px 0' }}>Здесь пока пусто</div>
              {tab === 'online' && <div>Зови друзей, чтобы веселиться вместе. <a className="clickable" style={{ color: 'var(--text-link)' }} onClick={() => setUI({ friendsTab: 'add' })}>Добавить друга</a></div>}
              {tab === 'all' && <div>Добавьте друзей, чтобы видеть, чем они занимаются.</div>}
              {tab === 'pending' && <div>Нет ожидающих заявок.</div>}
            </div>
          )}
          {rows.length > 0 && <div className="friends-title">{tab === 'online' ? `В сети — ${rows.length}` : tab === 'all' ? `Все друзья — ${s.friends.length}` : `Ожидание — ${rows.length}`}</div>}
          {tab === 'pending'
            ? rows.map(r => {
                const u = r.user
                return (
                  <div key={r.id} className="friend-row"
                    onClick={() => setUI({ modal: { type: 'profile', userId: u.id } })}
                    onContextMenu={e => openMenu(e, [{ label: r.kind === 'in' ? 'Отклонить заявку' : 'Отменить заявку', danger: true, onClick: () => api(`/friends/requests/${r.id}`, { method: 'DELETE' }).catch(() => {}) }])}>
                    <Avatar user={u} size={36} showStatus />
                    <div className="f-info">
                      <div className="f-name">{u.username}</div>
                      <div className="f-sub">{r.kind === 'in' ? 'Входящая заявка' : 'Исходящий запрос'} · {new Date(r.created_at).toLocaleDateString('ru-RU')}</div>
                    </div>
                    <div className="f-actions">
                      {r.kind === 'in' && <TooltipBtn tip="Принять" onClick={async e => {
                        e.stopPropagation()
                        try {
                          await api(`/friends/requests/${r.id}/accept`, { method: 'POST' })
                          // сразу создаём ЛС-канал — чат появится в списке слева
                          const dm = await api('/dm', { body: { user_id: u.id } })
                          ensureDMChannel(dm.channel)
                        } catch (ex) { alert(ex.message) }
                      }}><IconCheck size={20} /></TooltipBtn>}
                      <TooltipBtn tip={r.kind === 'in' ? 'Отклонить' : 'Отменить'} onClick={async e => { e.stopPropagation(); await api(`/friends/requests/${r.id}`, { method: 'DELETE' }).catch(() => {}) }}><IconX size={20} /></TooltipBtn>
                    </div>
                  </div>
                )
              })
            : rows.map(f => {
                const st = s.presences[f.id] || 'offline'
                const dm = s.dms.find(c => (c.recipients || []).includes(f.id))
                return (
                  <div key={f.id} className="friend-row"
                    onClick={() => setUI({ modal: { type: 'profile', userId: f.id } })}
                    onContextMenu={e => openMenu(e, [
                      { label: 'Написать сообщение', onClick: () => openDM(f.id) },
                      { label: 'Открыть профиль', onClick: () => setUI({ modal: { type: 'profile', userId: f.id } }) },
                      { sep: true },
                      { label: 'Удалить из друзей', danger: true, onClick: () => confirmDialog({ title: `Удалить ${f.username} из друзей?`, body: 'Вы больше не сможете видеть статусы друг друга.', okLabel: 'Удалить', onOk: () => api(`/friends/${f.id}`, { method: 'DELETE' }).catch(() => {}) }) },
                    ])}>
                    <Avatar user={f} size={36} showStatus />
                    <div className="f-info">
                      <div className="f-name">{displayName(f)}<UserBadges ids={f.badges} size={14} className="f-badges" /></div>
                      <div className="f-sub">{displayName(f) !== f.username ? '@' + f.username + ' · ' : ''}{st === 'online' ? 'В сети' : st === 'idle' ? 'Не активен' : st === 'dnd' ? 'Не беспокоить' : 'Не в сети'}</div>
                    </div>
                    <div className="f-actions">
                      <TooltipBtn tip="Написать сообщение" onClick={async e => { e.stopPropagation(); await openDM(f.id) }}><IconMessage size={20} /></TooltipBtn>
                      <TooltipBtn tip="Больше" onClick={e => {
                        const r = e.currentTarget.getBoundingClientRect()
                        openMenu({ preventDefault: () => {}, stopPropagation: () => {}, clientX: r.left, clientY: r.bottom + 4 }, [
                          { label: 'Открыть профиль', onClick: () => setUI({ modal: { type: 'profile', userId: f.id } }) },
                          { sep: true },
                          { label: 'Удалить из друзей', danger: true, onClick: () => confirmDialog({ title: `Удалить ${f.username} из друзей?`, okLabel: 'Удалить', onOk: () => api(`/friends/${f.id}`, { method: 'DELETE' }).catch(() => {}) }) },
                        ])
                      }}><IconPlus size={20} /></TooltipBtn>
                    </div>
                  </div>
                )
              })}
        </div>
      )}
    </div>
  )
}

async function openDM(userId) {
  try {
    const r = await api('/dm', { body: { user_id: userId } })
    ensureDMChannel(r.channel)
    setUI({ guildId: '@home', channelId: r.channel.id })
  } catch (e) { alert(e.message) }
}

function TooltipBtn({ tip, onClick, children }) {
  return (
    <button className="round-btn" title={tip} onClick={onClick}>{children}</button>
  )
}
