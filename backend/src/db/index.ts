import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from './schema'

const dbPath = process.env.DATABASE_PATH ?? './stream-switch.db'

const sqlite = new Database(dbPath)
sqlite.pragma('journal_mode = WAL')
sqlite.pragma('foreign_keys = ON')

sqlite.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    is_admin INTEGER NOT NULL DEFAULT 0
  )
`)

sqlite.exec(`
  CREATE TABLE IF NOT EXISTS youtube_accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL UNIQUE,
    channel_id TEXT NOT NULL,
    channel_title TEXT NOT NULL,
    email TEXT NOT NULL,
    access_token TEXT NOT NULL,
    refresh_token TEXT,
    expiry_date INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )
`)

sqlite.exec(`
  CREATE TABLE IF NOT EXISTS streams (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    youtube_title TEXT NOT NULL,
    privacy_status TEXT NOT NULL DEFAULT 'private',
    source_url TEXT,
    ffmpeg_extra_args TEXT,
    created_at INTEGER NOT NULL
  )
`)

sqlite.exec(`
  CREATE TABLE IF NOT EXISTS stream_config (
    id INTEGER PRIMARY KEY,
    source_url TEXT NOT NULL DEFAULT '',
    ffmpeg_extra_args TEXT NOT NULL DEFAULT '-c copy',
    updated_at INTEGER NOT NULL
  )
`)

sqlite.exec(`
  CREATE TABLE IF NOT EXISTS stream_forwards (
    id TEXT PRIMARY KEY,
    stream_id TEXT NOT NULL DEFAULT '',
    broadcast_id TEXT NOT NULL,
    yt_stream_id TEXT NOT NULL,
    process_id TEXT NOT NULL,
    status TEXT NOT NULL,
    title TEXT NOT NULL,
    watch_url TEXT NOT NULL,
    rtmp_url TEXT NOT NULL,
    stream_key TEXT NOT NULL,
    started_by INTEGER NOT NULL,
    started_at INTEGER NOT NULL,
    stopped_at INTEGER,
    stop_reason TEXT,
    FOREIGN KEY (stream_id) REFERENCES streams(id),
    FOREIGN KEY (started_by) REFERENCES users(id)
  )
`)
// Safe migration: add stream_id column if it was created before this column existed
try { sqlite.exec(`ALTER TABLE stream_forwards ADD COLUMN stream_id TEXT NOT NULL DEFAULT ''`) } catch { /* already exists */ }

export const db = drizzle(sqlite, { schema })
