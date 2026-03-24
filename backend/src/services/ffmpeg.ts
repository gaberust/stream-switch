import { spawn, type ChildProcess } from 'child_process'
import { EventEmitter } from 'events'

const MAX_STDERR_LINES = 200

export type ProcessStatus = 'running' | 'stopped' | 'error' | 'killed'

export interface ManagedProcess {
  id: string
  args: string[]
  status: ProcessStatus
  pid?: number
  startedAt: string
  stoppedAt?: string
  exitCode?: number | null
  signal?: string | null
  stderrLines: string[]
}

// Typed EventEmitter overloads
export declare interface FfmpegProcessManager {
  on(event: 'status', listener: (process: ManagedProcess) => void): this
  emit(event: 'status', process: ManagedProcess): boolean
}

export class FfmpegProcessManager extends EventEmitter {
  private processes = new Map<string, ManagedProcess>()
  private children = new Map<string, ChildProcess>()

  spawn(id: string, args: string[]): ManagedProcess {
    const existing = this.processes.get(id)
    if (existing?.status === 'running') {
      throw new Error(`Process "${id}" is already running`)
    }

    const proc: ManagedProcess = {
      id,
      args,
      status: 'running',
      startedAt: new Date().toISOString(),
      stderrLines: [],
    }

    const child = spawn('ffmpeg', ['-hide_banner', ...args])
    proc.pid = child.pid

    this.processes.set(id, proc)
    this.children.set(id, child)
    this.emit('status', proc)

    child.stderr.on('data', (chunk: Buffer) => {
      const incoming = chunk.toString().split('\n').filter(Boolean)
      proc.stderrLines.push(...incoming)
      if (proc.stderrLines.length > MAX_STDERR_LINES) {
        proc.stderrLines = proc.stderrLines.slice(-MAX_STDERR_LINES)
      }
      this.emit('status', proc)
    })

    child.on('exit', (code, signal) => {
      proc.stoppedAt = new Date().toISOString()
      proc.exitCode = code
      proc.signal = signal ?? null

      if (signal === 'SIGTERM' || signal === 'SIGKILL') {
        proc.status = 'killed'
      } else if (code === 0) {
        proc.status = 'stopped'
      } else {
        proc.status = 'error'
      }

      this.children.delete(id)
      this.emit('status', proc)
    })

    child.on('error', (err) => {
      proc.status = 'error'
      proc.stoppedAt = new Date().toISOString()
      proc.stderrLines.push(`[spawn error] ${err.message}`)
      this.children.delete(id)
      this.emit('status', proc)
    })

    return proc
  }

  kill(id: string): void {
    const child = this.children.get(id)
    if (!child) {
      throw new Error(`No running process with id "${id}"`)
    }
    child.kill('SIGTERM')
  }

  get(id: string): ManagedProcess | undefined {
    return this.processes.get(id)
  }

  list(): ManagedProcess[] {
    return Array.from(this.processes.values())
  }

  killAll(): void {
    for (const child of this.children.values()) {
      child.kill('SIGTERM')
    }
  }
}
