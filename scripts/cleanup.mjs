import Database from 'better-sqlite3'
const db = new Database('data/discord.db')
const junk = db.prepare("SELECT id FROM users WHERE username LIKE 'alice\\_%' ESCAPE '\\' OR username LIKE 'bob\\_%' ESCAPE '\\' OR username LIKE 'wsuser\\_%' ESCAPE '\\'").all()
const ids = junk.map(u => u.id)
if (!ids.length) { console.log('nothing to clean'); process.exit(0) }
const q = ids.map(() => '?').join(',')
db.prepare('DELETE FROM friend_requests WHERE from_user IN (' + q + ') OR to_user IN (' + q + ')').run(...ids, ...ids)
db.prepare('DELETE FROM friendships WHERE user_id IN (' + q + ') OR friend_id IN (' + q + ')').run(...ids, ...ids)
db.prepare('DELETE FROM reads WHERE user_id IN (' + q + ')').run(...ids)
db.prepare('DELETE FROM user_notes WHERE owner_id IN (' + q + ') OR user_id IN (' + q + ')').run(...ids, ...ids)
const dmChans = db.prepare('SELECT DISTINCT channel_id FROM dm_recipients WHERE user_id IN (' + q + ')').all(...ids).map(r => r.channel_id)
if (dmChans.length) {
  const cq = dmChans.map(() => '?').join(',')
  const msgIds = db.prepare('SELECT id FROM messages WHERE channel_id IN (' + cq + ')').all(...dmChans).map(r => r.id)
  if (msgIds.length) db.prepare('DELETE FROM reactions WHERE message_id IN (' + msgIds.map(() => '?').join(',') + ')').run(...msgIds)
  db.prepare('DELETE FROM messages WHERE channel_id IN (' + cq + ')').run(...dmChans)
  db.prepare('DELETE FROM dm_recipients WHERE channel_id IN (' + cq + ')').run(...dmChans)
  db.prepare('DELETE FROM channels WHERE id IN (' + cq + ')').run(...dmChans)
}
const msgIds = db.prepare('SELECT id FROM messages WHERE author_id IN (' + q + ')').all(...ids).map(r => r.id)
if (msgIds.length) db.prepare('DELETE FROM reactions WHERE message_id IN (' + msgIds.map(() => '?').join(',') + ')').run(...msgIds)
db.prepare('DELETE FROM messages WHERE author_id IN (' + q + ')').run(...ids)
db.prepare('DELETE FROM guild_members WHERE user_id IN (' + q + ')').run(...ids)
const owned = db.prepare('SELECT id FROM guilds WHERE owner_id IN (' + q + ')').all(...ids).map(r => r.id)
if (owned.length) {
  const gq = owned.map(() => '?').join(',')
  db.prepare('DELETE FROM channels WHERE guild_id IN (' + gq + ')').run(...owned)
  db.prepare('DELETE FROM guilds WHERE id IN (' + gq + ')').run(...owned)
}
db.prepare('DELETE FROM users WHERE id IN (' + q + ')').run(...ids)
console.log('cleaned', ids.length, 'users')
console.log('remaining users:', db.prepare('SELECT username FROM users').all().map(u => u.username).join(', '))
console.log('guilds:', db.prepare('SELECT name FROM guilds').all().map(g => g.name).join(', '))
