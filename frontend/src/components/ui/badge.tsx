import { cn } from '@/lib/utils'

const variants: Record<string, string> = {
  starting: 'bg-yellow-500/15 text-yellow-700 dark:text-yellow-400',
  live: 'bg-green-500/15 text-green-700 dark:text-green-400',
  stopped: 'bg-muted text-muted-foreground',
  error: 'bg-destructive/15 text-destructive',
}

export function Badge({ status, className }: { status: string; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize',
        variants[status] ?? variants.stopped,
        className,
      )}
    >
      {status}
    </span>
  )
}
