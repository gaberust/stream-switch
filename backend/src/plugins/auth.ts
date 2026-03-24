import bcryptjs from 'bcryptjs'
import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { db } from '../db/index'
import { users } from '../db/schema'
import { requireAuth } from '../middleware/protect'

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
}
