import { defineConfig } from 'vitest/config';

// FILMELIER-5 (D-8): testes de componente em jsdom; a suíte node:test continua em tests/*.test.mjs.
export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['tests/ui/**/*.test.tsx'],
    setupFiles: ['tests/ui/setup.ts'],
  },
});
