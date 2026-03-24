import type { FfmpegProcessManager } from './services/ffmpeg'
import type { StreamForwardService } from './services/streamForward'

declare module '@fastify/session' {
  interface FastifySessionObject {
    userId?: number
    isAdmin?: boolean
    username?: string
    oauthState?: string
  }
}

declare module 'fastify' {
  interface FastifyInstance {
    ffmpeg: FfmpegProcessManager
    forwards: StreamForwardService
  }
}
