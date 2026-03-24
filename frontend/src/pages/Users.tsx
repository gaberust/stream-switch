import { KeyRound, Shield, ShieldOff, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import Layout from '@/components/Layout'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/context/AuthContext'

interface UserRow {
  id: number
  username: string
  isAdmin: boolean
}

export default function Users() {
  const { user } = useAuth()
  const [users, setUsers] = useState<UserRow[]>([])
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [isAdmin, setIsAdmin] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [changingPwFor, setChangingPwFor] = useState<number | null>(null)
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [pwError, setPwError] = useState<string | null>(null)
  const [pwSaving, setPwSaving] = useState(false)

  useEffect(() => {
    fetch('/api/users')
      .then((r) => r.json() as Promise<UserRow[]>)
      .then(setUsers)
      .catch(() => setUsers([]))
  }, [])

  const createUser = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, isAdmin }),
      })
      const data = await res.json() as UserRow & { error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Failed to create user')
      setUsers((prev) => [...prev, data])
      setUsername('')
      setPassword('')
      setIsAdmin(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create user')
    } finally {
      setSubmitting(false)
    }
  }

  const deleteUser = async (id: number) => {
    const res = await fetch(`/api/users/${id}`, { method: 'DELETE' })
    if (res.ok) setUsers((prev) => prev.filter((u) => u.id !== id))
  }

  const toggleAdmin = async (row: UserRow) => {
    const res = await fetch(`/api/users/${row.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isAdmin: !row.isAdmin }),
    })
    if (res.ok) {
      const updated = await res.json() as UserRow
      setUsers((prev) => prev.map((u) => (u.id === row.id ? updated : u)))
    }
  }

  const openChangePw = (id: number) => {
    setChangingPwFor(id)
    setNewPw('')
    setConfirmPw('')
    setPwError(null)
  }

  const submitChangePw = async (e: React.FormEvent) => {
    e.preventDefault()
    if (newPw !== confirmPw) { setPwError('Passwords do not match'); return }
    setPwSaving(true)
    setPwError(null)
    try {
      const res = await fetch(`/api/users/${changingPwFor}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: newPw }),
      })
      if (!res.ok) {
        const data = await res.json() as { error?: string }
        setPwError(data.error ?? 'Failed to change password')
        return
      }
      setChangingPwFor(null)
    } catch {
      setPwError('Network error')
    } finally {
      setPwSaving(false)
    }
  }

  return (
    <Layout>
      <div className="max-w-2xl space-y-6">
        <h1 className="text-2xl font-bold">Users</h1>

        <Card>
          <CardHeader>
            <CardTitle>Add User</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={createUser} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="new-username">Username</Label>
                  <Input
                    id="new-username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="new-password">Password</Label>
                  <Input
                    id="new-password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={isAdmin}
                  onChange={(e) => setIsAdmin(e.target.checked)}
                  className="rounded"
                />
                Admin
              </label>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" disabled={submitting}>
                {submitting ? 'Creating…' : 'Create User'}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>All Users</CardTitle>
            <CardDescription>{users.length} user{users.length !== 1 ? 's' : ''}</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y">
              {users.map((row) => (
                <div key={row.id}>
                  <div className="flex items-center justify-between px-6 py-3">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{row.username}</span>
                      {row.isAdmin && (
                        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                          admin
                        </span>
                      )}
                      {row.id === user?.id && (
                        <span className="text-xs text-muted-foreground">(you)</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Change password"
                        onClick={() => changingPwFor === row.id ? setChangingPwFor(null) : openChangePw(row.id)}
                      >
                        <KeyRound className="h-4 w-4 text-muted-foreground" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        title={row.isAdmin ? 'Remove admin' : 'Make admin'}
                        disabled={row.id === user?.id}
                        onClick={() => toggleAdmin(row)}
                      >
                        {row.isAdmin ? (
                          <ShieldOff className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <Shield className="h-4 w-4 text-muted-foreground" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Delete user"
                        disabled={row.id === user?.id}
                        onClick={() => deleteUser(row.id)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>

                  {changingPwFor === row.id && (
                    <form onSubmit={submitChangePw} className="border-t bg-muted/40 px-6 py-4 space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label>New Password</Label>
                          <Input
                            type="password"
                            value={newPw}
                            onChange={(e) => setNewPw(e.target.value)}
                            required
                            autoFocus
                          />
                        </div>
                        <div className="space-y-1">
                          <Label>Confirm Password</Label>
                          <Input
                            type="password"
                            value={confirmPw}
                            onChange={(e) => setConfirmPw(e.target.value)}
                            required
                          />
                        </div>
                      </div>
                      {pwError && <p className="text-sm text-destructive">{pwError}</p>}
                      <div className="flex gap-2">
                        <Button type="submit" size="sm" disabled={pwSaving}>
                          {pwSaving ? 'Saving…' : 'Set Password'}
                        </Button>
                        <Button type="button" variant="ghost" size="sm" onClick={() => setChangingPwFor(null)}>
                          Cancel
                        </Button>
                      </div>
                    </form>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  )
}
