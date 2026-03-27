import { ClipboardList, LogOut, Menu, Moon, Radio, Settings, Sun, Users, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { useTheme } from '@/context/ThemeContext'
import { cn } from '@/lib/utils'

function useUpdateCheck(isAdmin: boolean) {
  const [newVersion, setNewVersion] = useState<string | null>(null)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    if (!isAdmin) return
    const current = __APP_VERSION__
    fetch('https://hub.docker.com/v2/repositories/gaberust/stream-switch/tags?page_size=25')
      .then((r) => r.json() as Promise<{ results?: Array<{ name: string }> }>)
      .then(({ results }) => {
        if (!results) return
        const semver = results
          .map((t) => t.name)
          .filter((n) => /^\d+\.\d+\.\d+$/.test(n))
          .sort((a, b) => {
            const [aMaj, aMin, aPatch] = a.split('.').map(Number)
            const [bMaj, bMin, bPatch] = b.split('.').map(Number)
            return bMaj - aMaj || bMin - aMin || bPatch - aPatch
          })
        const latest = semver[0]
        if (latest && latest !== current) setNewVersion(latest)
      })
      .catch(() => {})
  }, [isAdmin])

  return { newVersion, dismissed, dismiss: () => setDismissed(true) }
}

const navItems = [
  { label: 'Streams', href: '/', icon: Radio, adminOnly: false },
  { label: 'Users', href: '/users', icon: Users, adminOnly: true },
  { label: 'Activity', href: '/activity', icon: ClipboardList, adminOnly: true },
  { label: 'Settings', href: '/settings', icon: Settings, adminOnly: false },
]

export default function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth()
  const { theme, toggle } = useTheme()
  const location = useLocation()
  const [open, setOpen] = useState(false)
  const { newVersion, dismissed, dismiss } = useUpdateCheck(user?.isAdmin ?? false)

  const visible = navItems.filter((item) => !item.adminOnly || user?.isAdmin)

  const sidebar = (
    <>
      <div className="border-b px-4 py-5 flex items-center justify-between">
        <span className="text-lg font-bold tracking-tight">StreamSwitch</span>
        <button
          className="md:hidden text-muted-foreground hover:text-foreground"
          onClick={() => setOpen(false)}
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <nav className="flex-1 space-y-1 p-3">
        {visible.map(({ label, href, icon: Icon }) => (
          <Link
            key={href}
            to={href}
            onClick={() => setOpen(false)}
            className={cn(
              'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground',
              location.pathname === href && 'bg-accent text-accent-foreground',
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </Link>
        ))}
      </nav>

      <div className="border-t p-3 space-y-1">
        <div className="mb-1 px-3 text-xs text-muted-foreground">{user?.username}</div>
        <button
          onClick={toggle}
          className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors hover:bg-accent hover:text-accent-foreground"
        >
          {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          {theme === 'dark' ? 'Light mode' : 'Dark mode'}
        </button>
        <button
          onClick={logout}
          className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-destructive transition-colors hover:bg-accent"
        >
          <LogOut className="h-4 w-4" />
          Logout
        </button>
      </div>
    </>
  )

  return (
    <div className="flex h-screen bg-background">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-60 flex-col border-r">
        {sidebar}
      </aside>

      {/* Mobile overlay */}
      {open && (
        <div
          className="fixed inset-0 z-20 bg-background/80 backdrop-blur-sm md:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Mobile drawer */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-30 flex w-60 flex-col border-r bg-background transition-transform duration-200 md:hidden',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        {sidebar}
      </aside>

      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Mobile top bar */}
        <div className="flex items-center gap-3 border-b px-4 py-3 md:hidden">
          <button
            onClick={() => setOpen(true)}
            className="text-muted-foreground hover:text-foreground"
          >
            <Menu className="h-5 w-5" />
          </button>
          <span className="text-sm font-semibold">StreamSwitch</span>
        </div>

        {newVersion && !dismissed && (
          <div className="flex items-center justify-between gap-3 border-b bg-primary/10 px-4 py-2 text-sm">
            <span>
              A new version is available:{' '}
              <span className="font-semibold">{newVersion}</span>
              {' '}(current: {__APP_VERSION__})
            </span>
            <button
              onClick={dismiss}
              className="shrink-0 text-muted-foreground hover:text-foreground"
              aria-label="Dismiss"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
        <main className="flex-1 overflow-auto p-6">{children}</main>
      </div>
    </div>
  )
}
