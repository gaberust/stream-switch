import bcryptjs from 'bcryptjs'
import { db } from '../db/index'
import { users } from '../db/schema'
import { buildApp } from '../index'
import type { FastifyInstance } from 'fastify'

export async function createApp(): Promise<FastifyInstance> {
  return buildApp({ logger: false })
}

export async function seedUsers() {
  const adminHash = await bcryptjs.hash('adminpass', 10)
  const userHash = await bcryptjs.hash('userpass', 10)

  const [admin] = await db
    .insert(users)
    .values({ username: 'testadmin', passwordHash: adminHash, isAdmin: true })
    .returning()

  const [regular] = await db
    .insert(users)
    .values({ username: 'testuser', passwordHash: userHash, isAdmin: false })
    .returning()

  return { admin, regular }
}

/** Login and return the Set-Cookie header for use in subsequent requests. */
export async function loginAs(
  app: FastifyInstance,
  username: string,
  password: string,
): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { username, password },
  })
  const cookie = res.headers['set-cookie']
  if (!cookie) throw new Error(`Login failed for ${username}: ${res.body}`)
  return Array.isArray(cookie) ? cookie[0] : cookie
}
