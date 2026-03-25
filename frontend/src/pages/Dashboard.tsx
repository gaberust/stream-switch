import { AlertCircle, ExternalLink } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import Layout from '@/components/Layout'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

interface ActiveForward {
  id: string
  status: 'starting' | 'live' | 'stopped' | 'error'
  watchUrl: string
  startedAt: string
  stoppedAt?: string
  streamId: string
  stopReason?: string
  title: string
  startedByUsername?: string
}

interface Stream {
  id: string
  name: string
  youtubeTitle: string
  privacyStatus: string
  activeForward: ActiveForward | null
}

function useNow(intervalMs: number) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(t)
  }, [intervalMs])
  return now
}

function formatElapsed(startedAt: string, now: number) {
  const secs = Math.floor((now - new Date(startedAt).getTime()) / 1000)
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

function formatDuration(startedAt: string, stoppedAt?: string) {
  if (!stoppedAt) return '—'
  const secs = Math.floor((new Date(stoppedAt).getTime() - new Date(startedAt).getTime()) / 1000)
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return m > 0 ? `${m}m ${s}s` : `${s}s`
}

export default function Dashboard() {
  const [streams, setStreams] = useState<Stream[]>([])
  const [allForwards, setAllForwards] = useState<ActiveForward[]>([])
  const [toggling, setToggling] = useState<Set<string>>(new Set())
  const [errors, setErrors] = useState<Record<string, string>>({})
  const wsRef = useRef<WebSocket | null>(null)
  const now = useNow(1000)

  const applyForwardUpdate = (fwd: ActiveForward) => {
    setAllForwards((prev) => {
      const idx = prev.findIndex((f) => f.id === fwd.id)
      if (idx === -1) return [fwd, ...prev]
      const next = [...prev]
      next[idx] = fwd
      return next
    })
    setStreams((prev) =>
      prev.map((s) => {
        if (s.id !== fwd.streamId) return s
        const isActive = fwd.status === 'starting' || fwd.status === 'live'
        const isRecent = fwd.status === 'error'
        return { ...s, activeForward: (isActive || isRecent) ? fwd : null }
      }),
    )
    if (fwd.status === 'error') {
      setErrors((prev) => ({ ...prev, [fwd.streamId]: fwd.stopReason ?? 'ffmpeg exited unexpectedly' }))
    } else if (fwd.status === 'starting' || fwd.status === 'live') {
      setErrors((prev) => { const n = { ...prev }; delete n[fwd.streamId]; return n })
    }
  }

  useEffect(() => {
    let cancelled = false
    let ws: WebSocket | null = null
    let retryTimer: ReturnType<typeof setTimeout> | null = null
    let delay = 1000

    const fetchStreams = () =>
      fetch('/api/streams')
        .then((r) => r.json() as Promise<Stream[]>)
        .then((data) => { if (!cancelled) setStreams(data) })
        .catch(() => {})

    const connect = () => {
      if (cancelled) return
      const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
      ws = new WebSocket(`${protocol}//${location.host}/ws`)
      wsRef.current = ws

      ws.onopen = () => {
        delay = 1000
        void fetchStreams()
      }

      ws.onmessage = (e) => {
        const msg = JSON.parse(e.data as string) as
          | { type: 'init'; forwards: ActiveForward[] }
          | { type: 'forward:update'; forward: ActiveForward }
          | { type: string }

        if (msg.type === 'init') {
          setAllForwards((msg as { type: 'init'; forwards: ActiveForward[] }).forwards)
        } else if (msg.type === 'forward:update') {
          applyForwardUpdate((msg as { type: 'forward:update'; forward: ActiveForward }).forward)
        }
      }

      ws.onclose = () => {
        if (cancelled) return
        retryTimer = setTimeout(() => {
          delay = Math.min(delay * 2, 30_000)
          connect()
        }, delay)
      }
    }

    void fetchStreams()
    connect()

    return () => {
      cancelled = true
      ws?.close()
      if (retryTimer) clearTimeout(retryTimer)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = async (stream: Stream) => {
    const isLive = stream.activeForward !== null && stream.activeForward.status !== 'error'
    setToggling((s) => new Set(s).add(stream.id))
    setErrors((prev) => { const n = { ...prev }; delete n[stream.id]; return n })
    try {
      const res = await fetch(`/api/streams/${stream.id}/${isLive ? 'stop' : 'start'}`, {
        method: 'POST',
      })
      if (!res.ok) {
        const data = await res.json() as { error?: string }
        setErrors((prev) => ({ ...prev, [stream.id]: data.error ?? 'Request failed' }))
        return
      }
      if (!isLive) {
        const fwd = await res.json() as ActiveForward
        applyForwardUpdate(fwd)
      }
    } catch {
      setErrors((prev) => ({ ...prev, [stream.id]: 'Network error' }))
    } finally {
      setToggling((s) => { const n = new Set(s); n.delete(stream.id); return n })
    }
  }

  const history = allForwards
    .filter((f) => f.status === 'stopped' || f.status === 'error')
    .slice(0, 10)

  const streamName = (streamId: string) =>
    streams.find((s) => s.id === streamId)?.name ?? streamId

  return (
    <Layout>
      <div className="max-w-2xl space-y-4">
        <h1 className="text-2xl font-bold">Streams</h1>

        {streams.length === 0 && (
          <p className="text-sm text-muted-foreground">No streams configured yet.</p>
        )}

        {streams.map((stream) => {
          const fwd = stream.activeForward
          const isActive = fwd !== null && (fwd.status === 'starting' || fwd.status === 'live')
          const isError = fwd !== null && fwd.status === 'error'
          const busy = toggling.has(stream.id)
          const err = errors[stream.id]
          // Extract the YouTube video ID and reconstruct the URL to avoid XSS via javascript: URLs
          const safeWatchUrl = (() => {
            try {
              const u = new URL(fwd?.watchUrl ?? '')
              if (u.hostname !== 'www.youtube.com') return null
              const rawV = u.searchParams.get('v') ?? ''
              // Reconstruct video ID from allowed chars only (alphanumeric, hyphen, underscore)
              const v = Array.from(rawV).filter((c) => /[\w-]/.test(c)).join('').slice(0, 20)
              if (!v) return null
              return `https://www.youtube.com/watch?v=${encodeURIComponent(v)}`
            } catch { return null }
          })()

          return (
            <div key={stream.id} className="space-y-1">
              <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
                <div className="min-w-0 space-y-0.5">
                  <div className="flex items-center gap-2">
                    <p className="font-medium">{stream.name}</p>
                    {isActive && fwd && <Badge status={fwd.status} />}
                    {isActive && fwd?.status === 'starting' && (
                      <span className="text-xs text-muted-foreground">{formatElapsed(fwd.startedAt, now)}</span>
                    )}
                    {isError && <Badge status="error" />}
                    {!isActive && !isError && (
                      <span className="text-xs text-muted-foreground">Offline</span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground truncate">{stream.youtubeTitle}</p>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  {isActive && fwd?.status === 'live' && safeWatchUrl && (
                    <a
                      href={safeWatchUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-muted-foreground hover:text-foreground"
                      title="Watch on YouTube"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  )}
                  <Button
                    variant={isActive ? 'outline' : 'default'}
                    size="sm"
                    disabled={busy}
                    onClick={() => toggle(stream)}
                  >
                    {busy
                      ? isActive ? 'Stopping…' : 'Starting…'
                      : isActive ? 'Stop'
                      : isError ? 'Retry'
                      : 'Go Live'}
                  </Button>
                </div>
              </div>

              {err && (
                <p className="flex items-center gap-1.5 px-1 text-xs text-destructive">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                  {err}
                </p>
              )}
            </div>
          )
        })}

        {history.length > 0 && (
          <div className="pt-4">
            <h2 className="mb-2 text-sm font-semibold text-muted-foreground uppercase tracking-wide">Recent Activity</h2>
            <div className="rounded-lg border divide-y text-sm">
              {history.map((fwd) => (
                <div key={fwd.id} className="flex items-center justify-between gap-4 px-4 py-2.5">
                  <div className="min-w-0 flex items-center gap-2">
                    <Badge status={fwd.status} />
                    <span className="font-medium truncate">{streamName(fwd.streamId)}</span>
                    {fwd.stopReason && fwd.status === 'error' && (
                      <span className="truncate text-xs text-muted-foreground hidden sm:block" title={fwd.stopReason}>
                        — {fwd.stopReason}
                      </span>
                    )}
                  </div>
                  <div className="shrink-0 text-xs text-muted-foreground text-right space-y-0.5">
                    <div>{new Date(fwd.startedAt).toLocaleTimeString()}</div>
                    <div>{formatDuration(fwd.startedAt, fwd.stoppedAt)}</div>
                    {fwd.startedByUsername && <div>{fwd.startedByUsername}</div>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Layout>
  )
}
