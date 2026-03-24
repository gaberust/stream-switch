import { randomBytes } from 'crypto'
import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { db } from '../db/index'
import { streams } from '../db/schema'
import { requireAdmin, requireAuth } from '../middleware/protect'

export default async function streamsPlugin(app: FastifyInstance) {
  // ── Stream CRUD (admin) ──────────────────────────────────────────────────────

  // List all streams, each annotated with its active forward (if any)
  app.get('/api/streams', { preHandler: requireAuth }, async () => {
    const allStreams = await db.select().from(streams)
    return allStreams.map((s) => ({
      ...s,
      activeForward: app.forwards.getActiveForStream(s.id) ?? null,
    }))
  })

  app.post<{
    Body: {
      name: string
      youtubeTitle: string
      privacyStatus?: 'public' | 'private' | 'unlisted'
      sourceUrl?: string
      ffmpegExtraArgs?: string
    }
  }>(
    '/api/streams',
    {
      preHandler: requireAdmin,
      schema: {
        body: {
          type: 'object',
          required: ['name', 'youtubeTitle'],
          properties: {
            name: { type: 'string', minLength: 1 },
            youtubeTitle: { type: 'string', minLength: 1 },
            privacyStatus: { type: 'string', enum: ['public', 'private', 'unlisted'] },
            sourceUrl: { type: 'string' },
            ffmpegExtraArgs: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      const { name, youtubeTitle, privacyStatus = 'private', sourceUrl, ffmpegExtraArgs } = request.body
      const id = randomBytes(6).toString('hex')
      const [created] = await db
        .insert(streams)
        .values({
          id,
          name,
          youtubeTitle,
          privacyStatus,
          sourceUrl: sourceUrl ?? null,
          ffmpegExtraArgs: ffmpegExtraArgs ?? null,
          createdAt: Date.now(),
        })
        .returning()
      return reply.code(201).send({ ...created, activeForward: null })
    },
  )

  app.patch<{
    Params: { id: string }
    Body: {
      name?: string
      youtubeTitle?: string
      privacyStatus?: 'public' | 'private' | 'unlisted'
      sourceUrl?: string | null
      ffmpegExtraArgs?: string | null
    }
  }>(
    '/api/streams/:id',
    {
      preHandler: requireAdmin,
      schema: {
        body: {
          type: 'object',
          properties: {
            name: { type: 'string', minLength: 1 },
            youtubeTitle: { type: 'string', minLength: 1 },
            privacyStatus: { type: 'string', enum: ['public', 'private', 'unlisted'] },
            sourceUrl: { type: ['string', 'null'] },
            ffmpegExtraArgs: { type: ['string', 'null'] },
          },
        },
      },
    },
    async (request, reply) => {
      const [updated] = await db
        .update(streams)
        .set(request.body)
        .where(eq(streams.id, request.params.id))
        .returning()
      if (!updated) return reply.code(404).send({ error: 'Stream not found' })
      return { ...updated, activeForward: app.forwards.getActiveForStream(updated.id) ?? null }
    },
  )

  app.delete<{ Params: { id: string } }>(
    '/api/streams/:id',
    { preHandler: requireAdmin },
    async (request, reply) => {
      if (app.forwards.getActiveForStream(request.params.id)) {
        return reply.code(409).send({ error: 'Stop the stream before deleting it' })
      }
      await db.delete(streams).where(eq(streams.id, request.params.id))
      return { ok: true }
    },
  )

  // ── Per-stream start / stop (any authenticated user) ────────────────────────

  app.post<{ Params: { id: string } }>(
    '/api/streams/:id/start',
    { preHandler: requireAuth },
    async (request, reply) => {
      try {
        const fwd = await app.forwards.startForStream(request.params.id, request.session.userId!)
        return reply.code(201).send(fwd)
      } catch (err) {
        const msg = (err as Error).message
        const status =
          msg === 'This stream is already live' ? 409
          : msg.includes('No YouTube') || msg.includes('No source URL') ? 400
          : 502
        return reply.code(status).send({ error: msg })
      }
    },
  )

  app.post<{ Params: { id: string } }>(
    '/api/streams/:id/stop',
    { preHandler: requireAuth },
    async (request, reply) => {
      try {
        await app.forwards.stopForStream(request.params.id)
        return { ok: true }
      } catch (err) {
        return reply.code(404).send({ error: (err as Error).message })
      }
    },
  )

  // ── Global config (admin) ────────────────────────────────────────────────────

  app.get('/api/config/stream', { preHandler: requireAdmin }, async () => {
    return app.forwards.getConfig()
  })

  app.put<{ Body: { sourceUrl?: string; ffmpegExtraArgs?: string } }>(
    '/api/config/stream',
    {
      preHandler: requireAdmin,
      schema: {
        body: {
          type: 'object',
          properties: {
            sourceUrl: { type: 'string' },
            ffmpegExtraArgs: { type: 'string' },
          },
        },
      },
    },
    async (request) => {
      return app.forwards.setConfig(request.body)
    },
  )
}
