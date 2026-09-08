import Database from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const DATA_DIR = path.join(process.cwd(), 'data')
fs.mkdirSync(DATA_DIR, { recursive: true })

export const db = new Database(path.join(DATA_DIR, 'discord.db'))
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  discriminator TEXT NOT NULL DEFAULT '0',
  password_hash TEXT NOT NULL,
  avatar TEXT,
  bio TEXT DEFAULT '',
  status TEXT DEFAULT 'online',
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS friendships (
  user_id TEXT NOT NULL,
  friend_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, friend_id)
);
CREATE TABLE IF NOT EXISTS friend_requests (
  id TEXT PRIMARY KEY,
  from_user TEXT NOT NULL,
  to_user TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE (from_user, to_user)
);
CREATE TABLE IF NOT EXISTS guilds (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  icon_color TEXT NOT NULL,
  invite_code TEXT UNIQUE NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS guild_members (
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  joined_at INTEGER NOT NULL,
  PRIMARY KEY (guild_id, user_id)
);
CREATE TABLE IF NOT EXISTS channels (
  id TEXT PRIMARY KEY,
  guild_id TEXT,
  type TEXT NOT NULL,
  name TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  topic TEXT DEFAULT '',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_channels_guild ON channels(guild_id);
CREATE TABLE IF NOT EXISTS dm_recipients (
  channel_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  PRIMARY KEY (channel_id, user_id)
);
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  channel_id TEXT NOT NULL,
  author_id TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  reply_to TEXT,
  attachments TEXT,
  pinned INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  edited_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_messages_channel ON messages(channel_id, created_at);
CREATE TABLE IF NOT EXISTS reactions (
  message_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  emoji TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (message_id, user_id, emoji)
);
CREATE TABLE IF NOT EXISTS reads (
  user_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  last_read INTEGER NOT NULL,
  PRIMARY KEY (user_id, channel_id)
);
CREATE TABLE IF NOT EXISTS user_notes (
  owner_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (owner_id, user_id)
);
`)

// --- lightweight migrations (safe to re-run) ---
function safeAlter(sql) { try { db.exec(sql) } catch { /* column exists */ } }
safeAlter('ALTER TABLE users ADD COLUMN display_name TEXT')
safeAlter('ALTER TABLE users ADD COLUMN pronouns TEXT')
safeAlter('ALTER TABLE users ADD COLUMN banner_color TEXT')
safeAlter('ALTER TABLE users ADD COLUMN custom_status TEXT')
safeAlter('ALTER TABLE users ADD COLUMN status_icon TEXT')
safeAlter('ALTER TABLE users ADD COLUMN badges TEXT')
safeAlter('ALTER TABLE users ADD COLUMN admin INTEGER NOT NULL DEFAULT 0')
safeAlter('ALTER TABLE users ADD COLUMN suspended_until INTEGER')
safeAlter('ALTER TABLE users ADD COLUMN banned INTEGER NOT NULL DEFAULT 0')
// the demo account doubles as the platform admin (can grant profile badges)
db.exec(`UPDATE users SET admin = 1 WHERE username = 'admin'`)

export const uid = () => randomUUID()
export const now = () => Date.now()

export function get(sql, ...args) { return db.prepare(sql).get(...flat(args)) }
export function all(sql, ...args) { return db.prepare(sql).all(...flat(args)) }
export function run(sql, ...args) { return db.prepare(sql).run(...flat(args)) }
function flat(args) { return args.length === 1 && Array.isArray(args[0]) ? args[0] : args }

// Seed a demo account: admin / admin123 (created lazily on first boot)
export async function seedDemo() {
  const bcrypt = (await import('bcryptjs')).default
  const existing = get('SELECT id FROM users WHERE username = ?', ['admin'])
  if (existing) return
  const hash = bcrypt.hashSync('admin123', 10)
  const adminId = uid()
  run('INSERT INTO users (id, username, discriminator, password_hash, bio, status, created_at, admin) VALUES (?,?,?,?,?,?,?,1)',
    [adminId, 'admin', '0', hash, 'Владелец этого Discord 🛠', 'online', now()])
  // demo guild
  const gid = uid()
  const color = '#5865f2'
  const invite = 'demo' + gid.slice(0, 4)
  run('INSERT INTO guilds (id,name,owner_id,icon_color,invite_code,created_at) VALUES (?,?,?,?,?,?)',
    [gid, 'Demo Server', adminId, color, invite, now()])
  run('INSERT INTO guild_members (guild_id,user_id,role,joined_at) VALUES (?,?,?,?)', [gid, adminId, 'owner', now()])
  let pos = 0
  for (const [type, name] of [['text', 'general'], ['text', 'memes'], ['voice', 'General'], ['voice', 'Chill']]) {
    run('INSERT INTO channels (id,guild_id,type,name,position,created_at) VALUES (?,?,?,?,?,?)',
      [uid(), gid, type, name, pos++, now()])
  }
  console.log('[seed] demo user admin/admin123, invite:', invite)
}
