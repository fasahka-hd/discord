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

app.use(express.json({ limit: '12mb' }))
app.use(cookieParser())
app.use('/api', router)

const DIST = path.join(process.cwd(), 'dist')
if (fs.existsSync(DIST)) {
  app.use(express.static(DIST))
  app.get(/^(?!\/api|\/ws).*/, (req, res) => res.sendFile(path.join(DIST, 'index.html')))
}

app.use((err, req, res, next) => {
  const status = err.status || 500
  if (status >= 500) console.error(err)
  res.status(status).json({ error: err.expose ? err.message : 'Ошибка сервера' })
})

await seedDemo()
attachWS(server)

const PORT = Number(process.env.PORT) || 3001
server.listen(PORT, () => console.log(`[dsh] Discord clone ready on http://localhost:${PORT}`))
