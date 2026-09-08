// End-to-end smoke test for the Discord clone backend.
import WebSocket from 'ws'

const BASE = 'http://localhost:3001'
let failures = 0
const ok = (name, cond) => { console.log(`${cond ? '✓' : '✗'} ${name}`); if (!cond) failures++ }

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
      this.ws.on('message', raw => {
        const msg = JSON.parse(raw)
        this.wsEvents.push(msg)
      })
    })
  }
  waitFor(t, pred, timeout = 4000) {
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

const alice = new Client('alice_' + Date.now().toString(36))
const bob = new Client('bob_' + Date.now().toString(36))

await alice.login()
await bob.login()
ok('регистрация двух пользователей', !!alice.user.id && !!bob.user.id)

await alice.connectWS()
await bob.connectWS()
await alice.waitFor('HELLO')
await bob.waitFor('HELLO')
ok('websocket подключение', true)

// friends
await alice.api('/friends/request', { body: { username: bob.user.username } })
await bob.waitFor('FRIENDS_UPDATE', d => d.incoming.some(i => i.user.id === alice.user.id))
const inc = (await bob.api('/state')).incoming[0]
await bob.api(`/friends/requests/${inc.id}/accept`, { method: 'POST' })
const aState = await alice.waitFor('FRIENDS_UPDATE', d => d.friends.some(f => f.id === bob.user.id)).then(() => alice.api('/state'))
ok('дружба через заявку', aState.friends.some(f => f.id === bob.user.id))

// DM
const dm = await alice.api('/dm', { body: { user_id: bob.user.id } })
ok('создание ЛС-канала', dm.channel.type === 'dm')
await bob.waitFor('DM_CREATE')
const msg = await alice.api(`/channels/${dm.channel.id}/messages`, { body: { content: 'привет, боб!' } })
const got = await bob.waitFor('MESSAGE_CREATE', d => d.message.id === msg.message.id)
ok('доставка сообщения в ЛС по WS', !!got)

// edit + delete + reaction
await alice.api(`/messages/${msg.message.id}`, { method: 'PATCH', body: { content: 'привет, боб! (изм)' } })
await bob.waitFor('MESSAGE_UPDATE', d => d.message.content.includes('изм'))
ok('редактирование сообщения', true)
await bob.api(`/messages/${msg.message.id}/reactions`, { body: { emoji: '👍' } })
await alice.waitFor('REACTION', d => d.emoji === '👍')
ok('реакция', true)

// guild
const g = await alice.api('/guilds', { body: { name: 'Тестовый сервер' } })
ok('создание сервера', g.guild.channels.length === 2)
await bob.api('/guilds/join', { body: { code: g.guild.invite_code } })
await bob.waitFor('GUILD_UPDATE', d => d.guild.id === g.guild.id)
const textCh = g.guild.channels.find(c => c.type === 'text')
const gm = await alice.api(`/channels/${textCh.id}/messages`, { body: { content: 'все привет @' + bob.user.username } })
await bob.waitFor('MESSAGE_CREATE', d => d.message.id === gm.message.id)
ok('сообщение в канал сервера', true)

// typing
alice.send('typing', { channel_id: textCh.id })
await bob.waitFor('TYPING', d => d.channel_id === textCh.id && d.user.id === alice.user.id)
ok('индикатор набора текста', true)

// voice signaling
const voiceCh = g.guild.channels.find(c => c.type === 'voice')
bob.send('voice:join', { channel_id: voiceCh.id })
await alice.waitFor('VOICE_STATE', d => d.channel_id === voiceCh.id && d.states.some(s => s.user_id === bob.user.id))
alice.send('voice:join', { channel_id: voiceCh.id })
const init = await alice.waitFor('VOICE_INIT', d => d.channel_id === voiceCh.id)
ok('voice:join + VOICE_INIT с пирами', init.d.peers.includes(bob.user.id))
alice.send('voice:signal', { to: bob.user.id, data: { sdp: { type: 'offer', sdp: 'fake' } } })
const sig = await bob.waitFor('VOICE_SIGNAL', d => d.from === alice.user.id)
ok('релей WebRTC-сигналов', !!sig)
bob.send('voice:mute', { muted: true, deafened: false })
await alice.waitFor('VOICE_STATE', d => d.states.find(s => s.user_id === bob.user.id)?.muted === true)
ok('mute-статус в войсе', true)
alice.send('voice:leave')
await bob.waitFor('VOICE_STATE', d => !d.states.some(s => s.user_id === alice.user.id))
ok('выход из войса', true)

// presence
bob.send('presence', { status: 'dnd' })
await alice.waitFor('PRESENCE', d => d.user_id === bob.user.id && d.status === 'dnd')
ok('presence-статусы', true)

// extended profile fields + USER_UPDATE propagation
await bob.api('/me', { method: 'PATCH', body: { display_name: 'Bob The Great', pronouns: 'he/him', banner_color: '#eb459e' } })
const uu = await alice.waitFor('USER_UPDATE', d => d.user.id === bob.user.id && d.user.display_name === 'Bob The Great')
ok('расширенный профиль (display_name/pronouns/banner) + рассылка', !!uu)
const prof = await alice.api(`/users/${bob.user.id}`)
ok('профиль отдаёт новые поля', prof.user.pronouns === 'he/him' && prof.user.banner_color === '#eb459e')

// guild create pushes GUILD_UPDATE to creator via WS
const g2 = await alice.api('/guilds', { body: { name: 'Auto Push Test' } })
await alice.waitFor('GUILD_UPDATE', d => d.guild.id === g2.guild.id)
ok('создание сервера пушится без F5', true)

// search
const sr = await alice.api('/search?q=' + encodeURIComponent('привет'))
ok('поиск по сообщениям', sr.messages.length > 0)

// unread + read
const st2 = await bob.api('/state')
const dm2 = st2.dmChannels.find(c => c.id === dm.channel.id)
ok('непрочитанные в ЛС', dm2 && dm2.unread >= 1)
await bob.api(`/channels/${dm.channel.id}/read`, { method: 'POST' })
const st3 = await bob.api('/state')
ok('сброс непрочитанных', st3.dmChannels.find(c => c.id === dm.channel.id).unread === 0)

// permissions: bob cannot post to alice-only guild after removal
await alice.api(`/guilds/${g.guild.id}/members/${bob.user.id}`, { method: 'DELETE' })
let denied = false
try { await bob.api(`/channels/${textCh.id}/messages`, { body: { content: 'хак' } }) } catch (e) { denied = e.message.includes('403') }
ok('доступ к каналу закрыт после кика', denied)

// ---------- badges ----------
const admin = new Client('admin')
{
  const r = await fetch(BASE + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: 'admin123' }) })
  const data = await r.json()
  if (!data.user) throw new Error('admin login failed: ' + JSON.stringify(data))
  admin.token = r.headers.get('set-cookie').split(';')[0]
  admin.user = data.user
}
await admin.connectWS()
await admin.waitFor('HELLO')
ok('вход под admin-аккаунтом (is_admin)', !!admin.user.is_admin && !alice.user.is_admin)
const cat = await admin.api('/badges')
ok('каталог бейджей', cat.badges.length > 50 && cat.badges.some(b => b.id === 'staff'))
const au = await admin.api('/admin/users?q=' + encodeURIComponent(bob.user.username))
ok('admin-список пользователей', au.users.some(u => u.id === bob.user.id))
await admin.api(`/admin/users/${bob.user.id}/badges`, { method: 'PUT', body: { badges: ['staff', 'bug_hunter_1'] } })
const bu = await bob.waitFor('USER_UPDATE', d => d.user.id === bob.user.id && d.user.badges?.includes('staff'))
ok('выдача бейджей + live-рассылка получателю', !!bu)
const bu2 = await alice.waitFor('USER_UPDATE', d => d.user.id === bob.user.id && d.user.badges?.includes('bug_hunter_1'))
ok('бейджи видны всем клиентам', !!bu2)
const profB = await alice.api(`/users/${bob.user.id}`)
ok('бейджи в профиле пользователя', JSON.stringify(profB.user.badges) === JSON.stringify(['staff', 'bug_hunter_1']))
let deniedB = false
try { await alice.api(`/admin/users/${bob.user.id}/badges`, { method: 'PUT', body: { badges: ['staff'] } }) } catch (e) { deniedB = e.message.includes('403') }
ok('не-админу выдача запрещена (403)', deniedB)
let badId = false
try { await admin.api(`/admin/users/${bob.user.id}/badges`, { method: 'PUT', body: { badges: ['nope'] } }) } catch (e) { badId = true }
ok('неизвестный id бейджа отклоняется', badId)
await admin.api(`/admin/users/${bob.user.id}/badges`, { method: 'PUT', body: { badges: [] } })
const bu3 = await bob.waitFor('ME_UPDATE', d => d.user.id === bob.user.id && d.user.badges.length === 0)
ok('снятие всех бейджей', !!bu3)

// ---------- moderation rights from badges ----------
const carol = new Client('carol_' + Date.now().toString(36))
await carol.login()
await carol.connectWS()
await carol.waitFor('HELLO')
let deniedS = false
try { await alice.api(`/mod/users/${bob.user.id}/suspend`, { method: 'POST', body: { hours: 1 } }) } catch (e) { deniedS = e.message.includes('403') }
ok('без бейджа модерация запрещена (403)', deniedS)
await admin.api(`/admin/users/${carol.user.id}/badges`, { method: 'PUT', body: { badges: ['staff'] } })
await carol.api(`/mod/users/${bob.user.id}/suspend`, { method: 'POST', body: { hours: 1 } })
const rs = await bob.waitFor('ACCOUNT_RESTRICTED', d => d.action === 'suspended' && d.until > Date.now())
ok('бейдж «Сотрудник» даёт право приостановки, цель получает событие', !!rs)
const loginBlocked = await fetch(BASE + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: bob.user.username, password: 'secret123' }) })
ok('приостановленный аккаунт не может войти (403)', loginBlocked.status === 403)
const apiBlocked = await fetch(BASE + '/api/state', { headers: { cookie: bob.token } })
ok('API приостановленного аккаунта закрыт (403)', apiBlocked.status === 403)
let deniedBan = false
try { await carol.api(`/mod/users/${admin.user.id}/ban`, { method: 'POST' }) } catch (e) { deniedBan = e.message.includes('403') }
ok('нельзя забанить администратора платформы', deniedBan)
await carol.api(`/mod/users/${bob.user.id}/pardon`, { method: 'POST' })
const rp = await bob.waitFor('ACCOUNT_RESTRICTED', d => d.action === 'none')
ok('снятие ограничения бейдж-модератором', !!rp)
const apiOk = await fetch(BASE + '/api/state', { headers: { cookie: bob.token } })
ok('после прощения API снова доступен', apiOk.status === 200)
await admin.api(`/admin/users/${carol.user.id}/badges`, { method: 'PUT', body: { badges: [] } })
let deniedAfter = false
try { await carol.api(`/mod/users/${bob.user.id}/suspend`, { method: 'POST', body: { hours: 1 } }) } catch (e) { deniedAfter = e.message.includes('403') }
ok('без бейджа права модерации исчезают', deniedAfter)

console.log(failures ? `\n${failures} FAILURES` : '\nALL TESTS PASSED')
process.exit(failures ? 1 : 0)
