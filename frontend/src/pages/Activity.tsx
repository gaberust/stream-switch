import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Layout from '@/components/Layout'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/context/AuthContext'

interface ActivityRecord {
  id: string
  streamId: string
  streamName: string | null
  status: string
  title: string
  startedByUsername: string | null
  startedAt: string
  stoppedAt: string | null
  stopReason: string | null
}

function formatDuration(startedAt: string, stoppedAt: string | null) {
  if (!stoppedAt) return '—'
  const secs = Math.floor((new Date(stoppedAt).getTime() - new Date(startedAt).getTime()) / 1000)
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return m > 0 ? `${m}m ${s}s` : `${s}s`
}

function formatDateTime(iso: string) {
  const d = new Date(iso)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' ' + d.toLocaleTimeString()
}

export default function Activity() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [records, setRecords] = useState<ActivityRecord[]>([])
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [hasMore, setHasMore] = useState(false)

  useEffect(() => {
    if (!user?.isAdmin) {
      void navigate('/')
    }
  }, [user, navigate])

  useEffect(() => {
    if (!user?.isAdmin) return
    setLoading(true)
    fetch(`/api/activity?page=${page}`)
      .then((r) => r.json() as Promise<ActivityRecord[]>)
      .then((data) => {
        setRecords(data)
        setHasMore(data.length === 50)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [page, user?.isAdmin])

  return (
    <Layout>
      <div className="max-w-4xl space-y-4">
        <h1 className="text-2xl font-bold">Activity Log</h1>

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : records.length === 0 ? (
          <p className="text-sm text-muted-foreground">No activity yet.</p>
        ) : (
          <div className="rounded-lg border divide-y text-sm">
            {records.map((r) => (
              <div key={r.id} className="flex items-start justify-between gap-4 px-4 py-3">
                <div className="min-w-0 space-y-0.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge status={r.status as 'starting' | 'live' | 'stopped' | 'error'} />
                    <span className="font-medium">{r.streamName ?? r.streamId}</span>
                    <span className="text-xs text-muted-foreground truncate">{r.title}</span>
                  </div>
                  {r.stopReason && r.status === 'error' && (
                    <p className="text-xs text-destructive truncate" title={r.stopReason}>{r.stopReason}</p>
                  )}
                </div>
                <div className="shrink-0 text-xs text-muted-foreground text-right space-y-0.5">
                  <div>{formatDateTime(r.startedAt)}</div>
                  <div>{formatDuration(r.startedAt, r.stoppedAt)}</div>
                  <div>{r.startedByUsername ?? '—'}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {(page > 1 || hasMore) && (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
              Previous
            </Button>
            <span className="text-sm text-muted-foreground">Page {page}</span>
            <Button variant="outline" size="sm" disabled={!hasMore} onClick={() => setPage((p) => p + 1)}>
              Next
            </Button>
          </div>
        )}
      </div>
    </Layout>
  )
}
