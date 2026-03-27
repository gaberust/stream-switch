import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type TokenState =
  | { status: 'loading' }
  | { status: 'invalid'; error: string }
  | { status: 'valid'; username: string; type: 'reset' | 'invite' }

export default function ResetPassword() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const token = searchParams.get('token') ?? ''

  const [tokenState, setTokenState] = useState<TokenState>({ status: 'loading' })
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  useEffect(() => {
    if (!token) { setTokenState({ status: 'invalid', error: 'Missing token.' }); return }
    fetch(`/api/auth/verify-token?token=${encodeURIComponent(token)}`)
      .then((r) => r.json() as Promise<{ username: string; type: 'reset' | 'invite' } | { error: string }>)
      .then((data) => {
        if ('error' in data) {
          setTokenState({ status: 'invalid', error: data.error })
        } else {
          setTokenState({ status: 'valid', username: data.username, type: data.type })
        }
      })
      .catch(() => setTokenState({ status: 'invalid', error: 'Network error.' }))
  }, [token])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password !== confirm) { setError('Passwords do not match'); return }
    setError(null)
    setSubmitting(true)
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      })
      const data = await res.json() as { error?: string }
      if (!res.ok) { setError(data.error ?? 'Something went wrong'); return }
      setDone(true)
      setTimeout(() => void navigate('/login', { replace: true }), 2000)
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const isInvite = tokenState.status === 'valid' && tokenState.type === 'invite'

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-2xl">
            {isInvite ? 'Welcome to Stream Switch' : 'Reset password'}
          </CardTitle>
          <CardDescription>
            {tokenState.status === 'loading' && 'Verifying link…'}
            {tokenState.status === 'invalid' && tokenState.error}
            {tokenState.status === 'valid' && (
              isInvite
                ? `Hello ${tokenState.username}! Set a password to activate your account.`
                : `Set a new password for ${tokenState.username}.`
            )}
          </CardDescription>
        </CardHeader>

        {tokenState.status === 'valid' && !done && (
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="password">New password</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoFocus
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm">Confirm password</Label>
                <Input
                  id="confirm"
                  type="password"
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? 'Saving…' : isInvite ? 'Activate account' : 'Reset password'}
              </Button>
            </form>
          </CardContent>
        )}

        {done && (
          <CardContent>
            <p className="text-sm text-muted-foreground text-center">
              Password set. Redirecting to sign in…
            </p>
          </CardContent>
        )}

        {tokenState.status === 'invalid' && (
          <CardContent>
            <p className="text-center text-sm text-muted-foreground">
              <Link to="/login" className="underline underline-offset-4">Back to sign in</Link>
            </p>
          </CardContent>
        )}
      </Card>
    </div>
  )
}
