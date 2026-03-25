import fastifyCookie from '@fastify/cookie'
import fastifySession from '@fastify/session'
import fastifyStatic from '@fastify/static'
import { eq } from 'drizzle-orm'
import Fastify, { type FastifyInstance } from 'fastify'
import path from 'path'
import { db } from './db/index'
import { seed } from './db/seed'
import { youtubeAccounts } from './db/schema'
import authPlugin from './plugins/auth'
import processesPlugin from './plugins/processes'
import streamsPlugin from './plugins/streams'
import usersPlugin from './plugins/users'
import wsPlugin from './plugins/websocket'
import youtubePlugin from './plugins/youtube'
import { FfmpegProcessManager } from './services/ffmpeg'
import { StreamForwardService } from './services/streamForward'
import { YouTubeService } from './services/youtube'

async function getAnyYouTubeService() {
  const [account] = await db.select().from(youtubeAccounts).limit(1)
  if (!account) return null
  return new YouTubeService(account, async (refreshed) => {
    await db
      .update(youtubeAccounts)
      .set({
        ...(refreshed.access_token ? { accessToken: refreshed.access_token } : {}),
        ...(refreshed.refresh_token ? { refreshToken: refreshed.refresh_token } : {}),
        ...(refreshed.expiry_date != null ? { expiryDate: refreshed.expiry_date } : {}),
        updatedAt: Date.now(),
      })
      .where(eq(youtubeAccounts.id, account.id))
  })
}

export async function buildApp(options: { logger?: boolean } = {}): Promise<FastifyInstance> {
  const trustProxy = process.env.TRUST_PROXY === 'true'
  const app = Fastify({ logger: options.logger ?? true, trustProxy })

  const ffmpegManager = new FfmpegProcessManager()
  const forwardService = new StreamForwardService(ffmpegManager, getAnyYouTubeService)
  await forwardService.initialize()

  app.decorate('ffmpeg', ffmpegManager)
  app.decorate('forwards', forwardService)

  await app.register(fastifyCookie)
  await app.register(fastifySession, {
    secret: process.env.SESSION_SECRET ?? 'change-me-in-production-32chars!',
    cookie: {
      secure: trustProxy, // true when behind an HTTPS reverse proxy
      httpOnly: true,
      maxAge: 86_400_000, // 24 h
    },
    saveUninitialized: false,
  })

  await app.register(authPlugin)
  await app.register(usersPlugin)
  await app.register(streamsPlugin)
  await app.register(processesPlugin)
  await app.register(youtubePlugin)
  await app.register(wsPlugin)

  if (process.env.NODE_ENV === 'production') {
    const distPath = path.resolve(__dirname, '..', '..', 'frontend', 'dist')

    await app.register(fastifyStatic, { root: distPath, wildcard: false })

    app.setNotFoundHandler(async (request, reply) => {
      if (request.url.startsWith('/api') || request.url.startsWith('/ws')) {
        return reply.code(404).send({ error: 'Not Found' })
      }
      return reply.sendFile('index.html')
    })
  }

  return app
}

async function main() {
  await seed()
  const app = await buildApp()
  await app.listen({ port: 3000, host: process.env.BIND_HOST ?? '0.0.0.0' })
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
