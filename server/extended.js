import express from 'express'
import { get, all, run, uid, now } from './db.js'
import { authMiddleware, httpError } from './auth.js'
import { sendToUsers } from './hub.js'

export const extendedRouter = express.Router()

const PERMISSIONS = [
  'VIEW_CHANNEL','SEND_MESSAGES','MANAGE_MESSAGES','MANAGE_CHANNELS','MANAGE_SERVER',
  'MANAGE_ROLES','MANAGE_WEBHOOKS','MANAGE_EMOJIS','KICK_MEMBERS','BAN_MEMBERS',
  'MODERATE_MEMBERS','MENTION_EVERYONE','ATTACH_FILES','EMBED_LINKS','CONNECT',
  'SPEAK','MUTE_MEMBERS','DEAFEN_MEMBERS','MOVE_MEMBERS','STREAM','ADMINISTRATOR'
]
const DEFAULT_PERMISSIONS = 'VIEW_CHANNEL,SEND_MESSAGES,ATTACH_FILES,EMBED_LINKS,CONNECT,SPEAK'

function wrap(fn) { return (req,res,next) => { try { const r = fn(req,res,next); if (r && typeof r.catch === 'function') return r.catch(next); return r } catch(e) { return next(e) } } }
function member(guildId, userId) { return get('SELECT * FROM guild_members WHERE guild_id = ? AND user_id = ?', [guildId,userId]) }
function role(guildId, userId) { return member(guildId,userId)?.role || null }
function requireGuild(guildId) {
  const g = get('SELECT * FROM guilds WHERE id = ?', [guildId])
  if (!g) throw httpError(404,'Сервер не найден')
  return g
}
function requireManager(guildId, userId) {
  const r = role(guildId,userId)
  if (!['owner','admin'].includes(r)) throw httpError(403,'Недостаточно прав')
  return r
}
function audit(guildId, actorId, action, targetId=null, metadata={}) {
  run('INSERT INTO audit_logs (id,guild_id,actor_id,action,target_id,metadata,created_at) VALUES (?,?,?,?,?,?,?)', [uid(),guildId,actorId,action,targetId,JSON.stringify(metadata),now()])
}
function parsePerms(value) {
  const input = Array.isArray(value) ? value : String(value || '').split(',')
  return [...new Set(input.map(String).map(x=>x.trim().toUpperCase()).filter(x=>PERMISSIONS.includes(x)))]
}


extendedRouter.get('/blocks', authMiddleware, wrap((req,res) => {
  const rows = all(`SELECT u.* FROM blocks b JOIN users u ON u.id=b.blocked_user_id WHERE b.user_id=? ORDER BY b.created_at DESC`, req.user.id)
  res.json({ users: rows })
}))
extendedRouter.post('/blocks/:userId', authMiddleware, wrap((req,res) => {
  if (req.params.userId === req.user.id) throw httpError(400,'Нельзя заблокировать себя')
  if (!get('SELECT id FROM users WHERE id=?', req.params.userId)) throw httpError(404,'Пользователь не найден')
  run('INSERT OR IGNORE INTO blocks (user_id,blocked_user_id,created_at) VALUES (?,?,?)',[req.user.id,req.params.userId,now()])
  run('DELETE FROM friend_requests WHERE (from_user=? AND to_user=?) OR (from_user=? AND to_user=?)',[req.user.id,req.params.userId,req.params.userId,req.user.id])
  run('DELETE FROM friendships WHERE (user_id=? AND friend_id=?) OR (user_id=? AND friend_id=?)',[req.user.id,req.params.userId,req.params.userId,req.user.id])
  sendToUsers([req.user.id,req.params.userId],{t:'BLOCK_UPDATE',d:{user_id:req.user.id,blocked_user_id:req.params.userId}})
  res.json({ok:true})
}))
extendedRouter.delete('/blocks/:userId', authMiddleware, wrap((req,res) => {
  run('DELETE FROM blocks WHERE user_id=? AND blocked_user_id=?',[req.user.id,req.params.userId])
  res.json({ok:true})
}))


extendedRouter.get('/guilds/:id/roles', authMiddleware, wrap((req,res) => {
  requireGuild(req.params.id)
  if (!member(req.params.id,req.user.id)) throw httpError(403,'Нет доступа')
  res.json({roles: all('SELECT * FROM guild_roles WHERE guild_id=? ORDER BY position DESC, created_at',[req.params.id]).map(r=>({...r,permissions:parsePerms(r.permissions),mentionable:!!r.mentionable}))})
}))
extendedRouter.post('/guilds/:id/roles', authMiddleware, wrap((req,res) => {
  const g=requireGuild(req.params.id); requireManager(g.id,req.user.id)
  const name=String(req.body.name||'').trim().slice(0,100)
  if(name.length<1) throw httpError(400,'Название роли обязательно')
  if(get('SELECT id FROM guild_roles WHERE guild_id=? AND name=?',[g.id,name])) throw httpError(409,'Такая роль уже существует')
  const perms=parsePerms(req.body.permissions || DEFAULT_PERMISSIONS)
  const max=get('SELECT COALESCE(MAX(position),0) p FROM guild_roles WHERE guild_id=?',[g.id]).p
  const id=uid()
  run('INSERT INTO guild_roles (id,guild_id,name,color,permissions,position,mentionable,created_at) VALUES (?,?,?,?,?,?,?,?)',[id,g.id,name,String(req.body.color||'').slice(0,20)||null,perms.join(','),max+1,req.body.mentionable?1:0,now()])
  audit(g.id,req.user.id,'ROLE_CREATE',id,{name})
  res.json({role:{...get('SELECT * FROM guild_roles WHERE id=?',id),permissions:perms,mentionable:!!req.body.mentionable}})
}))
extendedRouter.patch('/guilds/:id/roles/:roleId', authMiddleware, wrap((req,res) => {
  const g=requireGuild(req.params.id); requireManager(g.id,req.user.id)
  const r=get('SELECT * FROM guild_roles WHERE id=? AND guild_id=?',[req.params.roleId,g.id])
  if(!r) throw httpError(404,'Роль не найдена')
  if(req.body.name!==undefined){const n=String(req.body.name).trim().slice(0,100);if(!n)throw httpError(400,'Название роли обязательно');run('UPDATE guild_roles SET name=? WHERE id=?',[n,r.id])}
  if(req.body.color!==undefined)run('UPDATE guild_roles SET color=? WHERE id=?',[String(req.body.color).slice(0,20)||null,r.id])
  if(req.body.permissions!==undefined)run('UPDATE guild_roles SET permissions=? WHERE id=?',[parsePerms(req.body.permissions).join(','),r.id])
  if(req.body.position!==undefined)run('UPDATE guild_roles SET position=? WHERE id=?',[Math.max(0,Math.min(10000,Number(req.body.position)||0)),r.id])
  if(req.body.mentionable!==undefined)run('UPDATE guild_roles SET mentionable=? WHERE id=?',[req.body.mentionable?1:0,r.id])
  audit(g.id,req.user.id,'ROLE_UPDATE',r.id,req.body)
  res.json({role:get('SELECT * FROM guild_roles WHERE id=?',r.id)})
}))
extendedRouter.delete('/guilds/:id/roles/:roleId', authMiddleware, wrap((req,res) => {
  const g=requireGuild(req.params.id); requireManager(g.id,req.user.id)
  const r=get('SELECT * FROM guild_roles WHERE id=? AND guild_id=?',[req.params.roleId,g.id])
  if(!r) throw httpError(404,'Роль не найдена')
  run('DELETE FROM guild_member_roles WHERE guild_id=? AND role_id=?',[g.id,r.id])
  run('DELETE FROM channel_permission_overwrites WHERE role_id=?',[r.id])
  run('DELETE FROM guild_roles WHERE id=?',[r.id])
  audit(g.id,req.user.id,'ROLE_DELETE',r.id,{name:r.name})
  res.json({ok:true})
}))
extendedRouter.put('/guilds/:id/members/:userId/roles/:roleId', authMiddleware, wrap((req,res) => {
  const g=requireGuild(req.params.id); requireManager(g.id,req.user.id)
  if(!member(g.id,req.params.userId)) throw httpError(404,'Участник не найден')
  if(!get('SELECT id FROM guild_roles WHERE id=? AND guild_id=?',[req.params.roleId,g.id])) throw httpError(404,'Роль не найдена')
  run('INSERT OR IGNORE INTO guild_member_roles (guild_id,user_id,role_id) VALUES (?,?,?)',[g.id,req.params.userId,req.params.roleId])
  audit(g.id,req.user.id,'MEMBER_ROLE_ADD',req.params.userId,{role_id:req.params.roleId})
  res.json({ok:true})
}))
extendedRouter.delete('/guilds/:id/members/:userId/roles/:roleId', authMiddleware, wrap((req,res) => {
  const g=requireGuild(req.params.id); requireManager(g.id,req.user.id)
  run('DELETE FROM guild_member_roles WHERE guild_id=? AND user_id=? AND role_id=?',[g.id,req.params.userId,req.params.roleId])
  audit(g.id,req.user.id,'MEMBER_ROLE_REMOVE',req.params.userId,{role_id:req.params.roleId})
  res.json({ok:true})
}))


extendedRouter.get('/channels/:id/permissions', authMiddleware, wrap((req,res) => {
  const ch=get('SELECT * FROM channels WHERE id=?',req.params.id)
  if(!ch||!ch.guild_id||!member(ch.guild_id,req.user.id))throw httpError(404,'Канал не найден')
  const rows=all('SELECT * FROM channel_permission_overwrites WHERE channel_id=?',[ch.id]).map(x=>({...x,allow_permissions:parsePerms(x.allow_permissions),deny_permissions:parsePerms(x.deny_permissions)}))
  res.json({overwrites:rows})
}))
extendedRouter.put('/channels/:id/permissions/:roleId', authMiddleware, wrap((req,res) => {
  const ch=get('SELECT * FROM channels WHERE id=?',req.params.id)
  if(!ch||!ch.guild_id)throw httpError(404,'Канал не найден');requireManager(ch.guild_id,req.user.id)
  if(!get('SELECT id FROM guild_roles WHERE id=? AND guild_id=?',[req.params.roleId,ch.guild_id]))throw httpError(404,'Роль не найдена')
  const allow=parsePerms(req.body.allow_permissions),deny=parsePerms(req.body.deny_permissions)
  run('INSERT OR REPLACE INTO channel_permission_overwrites (channel_id,role_id,allow_permissions,deny_permissions) VALUES (?,?,?,?)',[ch.id,req.params.roleId,allow.join(','),deny.join(',')])
  audit(ch.guild_id,req.user.id,'CHANNEL_PERMISSION_UPDATE',ch.id,{role_id:req.params.roleId,allow,deny})
  res.json({ok:true,allow_permissions:allow,deny_permissions:deny})
}))
extendedRouter.delete('/channels/:id/permissions/:roleId', authMiddleware, wrap((req,res) => {
  const ch=get('SELECT * FROM channels WHERE id=?',req.params.id)
  if(!ch||!ch.guild_id)throw httpError(404,'Канал не найден');requireManager(ch.guild_id,req.user.id)
  run('DELETE FROM channel_permission_overwrites WHERE channel_id=? AND role_id=?',[ch.id,req.params.roleId])
  res.json({ok:true})
}))
extendedRouter.patch('/channels/:id/settings', authMiddleware, wrap((req,res) => {
  const ch=get('SELECT * FROM channels WHERE id=?',req.params.id)
  if(!ch||!ch.guild_id)throw httpError(404,'Канал не найден');requireManager(ch.guild_id,req.user.id)
  const updates=[];const vals=[]
  if(req.body.topic!==undefined){updates.push('topic=?');vals.push(String(req.body.topic).slice(0,1024))}
  if(req.body.slowmode_seconds!==undefined){updates.push('slowmode_seconds=?');vals.push(Math.max(0,Math.min(21600,Number(req.body.slowmode_seconds)||0)))}
  if(req.body.nsfw!==undefined){updates.push('nsfw=?');vals.push(req.body.nsfw?1:0)}
  if(req.body.bitrate!==undefined&&ch.type==='voice'){updates.push('bitrate=?');vals.push(Math.max(8000,Math.min(384000,Number(req.body.bitrate)||64000)))}
  if(req.body.user_limit!==undefined&&ch.type==='voice'){updates.push('user_limit=?');vals.push(Math.max(0,Math.min(99,Number(req.body.user_limit)||0)))}
  if(req.body.category_id!==undefined){updates.push('category_id=?');vals.push(req.body.category_id||null)}
  if(updates.length)run(`UPDATE channels SET ${updates.join(',')} WHERE id=?`,[...vals,ch.id])
  audit(ch.guild_id,req.user.id,'CHANNEL_SETTINGS_UPDATE',ch.id,req.body)
  res.json({channel:get('SELECT * FROM channels WHERE id=?',ch.id)})
}))


extendedRouter.post('/guilds/:id/invites', authMiddleware, wrap((req,res) => {
  const g=requireGuild(req.params.id)
  if(!member(g.id,req.user.id))throw httpError(403,'Нет доступа')
  const code=uid().replaceAll('-','').slice(0,10)
  const max=Math.max(0,Math.min(100000,Number(req.body.max_uses)||0))
  const expires=Number(req.body.expires_at)||null
  run('INSERT INTO invites (code,guild_id,creator_id,max_uses,uses,expires_at,created_at) VALUES (?,?,?,?,?,?,?)',[code,g.id,req.user.id,max,0,expires,now()])
  audit(g.id,req.user.id,'INVITE_CREATE',code,{max_uses:max,expires_at:expires})
  res.json({invite:{code,guild_id:g.id,max_uses:max,uses:0,expires_at:expires}})
}))
extendedRouter.get('/guilds/:id/invites', authMiddleware, wrap((req,res) => {
  const g=requireGuild(req.params.id);requireManager(g.id,req.user.id)
  res.json({invites:all('SELECT * FROM invites WHERE guild_id=? ORDER BY created_at DESC',[g.id])})
}))
extendedRouter.delete('/guilds/:id/invites/:code', authMiddleware, wrap((req,res) => {
  const g=requireGuild(req.params.id);requireManager(g.id,req.user.id)
  run('DELETE FROM invites WHERE code=? AND guild_id=?',[req.params.code,g.id]);res.json({ok:true})
}))


extendedRouter.get('/guilds/:id/bans', authMiddleware, wrap((req,res) => {
  const g=requireGuild(req.params.id);requireManager(g.id,req.user.id)
  res.json({bans:all(`SELECT b.*,u.username,u.display_name,u.avatar FROM guild_bans b JOIN users u ON u.id=b.user_id WHERE b.guild_id=? ORDER BY b.created_at DESC`,g.id)})
}))
extendedRouter.put('/guilds/:id/bans/:userId', authMiddleware, wrap((req,res) => {
  const g=requireGuild(req.params.id);requireManager(g.id,req.user.id)
  if(req.params.userId===g.owner_id)throw httpError(400,'Нельзя заблокировать владельца')
  if(!get('SELECT id FROM users WHERE id=?',req.params.userId))throw httpError(404,'Пользователь не найден')
  run('INSERT OR REPLACE INTO guild_bans (guild_id,user_id,moderator_id,reason,created_at) VALUES (?,?,?,?,?)',[g.id,req.params.userId,req.user.id,String(req.body.reason||'').slice(0,500),now()])
  run('DELETE FROM guild_members WHERE guild_id=? AND user_id=?',[g.id,req.params.userId])
  audit(g.id,req.user.id,'MEMBER_BAN',req.params.userId,{reason:String(req.body.reason||'').slice(0,500)})
  sendToUsers([req.params.userId],{t:'GUILD_REMOVE',d:{guild_id:g.id}})
  res.json({ok:true})
}))
extendedRouter.delete('/guilds/:id/bans/:userId', authMiddleware, wrap((req,res) => {
  const g=requireGuild(req.params.id);requireManager(g.id,req.user.id)
  run('DELETE FROM guild_bans WHERE guild_id=? AND user_id=?',[g.id,req.params.userId]);audit(g.id,req.user.id,'MEMBER_UNBAN',req.params.userId);res.json({ok:true})
}))
extendedRouter.get('/guilds/:id/audit-log', authMiddleware, wrap((req,res) => {
  const g=requireGuild(req.params.id);requireManager(g.id,req.user.id)
  const limit=Math.min(200,Math.max(1,Number(req.query.limit)||50));const rows=all(`SELECT a.*,u.username,u.display_name FROM audit_logs a LEFT JOIN users u ON u.id=a.actor_id WHERE a.guild_id=? ORDER BY a.created_at DESC LIMIT ?`,[g.id,limit])
  res.json({entries:rows.map(x=>({...x,metadata:x.metadata?JSON.parse(x.metadata):{}}))})
}))


extendedRouter.get('/settings', authMiddleware, wrap((req,res) => {
  let s=get('SELECT * FROM user_settings WHERE user_id=?',req.user.id)
  if(!s){run('INSERT INTO user_settings (user_id) VALUES (?)',req.user.id);s=get('SELECT * FROM user_settings WHERE user_id=?',req.user.id)}
  res.json({settings:s})
}))
extendedRouter.patch('/settings', authMiddleware, wrap((req,res) => {
  const allowed={theme:['dark','light','system'],density:['cozy','compact'],reduced_motion:[0,1],desktop_notifications:[0,1],notification_sounds:[0,1],message_sounds:[0,1],dm_notifications:[0,1],mention_notifications:[0,1],friend_notifications:[0,1],show_activities:[0,1],autoplay_gifs:[0,1],developer_mode:[0,1],input_mode:['voice_activity','push_to_talk']}
  const current=get('SELECT * FROM user_settings WHERE user_id=?',req.user.id)||{}
  const changes=[];const vals=[]
  for(const [key,choices] of Object.entries(allowed)) if(req.body[key]!==undefined){const v=req.body[key];if(!choices.includes(v))throw httpError(400,`Некорректное значение: ${key}`);changes.push(`${key}=?`);vals.push(v)}
  if(changes.length){run('INSERT INTO user_settings (user_id) VALUES (?) ON CONFLICT(user_id) DO NOTHING',req.user.id);run(`UPDATE user_settings SET ${changes.join(',')} WHERE user_id=?`,[...vals,req.user.id])}
  res.json({settings:get('SELECT * FROM user_settings WHERE user_id=?',req.user.id)})
}))
