import React, { useEffect, useCallback, useState } from 'react'
import { api } from './lib/api.js'
import { getState, setState, setUI } from './lib/store.js'
import { connectWS, setRefreshHandler } from './lib/ws.js'
import { useStore } from './lib/util.js'
import Auth from './components/Auth.jsx'
import Layout from './components/Layout.jsx'
import AdvancedSettings from './components/AdvancedSettings.jsx'
import ServerSettings from './components/ServerSettings.jsx'

export default function App() {
  const s = useStore()
  const [booting, setBooting] = useState(true)
  const [authed, setAuthed] = useState(false)

  const loadState = useCallback(async () => {
    const st = await api('/state')
    const users = {}
    for (const u of st.users) users[u.id] = u
    setState({
      me: st.me, users,
      friends: st.friends, incoming: st.incoming, outgoing: st.outgoing,
      dms: st.dmChannels, guilds: st.guilds, reads: st.reads,
      voice: st.voice, presences: st.presences, ready: true,
    })
  }, [])

  useEffect(() => {
    setRefreshHandler(() => { loadState().catch(() => {}) })
    api('/me').then(async () => {
      await loadState()
      connectWS()
      setAuthed(true)
    }).catch(() => {}).finally(() => setBooting(false))
  }, [loadState])

  const onLoggedIn = useCallback(async () => {
    await loadState()
    connectWS()
    setAuthed(true)
  }, [loadState])

  const restriction = s.restriction
  if (restriction) return <RestrictionScreen r={restriction} />
  if (booting) return <div className="app-loading"><div className="spinner" /></div>
  if (!authed) return <Auth onAuthed={onLoggedIn} />
  if (s.ui.settingsOpen) return <AdvancedSettings />
  return <><Layout />{s.ui.modal?.type === 'guild-settings' && <ServerSettings guildId={s.ui.modal.guildId} onClose={() => setUI({ modal: null })} />}</>
}

function RestrictionScreen({ r }) {
  const banned = r.action === 'banned'
  const logout = async () => { try { await api('/logout', { method: 'POST' }) } catch {} location.reload() }
  return (
    <div className="app-loading">
      <div className={`restrict-card ${banned ? 'banned' : 'suspended'}`}>
        <div className="restrict-title">{banned ? 'Учётная запись заблокирована' : 'Учётная запись приостановлена'}</div>
        <div className="restrict-text">
          {banned
            ? 'Ваш аккаунт заблокирован модерацией платформы. Обратитесь к администратору для обжалования.'
            : <>Ваш аккаунт временно приостановлен{r.until ? <> до <b>{new Date(r.until).toLocaleString('ru-RU')}</b></> : ''}. Вы сможете вернуться, когда срок ограничения истечёт.</>}
        </div>
        <button className="btn primary" style={{ marginTop: 18 }} onClick={logout}>Выйти</button>
      </div>
    </div>
  )
}
