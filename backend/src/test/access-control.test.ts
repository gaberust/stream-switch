import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { createApp, loginAs, seedUsers } from './helpers'

let app: FastifyInstance
let adminCookie: string
let userCookie: string

beforeAll(async () => {
  app = await createApp()
  await seedUsers()
  adminCookie = await loginAs(app, 'testadmin', 'adminpass')
  userCookie = await loginAs(app, 'testuser', 'userpass')
})

afterAll(async () => {
  await app.close()
})

const adminOnlyEndpoints: Array<{ method: string; url: string; payload?: unknown }> = [
  { method: 'GET', url: '/api/users' },
  { method: 'POST', url: '/api/users', payload: { username: 'x', password: 'y' } },
  { method: 'POST', url: '/api/streams', payload: { name: 'x', youtubeTitle: 'x' } },
  { method: 'DELETE', url: '/api/streams/nonexistent' },
  { method: 'GET', url: '/api/config/stream' },
  { method: 'PUT', url: '/api/config/stream', payload: {} },
  { method: 'GET', url: '/api/youtube/account' },
  { method: 'DELETE', url: '/api/youtube/account' },
]

const authRequiredEndpoints: Array<{ method: string; url: string; payload?: unknown }> = [
  { method: 'GET', url: '/api/auth/me' },
  { method: 'POST', url: '/api/auth/logout' },
  { method: 'GET', url: '/api/streams' },
  { method: 'PATCH', url: '/api/users/me/password', payload: { currentPassword: 'a', newPassword: 'b' } },
]

describe('Unauthenticated access', () => {
  for (const { method, url, payload } of [...adminOnlyEndpoints, ...authRequiredEndpoints]) {
    it(`${method} ${url} → 401`, async () => {
      const res = await app.inject({ method, url, payload } as Parameters<typeof app.inject>[0])
      expect(res.statusCode).toBe(401)
    })
  }
})

describe('Non-admin access to admin-only endpoints', () => {
  for (const { method, url, payload } of adminOnlyEndpoints) {
    it(`${method} ${url} → 403`, async () => {
      const res = await app.inject({
        method,
        url,
        payload,
        headers: { cookie: userCookie },
      } as Parameters<typeof app.inject>[0])
      expect(res.statusCode).toBe(403)
    })
  }
})

describe('Admin access to admin-only endpoints', () => {
  it('GET /api/users → 200', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/users',
      headers: { cookie: adminCookie },
    })
    expect(res.statusCode).toBe(200)
    expect(Array.isArray(res.json())).toBe(true)
  })

  it('GET /api/config/stream → 200', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/config/stream',
      headers: { cookie: adminCookie },
    })
    expect(res.statusCode).toBe(200)
  })

  it('GET /api/streams → 200 for any authenticated user', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/streams',
      headers: { cookie: userCookie },
    })
    expect(res.statusCode).toBe(200)
  })
})
