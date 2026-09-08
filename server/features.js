import express from 'express'
import { get, all, run, uid, now } from './db.js'
import { authMiddleware, httpError } from './auth.js'
import { sendToUsers } from './hub.js'

export const featuresRouter = express.Router()
const wrap=fn=>(req,res,next)=>{try{return fn(req,res,next)}catch(e){return next(e)}}
function channel(id){return get('SELECT * FROM channels WHERE id=?',id)}
function member(gid,uid){return get('SELECT * FROM guild_members WHERE guild_id=? AND user_id=?',[gid,uid])}
function manager(gid,uid){const r=member(gid,uid)?.role;if(!['owner','admin'].includes(r))throw httpError(403,'Недостаточно прав')}
function audience(ch){return ch.guild_id?all('SELECT user_id FROM guild_members WHERE guild_id=?',[ch.guild_id]).map(x=>x.user_id):all('SELECT user_id FROM dm_recipients WHERE channel_id=?',[ch.id]).map(x=>x.user_id)}

featuresRouter.get('/health',wrap((req,res)=>res.json({ok:true,status:'online',time:now()})))

/* Secure invite join flow with expiration and usage limits. */
featuresRouter.post('/invites/:code/join',authMiddleware,wrap((req,res)=>{
  const invite=get('SELECT * FROM invites WHERE code=?',req.params.code)
  if(!invite)throw httpError(404,'Приглашение недействительно')
  if(invite.expires_at&&invite.expires_at<=now())throw httpError(410,'Приглашение истекло')
  if(invite.max_uses>0&&invite.uses>=invite.max_uses)throw httpError(410,'Лимит приглашения исчерпан')
  if(get('SELECT 1 FROM guild_bans WHERE guild_id=? AND user_id=?',[invite.guild_id,req.user.id]))throw httpError(403,'Вы заблокированы на этом сервере')
  if(member(invite.guild_id,req.user.id))return res.json({ok:true,joined:false,guild_id:invite.guild_id})
  run('INSERT INTO guild_members (guild_id,user_id,role,joined_at) VALUES (?,?,?,?)',[invite.guild_id,req.user.id,'member',now()])
  run('UPDATE invites SET uses=uses+1 WHERE code=?',invite.code)
  sendToUsers([req.user.id],{t:'GUILD_UPDATE',d:{guild_id:invite.guild_id}})
  res.json({ok:true,joined:true,guild_id:invite.guild_id})
}))

/* Threads */
featuresRouter.get('/channels/:id/threads',authMiddleware,wrap((req,res)=>{
  const ch=channel(req.params.id)
  if(!ch||!((ch.guild_id&&member(ch.guild_id,req.user.id))||(!ch.guild_id&&get('SELECT 1 FROM dm_recipients WHERE channel_id=? AND user_id=?',[ch.id,req.user.id]))))throw httpError(404,'Канал не найден')
  const rows=all('SELECT * FROM threads WHERE channel_id=? ORDER BY created_at DESC LIMIT 100',ch.id)
  res.json({threads:rows})
}))
featuresRouter.post('/channels/:id/threads',authMiddleware,wrap((req,res)=>{
  const ch=channel(req.params.id)
  if(!ch||!ch.guild_id||!member(ch.guild_id,req.user.id))throw httpError(403,'Нет доступа')
  const parent=String(req.body.parent_message_id||'')
  if(!get('SELECT id FROM messages WHERE id=? AND channel_id=?',[parent,ch.id]))throw httpError(404,'Родительское сообщение не найдено')
  const name=String(req.body.name||'Обсуждение').trim().slice(0,100)||'Обсуждение'
  const id=uid();run('INSERT INTO threads (id,channel_id,parent_message_id,name,created_by,created_at) VALUES (?,?,?,?,?,?)',[id,ch.id,parent,name,req.user.id,now()])
  sendToUsers(audience(ch),{t:'THREAD_CREATE',d:{thread:get('SELECT * FROM threads WHERE id=?',id)}})
  res.json({thread:get('SELECT * FROM threads WHERE id=?',id)})
}))
featuresRouter.patch('/threads/:id',authMiddleware,wrap((req,res)=>{
  const t=get('SELECT * FROM threads WHERE id=?',req.params.id)
  if(!t)throw httpError(404,'Тред не найден')
  const ch=channel(t.channel_id);if(!ch||!ch.guild_id)throw httpError(404,'Тред не найден')
  const isManager=['owner','admin'].includes(member(ch.guild_id,req.user.id)?.role)
  if(t.created_by!==req.user.id&&!isManager)throw httpError(403,'Недостаточно прав')
  if(req.body.name!==undefined)run('UPDATE threads SET name=? WHERE id=?',[String(req.body.name).trim().slice(0,100)||t.name,t.id])
  if(req.body.archived!==undefined)run('UPDATE threads SET archived=? WHERE id=?',[req.body.archived?1:0,t.id])
  if(req.body.locked!==undefined){if(!isManager)throw httpError(403,'Только модератор может блокировать тред');run('UPDATE threads SET locked=? WHERE id=?',[req.body.locked?1:0,t.id])}
  res.json({thread:get('SELECT * FROM threads WHERE id=?',t.id)})
}))
featuresRouter.delete('/threads/:id',authMiddleware,wrap((req,res)=>{
  const t=get('SELECT * FROM threads WHERE id=?',req.params.id);if(!t)throw httpError(404,'Тред не найден')
  const ch=channel(t.channel_id);if(!ch||!ch.guild_id)throw httpError(404,'Тред не найден')
  if(t.created_by!==req.user.id)manager(ch.guild_id,req.user.id)
  run('DELETE FROM threads WHERE id=?',t.id);res.json({ok:true})
}))

/* Pins */
featuresRouter.get('/channels/:id/pins',authMiddleware,wrap((req,res)=>{
  const ch=channel(req.params.id);if(!ch)throw httpError(404,'Канал не найден')
  const access=ch.guild_id?member(ch.guild_id,req.user.id):get('SELECT 1 FROM dm_recipients WHERE channel_id=? AND user_id=?',[ch.id,req.user.id])
  if(!access)throw httpError(403,'Нет доступа')
  const rows=all(`SELECT p.*,m.author_id,m.content,m.attachments,m.created_at,m.edited_at FROM message_pins p JOIN messages m ON m.id=p.message_id WHERE p.channel_id=? ORDER BY p.pinned_at DESC`,ch.id)
  res.json({pins:rows})
}))
featuresRouter.post('/messages/:id/pin',authMiddleware,wrap((req,res)=>{
  const m=get('SELECT * FROM messages WHERE id=?',req.params.id);if(!m)throw httpError(404,'Сообщение не найдено')
  const ch=channel(m.channel_id);if(!ch)throw httpError(404,'Канал не найден')
  if(ch.guild_id)manager(ch.guild_id,req.user.id);else if(!get('SELECT 1 FROM dm_recipients WHERE channel_id=? AND user_id=?',[ch.id,req.user.id]))throw httpError(403,'Нет доступа')
  run('INSERT OR REPLACE INTO message_pins (message_id,channel_id,pinned_by,pinned_at) VALUES (?,?,?,?)',[m.id,ch.id,req.user.id,now()])
  run('UPDATE messages SET pinned=1 WHERE id=?',m.id)
  sendToUsers(audience(ch),{t:'MESSAGE_PIN',d:{message_id:m.id,channel_id:ch.id,pinned:true}})
  res.json({ok:true})
}))
featuresRouter.delete('/messages/:id/pin',authMiddleware,wrap((req,res)=>{
  const m=get('SELECT * FROM messages WHERE id=?',req.params.id);if(!m)throw httpError(404,'Сообщение не найдено')
  const ch=channel(m.channel_id);if(!ch)throw httpError(404,'Канал не найден')
  if(ch.guild_id)manager(ch.guild_id,req.user.id);else if(!get('SELECT 1 FROM dm_recipients WHERE channel_id=? AND user_id=?',[ch.id,req.user.id]))throw httpError(403,'Нет доступа')
  run('DELETE FROM message_pins WHERE message_id=?',m.id);run('UPDATE messages SET pinned=0 WHERE id=?',m.id)
  sendToUsers(audience(ch),{t:'MESSAGE_PIN',d:{message_id:m.id,channel_id:ch.id,pinned:false}})
  res.json({ok:true})
}))
