import { randomBytes } from 'crypto'
import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { db } from '../db/index'
import { youtubeAccounts } from '../db/schema'
import { requireAdmin } from '../middleware/protect'
import { exchangeCodeAndFetchProfile, generateAuthUrl } from '../services/youtube'

const FRONTEND_URL = process.env.FRONTEND_URL ?? ''

export default async function youtubePlugin(app: FastifyInstance) {
  // ── OAuth ──────────────────────────────────────────────────────────────────

  // Step 1: redirect the admin to Google's consent screen
  app.get('/api/youtube/auth', { preHandler: requireAdmin }, async (request, reply) => {
    if (!process.env.YOUTUBE_CLIENT_ID || !process.env.YOUTUBE_CLIENT_SECRET) {
      return reply.redirect(`${FRONTEND_URL}/settings?youtube=error`)
    }
    const state = randomBytes(16).toString('hex')
    request.session.oauthState = state
    return reply.redirect(generateAuthUrl(state))
  })

  // Step 2: Google redirects here after consent
  app.get<{ Querystring: { code?: string; state?: string; error?: string } }>(
    '/api/youtube/callback',
    async (request, reply) => {
      const { code, state, error } = request.query

      if (error || !code) {
        return reply.redirect(`${FRONTEND_URL}/settings?youtube=error`)
      }
      if (!request.session.userId || !request.session.isAdmin) {
        return reply.redirect(`${FRONTEND_URL}/login`)
      }
      if (state !== request.session.oauthState) {
        return reply.redirect(`${FRONTEND_URL}/settings?youtube=error`)
      }
      request.session.oauthState = undefined

      try {
        const { tokens, channelId, channelTitle, email } =
          await exchangeCodeAndFetchProfile(code)
        const now = Date.now()

        await db
          .insert(youtubeAccounts)
          .values({
            userId: request.session.userId,
            channelId,
            channelTitle,
            email,
            accessToken: tokens.access_token,
            refreshToken: tokens.refresh_token ?? null,
            expiryDate: tokens.expiry_date ?? null,
            createdAt: now,
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: youtubeAccounts.userId,
            set: {
              channelId,
              channelTitle,
              email,
              accessToken: tokens.access_token,
              refreshToken: tokens.refresh_token ?? null,
              expiryDate: tokens.expiry_date ?? null,
              updatedAt: now,
            },
          })

        return reply.redirect(`${FRONTEND_URL}/settings?youtube=connected`)
      } catch (err) {
        app.log.error(err, 'YouTube OAuth callback failed')
        return reply.redirect(`${FRONTEND_URL}/settings?youtube=error`)
      }
    },
  )

  // ── Account management ─────────────────────────────────────────────────────

  app.get('/api/youtube/account', { preHandler: requireAdmin }, async (request, reply) => {
    if (!process.env.YOUTUBE_CLIENT_ID || !process.env.YOUTUBE_CLIENT_SECRET) {
      return reply.code(500).send({ error: 'YouTube OAuth not configured' })
    }
    const [account] = await db
      .select({
        channelId: youtubeAccounts.channelId,
        channelTitle: youtubeAccounts.channelTitle,
        email: youtubeAccounts.email,
        createdAt: youtubeAccounts.createdAt,
      })
      .from(youtubeAccounts)
      .where(eq(youtubeAccounts.userId, request.session.userId!))

    if (!account) return reply.code(404).send({ error: 'No YouTube account connected' })
    return account
  })

  app.delete('/api/youtube/account', { preHandler: requireAdmin }, async (request) => {
    await db.delete(youtubeAccounts).where(eq(youtubeAccounts.userId, request.session.userId!))
    return { ok: true }
  })
}
