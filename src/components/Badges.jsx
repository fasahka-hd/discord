import React, { useEffect, useMemo, useState } from 'react'
import { getState, setUI } from '../lib/store.js'
import { api } from '../lib/api.js'
import { useStore } from '../lib/util.js'
import { Modal, Tooltip, Avatar, confirmDialog } from './Common.jsx'
import { IconBadge } from './Icons.jsx'
import { BADGES, BADGE_CATEGORIES, BADGE_BY_ID, permsOf } from '../../shared/badges.js'


function badgeTip(b) {
  return <span><b>{b.name}</b><br />{b.desc}</span>
}


export function UserBadges({ ids, size = 18, className = '' }) {
  if (!ids || !ids.length) return null
  return (
    <span className={`badge-row ${className}`}>
      {ids.map(id => {
        const b = BADGE_BY_ID[id]
        if (!b) return null
        return (
          <Tooltip key={id} tip={badgeTip(b)} side="bottom" multiline>
            <img className="badge-icon" src={b.icon} width={size} height={size} alt={b.name} draggable={false} />
          </Tooltip>
        )
      })}
    </span>
  )
}


export function BadgeGrid({ selected, onToggle }) {
  const sel = new Set(selected || [])
  return (
    <div className="badge-cats thin-scroll">
      {BADGE_CATEGORIES.map(cat => {
        const items = BADGES.filter(b => b.cat === cat.id)
        if (!items.length) return null
        return (
          <div key={cat.id} className="badge-cat">
            <div className="badge-cat-title">{cat.title}</div>
            <div className="badge-grid">
              {items.map(b => (
                <Tooltip key={b.id} tip={badgeTip(b)} side="top" multiline>
                  <button type="button" className={`badge-tile ${sel.has(b.id) ? 'on' : ''}`} onClick={() => onToggle(b.id)}>
                    <img src={b.icon} width={26} height={26} alt="" draggable={false} />
                    <span>{b.name}</span>
                  </button>
                </Tooltip>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}


export function myModPerms(me) {
  if (!me) return new Set()
  if (me.is_admin) return new Set(['suspend', 'ban', 'delete_any_message', 'grant_badges'])
  return new Set(permsOf(me.badges || []))
}

async function saveBadges(userId, ids) {
  const r = await api(`/admin/users/${userId}/badges`, { method: 'PUT', body: { badges: ids } })
  return r.user
}


export function BadgeEditorModal({ userId, onClose }) {
  const s = useStore()
  const user = s.users[userId] || getState().me
  const [ids, setIds] = useState(() => [...(user?.badges || [])])
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => { setIds([...(user?.badges || [])]) }, [userId, user?.badges?.join(',')])
  if (!user) return null
  const dirty = ids.join(',') !== (user.badges || []).join(',')
  const toggle = id => setIds(cur => cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id])
  const save = async () => {
    setBusy(true); setMsg('')
    try {
      await saveBadges(userId, ids)
      setMsg('✓ Сохранено')
      setTimeout(() => {
        
        if (getState().ui.modal?.type === 'badge-editor' && getState().ui.modal.userId === userId)
          setUI({ modal: { type: 'profile', userId } })
      }, 600)
    } catch (e) { setMsg('⚠ ' + e.message) } finally { setBusy(false) }
  }
  return (
    <Modal onClose={onClose} width={640}>
      <div className="be-head">
        <Avatar user={user} size={44} />
        <div>
          <div className="be-name">{user.display_name || user.username}</div>
          <div className="be-sub">@{user.username} · бейджей: {ids.length}/25</div>
        </div>
        <button className="pp-close" style={{ position: 'absolute', top: 10, right: 10 }} onClick={onClose}>✕</button>
      </div>
      <BadgeGrid selected={ids} onToggle={toggle} />
      <div className="modal-footer">
        {msg && <span className="be-msg">{msg}</span>}
        <button className="btn ghost" onClick={() => setIds([])} disabled={!ids.length}>Снять все</button>
        <button className="btn ghost" onClick={onClose}>Отмена</button>
        <button className="btn primary" onClick={save} disabled={!dirty || busy}>Сохранить</button>
      </div>
    </Modal>
  )
}


export function AdminBadgesTab() {
  const s = useStore()
  const [users, setUsers] = useState(null)
  const [q, setQ] = useState('')
  const [selId, setSelId] = useState(null)
  const [ids, setIds] = useState([])
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const load = () => api(`/admin/users${q ? '?q=' + encodeURIComponent(q) : ''}`).then(r => {
    setUsers(r.users)
    if (!selId && r.users.length) setSelId(r.users[0].id)
  }).catch(e => setMsg('⚠ ' + e.message))
  useEffect(() => { load() }, [q])
  
  const selUser = selId ? (s.users[selId] || users?.find(u => u.id === selId)) : null
  useEffect(() => { if (selUser) setIds([...(selUser.badges || [])]) }, [selId, selUser?.badges?.join(',')])
  const filtered = useMemo(() => users || [], [users])
  const dirty = selUser && ids.join(',') !== (selUser.badges || []).join(',')
  const toggle = id => setIds(cur => cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id])
  const save = async () => {
    if (!selUser) return
    setBusy(true); setMsg('')
    try {
      await saveBadges(selUser.id, ids)
      setMsg('✓ Сохранено'); setTimeout(() => setMsg(''), 2000)
    } catch (e) { setMsg('⚠ ' + e.message) } finally { setBusy(false) }
  }
  const restrict = async (action, hours) => {
    if (!selUser) return
    try {
      await api(`/mod/users/${selUser.id}/${action}`, { method: 'POST', body: hours ? { hours } : {} })
      setMsg('✓ Готово'); setTimeout(() => setMsg(''), 2000)
    } catch (e) { setMsg('⚠ ' + e.message) }
  }
  const askSuspend = () => confirmDialog({
    title: `Приостановить @${selUser?.username}?`,
    body: 'Пользователь не сможет пользоваться аккаунтом 24 часа.',
    okLabel: 'Приостановить', danger: true, onOk: () => restrict('suspend', 24),
  })
  const askBan = () => confirmDialog({
    title: `Заблокировать @${selUser?.username}?`,
    body: 'Полная блокировка учётной записи. Снять её сможет только администратор платформы.',
    okLabel: 'Заблокировать', danger: true, onOk: () => restrict('ban'),
  })
  const restricted = selUser && (selUser.banned || selUser.suspended_until)
  return (
    <div className="admin-wrap">
      <div className="admin-side">
        <div className="sr-desc" style={{ marginBottom: 8 }}>
          <IconBadge size={14} style={{ verticalAlign: -2 }} /> Выдавайте бейджи Discord — они сразу появятся в профилях, в чате и в списках участников.
        </div>
        <input className="field-input" placeholder="Поиск по имени…" value={q} onChange={e => setQ(e.target.value)} />
        <div className="admin-users thin-scroll">
          {!users && <div className="pp-empty">Загрузка…</div>}
          {users && !filtered.length && <div className="pp-empty">Никого не найдено</div>}
          {filtered.map(u => {
            const live = s.users[u.id] || u
            return (
              <div key={u.id} className={`admin-user ${selId === u.id ? 'active' : ''}`} onClick={() => setSelId(u.id)}>
                <Avatar user={live} size={32} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="au-name">{live.display_name || live.username}{live.is_admin && <Tooltip tip="Администратор платформы" side="right"><IconBadge size={12} style={{ color: 'var(--yellow)', marginLeft: 4, verticalAlign: -1 }} /></Tooltip>}</div>
                  <div className="au-sub">@{live.username} · {(live.badges || []).length} бейджей</div>
                </div>
                {(live.banned || live.suspended_until) && <span className="au-restricted">{live.banned ? 'бан' : 'тайм-аут'}</span>}
                <UserBadges ids={(live.badges || []).slice(0, 3)} size={14} />
              </div>
            )
          })}
        </div>
      </div>
      <div className="admin-main">
        {selUser ? (
          <>
            <div className="admin-editor-head">
              <div className="sr-label">Бейджи: {selUser.display_name || selUser.username} <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>@{selUser.username}</span></div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                {msg && <span className="be-msg">{msg}</span>}
                <button className="btn ghost small" onClick={() => setIds([])} disabled={!ids.length}>Снять все</button>
                <button className="btn primary small" onClick={save} disabled={!dirty || busy}>{busy ? '…' : 'Сохранить'}</button>
              </div>
            </div>
            <div className="admin-mod-row">
              <span className="admin-mod-label">Модерация:</span>
              {restricted
                ? <span className="admin-mod-status">{selUser.banned ? 'Заблокирован' : `Приостановлен до ${new Date(selUser.suspended_until).toLocaleString('ru-RU')}`}</span>
                : <span className="admin-mod-status ok">Активен</span>}
              {!selUser.is_admin && selUser.id !== s.me.id && (
                <>
                  <button className="btn ghost small" disabled={selUser.banned} onClick={askSuspend}>Приостановить 24 ч</button>
                  <button className="btn red small" disabled={selUser.banned} onClick={askBan}>Заблокировать</button>
                  {restricted && <button className="btn green small" onClick={() => restrict('pardon')}>Снять ограничения</button>}
                </>
              )}
            </div>
            <BadgeGrid selected={ids} onToggle={toggle} />
          </>
        ) : <div className="pp-empty">Выберите пользователя слева</div>}
      </div>
    </div>
  )
}
