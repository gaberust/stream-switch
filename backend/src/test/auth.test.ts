import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { createApp, seedUsers } from './helpers'

let app: FastifyInstance

beforeAll(async () => {
  app = await createApp()
  await seedUsers()
})

afterAll(async () => {
  await app.close()
})

describe('POST /api/auth/login', () => {
  it('returns user info and sets session cookie on valid credentials', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'testadmin', password: 'adminpass' },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.username).toBe('testadmin')
    expect(body.isAdmin).toBe(true)
    expect(body.passwordHash).toBeUndefined()
    expect(res.headers['set-cookie']).toBeDefined()
  })

  it('returns 401 on wrong password', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'testadmin', password: 'wrongpass' },
    })
    expect(res.statusCode).toBe(401)
  })

  it('returns 401 on unknown username', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'nobody', password: 'anything' },
    })
    expect(res.statusCode).toBe(401)
  })
})

describe('GET /api/auth/me', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/auth/me' })
    expect(res.statusCode).toBe(401)
  })

  it('returns session user when authenticated', async () => {
    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'testadmin', password: 'adminpass' },
    })
    const cookie = loginRes.headers['set-cookie'] as string

    const meRes = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { cookie },
    })
    expect(meRes.statusCode).toBe(200)
    expect(meRes.json().username).toBe('testadmin')
  })
})

describe('POST /api/auth/logout', () => {
  it('destroys session and subsequent /me returns 401', async () => {
    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'testuser', password: 'userpass' },
    })
    const cookie = loginRes.headers['set-cookie'] as string

    const logoutRes = await app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: { cookie },
    })
    expect(logoutRes.statusCode).toBe(200)

    const meRes = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { cookie },
    })
    expect(meRes.statusCode).toBe(401)
  })
})
