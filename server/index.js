import express from 'express'
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import cookieParser from 'cookie-parser'
import { router } from './api.js'
import { extendedRouter } from './extended.js'
import { featuresRouter } from './features.js'
import { attachWS } from './ws.js'

const app = express()
const server = http.createServer(app)
const isProduction = process.env.NODE_ENV === 'production'

app.disable('x-powered-by')
if (process.env.TRUST_PROXY === 'true') app.set('trust proxy', 1)
if (isProduction && (!process.env.DSH_SECRET || process.env.DSH_SECRET.length < 32)) throw new Error('DSH_SECRET must be set to at least 32 characters in production')

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
  res.setHeader('Permissions-Policy', 'camera=(self), microphone=(self), geolocation=()')
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin')
  if (req.path.startsWith('/api/')) res.setHeader('Cache-Control', 'no-store')
  if (isProduction) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
  next()
})

const buckets = new Map()
function rateLimit(max, windowMs) {
  return (req, res, next) => {
    const key = `${req.ip}:${req.path === '/login' || req.path === '/register' ? 'auth' : 'api'}`
    const now = Date.now()
    let bucket = buckets.get(key)
    if (!bucket || now - bucket.started >= windowMs) bucket = { started: now, count: 0 }
    bucket.count++
    buckets.set(key, bucket)
    res.setHeader('X-RateLimit-Limit', max)
    res.setHeader('X-RateLimit-Remaining', Math.max(0, max - bucket.count))
    if (bucket.count > max) {
      res.setHeader('Retry-After', Math.ceil((bucket.started + windowMs - now) / 1000))
      return res.status(429).json({ error: 'Слишком много запросов. Попробуйте позже.' })
    }
    next()
  }
}
setInterval(() => {
  const cutoff = Date.now() - 15 * 60_000
  for (const [key, bucket] of buckets) if (bucket.started < cutoff) buckets.delete(key)
}, 5 * 60_000).unref()

app.use('/api/login', rateLimit(10, 60_000))
app.use('/api/register', rateLimit(5, 60_000))
app.use('/api', rateLimit(300, 60_000))
app.use(express.json({ limit: '2mb', strict: true }))
app.use(cookieParser())

// The older route modules pass cookie options inline. Normalize them centrally so
// authentication cookies are always HttpOnly/SameSite and secure in production.
app.use((req, res, next) => {
  const originalCookie = res.cookie.bind(res)
  res.cookie = (name, value, options = {}) => originalCookie(name, value, {
    ...options,
    httpOnly: true,
    sameSite: 'lax',
    secure: isProduction,
    path: '/',
  })
  next()
})

app.use('/api', router)
app.use('/api', extendedRouter)
app.use('/api', featuresRouter)

const DIST = path.join(process.cwd(), 'dist')
if (fs.existsSync(DIST)) {
  app.use(express.static(DIST, { index: 'index.html', maxAge: isProduction ? '1h' : 0 }))
  app.get(/^(?!\/api|\/ws).*/, (req, res) => res.sendFile(path.join(DIST, 'index.html')))
}

app.use((req, res) => res.status(404).json({ error: 'Не найдено' }))
app.use((err, req, res, next) => {
  const status = Number(err.status) || 500
  if (status >= 500) console.error(err)
  if (res.headersSent) return next(err)
  res.status(status).json({ error: err.expose ? err.message : 'Ошибка сервера' })
})

attachWS(server)
const PORT = Number(process.env.PORT) || 3001
server.listen(PORT, () => console.log(`[dsh] Discord clone ready on port ${PORT}`))
