import type { FastifyInstance } from 'fastify'

// No HTTP routes — processes are managed via /api/streams/:id/start and /stop.
// This plugin only handles cleanup on server shutdown.
export default async function processesPlugin(app: FastifyInstance) {
  app.addHook('onClose', async () => {
    app.ffmpeg.killAll()
  })
}
