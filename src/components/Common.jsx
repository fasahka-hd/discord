import React, { useState, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { getState, setUI } from '../lib/store.js'
import { avatarColor, initials, useStore } from '../lib/util.js'


let _ptr = { x: 0, y: 0 }
if (typeof document !== 'undefined') {
  document.addEventListener('pointerdown', e => { _ptr = { x: e.clientX, y: e.clientY } })
}
export function lastPointer() { return _ptr }


export function Avatar({ user, size = 40, showStatus = false, status, speaking = false, square = false, onClick }) {
  const s = useStore()
  const st = status || (user && s.presences[user.id]) || 'offline'
  return (
    <div className={`avatar-wrap ${speaking ? 'speaking' : ''}`} style={{ width: size, height: size }} onClick={onClick}>
      {user?.avatar
        ? <div className="avatar" style={{ width: size, height: size, background: 'transparent' }}><img src={user.avatar} alt="" style={{ borderRadius: square ? '33%' : '50%' }} /></div>
        : <div className="avatar" style={{ width: size, height: size, background: avatarColor(user?.id || user?.username), fontSize: size * 0.4, borderRadius: square ? '33%' : '50%' }}>{initials(user?.username)}</div>}
      {showStatus && <div className={`status-dot ${st}`} style={{ width: size * 0.35, height: size * 0.35 }} />}
    </div>
  )
}


export function Tooltip({ tip, children, side = 'right', multiline = false }) {
  const [pos, setPos] = useState(null)
  const ref = useRef(null)
  const show = () => {
    if (!tip || !ref.current) return
    
    
    const el = ref.current.firstElementChild || ref.current
    const r = el.getBoundingClientRect()
    if (!r.width && !r.height) return
    const cx = Math.max(170, Math.min(r.left + r.width / 2, window.innerWidth - 170))
    const cy = Math.max(30, Math.min(r.top + r.height / 2, window.innerHeight - 30))
    if (side === 'right') setPos({ top: cy - 16, left: Math.min(r.right + 12, window.innerWidth - 240) })
    else if (side === 'bottom') setPos({ top: r.bottom + 8, left: cx, transform: 'translateX(-50%)' })
    else if (side === 'top') setPos({ bottom: window.innerHeight - r.top + 8, left: cx, transform: 'translateX(-50%)' })
    else setPos({ top: cy - 16, right: Math.max(window.innerWidth - r.left + 12, 8) })
  }
  const hide = () => setPos(null)
  return (
    <div ref={ref} style={{ display: 'contents' }} onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide}>
      {children}
      {pos && createPortal(<div className={`tooltip ${multiline ? 'multiline' : ''}`} style={pos}>{tip}</div>, document.body)}
    </div>
  )
}


export function openMenu(e, items) {
  e.preventDefault()
  e.stopPropagation()
  setUI({ contextMenu: { x: e.clientX, y: e.clientY, items } })
}
export function ContextMenuHost() {
  const s = useStore()
  const m = s.ui.contextMenu
  if (!m) return null
  const close = () => setUI({ contextMenu: null })
  const style = {
    left: Math.max(8, Math.min(m.x, window.innerWidth - 230)),
    top: Math.max(8, Math.min(m.y, window.innerHeight - m.items.length * 34 - 16)),
  }
  return createPortal(
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 1999 }} onClick={close} onContextMenu={e => { e.preventDefault(); close() }} />
      <div className="context-menu" style={style}>
        {m.items.map((it, i) => it.sep
          ? <div className="context-sep" key={i} />
          : <button key={i} className={`context-item ${it.danger ? 'danger' : ''}`} onClick={() => { close(); it.onClick && it.onClick() }}>
              {it.icon && <span style={{ display: 'grid', placeItems: 'center' }}>{it.icon}</span>}
              {it.label}
            </button>)}
      </div>
    </>, document.body)
}


export function Modal({ onClose, children, width = 440, bare = false, compact = false, className = '' }) {
  return createPortal(
    <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className={`modal ${bare ? 'bare' : ''} ${compact ? 'compact' : ''} ${className}`.trim()}
        style={{ width, maxWidth: `min(${width}px, calc(100vw - 32px))` }}>
        {children}
      </div>
    </div>, document.body)
}


export function confirmDialog({ title, body, danger = true, okLabel = 'Подтвердить', onOk }) {
  setUI({
    modal: {
      type: 'confirm',
      title, body, danger, okLabel,
      onOk: () => { setUI({ modal: null }); onOk() },
    },
  })
}
