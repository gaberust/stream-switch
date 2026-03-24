import fastifyWebSocket from '@fastify/websocket'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { WebSocket } from 'ws'

export default async function wsPlugin(app: FastifyInstance) {
  await app.register(fastifyWebSocket)

  const connections = new Set<WebSocket>()

  function broadcast(payload: unknown) {
    const message = JSON.stringify(payload)
    for (const socket of connections) {
      if (socket.readyState === 1 /* OPEN */) {
        socket.send(message)
      }
    }
  }

  app.ffmpeg.on('status', (proc) => {
    broadcast({ type: 'process:update', process: proc })
  })

  app.forwards.on('forward', (fwd) => {
    broadcast({ type: 'forward:update', forward: fwd })
  })

  app.get('/ws', { websocket: true }, (socket: WebSocket, request: FastifyRequest) => {
    if (!request.session.userId) {
      socket.close(4401, 'Unauthorized')
      return
    }

    connections.add(socket)

    socket.send(
      JSON.stringify({
        type: 'init',
        forwards: app.forwards.list(),
      }),
    )

    socket.on('close', () => {
      connections.delete(socket)
    })
  })
}
