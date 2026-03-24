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

describe('Stream CRUD', () => {
  let streamId: string

  it('admin can create a stream', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/streams',
      payload: { name: 'Test Stream', youtubeTitle: 'Test YouTube Title' },
      headers: { cookie: adminCookie },
    })
    expect(res.statusCode).toBe(201)
    const body = res.json()
    expect(body.name).toBe('Test Stream')
    expect(body.youtubeTitle).toBe('Test YouTube Title')
    expect(body.privacyStatus).toBe('private')
    expect(body.activeForward).toBeNull()
    streamId = body.id
  })

  it('stream appears in list for all authenticated users', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/streams',
      headers: { cookie: userCookie },
    })
    expect(res.statusCode).toBe(200)
    const streams = res.json()
    expect(streams.some((s: { id: string }) => s.id === streamId)).toBe(true)
  })

  it('admin can update a stream', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/streams/${streamId}`,
      payload: { name: 'Renamed Stream', privacyStatus: 'public' },
      headers: { cookie: adminCookie },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().name).toBe('Renamed Stream')
    expect(res.json().privacyStatus).toBe('public')
  })

  it('non-admin cannot update a stream', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/streams/${streamId}`,
      payload: { name: 'Hacked' },
      headers: { cookie: userCookie },
    })
    expect(res.statusCode).toBe(403)
  })

  it('admin can delete a stream that is not live', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/streams/${streamId}`,
      headers: { cookie: adminCookie },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().ok).toBe(true)
  })

  it('deleted stream no longer appears in list', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/streams',
      headers: { cookie: adminCookie },
    })
    const streams = res.json()
    expect(streams.some((s: { id: string }) => s.id === streamId)).toBe(false)
  })
})

describe('Stream config', () => {
  it('admin can read and update global stream config', async () => {
    const getRes = await app.inject({
      method: 'GET',
      url: '/api/config/stream',
      headers: { cookie: adminCookie },
    })
    expect(getRes.statusCode).toBe(200)

    const putRes = await app.inject({
      method: 'PUT',
      url: '/api/config/stream',
      payload: { sourceUrl: 'rtsp://example.com/live', ffmpegExtraArgs: '-c copy' },
      headers: { cookie: adminCookie },
    })
    expect(putRes.statusCode).toBe(200)
    expect(putRes.json().sourceUrl).toBe('rtsp://example.com/live')
  })
})

describe('User management', () => {
  let newUserId: number

  it('admin can create a user', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/users',
      payload: { username: 'newuser', password: 'password123' },
      headers: { cookie: adminCookie },
    })
    expect(res.statusCode).toBe(201)
    expect(res.json().username).toBe('newuser')
    expect(res.json().isAdmin).toBe(false)
    newUserId = res.json().id
  })

  it('admin cannot create duplicate username', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/users',
      payload: { username: 'newuser', password: 'other' },
      headers: { cookie: adminCookie },
    })
    expect(res.statusCode).toBe(409)
  })

  it('admin can delete a user', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/users/${newUserId}`,
      headers: { cookie: adminCookie },
    })
    expect(res.statusCode).toBe(200)
  })

  it('admin cannot delete themselves', async () => {
    const meRes = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { cookie: adminCookie },
    })
    const adminId = meRes.json().id

    const res = await app.inject({
      method: 'DELETE',
      url: `/api/users/${adminId}`,
      headers: { cookie: adminCookie },
    })
    expect(res.statusCode).toBe(400)
  })
})

describe('Password change', () => {
  it('user can change their own password with correct current password', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/users/me/password',
      payload: { currentPassword: 'userpass', newPassword: 'newpass123' },
      headers: { cookie: userCookie },
    })
    expect(res.statusCode).toBe(200)
  })

  it('password change fails with wrong current password', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/users/me/password',
      payload: { currentPassword: 'wrongpass', newPassword: 'whatever' },
      headers: { cookie: userCookie },
    })
    expect(res.statusCode).toBe(400)
  })
})
