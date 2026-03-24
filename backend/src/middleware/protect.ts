import type { FastifyReply, FastifyRequest } from 'fastify'

export async function requireAuth(request: FastifyRequest, reply: FastifyReply) {
  if (!request.session.userId) {
    return reply.code(401).send({ error: 'Unauthorized' })
  }
}

export async function requireAdmin(request: FastifyRequest, reply: FastifyReply) {
  if (!request.session.userId) {
    return reply.code(401).send({ error: 'Unauthorized' })
  }
  if (!request.session.isAdmin) {
    return reply.code(403).send({ error: 'Forbidden' })
  }
}
