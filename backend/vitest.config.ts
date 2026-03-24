import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    env: {
      DATABASE_PATH: ':memory:',
      SESSION_SECRET: 'test-secret-at-least-32-characters!!',
    },
  },
})
