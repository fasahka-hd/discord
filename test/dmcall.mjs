// Focused test: DM voice call logging (connected-call end + missed call).
import WebSocket from 'ws'
const BASE = 'http://localhost:3001'
let failures = 0
const ok = (name, cond) => { console.log(`${cond ? '✓' : '✗'} ${name}`); if (!cond) failures++ }
const sleep = ms => new Promise(r => setTimeout(r, ms))

class Client {
  constructor(username) { this.username = username; this.events = []; this.wsEvents = [] }
  async login() {
    let r = await fetch(BASE + '/api/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: this.username, password: 'secret123' }) })
    if (r.status === 409) r = await fetch(BASE + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: this.username, password: 'secret123' }) })
    const data = await r.json()
    if (!data.user) throw new Error('login failed: ' + JSON.stringify(data))
    this.token = r.headers.get('set-cookie').split(';')[0]
    this.user = data.user
  }
  async api(path, opts = {}) {
    const r = await fetch(BASE + '/api' + path, {
      method: opts.method || (opts.body ? 'POST' : 'GET'),
      headers: { 'Content-Type': 'application/json', cookie: this.token },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(`${path} → ${r.status} ${JSON.stringify(d)}`)
    return d
  }
  connectWS() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket('ws://localhost:3001/ws', { headers: { cookie: this.token } })
      this.ws.on('open', resolve)
      this.ws.on('error', reject)
      this.ws.on('message', raw => this.wsEvents.push(JSON.parse(raw)))
    })
  }
  waitFor(t, pred, timeout = 5000) {
    const start = Date.now()
    return new Promise((resolve, reject) => {
      const check = () => {
        const found = this.wsEvents.find(m => m.t === t && (!pred || pred(m.d)))
        if (found) return resolve(found)
        if (Date.now() - start > timeout) return reject(new Error(`timeout waiting for ${t}`))
        setTimeout(check, 50)
      }
      check()
    })
  }
  send(op, d) { this.ws.send(JSON.stringify({ op, d })) }
}

const alice = new Client('wsuser_a_' + Date.now().toString(36))
const bob = new Client('wsuser_b_' + Date.now().toString(36))
await alice.login(); await bob.login()
await alice.connectWS(); await bob.connectWS()
await alice.waitFor('HELLO'); await bob.waitFor('HELLO')

await alice.api('/friends/request', { body: { username: bob.user.username } })
const inc = (await bob.api('/state')).incoming.find(i => i.user.id === alice.user.id)
await bob.api(`/friends/requests/${inc.id}/accept`, { method: 'POST' })
const dm = await alice.api('/dm', { body: { user_id: bob.user.id } })
const chId = dm.channel.id

// --- Test 1: connected call — start message on connect, duration message on end ---
alice.send('voice:join', { channel_id: chId })
await alice.waitFor('VOICE_INIT', d => d.channel_id === chId)
await sleep(300)
bob.send('voice:join', { channel_id: chId })
await bob.waitFor('VOICE_INIT', d => d.channel_id === chId)
const aStart = await alice.waitFor('MESSAGE_CREATE', d => /начал\(а\) голосовой звонок/.test(String(d.message.content)))
const bStart = await bob.waitFor('MESSAGE_CREATE', d => /начал\(а\) голосовой звонок/.test(String(d.message.content)))
ok('начало звонка: системное сообщение обоим', !!aStart && !!bStart)
await sleep(1500) // let the call run a bit
alice.send('voice:leave', {})
// both clients should receive a [SYS] message about the ended call
const aMsg = await alice.waitFor('MESSAGE_CREATE', d => /продолжительностью/.test(String(d.message.content)))
const bMsg = await bob.waitFor('MESSAGE_CREATE', d => /продолжительностью/.test(String(d.message.content)))
ok('завершение звонка: системное сообщение отправлено', !!aMsg && !!bMsg)
ok('текст звонка содержит «начал(а) звонок»', /начал\(а\) звонок/.test(aMsg.d.message.content))
ok('указана длительность', /продолжительностью/.test(aMsg.d.message.content) && /секунд|минут|час/.test(aMsg.d.message.content))
// persisted in history
const hist = await alice.api(`/channels/${chId}/messages?limit=50`)
const sysMsg = hist.messages.find(m => String(m.content).startsWith('[SYS]'))
ok('сообщение сохранено в истории ЛС', !!sysMsg)

// --- Test 2: missed call — alice joins alone, nobody answers for 30s ---
bob.send('voice:leave', {})
await sleep(300)
alice.send('voice:join', { channel_id: chId })
await alice.waitFor('VOICE_INIT', d => d.channel_id === chId)
console.log('   …ожидание таймера пропущенного звонка (30 c)…')
const missed = await alice.waitFor('MESSAGE_CREATE', d => String(d.message.content).startsWith('[SYS]') && /не ответил/.test(String(d.message.content)), 34000)
ok('пропущенный звонок: системное сообщение', !!missed)
ok('пропущенный звонок упоминает обоих', /позвонил\(а\)/.test(missed.d.message.content))
alice.send('voice:leave', {})
await sleep(300)

alice.ws.close(); bob.ws.close()
console.log(failures ? `\n${failures} FAILURES` : '\nALL PASSED')
process.exit(failures ? 1 : 0)
