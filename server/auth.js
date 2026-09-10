import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import { randomBytes } from 'node:crypto'
import { get, run, uid, now } from './db.js'

const isProduction = process.env.NODE_ENV === 'production'
const configuredSecret = process.env.DSH_SECRET
if (isProduction && (!configuredSecret || configuredSecret.length < 32)) throw new Error('DSH_SECRET must be set to a random value of at least 32 characters in production')
export const SECRET = configuredSecret || randomBytes(48).toString('hex')
export const COOKIE = 'dsh_token'
export const COOKIE_OPTIONS = { httpOnly: true, sameSite: 'lax', secure: isProduction, maxAge: 30 * 864e5, path: '/' }

export function sign(user) { return jwt.sign({ id: user.id }, SECRET, { expiresIn: '30d', issuer: 'discord-clone', audience: 'discord-clients' }) }
export function verify(token) { try { return jwt.verify(token, SECRET, { issuer: 'discord-clone', audience: 'discord-clients' }) } catch { return null } }
function restrictedResponse(res, restriction) {
  return res.status(403).json({ error: restriction.action === 'banned' ? 'Учётная запись заблокирована' : 'Учётная запись приостановлена', code: restriction.action, until: restriction.until || null })
}
export function authMiddleware(req, res, next) {
  const payload = verify(req.cookies?.[COOKIE])
  if (!payload?.id) return res.status(401).json({ error: 'unauthorized' })
  const user = get('SELECT * FROM users WHERE id=?', [payload.id])
  if (!user) return res.status(401).json({ error: 'unauthorized' })
  const restriction = restrictionOf(user)
  if (restriction && !(req.method === 'POST' && req.path === '/logout')) return restrictedResponse(res, restriction)
  req.user = user
  next()
}
export function optionalAuthMiddleware(req, res, next) {
  const payload = verify(req.cookies?.[COOKIE])
  const user = payload?.id ? get('SELECT * FROM users WHERE id=?', [payload.id]) : null
  if (!user) {
    req.user = null
    return next()
  }
  const restriction = restrictionOf(user)
  if (restriction) return restrictedResponse(res, restriction)
  req.user = user
  next()
}
export function publicUser(u) {
  if (!u) return null
  let badges = []
  try { badges = u.badges ? JSON.parse(u.badges) : [] } catch {}
  return { id: u.id, username: u.username, discriminator: u.discriminator, avatar: u.avatar, bio: u.bio, status: u.status, created_at: u.created_at, display_name: u.display_name || null, pronouns: u.pronouns || null, banner_color: u.banner_color || null, custom_status: u.custom_status || null, status_icon: u.status_icon || '', badges: Array.isArray(badges) ? badges : [], is_admin: !!u.admin, banned: !!u.banned, suspended_until: u.suspended_until && u.suspended_until > Date.now() ? u.suspended_until : null }
}
export function restrictionOf(u) { if (!u) return null; if (u.banned) return { action: 'banned' }; if (u.suspended_until && u.suspended_until > Date.now()) return { action: 'suspended', until: u.suspended_until }; return null }
export function register(username, password) {
  username = String(username || '').trim()
  if (!/^[a-zA-Z0-9_.\u0430-\u044f\u0410-\u042fёЁ-]{2,32}$/.test(username)) throw httpError(400, 'Некорректное имя пользователя')
  if (!password || password.length < 8) throw httpError(400, 'Пароль должен быть не короче 8 символов')
  if (get('SELECT id FROM users WHERE username=? COLLATE NOCASE', [username])) throw httpError(409, 'Имя занято')
  const id = uid()
  run('INSERT INTO users (id,username,discriminator,password_hash,bio,status,created_at) VALUES (?,?,?,?,?,?,?)', [id, username, '0', bcrypt.hashSync(password, 12), '', 'online', now()])
  return get('SELECT * FROM users WHERE id=?', [id])
}
export function login(username, password) {
  const u = get('SELECT * FROM users WHERE username=? COLLATE NOCASE', [String(username || '').trim()])
  if (!u || !bcrypt.compareSync(password || '', u.password_hash)) throw httpError(401, 'Неверный логин или пароль')
  const r = restrictionOf(u)
  if (r?.action === 'banned') throw httpError(403, 'Учётная запись заблокирована администратором.')
  if (r?.action === 'suspended') throw httpError(403, `Учётная запись приостановлена до ${new Date(r.until).toLocaleString('ru-RU')}.`)
  return u
}
export function httpError(code, msg) { const e = new Error(msg); e.status = code; e.expose = true; return e }
