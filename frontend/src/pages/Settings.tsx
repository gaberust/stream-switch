import { Pencil, Trash2, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import Layout from '@/components/Layout'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/context/AuthContext'

interface YouTubeAccount {
  channelId: string
  channelTitle: string
  email: string
  createdAt: number
}

interface StreamRow {
  id: string
  name: string
  youtubeTitle: string
  privacyStatus: string
  sourceUrl: string | null
  ffmpegExtraArgs: string | null
}

interface StreamConfig {
  sourceUrl: string
  ffmpegExtraArgs: string
}

type LoadState = 'loading' | 'connected' | 'disconnected' | 'unconfigured'

const PRIVACY_OPTIONS = ['private', 'unlisted', 'public'] as const

const emptyForm = { name: '', youtubeTitle: '', privacyStatus: 'private', sourceUrl: '', ffmpegExtraArgs: '' }

export default function Settings() {
  const { user } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const [ytState, setYtState] = useState<LoadState>('loading')
  const [account, setAccount] = useState<YouTubeAccount | null>(null)
  const [flash, setFlash] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)

  const [streamList, setStreamList] = useState<StreamRow[]>([])
  const [editingId, setEditingId] = useState<string | 'new' | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [formSaving, setFormSaving] = useState(false)

  const [config, setConfig] = useState<StreamConfig>({ sourceUrl: '', ffmpegExtraArgs: '-c copy' })
  const [configLoaded, setConfigLoaded] = useState(false)
  const [configSaving, setConfigSaving] = useState(false)

  const [pwForm, setPwForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' })
  const [pwSaving, setPwSaving] = useState(false)
  const [pwFlash, setPwFlash] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    if (flash?.kind !== 'success') return
    const t = setTimeout(() => setFlash(null), 4000)
    return () => clearTimeout(t)
  }, [flash])

  useEffect(() => {
    if (pwFlash?.kind !== 'success') return
    const t = setTimeout(() => setPwFlash(null), 4000)
    return () => clearTimeout(t)
  }, [pwFlash])

  useEffect(() => {
    const youtube = searchParams.get('youtube')
    if (youtube === 'connected') {
      setFlash({ kind: 'success', text: 'YouTube account connected successfully.' })
      setSearchParams({}, { replace: true })
    } else if (youtube === 'error') {
      setFlash({ kind: 'error', text: 'Failed to connect YouTube account. Check that YOUTUBE_CLIENT_ID and YOUTUBE_CLIENT_SECRET are configured.' })
      setSearchParams({}, { replace: true })
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!user?.isAdmin) return

    fetch('/api/youtube/account')
      .then(async (res) => {
        if (res.status === 404) { setYtState('disconnected'); return }
        if (res.status === 500) { setYtState('unconfigured'); return }
        if (!res.ok) { setYtState('disconnected'); return }
        setAccount(await res.json() as YouTubeAccount)
        setYtState('connected')
      })
      .catch(() => setYtState('disconnected'))

    fetch('/api/streams')
      .then((r) => r.json() as Promise<StreamRow[]>)
      .then(setStreamList)
      .catch(() => {})

    fetch('/api/config/stream')
      .then((r) => r.json() as Promise<StreamConfig>)
      .then((d) => { setConfig(d); setConfigLoaded(true) })
      .catch(() => setConfigLoaded(true))
  }, [user?.isAdmin])

  const disconnect = async () => {
    await fetch('/api/youtube/account', { method: 'DELETE' })
    setAccount(null)
    setYtState('disconnected')
    setFlash({ kind: 'success', text: 'YouTube account disconnected.' })
  }

  const openNew = () => {
    setForm(emptyForm)
    setEditingId('new')
  }

  const openEdit = (s: StreamRow) => {
    setForm({
      name: s.name,
      youtubeTitle: s.youtubeTitle,
      privacyStatus: s.privacyStatus,
      sourceUrl: s.sourceUrl ?? '',
      ffmpegExtraArgs: s.ffmpegExtraArgs ?? '',
    })
    setEditingId(s.id)
  }

  const cancelEdit = () => setEditingId(null)

  const saveStream = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormSaving(true)
    const body = {
      name: form.name,
      youtubeTitle: form.youtubeTitle,
      privacyStatus: form.privacyStatus,
      sourceUrl: form.sourceUrl || null,
      ffmpegExtraArgs: form.ffmpegExtraArgs || null,
    }
    try {
      if (editingId === 'new') {
        const res = await fetch('/api/streams', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        const created = await res.json() as StreamRow
        setStreamList((prev) => [...prev, created])
      } else {
        const res = await fetch(`/api/streams/${editingId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        const updated = await res.json() as StreamRow
        setStreamList((prev) => prev.map((s) => (s.id === editingId ? updated : s)))
      }
      setEditingId(null)
    } catch {
      setFlash({ kind: 'error', text: 'Failed to save stream.' })
    } finally {
      setFormSaving(false)
    }
  }

  const deleteStream = async (id: string) => {
    const res = await fetch(`/api/streams/${id}`, { method: 'DELETE' })
    if (res.ok) {
      setStreamList((prev) => prev.filter((s) => s.id !== id))
    } else {
      const data = await res.json() as { error?: string }
      setFlash({ kind: 'error', text: data.error ?? 'Failed to delete stream.' })
    }
  }

  const saveConfig = async (e: React.FormEvent) => {
    e.preventDefault()
    setConfigSaving(true)
    try {
      const res = await fetch('/api/config/stream', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      })
      if (!res.ok) throw new Error()
      setFlash({ kind: 'success', text: 'Configuration saved.' })
    } catch {
      setFlash({ kind: 'error', text: 'Failed to save configuration.' })
    } finally {
      setConfigSaving(false)
    }
  }

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (pwForm.newPassword !== pwForm.confirmPassword) {
      setPwFlash({ kind: 'error', text: 'New passwords do not match.' })
      return
    }
    setPwSaving(true)
    try {
      const res = await fetch('/api/users/me/password', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: pwForm.currentPassword, newPassword: pwForm.newPassword }),
      })
      if (!res.ok) {
        const data = await res.json() as { error?: string }
        setPwFlash({ kind: 'error', text: data.error ?? 'Failed to change password.' })
        return
      }
      setPwForm({ currentPassword: '', newPassword: '', confirmPassword: '' })
      setPwFlash({ kind: 'success', text: 'Password changed successfully.' })
    } catch {
      setPwFlash({ kind: 'error', text: 'Network error.' })
    } finally {
      setPwSaving(false)
    }
  }

  const pwCard = (
    <Card>
      <CardHeader>
        <CardTitle>Change Password</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={changePassword} className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="current-password">Current Password</Label>
            <Input
              id="current-password"
              type="password"
              value={pwForm.currentPassword}
              onChange={(e) => setPwForm((f) => ({ ...f, currentPassword: e.target.value }))}
              required
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="new-password">New Password</Label>
            <Input
              id="new-password"
              type="password"
              value={pwForm.newPassword}
              onChange={(e) => setPwForm((f) => ({ ...f, newPassword: e.target.value }))}
              required
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="confirm-password">Confirm New Password</Label>
            <Input
              id="confirm-password"
              type="password"
              value={pwForm.confirmPassword}
              onChange={(e) => setPwForm((f) => ({ ...f, confirmPassword: e.target.value }))}
              required
            />
          </div>
          {pwFlash && (
            <div className={`rounded-md px-4 py-3 text-sm ${pwFlash.kind === 'success' ? 'bg-green-500/10 text-green-700 dark:text-green-400' : 'bg-destructive/10 text-destructive'}`}>
              {pwFlash.text}
            </div>
          )}
          <Button type="submit" disabled={pwSaving}>{pwSaving ? 'Saving…' : 'Change Password'}</Button>
        </form>
      </CardContent>
    </Card>
  )

  if (!user?.isAdmin) {
    return (
      <Layout>
        <div className="max-w-2xl space-y-6">
          <h1 className="text-2xl font-bold">Settings</h1>
          {pwCard}
        </div>
      </Layout>
    )
  }

  return (
    <Layout>
      <div className="max-w-2xl space-y-6">
        <h1 className="text-2xl font-bold">Settings</h1>

        {flash && (
          <div className={`rounded-md px-4 py-3 text-sm ${flash.kind === 'success' ? 'bg-green-500/10 text-green-700 dark:text-green-400' : 'bg-destructive/10 text-destructive'}`}>
            {flash.text}
          </div>
        )}

        {/* YouTube Account */}
        <Card>
          <CardHeader>
            <CardTitle>YouTube Account</CardTitle>
            <CardDescription>Connect a YouTube account to create and manage live broadcasts.</CardDescription>
          </CardHeader>
          <CardContent>
            {ytState === 'loading' && <p className="text-sm text-muted-foreground">Loading…</p>}
            {ytState === 'unconfigured' && (
              <p className="text-sm text-muted-foreground">
                YouTube OAuth is not configured. Set{' '}
                <code className="rounded bg-muted px-1 py-0.5 text-xs">YOUTUBE_CLIENT_ID</code> and{' '}
                <code className="rounded bg-muted px-1 py-0.5 text-xs">YOUTUBE_CLIENT_SECRET</code> in your environment.
              </p>
            )}
            {ytState === 'connected' && account && (
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="truncate font-medium">{account.channelTitle}</p>
                  <p className="truncate text-sm text-muted-foreground">{account.email}</p>
                </div>
                <Button variant="outline" onClick={disconnect} className="shrink-0">Disconnect</Button>
              </div>
            )}
            {ytState === 'disconnected' && (
              <div className="flex items-center justify-between gap-4">
                <p className="text-sm text-muted-foreground">No account connected.</p>
                <Button asChild className="shrink-0"><a href="/api/youtube/auth">Connect YouTube</a></Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Streams */}
        <Card>
          <CardHeader>
            <CardTitle>Streams</CardTitle>
            <CardDescription>Configure stream presets that users can toggle live.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {streamList.map((s) => (
              <div key={s.id}>
                {editingId === s.id ? (
                  <StreamForm
                    form={form}
                    setForm={setForm}
                    onSave={saveStream}
                    onCancel={cancelEdit}
                    saving={formSaving}
                  />
                ) : (
                  <div className="flex items-center justify-between gap-2 rounded-md border px-3 py-2">
                    <div className="min-w-0">
                      <p className="font-medium">{s.name}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {s.youtubeTitle} · {s.privacyStatus}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(s)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => deleteStream(s.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ))}

            {editingId === 'new' ? (
              <StreamForm
                form={form}
                setForm={setForm}
                onSave={saveStream}
                onCancel={cancelEdit}
                saving={formSaving}
              />
            ) : (
              <Button variant="outline" className="w-full" onClick={openNew}>
                + Add Stream
              </Button>
            )}
          </CardContent>
        </Card>

        {/* Global Config */}
        <Card>
          <CardHeader>
            <CardTitle>Default Source</CardTitle>
            <CardDescription>
              Global MediaMTX URL and ffmpeg args. Individual streams can override these.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!configLoaded ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : (
              <form onSubmit={saveConfig} className="space-y-4">
                <div className="space-y-1">
                  <Label htmlFor="sourceUrl">MediaMTX Source URL</Label>
                  <Input
                    id="sourceUrl"
                    placeholder="rtsp://mediamtx:8554/live"
                    value={config.sourceUrl}
                    onChange={(e) => setConfig((c) => ({ ...c, sourceUrl: e.target.value }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="ffmpegArgs">FFmpeg Extra Args</Label>
                  <Input
                    id="ffmpegArgs"
                    placeholder="-c copy"
                    value={config.ffmpegExtraArgs}
                    onChange={(e) => setConfig((c) => ({ ...c, ffmpegExtraArgs: e.target.value }))}
                  />
                  <p className="text-xs text-muted-foreground">
                    Args between <code className="bg-muted px-1 rounded">-i &lt;source&gt;</code> and{' '}
                    <code className="bg-muted px-1 rounded">-f flv &lt;destination&gt;</code>.
                  </p>
                </div>
                <Button type="submit" disabled={configSaving}>{configSaving ? 'Saving…' : 'Save'}</Button>
              </form>
            )}
          </CardContent>
        </Card>

        {pwCard}
      </div>
    </Layout>
  )
}

function StreamForm({
  form,
  setForm,
  onSave,
  onCancel,
  saving,
}: {
  form: typeof emptyForm
  setForm: React.Dispatch<React.SetStateAction<typeof emptyForm>>
  onSave: (e: React.FormEvent) => void
  onCancel: () => void
  saving: boolean
}) {
  const set = (k: keyof typeof emptyForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))

  return (
    <form onSubmit={onSave} className="space-y-3 rounded-md border p-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>Display Name</Label>
          <Input placeholder="Main Camera" value={form.name} onChange={set('name')} required />
        </div>
        <div className="space-y-1">
          <Label>YouTube Title</Label>
          <Input placeholder="Live Stream" value={form.youtubeTitle} onChange={set('youtubeTitle')} required />
        </div>
      </div>
      <div className="space-y-1">
        <Label>Privacy</Label>
        <select
          value={form.privacyStatus}
          onChange={set('privacyStatus')}
          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
        >
          {PRIVACY_OPTIONS.map((p) => (
            <option key={p} value={p} className="bg-background capitalize">{p}</option>
          ))}
        </select>
      </div>
      <details className="text-sm">
        <summary className="cursor-pointer text-muted-foreground select-none">Advanced overrides</summary>
        <div className="mt-3 space-y-3">
          <div className="space-y-1">
            <Label>Source URL override</Label>
            <Input placeholder="Leave blank to use default" value={form.sourceUrl} onChange={set('sourceUrl')} />
          </div>
          <div className="space-y-1">
            <Label>FFmpeg Args override</Label>
            <Input placeholder="Leave blank to use default" value={form.ffmpegExtraArgs} onChange={set('ffmpegExtraArgs')} />
          </div>
        </div>
      </details>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          <X className="h-4 w-4" />
          Cancel
        </Button>
      </div>
    </form>
  )
}
