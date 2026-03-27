import bcryptjs from 'bcryptjs'
import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import jwt from 'jsonwebtoken'
import { randomBytes } from 'crypto'
import { db } from '../db/index'
import { users } from '../db/schema'
import { requireAdmin, requireAuth } from '../middleware/protect'
import { isSmtpConfigured, sendInvite } from '../services/email'

const jwtSecret = () => process.env.SESSION_SECRET ?? 'change-me-in-production-32chars!'

const publicUserFields = {
  id: users.id,
  username: users.username,
  isAdmin: users.isAdmin,
  email: users.email,
  invitePending: users.invitePending,
}

export default async function usersPlugin(app: FastifyInstance) {
  // ── Self-service ─────────────────────────────────────────────────────────────

  app.patch<{ Body: { currentPassword: string; newPassword: string } }>(
    '/api/users/me/password',
    {
      preHandler: requireAuth,
      schema: {
        body: {
          type: 'object',
          required: ['currentPassword', 'newPassword'],
          properties: {
            currentPassword: { type: 'string', minLength: 1 },
            newPassword: { type: 'string', minLength: 1 },
          },
        },
      },
    },
    async (request, reply) => {
      const [row] = await db.select().from(users).where(eq(users.id, request.session.userId!))
      if (!row) return reply.code(404).send({ error: 'User not found' })
      const match = await bcryptjs.compare(request.body.currentPassword, row.passwordHash)
      if (!match) return reply.code(400).send({ error: 'Current password is incorrect' })
      const passwordHash = await bcryptjs.hash(request.body.newPassword, 10)
      await db.update(users).set({ passwordHash }).where(eq(users.id, row.id))
      return { ok: true }
    },
  )

  // ── Admin user management ────────────────────────────────────────────────────

  app.get('/api/users', { preHandler: requireAdmin }, async () => {
    return db.select(publicUserFields).from(users)
  })

  app.post<{ Body: { username: string; password?: string; email?: string; isAdmin?: boolean } }>(
    '/api/users',
    {
      preHandler: requireAdmin,
      schema: {
        body: {
          type: 'object',
          required: ['username'],
          properties: {
            username: { type: 'string', minLength: 1 },
            password: { type: 'string', minLength: 8 },
            email: { type: 'string' },
            isAdmin: { type: 'boolean' },
          },
        },
      },
    },
    async (request, reply) => {
      const { username, password, email, isAdmin = false } = request.body

      if (!password && !email) {
        return reply.code(400).send({ error: 'Either a password or email address is required' })
      }
      if (!password && !isSmtpConfigured()) {
        return reply.code(400).send({ error: 'SMTP is not configured — cannot send invite email. Set a password instead.' })
      }

      const existing = await db.select().from(users).where(eq(users.username, username))
      if (existing.length > 0) return reply.code(409).send({ error: 'Username already taken' })

      const isInvite = !password && !!email
      const passwordHash = isInvite
        ? await bcryptjs.hash(randomBytes(32).toString('hex'), 10)
        : await bcryptjs.hash(password!, 10)

      const [created] = await db
        .insert(users)
        .values({ username, passwordHash, isAdmin, email: email ?? null, invitePending: isInvite })
        .returning(publicUserFields)

      if (isInvite) {
        const token = jwt.sign({ sub: created.id, type: 'invite' }, jwtSecret(), { expiresIn: '7d' })
        await sendInvite(email!, username, token).catch((err) => {
          app.log.error({ err }, 'Failed to send invite email')
        })
      }

      return reply.code(201).send(created)
    },
  )

  app.patch<{ Params: { id: string }; Body: { isAdmin?: boolean; password?: string; email?: string } }>(
    '/api/users/:id',
    {
      preHandler: requireAdmin,
      schema: {
        body: {
          type: 'object',
          properties: {
            isAdmin: { type: 'boolean' },
            password: { type: 'string', minLength: 8 },
            email: { type: ['string', 'null'] },
          },
        },
      },
    },
    async (request, reply) => {
      const id = parseInt(request.params.id, 10)
      if (request.body.isAdmin !== undefined && id === request.session.userId) {
        return reply.code(400).send({ error: 'Cannot change your own admin status' })
      }
      const updates: Partial<typeof users.$inferInsert> = {}
      if (request.body.isAdmin !== undefined) updates.isAdmin = request.body.isAdmin
      if (request.body.password) {
        updates.passwordHash = await bcryptjs.hash(request.body.password, 10)
        updates.invitePending = false
      }
      if ('email' in request.body) updates.email = request.body.email ?? null
      if (Object.keys(updates).length === 0) return reply.code(400).send({ error: 'Nothing to update' })
      const [updated] = await db
        .update(users)
        .set(updates)
        .where(eq(users.id, id))
        .returning(publicUserFields)
      if (!updated) return reply.code(404).send({ error: 'User not found' })
      return updated
    },
  )

  app.delete<{ Params: { id: string } }>(
    '/api/users/:id',
    { preHandler: requireAdmin },
    async (request, reply) => {
      const id = parseInt(request.params.id, 10)
      if (id === request.session.userId) {
        return reply.code(400).send({ error: 'Cannot delete yourself' })
      }
      await db.delete(users).where(eq(users.id, id))
      return { ok: true }
    },
  )

  app.post<{ Params: { id: string } }>(
    '/api/users/:id/resend-invite',
    { preHandler: requireAdmin },
    async (request, reply) => {
      const id = parseInt(request.params.id, 10)
      const [user] = await db.select(publicUserFields).from(users).where(eq(users.id, id))
      if (!user) return reply.code(404).send({ error: 'User not found' })
      if (!user.invitePending) return reply.code(400).send({ error: 'User has already accepted their invite' })
      if (!user.email) return reply.code(400).send({ error: 'User has no email address' })
      if (!isSmtpConfigured()) return reply.code(400).send({ error: 'SMTP is not configured' })
      const token = jwt.sign({ sub: user.id, type: 'invite' }, jwtSecret(), { expiresIn: '7d' })
      await sendInvite(user.email, user.username, token)
      return { ok: true }
    },
  )

  // ── Feature flags (public) ───────────────────────────────────────────────────

  app.get('/api/config/features', async () => ({
    smtpEnabled: isSmtpConfigured(),
  }))
}
