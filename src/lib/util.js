import { useSyncExternalStore } from 'react'
import { getState, subscribe } from './store.js'

export function useStore() {
  return useSyncExternalStore(subscribe, getState)
}

const AVATAR_COLORS = ['#5865f2', '#3ba55c', '#faa61a', '#ed4245', '#eb459e', '#9b59b6', '#3498db', '#1abc9c', '#e67e22', '#e91e63']
export function avatarColor(id = '') {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return AVATAR_COLORS[h % AVATAR_COLORS.length]
}
export function initials(name = '?') {
  const clean = name.replace(/[^\p{L}\p{N}]/gu, '')
  return (clean.slice(0, 2) || '?').toUpperCase()
}

export function fmtTime(ts) {
  return new Date(ts).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
}
export function fmtDateDivider(ts) {
  const d = new Date(ts)
  const today = new Date()
  const yest = new Date(Date.now() - 864e5)
  const same = (a, b) => a.toDateString() === b.toDateString()
  if (same(d, today)) return `Сегодня в ${fmtTime(ts)}`
  if (same(d, yest)) return `Вчера в ${fmtTime(ts)}`
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ` ${fmtTime(ts)}`
}
export function fmtDay(ts) {
  const d = new Date(ts)
  const today = new Date()
  const yest = new Date(Date.now() - 864e5)
  if (d.toDateString() === today.toDateString()) return 'Сегодня'
  if (d.toDateString() === yest.toDateString()) return 'Вчера'
  return d.toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}
export function fmtBytes(n) {
  if (n < 1024) return n + ' B'
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB'
  return (n / 1024 / 1024).toFixed(1) + ' MB'
}
export function fmtDuration(ms) {
  const s = Math.floor(ms / 1000)
  const m = Math.floor(s / 60)
  const h = Math.floor(m / 60)
  const pad = x => String(x).padStart(2, '0')
  return h ? `${h}:${pad(m % 60)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`
}
export function escapeReg(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') }
