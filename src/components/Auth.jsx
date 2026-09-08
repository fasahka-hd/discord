import React, { useState } from 'react'
import { api } from '../lib/api.js'
import { DiscordLogo, IconEye, IconEyeOff } from './Icons.jsx'

export default function Auth({ onAuthed }) {
  const [mode, setMode] = useState('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async e => {
    e.preventDefault()
    setErr(''); setBusy(true)
    try {
      await api(mode === 'login' ? '/login' : '/register', { body: { username, password } })
      await onAuthed()
    } catch (ex) {
      setErr(ex.message)
    } finally { setBusy(false) }
  }

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-logo"><DiscordLogo size={52} /></div>
        <h1>{mode === 'login' ? 'С возвращением!' : 'Создать аккаунт'}</h1>
        <p className="sub">{mode === 'login' ? 'Мы очень рады видеть вас снова!' : 'Надеюсь, вам это понравится!'}</p>
        <form onSubmit={submit}>
          <div className="field-label">Имя пользователя</div>
          <input className="field-input" value={username} onChange={e => setUsername(e.target.value)} autoFocus autoComplete="username" />
          <div className="field-label">Пароль</div>
          <div style={{ position: 'relative' }}>
            <input className="field-input" style={{ paddingRight: 40 }} type={showPw ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
            <button type="button" className="icon-btn" style={{ position: 'absolute', right: 4, top: 4 }} onClick={() => setShowPw(!showPw)}>
              {showPw ? <IconEyeOff size={18} /> : <IconEye size={18} />}
            </button>
          </div>
          {err && <div className="auth-error">{err}</div>}
          <div style={{ marginTop: 16 }}>
            <button className="btn primary" style={{ width: '100%' }} disabled={busy}>
              {busy ? 'Подождите…' : mode === 'login' ? 'Войти' : 'Продолжить'}
            </button>
          </div>
        </form>
        <div className="auth-switch">
          {mode === 'login'
            ? <>Нужен аккаунт? <a onClick={() => { setMode('register'); setErr('') }}>Зарегистрироваться</a></>
            : <>Уже есть аккаунт? <a onClick={() => { setMode('login'); setErr('') }}>Войти</a></>}
        </div>
        {mode === 'login' && <div className="auth-switch" style={{ textAlign: 'center', marginTop: 12 }}>Демо-аккаунт: <b>admin</b> / <b>admin123</b></div>}
      </div>
    </div>
  )
}
