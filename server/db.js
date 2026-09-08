import Database from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const DATA_DIR = path.join(process.cwd(), 'data')
fs.mkdirSync(DATA_DIR, { recursive: true })
export const db = new Database(path.join(DATA_DIR, 'discord.db'))
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')
db.pragma('busy_timeout = 5000')
db.pragma('synchronous = NORMAL')

db.exec(`
CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, discriminator TEXT NOT NULL DEFAULT '0', password_hash TEXT NOT NULL, avatar TEXT, bio TEXT DEFAULT '', status TEXT DEFAULT 'online', created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS friendships (user_id TEXT NOT NULL, friend_id TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY (user_id, friend_id));
CREATE TABLE IF NOT EXISTS friend_requests (id TEXT PRIMARY KEY, from_user TEXT NOT NULL, to_user TEXT NOT NULL, created_at INTEGER NOT NULL, UNIQUE (from_user, to_user));
CREATE TABLE IF NOT EXISTS guilds (id TEXT PRIMARY KEY, name TEXT NOT NULL, owner_id TEXT NOT NULL, icon_color TEXT NOT NULL DEFAULT '#5865f2', invite_code TEXT UNIQUE NOT NULL, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS guild_members (guild_id TEXT NOT NULL, user_id TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'member', joined_at INTEGER NOT NULL, PRIMARY KEY (guild_id, user_id));
CREATE TABLE IF NOT EXISTS guild_roles (id TEXT PRIMARY KEY, guild_id TEXT NOT NULL, name TEXT NOT NULL, color TEXT, permissions TEXT NOT NULL DEFAULT '', position INTEGER NOT NULL DEFAULT 0, mentionable INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, UNIQUE (guild_id, name));
CREATE TABLE IF NOT EXISTS guild_member_roles (guild_id TEXT NOT NULL, user_id TEXT NOT NULL, role_id TEXT NOT NULL, PRIMARY KEY (guild_id, user_id, role_id));
CREATE TABLE IF NOT EXISTS channels (id TEXT PRIMARY KEY, guild_id TEXT, type TEXT NOT NULL, name TEXT NOT NULL, position INTEGER NOT NULL DEFAULT 0, topic TEXT DEFAULT '', category_id TEXT, slowmode_seconds INTEGER NOT NULL DEFAULT 0, nsfw INTEGER NOT NULL DEFAULT 0, bitrate INTEGER NOT NULL DEFAULT 64000, user_limit INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS idx_channels_guild ON channels(guild_id, position);
CREATE TABLE IF NOT EXISTS channel_permission_overwrites (channel_id TEXT NOT NULL, role_id TEXT NOT NULL, allow_permissions TEXT NOT NULL DEFAULT '', deny_permissions TEXT NOT NULL DEFAULT '', PRIMARY KEY (channel_id, role_id));
CREATE TABLE IF NOT EXISTS dm_recipients (channel_id TEXT NOT NULL, user_id TEXT NOT NULL, PRIMARY KEY (channel_id, user_id));
CREATE TABLE IF NOT EXISTS messages (id TEXT PRIMARY KEY, channel_id TEXT NOT NULL, author_id TEXT NOT NULL, content TEXT NOT NULL DEFAULT '', reply_to TEXT, attachments TEXT, pinned INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, edited_at INTEGER);
CREATE INDEX IF NOT EXISTS idx_messages_channel ON messages(channel_id, created_at);
CREATE INDEX IF NOT EXISTS idx_messages_author ON messages(author_id, created_at);
CREATE TABLE IF NOT EXISTS message_mentions (message_id TEXT NOT NULL, user_id TEXT NOT NULL, PRIMARY KEY (message_id, user_id));
CREATE TABLE IF NOT EXISTS message_pins (message_id TEXT PRIMARY KEY, channel_id TEXT NOT NULL, pinned_by TEXT NOT NULL, pinned_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS reactions (message_id TEXT NOT NULL, user_id TEXT NOT NULL, emoji TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY (message_id, user_id, emoji));
CREATE TABLE IF NOT EXISTS reads (user_id TEXT NOT NULL, channel_id TEXT NOT NULL, last_read INTEGER NOT NULL, PRIMARY KEY (user_id, channel_id));
CREATE TABLE IF NOT EXISTS user_notes (owner_id TEXT NOT NULL, user_id TEXT NOT NULL, note TEXT NOT NULL DEFAULT '', PRIMARY KEY (owner_id, user_id));
CREATE TABLE IF NOT EXISTS blocks (user_id TEXT NOT NULL, blocked_user_id TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY (user_id, blocked_user_id));
CREATE TABLE IF NOT EXISTS audit_logs (id TEXT PRIMARY KEY, guild_id TEXT, actor_id TEXT NOT NULL, action TEXT NOT NULL, target_id TEXT, metadata TEXT, created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS idx_audit_guild ON audit_logs(guild_id, created_at);
CREATE TABLE IF NOT EXISTS invites (code TEXT PRIMARY KEY, guild_id TEXT NOT NULL, creator_id TEXT NOT NULL, max_uses INTEGER NOT NULL DEFAULT 0, uses INTEGER NOT NULL DEFAULT 0, expires_at INTEGER, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS guild_bans (guild_id TEXT NOT NULL, user_id TEXT NOT NULL, moderator_id TEXT NOT NULL, reason TEXT, created_at INTEGER NOT NULL, PRIMARY KEY (guild_id, user_id));
CREATE TABLE IF NOT EXISTS threads (id TEXT PRIMARY KEY, channel_id TEXT NOT NULL, parent_message_id TEXT NOT NULL, name TEXT NOT NULL, archived INTEGER NOT NULL DEFAULT 0, locked INTEGER NOT NULL DEFAULT 0, created_by TEXT NOT NULL, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS attachments (id TEXT PRIMARY KEY, message_id TEXT NOT NULL, filename TEXT NOT NULL, mime_type TEXT NOT NULL, size INTEGER NOT NULL, url TEXT NOT NULL, width INTEGER, height INTEGER, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS user_settings (user_id TEXT PRIMARY KEY, theme TEXT NOT NULL DEFAULT 'dark', density TEXT NOT NULL DEFAULT 'cozy', reduced_motion INTEGER NOT NULL DEFAULT 0, desktop_notifications INTEGER NOT NULL DEFAULT 1, notification_sounds INTEGER NOT NULL DEFAULT 1, message_sounds INTEGER NOT NULL DEFAULT 1, dm_notifications INTEGER NOT NULL DEFAULT 1, mention_notifications INTEGER NOT NULL DEFAULT 1, friend_notifications INTEGER NOT NULL DEFAULT 1, show_activities INTEGER NOT NULL DEFAULT 1, autoplay_gifs INTEGER NOT NULL DEFAULT 1, developer_mode INTEGER NOT NULL DEFAULT 0, input_mode TEXT NOT NULL DEFAULT 'voice_activity', updated_at INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, created_at INTEGER NOT NULL, last_seen INTEGER NOT NULL, expires_at INTEGER NOT NULL, user_agent TEXT DEFAULT '', ip TEXT DEFAULT '', revoked INTEGER NOT NULL DEFAULT 0);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id, revoked, last_seen);
CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at);
`)

function safeAlter(sql) { try { db.exec(sql) } catch {} }
safeAlter('ALTER TABLE users ADD COLUMN display_name TEXT')
safeAlter('ALTER TABLE users ADD COLUMN pronouns TEXT')
safeAlter('ALTER TABLE users ADD COLUMN banner_color TEXT')
safeAlter('ALTER TABLE users ADD COLUMN custom_status TEXT')
safeAlter('ALTER TABLE users ADD COLUMN status_icon TEXT')
safeAlter('ALTER TABLE users ADD COLUMN badges TEXT')
safeAlter('ALTER TABLE users ADD COLUMN admin INTEGER NOT NULL DEFAULT 0')
safeAlter('ALTER TABLE users ADD COLUMN suspended_until INTEGER')
safeAlter('ALTER TABLE users ADD COLUMN banned INTEGER NOT NULL DEFAULT 0')
safeAlter('ALTER TABLE user_settings ADD COLUMN updated_at INTEGER NOT NULL DEFAULT 0')
safeAlter('ALTER TABLE sessions ADD COLUMN revoked INTEGER NOT NULL DEFAULT 0')

export const uid = () => randomUUID()
export const now = () => Date.now()
export function get(sql, ...args) { return db.prepare(sql).get(...flat(args)) }
export function all(sql, ...args) { return db.prepare(sql).all(...flat(args)) }
export function run(sql, ...args) { return db.prepare(sql).run(...flat(args)) }
function flat(args) { return args.length === 1 && Array.isArray(args[0]) ? args[0] : args }
