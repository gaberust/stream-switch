import { randomBytes } from 'crypto'
import { EventEmitter } from 'events'
import net from 'net'
import { desc, eq, inArray } from 'drizzle-orm'
import { db } from '../db/index'
import { streamConfig, streamForwards, streams } from '../db/schema'
import type { FfmpegProcessManager, ProcessStatus } from './ffmpeg'
import type { YouTubeService } from './youtube'

export type ForwardStatus = 'starting' | 'live' | 'stopped' | 'error'

export interface ForwardRecord {
  id: string
  streamId: string
  broadcastId: string
  ytStreamId: string
  processId: string
  status: ForwardStatus
  title: string
  watchUrl: string
  startedBy: number
  startedAt: string
  stoppedAt?: string
  stopReason?: string
}

export interface StreamConfigData {
  sourceUrl: string
  ffmpegExtraArgs: string
}

export declare interface StreamForwardService {
  on(event: 'forward', listener: (forward: ForwardRecord) => void): this
  emit(event: 'forward', forward: ForwardRecord): boolean
}

const HEALTH_INTERVAL_MS = 5_000
const UNHEALTHY_THRESHOLD_MS = 30_000
const TERMINAL: ProcessStatus[] = ['stopped', 'error', 'killed']

function parseSourceAddr(url: string): { host: string; port: number } | null {
  const m = url.match(/^([a-z]+):\/\/([^/:@]+)(?::(\d+))?/i)
  if (!m) return null
  const protocol = m[1].toLowerCase()
  const host = m[2]
  const defaultPort = protocol === 'rtsp' ? 554 : 1935
  const port = m[3] ? parseInt(m[3], 10) : defaultPort
  return { host, port }
}

function checkTcp(host: string, port: number, timeoutMs = 4_000): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port })
    const timer = setTimeout(() => { socket.destroy(); resolve(false) }, timeoutMs)
    socket.once('connect', () => { clearTimeout(timer); socket.destroy(); resolve(true) })
    socket.once('error', () => { clearTimeout(timer); resolve(false) })
  })
}

export class StreamForwardService extends EventEmitter {
  private forwards = new Map<string, ForwardRecord>()
  private healthTimers = new Map<string, ReturnType<typeof setInterval>>()
  private liveTimers = new Map<string, ReturnType<typeof setInterval>>()
  private missedChecks = new Map<string, number>()

  constructor(
    private ffmpeg: FfmpegProcessManager,
    private getYouTubeService: () => Promise<YouTubeService | null>,
  ) {
    super()
    this.ffmpeg.on('status', (proc) => {
      if (!TERMINAL.includes(proc.status)) return
      for (const fwd of this.forwards.values()) {
        if (fwd.processId === proc.id && fwd.status !== 'stopped' && fwd.status !== 'error') {
          void this.handleUnexpectedExit(fwd.id, `ffmpeg exited (${proc.status})`)
        }
      }
    })
  }

  async initialize(): Promise<void> {
    const rows = await db
      .select()
      .from(streamForwards)
      .orderBy(desc(streamForwards.startedAt))
      .limit(50)

    const stuckIds = rows
      .filter((r) => r.status === 'starting' || r.status === 'live')
      .map((r) => r.id)

    if (stuckIds.length > 0) {
      await db
        .update(streamForwards)
        .set({ status: 'stopped', stoppedAt: Date.now(), stopReason: 'Server restarted' })
        .where(inArray(streamForwards.id, stuckIds))
    }

    for (const row of rows) {
      const isStuck = stuckIds.includes(row.id)
      this.forwards.set(row.id, {
        id: row.id,
        streamId: row.streamId,
        broadcastId: row.broadcastId,
        ytStreamId: row.ytStreamId,
        processId: row.processId,
        status: isStuck ? 'stopped' : (row.status as ForwardStatus),
        title: row.title,
        watchUrl: row.watchUrl,
        startedBy: row.startedBy,
        startedAt: new Date(row.startedAt).toISOString(),
        stoppedAt: isStuck
          ? new Date().toISOString()
          : row.stoppedAt ? new Date(row.stoppedAt).toISOString() : undefined,
        stopReason: isStuck ? 'Server restarted' : (row.stopReason ?? undefined),
      })
    }
  }

  private update(fwd: ForwardRecord) {
    this.forwards.set(fwd.id, fwd)
    this.emit('forward', fwd)
  }

  private async handleUnexpectedExit(id: string, reason: string) {
    const fwd = this.forwards.get(id)
    if (!fwd || fwd.status === 'stopped' || fwd.status === 'error') return
    this.clearTimers(id)
    // Include last stderr line for actionable error messages
    const proc = this.ffmpeg.get(fwd.processId)
    const lastStderr = proc?.stderrLines.findLast((l) => l.trim().length > 0)
    const fullReason = lastStderr ? lastStderr.trim() : reason
    const now = new Date().toISOString()
    const updated: ForwardRecord = { ...fwd, status: 'error', stoppedAt: now, stopReason: fullReason }
    this.update(updated)
    await db
      .update(streamForwards)
      .set({ status: 'error', stoppedAt: Date.now(), stopReason: fullReason })
      .where(eq(streamForwards.id, id))
    try {
      const svc = await this.getYouTubeService()
      if (svc) await svc.transitionBroadcast(fwd.broadcastId, 'complete')
    } catch { /* best-effort */ }
  }

  private clearTimers(id: string) {
    const health = this.healthTimers.get(id)
    if (health) { clearInterval(health); this.healthTimers.delete(id) }
    const live = this.liveTimers.get(id)
    if (live) { clearInterval(live); this.liveTimers.delete(id) }
    this.missedChecks.delete(id)
  }

  private startHealthMonitor(id: string, sourceUrl: string) {
    const addr = parseSourceAddr(sourceUrl)
    if (!addr) return

    const timer = setInterval(async () => {
      const fwd = this.forwards.get(id)
      if (!fwd || fwd.status === 'stopped' || fwd.status === 'error') {
        this.clearTimers(id)
        return
      }
      const ok = await checkTcp(addr.host, addr.port)
      if (ok) {
        this.missedChecks.set(id, 0)
      } else {
        const misses = (this.missedChecks.get(id) ?? 0) + 1
        this.missedChecks.set(id, misses)
        if (misses * HEALTH_INTERVAL_MS >= UNHEALTHY_THRESHOLD_MS) {
          await this.stop(id, 'Source unavailable for 30 seconds')
        }
      }
    }, HEALTH_INTERVAL_MS)

    this.healthTimers.set(id, timer)
  }

  private scheduleTransition(id: string, broadcastId: string, ytStreamId: string) {
    const POLL_MS = 5_000
    const TIMEOUT_MS = 120_000
    const startedAt = Date.now()

    const timer = setInterval(async () => {
      const fwd = this.forwards.get(id)
      if (!fwd || fwd.status !== 'starting') {
        clearInterval(timer)
        this.liveTimers.delete(id)
        return
      }
      if (Date.now() - startedAt > TIMEOUT_MS) {
        clearInterval(timer)
        this.liveTimers.delete(id)
        return
      }
      try {
        const svc = await this.getYouTubeService()
        if (!svc) return
        // Wait until YouTube CDN reports the stream as active
        const info = await svc.getStreamIngestionInfo(ytStreamId)
        if (info.streamStatus !== 'active') return
        // Stream is active — transition to live
        clearInterval(timer)
        this.liveTimers.delete(id)
        try { await svc.transitionBroadcast(broadcastId, 'testing') } catch { /* may already be testing */ }
        await new Promise((r) => setTimeout(r, 3_000))
        const current = this.forwards.get(id)
        if (!current || current.status !== 'starting') return
        await svc.transitionBroadcast(broadcastId, 'live')
        const updated: ForwardRecord = { ...current, status: 'live' }
        this.update(updated)
        await db
          .update(streamForwards)
          .set({ status: 'live' })
          .where(eq(streamForwards.id, id))
      } catch { /* retry on next poll */ }
    }, POLL_MS)

    this.liveTimers.set(id, timer)
  }

  getActiveForStream(streamId: string): ForwardRecord | undefined {
    for (const fwd of this.forwards.values()) {
      if (fwd.streamId === streamId && (fwd.status === 'starting' || fwd.status === 'live')) {
        return fwd
      }
    }
    return undefined
  }

  async startForStream(streamId: string, startedBy: number): Promise<ForwardRecord> {
    if (this.getActiveForStream(streamId)) {
      throw new Error('This stream is already live')
    }

    const [streamRow] = await db.select().from(streams).where(eq(streams.id, streamId))
    if (!streamRow) throw new Error('Stream not found')

    const globalConfig = await this.getConfig()
    const sourceUrl = streamRow.sourceUrl ?? globalConfig.sourceUrl
    if (!sourceUrl) throw new Error('No source URL configured')

    const ffmpegExtraArgs = streamRow.ffmpegExtraArgs ?? globalConfig.ffmpegExtraArgs

    const svc = await this.getYouTubeService()
    if (!svc) throw new Error('No YouTube account connected')

    const broadcast = await svc.createBroadcastWithStream({
      title: streamRow.youtubeTitle,
      scheduledStartTime: new Date().toISOString(),
      privacyStatus: streamRow.privacyStatus as 'public' | 'private' | 'unlisted',
    })

    const id = randomBytes(8).toString('hex')
    const processId = `forward:${id}`
    const destination = `${broadcast.rtmpUrl}/${broadcast.streamKey}`
    const extraArgs = ffmpegExtraArgs.trim().split(/\s+/).filter(Boolean)
    const args = ['-re', '-i', sourceUrl, ...extraArgs, '-f', 'flv', destination]

    this.ffmpeg.spawn(processId, args)

    const now = Date.now()
    await db.insert(streamForwards).values({
      id,
      streamId,
      broadcastId: broadcast.broadcastId,
      ytStreamId: broadcast.streamId,
      processId,
      status: 'starting',
      title: streamRow.youtubeTitle,
      watchUrl: broadcast.watchUrl,
      rtmpUrl: broadcast.rtmpUrl,
      streamKey: broadcast.streamKey,
      startedBy,
      startedAt: now,
    })

    const fwd: ForwardRecord = {
      id,
      streamId,
      broadcastId: broadcast.broadcastId,
      ytStreamId: broadcast.streamId,
      processId,
      status: 'starting',
      title: streamRow.youtubeTitle,
      watchUrl: broadcast.watchUrl,
      startedBy,
      startedAt: new Date(now).toISOString(),
    }

    this.update(fwd)
    this.startHealthMonitor(id, sourceUrl)
    this.scheduleTransition(id, broadcast.broadcastId, broadcast.streamId)

    return fwd
  }

  async stopForStream(streamId: string): Promise<void> {
    const active = this.getActiveForStream(streamId)
    if (!active) return
    await this.stop(active.id)
  }

  async stop(id: string, reason = 'Stopped by user'): Promise<void> {
    const fwd = this.forwards.get(id)
    if (!fwd) throw new Error(`Forward "${id}" not found`)
    if (fwd.status === 'stopped' || fwd.status === 'error') return

    this.clearTimers(id)
    try { this.ffmpeg.kill(fwd.processId) } catch { /* already exited */ }

    const now = new Date().toISOString()
    const updated: ForwardRecord = { ...fwd, status: 'stopped', stoppedAt: now, stopReason: reason }
    this.update(updated)

    await db
      .update(streamForwards)
      .set({ status: 'stopped', stoppedAt: Date.now(), stopReason: reason })
      .where(eq(streamForwards.id, id))

    try {
      const svc = await this.getYouTubeService()
      if (svc) await svc.transitionBroadcast(fwd.broadcastId, 'complete')
    } catch { /* best-effort */ }
  }

  list(): ForwardRecord[] {
    return Array.from(this.forwards.values()).sort(
      (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
    )
  }

  async getConfig(): Promise<StreamConfigData> {
    const [row] = await db.select().from(streamConfig).where(eq(streamConfig.id, 1))
    return {
      sourceUrl: row?.sourceUrl ?? '',
      ffmpegExtraArgs: row?.ffmpegExtraArgs ?? '-c copy',
    }
  }

  async setConfig(patch: Partial<StreamConfigData>): Promise<StreamConfigData> {
    const current = await this.getConfig()
    const next = { ...current, ...patch }
    await db
      .insert(streamConfig)
      .values({ id: 1, sourceUrl: next.sourceUrl, ffmpegExtraArgs: next.ffmpegExtraArgs, updatedAt: Date.now() })
      .onConflictDoUpdate({
        target: streamConfig.id,
        set: { sourceUrl: next.sourceUrl, ffmpegExtraArgs: next.ffmpegExtraArgs, updatedAt: Date.now() },
      })
    return next
  }
}
