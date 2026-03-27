import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  username: text('username').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  isAdmin: integer('is_admin', { mode: 'boolean' }).notNull().default(false),
  email: text('email'),
  invitePending: integer('invite_pending', { mode: 'boolean' }).notNull().default(false),
})

export const youtubeAccounts = sqliteTable('youtube_accounts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull().unique(),
  channelId: text('channel_id').notNull(),
  channelTitle: text('channel_title').notNull(),
  email: text('email').notNull(),
  accessToken: text('access_token').notNull(),
  refreshToken: text('refresh_token'),
  expiryDate: integer('expiry_date'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
})

// Admin-configured stream presets
export const streams = sqliteTable('streams', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  youtubeTitle: text('youtube_title').notNull(),
  privacyStatus: text('privacy_status').notNull().default('private'),
  sourceUrl: text('source_url'),       // null = use global config
  ffmpegExtraArgs: text('ffmpeg_extra_args'), // null = use global config
  createdAt: integer('created_at').notNull(),
})

// Global fallback config
export const streamConfig = sqliteTable('stream_config', {
  id: integer('id').primaryKey(),
  sourceUrl: text('source_url').notNull().default(''),
  ffmpegExtraArgs: text('ffmpeg_extra_args').notNull().default('-c copy'),
  updatedAt: integer('updated_at').notNull(),
})

// Each time a stream is forwarded to YouTube
export const streamForwards = sqliteTable('stream_forwards', {
  id: text('id').primaryKey(),
  streamId: text('stream_id').notNull(),
  broadcastId: text('broadcast_id').notNull(),
  ytStreamId: text('yt_stream_id').notNull(),
  processId: text('process_id').notNull(),
  status: text('status').notNull(),
  title: text('title').notNull(),
  watchUrl: text('watch_url').notNull(),
  rtmpUrl: text('rtmp_url').notNull(),
  streamKey: text('stream_key').notNull(),
  startedBy: integer('started_by').notNull(),
  startedAt: integer('started_at').notNull(),
  stoppedAt: integer('stopped_at'),
  stopReason: text('stop_reason'),
})

export type User = typeof users.$inferSelect
export type YoutubeAccount = typeof youtubeAccounts.$inferSelect
export type Stream = typeof streams.$inferSelect
export type StreamConfig = typeof streamConfig.$inferSelect
