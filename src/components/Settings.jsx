import React, { useEffect, useRef, useState } from 'react'
import { setUI, setState, getState, displayName } from '../lib/store.js'
import { api } from '../lib/api.js'
import { wsSend } from '../lib/ws.js'
import { useStore } from '../lib/util.js'
import { voice } from '../lib/voice.js'
import { Avatar } from './Common.jsx'
import { AdminBadgesTab, UserBadges } from './Badges.jsx'
import { IconX, IconLogout, IconUser, IconShield, IconMic, IconPalette, IconBadge } from './Icons.jsx'
import ServerList from './ServerList.jsx'
import { avatarColor } from '../lib/util.js'

const NAV_SECTIONS = [
  { title: 'Мой аккаунт', items: [
    ['profile', 'Мой аккаунт', <IconUser size={16} />],
    ['auth', 'Безопасность', <IconShield size={16} />],
  ]},
  { title: 'Голос и видео', items: [
    ['voice', 'Голос и видео', <IconMic size={16} />],
  ]},
  { title: 'Приложение', items: [
    ['appearance', 'Внешний вид', <IconPalette size={16} />],
  ]},
]
const ADMIN_SECTION = { title: 'Администрирование', items: [
  ['badges', 'Выдача бейджей', <IconBadge size={16} />],
]}
const TITLES = { profile: 'Мой аккаунт', auth: 'Безопасность', voice: 'Голос и видео', appearance: 'Внешний вид', badges: 'Выдача бейджей' }
const BANNERS = ['#5865f2', '#eb459e', '#ed4245', '#f0b232', '#23a55a', '#1abc9c', '#3498db', '#9b59b6', '#e67e22', '#1e1f22']
const STATUSES = [['online', 'В сети'], ['idle', 'Не активен'], ['dnd', 'Не беспокоить'], ['invisible', 'Невидимка']]

function bannerBg(user) {
  return user?.banner_color
    ? `linear-gradient(135deg, ${user.banner_color}, ${user.banner_color}77)`
    : `linear-gradient(135deg, ${avatarColor(user?.id)}, #1e1f22)`
}

export default function Settings() {
  const s = useStore()
  const tab = s.ui.settingsTab || 'profile'
  const me = s.users[s.me.id] || s.me
  useEffect(() => {
    document.body.classList.toggle('theme-light', s.ui.theme === 'light')
    try { localStorage.setItem('dsh_theme', s.ui.theme) } catch {}
  }, [s.ui.theme])
  return (
    <div className="app">
      <ServerList />
      <div className="settings-wrap">
        <nav className="settings-nav">
          <div className="sn-card sn-click" title="Открыть профиль"
            onClick={() => setUI({ settingsOpen: false, modal: { type: 'profile', userId: me.id } })}>
            <div className="banner" style={{ background: bannerBg(me) }} />
            <div className="body">
              <Avatar user={me} size={48} showStatus />
              <div className="name">{displayName(me)}</div>
              <div className="uname">@{me.username}</div>
            </div>
          </div>
          {[...NAV_SECTIONS, ...(me.is_admin ? [ADMIN_SECTION] : [])].map(sec => (
            <React.Fragment key={sec.title}>
              <div className="sn-title">{sec.title}</div>
              {sec.items.map(([id, label, icon]) => (
                <div key={id} className={`sn-item ${tab === id ? 'active' : ''}`} onClick={() => setUI({ settingsTab: id })}>
                  {icon}<span>{label}</span>
                </div>
              ))}
            </React.Fragment>
          ))}
          <div className="sn-spacer" />
          <div className="sn-logout" onClick={async () => { await api('/logout', { method: 'POST' }); location.reload() }}>
            <IconLogout size={16} /> Выйти из аккаунта
          </div>
        </nav>
        <div className="settings-main">
          <button className="settings-close" title="Закрыть" onClick={() => setUI({ settingsOpen: false })}><IconX size={18} /></button>
          <div className={`settings-inner ${tab === 'badges' ? 'wide' : ''}`}>
            <div className="settings-title">{TITLES[tab]}</div>
            {tab === 'profile' && <ProfileTab me={me} />}
            {tab === 'auth' && <PrivacyTab me={me} />}
            {tab === 'voice' && <VoiceTab />}
            {tab === 'appearance' && <AppearanceTab />}
            {tab === 'badges' && me.is_admin && <AdminBadgesTab />}
          </div>
        </div>
      </div>
    </div>
  )
}

function Row({ label, desc, children }) {
  return (
    <div className="settings-row">
      <div style={{ minWidth: 0 }}>
        <div className="sr-label">{label}</div>
        {desc && <div className="sr-desc">{desc}</div>}
      </div>
      <div className="sr-control">{children}</div>
    </div>
  )
}

function ProfileTab({ me }) {
  const s = useStore()
  const [username, setUsername] = useState(me.username)
  const [displayNameV, setDisplayName] = useState(me.display_name || '')
  const [pronouns, setPronouns] = useState(me.pronouns || '')
  const [banner, setBanner] = useState(me.banner_color || '')
  const [bio, setBio] = useState(me.bio || '')
  const [avatarV, setAvatarV] = useState(me.avatar || '')
  const [msg, setMsg] = useState('')
  const fileRef = useRef(null)

  const eq = (a, b) => (a || '') === (b || '')
  const dirty =
    username !== me.username ||
    !eq(displayNameV, me.display_name) ||
    !eq(pronouns, me.pronouns) ||
    !eq(banner, me.banner_color) ||
    !eq(bio, me.bio) ||
    !eq(avatarV, me.avatar)

  const apply = async () => {
    const patch = {}
    if (username !== me.username) patch.username = username
    if (!eq(displayNameV, me.display_name)) patch.display_name = displayNameV
    if (!eq(pronouns, me.pronouns)) patch.pronouns = pronouns
    if (!eq(banner, me.banner_color)) patch.banner_color = banner
    if (!eq(bio, me.bio)) patch.bio = bio
    if (!eq(avatarV, me.avatar)) patch.avatar = avatarV || null
    try {
      const r = await api('/me', { method: 'PATCH', body: patch })
      const updated = r.user || { ...getState().me, ...patch }
      const st = getState()
      setState({
        me: { ...st.me, ...updated },
        users: { ...st.users, [updated.id]: { ...(st.users[updated.id] || st.me), ...updated } },
      })
      setMsg('✓ Сохранено'); setTimeout(() => setMsg(''), 2000)
    } catch (e) { setMsg('⚠ ' + e.message) }
  }
  const reset = () => {
    setUsername(me.username); setDisplayName(me.display_name || ''); setPronouns(me.pronouns || '')
    setBanner(me.banner_color || ''); setBio(me.bio || ''); setAvatarV(me.avatar || '')
    setMsg('')
  }
  const onAvatar = e => {
    const f = e.target.files?.[0]
    if (!f) return
    const img = new Image()
    const reader = new FileReader()
    reader.onload = () => {
      img.onload = () => {
        const size = 128
        const c = document.createElement('canvas')
        c.width = size; c.height = size
        const ctx = c.getContext('2d')
        const scale = Math.max(size / img.width, size / img.height)
        const w = img.width * scale, h = img.height * scale
        ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h)
        setAvatarV(c.toDataURL('image/png'))
      }
      img.src = reader.result
    }
    reader.readAsDataURL(f)
    e.target.value = ''
  }
  const curStatus = s.presences[me.id] || me.status
  const saveStatus = async status => {
    try {
      await api('/me', { method: 'PATCH', body: { status } })
      const st = getState()
      setState({
        me: { ...st.me, status },
        users: { ...st.users, [st.me.id]: { ...(st.users[st.me.id] || st.me), status } },
        presences: { ...st.presences, [st.me.id]: status },
      })
      wsSend('presence', { status })
    } catch {}
  }
  // live preview of how the profile will look — reflects the fields as you type, before Apply
  const previewUser = { ...me, display_name: displayNameV || undefined, avatar: avatarV || undefined }

  return (
    <>
      <div className="profile-card pf-preview">
        <div className="banner" style={{ background: bannerBg({ id: me.id, banner_color: banner || undefined }) }} />
        <div className="body">
          <div className="pc-top">
            <Avatar user={previewUser} size={76} showStatus />
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn primary" onClick={() => fileRef.current?.click()}>Сменить аватар</button>
              {avatarV && <button className="btn ghost" onClick={() => setAvatarV('')}>Удалить</button>}
            </div>
          </div>
          <div className="pc-name">{displayNameV || username || '—'}<UserBadges ids={me.badges} size={15} className="pc-badges" /></div>
          <div className="pc-user">@{username}{pronouns ? ` · ${pronouns}` : ''}</div>
          {bio && <div className="pc-bio">{bio}</div>}
          <div className="pc-user" style={{ marginTop: 6 }}>Зарегистрирован: {me.created_at ? new Date(me.created_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }) : '—'}</div>
          <div className="pf-hint">Так ваш профиль будет выглядеть после сохранения</div>
        </div>
      </div>
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={onAvatar} />

      <Row label="Отображаемое имя" desc="Видно всем. Может отличаться от имени пользователя.">
        <input className="sr-input" placeholder={me.username} value={displayNameV} maxLength={32} onChange={e => setDisplayName(e.target.value)} />
      </Row>

      <Row label="Имя пользователя" desc="Уникальное имя, по которому тебя можно найти и добавить.">
        <input className="sr-input" value={username} onChange={e => setUsername(e.target.value)} />
      </Row>

      <Row label="Местоимения" desc="Показываются в твоём профиле.">
        <input className="sr-input" placeholder="он/его, она/её, они…" value={pronouns} maxLength={30} onChange={e => setPronouns(e.target.value)} />
      </Row>

      <Row label="Цвет профиля" desc="Фон баннера в твоём профиле.">
        <div className="swatch-row">
          {BANNERS.map(c => (
            <button key={c} className={`swatch ${banner === c ? 'active' : ''}`} style={{ background: `linear-gradient(135deg, ${c}, ${c}77)` }}
              onClick={() => setBanner(c)} />
          ))}
          <button className="btn ghost small" onClick={() => setBanner('')}>Авто</button>
        </div>
      </Row>

      <Row label="Обо мне" desc="До 190 символов. Поддерживается обычный текст.">
        <div className="sr-col">
          <textarea className="sr-input" style={{ minHeight: 70, resize: 'vertical' }} value={bio} maxLength={190} onChange={e => setBio(e.target.value)} />
          <div className="bio-count">{bio.length}/190</div>
        </div>
      </Row>

      <Row label="Статус" desc="Друзья видят, чем ты занят.">
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {STATUSES.map(([id, label]) => (
            <button key={id} className={`btn small ${curStatus === id ? 'primary' : 'ghost'}`} onClick={() => saveStatus(id)}>{label}</button>
          ))}
        </div>
      </Row>

      {dirty && (
        <div className="save-bar">
          <span className="save-bar-text">У вас есть несохранённые изменения.</span>
          {msg && <span className={`save-bar-msg ${msg.startsWith('⚠') ? 'err' : ''}`}>{msg}</span>}
          <div className="save-bar-btns">
            <button className="btn ghost" onClick={reset}>Сбросить</button>
            <button className="btn green" onClick={apply}>Применить</button>
          </div>
        </div>
      )}
    </>
  )
}

function PrivacyTab() {
  const [cur, setCur] = useState('')
  const [nw, setNw] = useState('')
  const [msg, setMsg] = useState('')
  const change = async () => {
    try {
      await api('/me/password', { body: { current: cur, next: nw } })
      setMsg('✓ Пароль изменён'); setCur(''); setNw('')
    } catch (e) { setMsg('⚠ ' + e.message) }
  }
  return (
    <>
      <Row label="Текущий пароль" desc="Для смены пароля нужно подтвердить текущий.">
        <input className="sr-input" type="password" value={cur} onChange={e => setCur(e.target.value)} />
      </Row>
      <Row label="Новый пароль" desc="Минимум 6 символов.">
        <input className="sr-input" type="password" value={nw} onChange={e => setNw(e.target.value)} />
      </Row>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 0' }}>
        <span style={{ color: msg.startsWith('⚠') ? 'var(--red)' : 'var(--green)', fontSize: 14, flex: 1 }}>{msg}</span>
        <button className="btn primary" disabled={!cur || !nw} onClick={change}>Изменить пароль</button>
      </div>
    </>
  )
}

function VoiceTab() {
  const [inDevices, setInDevices] = useState([])
  const [outDevices, setOutDevices] = useState([])
  const [deviceId, setDeviceId] = useState(localStorage.getItem('dsh_mic') || '')
  const [spkId, setSpkId] = useState(voice.outputDevice || '')
  const [volIn, setVolIn] = useState(Math.round(voice.inputVolume * 100))
  const [volOut, setVolOut] = useState(Math.round(voice.outputVolume * 100))
  const [profile, setProfile] = useState(voice.voiceProfile || 'isolation')
  const [ptt, setPtt] = useState(voice.ptt)
  const [testing, setTesting] = useState(false)
  const [level, setLevel] = useState(0)
  const cleanupRef = useRef(null)
  useEffect(() => {
    navigator.mediaDevices?.enumerateDevices?.().then(ds => {
      setInDevices(ds.filter(d => d.kind === 'audioinput'))
      setOutDevices(ds.filter(d => d.kind === 'audiooutput'))
    }).catch(() => {})
    return () => cleanupRef.current && cleanupRef.current()
  }, [])
  const startTest = async () => {
    if (testing) { // stop
      cleanupRef.current && cleanupRef.current()
      cleanupRef.current = null
      setTesting(false)
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: deviceId ? { deviceId: { exact: deviceId } } : true })
      const AC = window.AudioContext || window.webkitAudioContext
      const ctx = new AC()
      const src = ctx.createMediaStreamSource(stream)
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 512
      src.connect(analyser)
      const data = new Uint8Array(analyser.frequencyBinCount)
      let raf
      const loop = () => {
        analyser.getByteFrequencyData(data)
        let sum = 0
        for (let i = 0; i < data.length; i++) sum += data[i] * data[i]
        setLevel(Math.min(1, Math.sqrt(sum / data.length) / 90))
        raf = requestAnimationFrame(loop)
      }
      loop()
      setTesting(true)
      cleanupRef.current = () => { cancelAnimationFrame(raf); stream.getTracks().forEach(t => t.stop()); ctx.close().catch(() => {}) }
    } catch { /* permission denied */ }
  }
  return (
    <>
      <Row label="Микрофон" desc="Устройство ввода, используемое в голосовых каналах.">
        <select className="sr-input" value={deviceId} onChange={e => { setDeviceId(e.target.value); localStorage.setItem('dsh_mic', e.target.value) }}>
          <option value="">По умолчанию</option>
          {inDevices.map((d, i) => <option key={i} value={d.deviceId}>{d.label || `Микрофон ${i + 1}`}</option>)}
        </select>
      </Row>
      <Row label="Динамик" desc="Устройство вывода — через него слышен голос других.">
        <select className="sr-input" value={spkId} onChange={e => { setSpkId(e.target.value); voice.setOutputDevice(e.target.value) }}>
          <option value="">По умолчанию</option>
          {outDevices.map((d, i) => <option key={i} value={d.deviceId}>{d.label || `Динамик ${i + 1}`}</option>)}
        </select>
      </Row>
      <Row label="Громкость микрофона" desc={`Как громко вас слышат другие · ${volIn}%`}>
        <input type="range" className="vol-range" min="0" max="200" step="1" value={volIn}
          onChange={e => { setVolIn(+e.target.value); voice.inputVolume = +e.target.value / 100 }} />
      </Row>
      <Row label="Громкость вывода" desc={`Громкость входящего голоса · ${volOut}%`}>
        <input type="range" className="vol-range" min="0" max="100" step="1" value={volOut}
          onChange={e => { setVolOut(+e.target.value); voice.outputVolume = +e.target.value / 100 }} />
      </Row>
      <Row label="Проверка микрофона" desc="Нажмите «Проверить» и поговорите — индикатор должен реагировать.">
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', width: '100%' }}>
          <div className="meter" style={{ flex: 1 }}>
            <div style={{ width: `${level * 100}%`, background: level > 0.7 ? 'var(--red)' : 'var(--green)' }} />
          </div>
          <button className="btn primary" onClick={startTest}>{testing ? 'Остановить' : 'Проверить'}</button>
        </div>
      </Row>
      <div className="settings-row vr-block">
        <div className="sr-label">Профиль ввода</div>
        <div className="sr-desc">Обрабатываем ли звук перед тем, как отправить его другим.</div>
        <div className="vr-radios">
          {[
            ['isolation', 'Изоляция голоса', 'Убирает фоновый шум и сторонние звуки — рекомендуется для большинства.'],
            ['studio', 'Студия', 'Минимальная обработка: для музыкальных станций и подкастов.'],
            ['custom', 'Пользовательский', 'Обработка полностью отключена — звук «как есть».'],
          ].map(([id, title, desc]) => (
            <label key={id} className={`vr-radio ${profile === id ? 'active' : ''}`}>
              <input type="radio" name="vprofile" checked={profile === id}
                onChange={() => { setProfile(id); voice.voiceProfile = id }} />
              <span className="vr-title">{title}</span>
              <span className="vr-desc">{desc}</span>
            </label>
          ))}
        </div>
      </div>
      <Row label="Режим рации" desc="Голос отправляется только пока вы удерживаете клавишу V.">
        <button type="button" className={`toggle ${ptt ? 'on' : ''}`} title={ptt ? 'Выключить режим рации' : 'Включить режим рации'}
          onClick={() => { const v = !ptt; setPtt(v); voice.ptt = v }}><span /></button>
      </Row>
      <div className="sr-help">
        💡 Настройки применяются с следующего подключения к голосовому каналу (кроме громкостей — они работают сразу).
      </div>
    </>
  )
}

function AppearanceTab() {
  const s = useStore()
  const light = s.ui.theme === 'light'
  return (
    <>
      <Row label="Тема" desc="Выбери, в каком стиле отображается приложение.">
        <div className="theme-cards">
          <div className={`theme-card ${!light ? 'active' : ''}`} onClick={() => setUI({ theme: 'dark' })}>
            <div className="tc-preview" style={{ background: '#313338' }}>
              <div style={{ width: '35%', height: '100%', background: '#2b2d31', display: 'inline-block', verticalAlign: 'top' }} />
              <div style={{ width: '60%', height: '100%', background: '#313338', display: 'inline-block', padding: 6 }}>
                <div style={{ height: 6, background: '#4e5058', borderRadius: 3, marginBottom: 4, width: '70%' }} />
                <div style={{ height: 6, background: '#404249', borderRadius: 3, width: '90%' }} />
              </div>
            </div>
            <div className="tc-label">🌑 Тёмная</div>
          </div>
          <div className={`theme-card ${light ? 'active' : ''}`} onClick={() => setUI({ theme: 'light' })}>
            <div className="tc-preview" style={{ background: '#fff' }}>
              <div style={{ width: '35%', height: '100%', background: '#f2f3f5', display: 'inline-block', verticalAlign: 'top' }} />
              <div style={{ width: '60%', height: '100%', background: '#fff', display: 'inline-block', padding: 6 }}>
                <div style={{ height: 6, background: '#dbdee1', borderRadius: 3, marginBottom: 4, width: '70%' }} />
                <div style={{ height: 6, background: '#e9eef2', borderRadius: 3, width: '90%' }} />
              </div>
            </div>
            <div className="tc-label">☀️ Светлая</div>
          </div>
        </div>
      </Row>
      <Row label="Размер шрифта" desc="Базовый размер текста в приложении.">
        <select className="sr-input" defaultValue="15" onChange={e => { document.documentElement.style.fontSize = e.target.value + 'px'; localStorage.setItem('dsh_font', e.target.value) }}>
          <option value="13">13 px</option>
          <option value="15">15 px (обычный)</option>
          <option value="17">17 px</option>
          <option value="19">19 px</option>
        </select>
      </Row>
    </>
  )
}
