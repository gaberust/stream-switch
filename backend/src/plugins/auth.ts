import bcryptjs from 'bcryptjs'
import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import jwt from 'jsonwebtoken'
import { db } from '../db/index'
import { users } from '../db/schema'
import { sendPasswordReset } from '../services/email'
import { requireAuth } from '../middleware/protect'

const jwtSecret = () => process.env.SESSION_SECRET ?? 'change-me-in-production-32chars!'

export default async function authPlugin(app: FastifyInstance) {
  app.post<{ Body: { username: string; password: string } }>(
    '/api/auth/login',
    {
      schema: {
        body: {
          type: 'object',
          required: ['username', 'password'],
          properties: {
            username: { type: 'string' },
            password: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      const { username, password } = request.body

      const [user] = await db.select().from(users).where(eq(users.username, username))

      if (!user || !(await bcryptjs.compare(password, user.passwordHash))) {
        return reply.code(401).send({ error: 'Invalid credentials' })
      }

      request.session.userId = user.id
      request.session.isAdmin = user.isAdmin
      request.session.username = user.username

      return { id: user.id, username: user.username, isAdmin: user.isAdmin }
    },
  )

  app.post('/api/auth/logout', { preHandler: requireAuth }, async (request, reply) => {
    await request.session.destroy()
    return { ok: true }
  })

  app.get('/api/auth/me', { preHandler: requireAuth }, async (request) => {
    return {
      id: request.session.userId,
      username: request.session.username,
      isAdmin: request.session.isAdmin,
    }
  })

  // ── Password reset ───────────────────────────────────────────────────────────

  app.post<{ Body: { email: string } }>(
    '/api/auth/forgot-password',
    {
      schema: {
        body: {
          type: 'object',
          required: ['email'],
          properties: { email: { type: 'string' } },
        },
      },
    },
    async (request) => {
      const { email } = request.body
      const [user] = await db.select().from(users).where(eq(users.email, email))
      if (user) {
        const token = jwt.sign({ sub: user.id, type: 'reset' }, jwtSecret(), { expiresIn: '1h' })
        await sendPasswordReset(email, token).catch(() => {})
      }
      // Always 200 — don't reveal whether the email exists
      return { ok: true }
    },
  )

  app.get<{ Querystring: { token: string } }>(
    '/api/auth/verify-token',
    {
      schema: {
        querystring: {
          type: 'object',
          required: ['token'],
          properties: { token: { type: 'string' } },
        },
      },
    },
    async (request, reply) => {
      try {
        const payload = jwt.verify(request.query.token, jwtSecret()) as unknown as { sub: number; type: string }
        const [user] = await db
          .select({ id: users.id, username: users.username, invitePending: users.invitePending })
          .from(users)
          .where(eq(users.id, payload.sub))
        if (!user) return reply.code(400).send({ error: 'Invalid token' })
        if (payload.type === 'invite' && !user.invitePending) {
          return reply.code(400).send({ error: 'Invite already accepted' })
        }
        return { username: user.username, type: payload.type }
      } catch {
        return reply.code(400).send({ error: 'Invalid or expired token' })
      }
    },
  )

  app.post<{ Body: { token: string; password: string } }>(
    '/api/auth/reset-password',
    {
      schema: {
        body: {
          type: 'object',
          required: ['token', 'password'],
          properties: {
            token: { type: 'string' },
            password: { type: 'string', minLength: 8 },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const { token, password } = request.body
        const payload = jwt.verify(token, jwtSecret()) as unknown as { sub: number; type: string }
        if (payload.type !== 'reset' && payload.type !== 'invite') {
          return reply.code(400).send({ error: 'Invalid token type' })
        }
        const passwordHash = await bcryptjs.hash(password, 10)
        const updates: Partial<typeof users.$inferInsert> = { passwordHash }
        if (payload.type === 'invite') updates.invitePending = false
        await db.update(users).set(updates).where(eq(users.id, payload.sub))
        return { ok: true }
      } catch {
        return reply.code(400).send({ error: 'Invalid or expired token' })
      }
    },
  )
}
