// Custom status (text + activity icon) round-trip test.
const BASE = 'http://localhost:3001'
let failures = 0
const ok = (n, c) => { console.log((c ? '✓' : '✗') + ' ' + n); if (!c) failures++ }

class C {
  constructor(u) { this.u = u }
  async login() {
    let r = await fetch(BASE + '/api/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: this.u, password: 'secret123' }) })
    if (r.status === 409) r = await fetch(BASE + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: this.u, password: 'secret123' }) })
    const d = await r.json()
    this.token = r.headers.get('set-cookie').split(';')[0]
    this.user = d.user
  }
  async api(p, o = {}) {
    const r = await fetch(BASE + '/api' + p, { method: o.method || (o.body ? 'POST' : 'GET'), headers: { 'Content-Type': 'application/json', cookie: this.token }, body: o.body ? JSON.stringify(o.body) : undefined })
    const d = await r.json().catch(() => ({}))
    return { status: r.status, data: d }
  }
}

const a = new C('wsuser_c_' + Date.now().toString(36)); await a.login()
let r = await a.api('/me', { method: 'PATCH', body: { status_icon: 'zzz' } })
ok('некорректная иконка → 400', r.status === 400)
r = await a.api('/me', { method: 'PATCH', body: { custom_status: 'в деле 🚀', status_icon: '🎮' } })
ok('PATCH с иконкой → 200 + поле в ответе', r.status === 200 && r.data.user.status_icon === '🎮')
const st = await a.api('/state')
const me = st.data.users.find(u => u.id === a.user.id)
ok('/state отдаёт custom_status + иконку', me.custom_status === 'в деле 🚀' && me.status_icon === '🎮')
r = await a.api('/me', { method: 'PATCH', body: { custom_status: '', status_icon: '' } })
ok('сброс статуса', r.status === 200)
console.log(failures ? failures + ' FAIL' : 'ALL PASSED')
process.exit(failures ? 1 : 0)
