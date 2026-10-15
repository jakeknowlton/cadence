import { defineConfig } from 'vitest/config'

// Firestore security rules tests. Run via `pnpm test:rules`, which starts the Firestore emulator around them.
export default defineConfig({
  test: {
    include: ['tests/rules/**/*.spec.ts'],
    environment: 'node',
    fileParallelism: false,
    testTimeout: 15_000,
  },
})
