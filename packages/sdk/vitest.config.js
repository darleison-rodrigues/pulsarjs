import { defineConfig } from 'vitest/config';

import packageJson from './package.json' with { type: 'json' };

export default defineConfig({
  define: {
    __VERSION__: JSON.stringify(packageJson.version),
  },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['tests/unit/**/*.test.js'],
  },
});
