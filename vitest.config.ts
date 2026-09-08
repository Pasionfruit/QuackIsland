import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Modules own their own tests. A new module adds them by creating files in
    // its own directory and touching nothing shared - which is what keeps a
    // frozen module's tests safe from the next agent.
    //
    // `src/app` is the exception, and has to be: the composition root is the
    // only place that can mount the interface as the page actually assembles
    // it, and "does it render at all" was a gap that let a blank page ship.
    include: [
      'src/modules/**/__tests__/**/*.test.{ts,tsx}',
      'src/app/__tests__/**/*.test.{ts,tsx}',
    ],
    environment: 'node',
  },
})
