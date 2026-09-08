import { get, all } from './db.js'

export const PERMISSIONS = new Set([
  'VIEW_CHANNEL','SEND_MESSAGES','MANAGE_MESSAGES','MANAGE_CHANNELS','MANAGE_SERVER',
  'MANAGE_ROLES','MANAGE_WEBHOOKS','MANAGE_EMOJIS','KICK_MEMBERS','BAN_MEMBERS',
  'MODERATE_MEMBERS','MENTION_EVERYONE','ATTACH_FILES','EMBED_LINKS','CONNECT',
  'SPEAK','MUTE_MEMBERS','DEAFEN_MEMBERS','MOVE_MEMBERS','STREAM','ADMINISTRATOR'
])

export function member(guildId, userId) {
  return get('SELECT * FROM guild_members WHERE guild_id=? AND user_id=?', [guildId, userId])
}

export function permissionsFor(guildId, userId) {
  const m = member(guildId, userId)
  if (!m) return new Set()
  if (m.role === 'owner') return new Set(['ADMINISTRATOR', ...PERMISSIONS])
  const roles = all(`SELECT r.permissions FROM guild_roles r JOIN guild_member_roles mr ON mr.role_id=r.id WHERE mr.guild_id=? AND mr.user_id=?`, [guildId, userId])
  const out = new Set()
  for (const row of roles) for (const p of String(row.permissions || '').split(',')) if (PERMISSIONS.has(p)) out.add(p)
  if (m.role === 'admin') out.add('ADMINISTRATOR')
  return out
}

export function hasPermission(guildId, userId, permission) {
  const p = permissionsFor(guildId, userId)
  return p.has('ADMINISTRATOR') || p.has(permission)
}

export function canUseChannel(guildId, userId, channelId, permission='VIEW_CHANNEL') {
  const m = member(guildId, userId)
  if (!m) return false
  if (m.role === 'owner' || m.role === 'admin') return true
  if (hasPermission(guildId, userId, permission)) {
    const roleIds = all('SELECT role_id FROM guild_member_roles WHERE guild_id=? AND user_id=?', [guildId,userId]).map(x=>x.role_id)
    const placeholders = roleIds.length ? roleIds.map(()=>'?').join(',') : "''"
    const rows = all(`SELECT allow_permissions,deny_permissions FROM channel_permission_overwrites WHERE channel_id=? AND (role_id IN (${placeholders}))`, [channelId, ...roleIds])
    let allowed = true
    for (const row of rows) {
      const denied = String(row.deny_permissions||'').split(',').includes(permission)
      const granted = String(row.allow_permissions||'').split(',').includes(permission)
      if (denied) allowed = false
      if (granted) allowed = true
    }
    return allowed
  }
  return false
}
