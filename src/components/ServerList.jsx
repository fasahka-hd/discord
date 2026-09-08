import React from 'react'
import { setUI } from '../lib/store.js'
import { api } from '../lib/api.js'
import { useStore } from '../lib/util.js'
import { Tooltip, openMenu, confirmDialog } from './Common.jsx'
import { DiscordLogo, IconPlus, IconUserAdd } from './Icons.jsx'

export default function ServerList() {
  const s = useStore()
  const totalUnreadHome = s.dms.reduce((n, c) => n + (c.unread || 0), 0) + (s.incoming.length ? 1 : 0)
  return (
    <nav className="server-list">
      <Tooltip tip="Личные сообщения" side="right">
        <div className={`server-icon ${s.ui.guildId === '@home' ? 'active' : ''} ${totalUnreadHome && s.ui.guildId !== '@home' ? 'unread' : ''}`}
          onClick={() => setUI({ guildId: '@home', channelId: null, settingsOpen: false })}>
          <div className="server-pill home"><DiscordLogo size={28} /></div>
        </div>
      </Tooltip>
      {s.guilds.length > 0 && <div className="server-divider" />}
      {s.guilds.map(g => {
        const unread = g.channels.some(c => c.unread > 0)
        return (
          <Tooltip key={g.id} tip={g.name} side="right">
            <div
              className={`server-icon ${s.ui.guildId === g.id ? 'active' : ''} ${unread && s.ui.guildId !== g.id ? 'unread' : ''}`}
              onClick={() => setUI({ guildId: g.id, channelId: g.channels.find(c => c.type === 'text')?.id || null, settingsOpen: false })}
              onContextMenu={e => openMenu(e, [
                { label: 'Пригласить людей', icon: <IconUserAdd size={16} />, onClick: () => setUI({ modal: { type: 'invite', guildId: g.id } }) },
                { label: 'Настройки сервера', icon: <IconPlus size={16} />, onClick: () => setUI({ modal: { type: 'guild-settings', guildId: g.id } }) },
                { sep: true },
                { label: 'Выйти с сервера', danger: true, onClick: () => leaveGuild(g) },
              ])}
            >
              <div className="server-pill" style={{ background: g.icon_color }}>{abbr(g.name)}</div>
            </div>
          </Tooltip>
        )
      })}
      <Tooltip tip="Создать сервер" side="right">
        <div className="server-icon" onClick={() => setUI({ modal: { type: 'create-guild' } })}>
          <div className="server-pill add"><IconPlus size={24} /></div>
        </div>
      </Tooltip>
      <Tooltip tip="Присоединиться к серверу" side="right">
        <div className="server-icon" onClick={() => setUI({ modal: { type: 'join-guild' } })}>
          <div className="server-pill add" style={{ color: 'var(--brand)' }}><IconUserAdd size={22} /></div>
        </div>
      </Tooltip>
    </nav>
  )
}
function abbr(name) {
  const words = name.trim().split(/\s+/)
  if (words.length > 1) return (words[0][0] + words[1][0]).toUpperCase()
  return name.slice(0, 2).toUpperCase()
}
export function leaveGuild(g) {
  confirmDialog({
    title: `Выйти с «${g.name}»?`,
    body: 'Вы действительно хотите выйти с этого сервера? Вас нужно будет пригласить снова, чтобы вернуться.',
    okLabel: 'Выйти',
    onOk: async () => { try { await api(`/guilds/${g.id}/leave`, { method: 'POST' }); setUI({ guildId: '@home', channelId: null }) } catch (e) { alert(e.message) } },
  })
}
