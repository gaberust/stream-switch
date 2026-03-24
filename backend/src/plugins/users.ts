import bcryptjs from 'bcryptjs'
import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { db } from '../db/index'
import { users } from '../db/schema'
import { requireAdmin, requireAuth } from '../middleware/protect'

export default async function usersPlugin(app: FastifyInstance) {
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

  app.get('/api/users', { preHandler: requireAdmin }, async () => {
    return db.select({ id: users.id, username: users.username, isAdmin: users.isAdmin }).from(users)
  })

  app.post<{ Body: { username: string; password: string; isAdmin?: boolean } }>(
    '/api/users',
    {
      preHandler: requireAdmin,
      schema: {
        body: {
          type: 'object',
          required: ['username', 'password'],
          properties: {
            username: { type: 'string', minLength: 1 },
            password: { type: 'string', minLength: 1 },
            isAdmin: { type: 'boolean' },
          },
        },
      },
    },
    async (request, reply) => {
      const { username, password, isAdmin = false } = request.body
      const existing = await db.select().from(users).where(eq(users.username, username))
      if (existing.length > 0) return reply.code(409).send({ error: 'Username already taken' })
      const passwordHash = await bcryptjs.hash(password, 10)
      const [created] = await db
        .insert(users)
        .values({ username, passwordHash, isAdmin })
        .returning({ id: users.id, username: users.username, isAdmin: users.isAdmin })
      return reply.code(201).send(created)
    },
  )

  app.patch<{ Params: { id: string }; Body: { isAdmin?: boolean; password?: string } }>(
    '/api/users/:id',
    {
      preHandler: requireAdmin,
      schema: {
        body: {
          type: 'object',
          properties: {
            isAdmin: { type: 'boolean' },
            password: { type: 'string', minLength: 1 },
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
      if (request.body.password) updates.passwordHash = await bcryptjs.hash(request.body.password, 10)
      if (Object.keys(updates).length === 0) return reply.code(400).send({ error: 'Nothing to update' })
      const [updated] = await db
        .update(users)
        .set(updates)
        .where(eq(users.id, id))
        .returning({ id: users.id, username: users.username, isAdmin: users.isAdmin })
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
}
