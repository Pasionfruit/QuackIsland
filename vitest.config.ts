import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Modules own their own tests. A new module adds them by creating files in
    // its own directory and touching nothing shared - which is what keeps a
    // frozen module's tests safe from the next agent.
    include: ['src/modules/**/__tests__/**/*.test.ts'],
    environment: 'node',
  },
})
