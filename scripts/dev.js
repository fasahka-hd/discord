import { spawn } from 'node:child_process'

const procs = []
function start(name, cmd, args) {
  const p = spawn(cmd, args, { stdio: 'pipe', shell: false })
  const tag = `[${name}]`
  p.stdout.on('data', d => process.stdout.write(`${tag} ${d}`))
  p.stderr.on('data', d => process.stderr.write(`${tag} ${d}`))
  p.on('exit', code => { console.log(`${tag} exited (${code})`); shutdown() })
  procs.push(p)
}
function shutdown() {
  for (const p of procs) { try { p.kill() } catch {} }
  process.exit(0)
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

const node = process.execPath
start('api', node, ['server/index.js'])
start('web', node, [
  new URL('../node_modules/vite/bin/vite.js', import.meta.url).pathname.replace(/^\/(\w:)/, '$1'),
])
console.log('Dev mode: http://localhost:5173  (API :3001)')
