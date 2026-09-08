import express from 'express'
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import cookieParser from 'cookie-parser'
import { router } from './api.js'
import { attachWS } from './ws.js'
import { seedDemo } from './db.js'

const app = express()
const server = http.createServer(app)
const isProduction = process.env.NODE_ENV === 'production'

// Basic security headers without adding another runtime dependency.
app.disable('x-powered-by')
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
  res.setHeader('Permissions-Policy', 'camera=(self), microphone=(self), geolocation=()')
  if (isProduction) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
  next()
})

// Keep JSON requests bounded. Large files should use a dedicated upload endpoint.
app.use(express.json({ limit: '2mb', strict: true }))
app.use(cookieParser())
app.use('/api', router)

const DIST = path.join(process.cwd(), 'dist')
if (fs.existsSync(DIST)) {
  app.use(express.static(DIST, { index: 'index.html', maxAge: isProduction ? '1h' : 0 }))
  app.get(/^(?!\/api|\/ws).*/, (req, res) => res.sendFile(path.join(DIST, 'index.html')))
}

app.use((req, res) => res.status(404).json({ error: 'Не найдено' }))
app.use((err, req, res, next) => {
  const status = err.status || 500
  if (status >= 500) console.error(err)
  if (res.headersSent) return next(err)
  res.status(status).json({ error: err.expose ? err.message : 'Ошибка сервера' })
})

if (process.env.DSH_SEED_DEMO === 'true') await seedDemo()
attachWS(server)

const PORT = Number(process.env.PORT) || 3001
server.listen(PORT, () => console.log(`[dsh] Discord clone ready on port ${PORT}`))
