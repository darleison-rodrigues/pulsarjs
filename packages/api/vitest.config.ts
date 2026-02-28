import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';

export default defineWorkersConfig({
    test: {
        exclude: ['tests/e2e/**', 'node_modules/**', 'dist/**'],
        testTimeout: 30000,
        hookTimeout: 30000,
        poolOptions: {
            workers: {
                singleWorker: true,
                wrangler: { configPath: '../../wrangler.json' },
                main: './src/index.ts',
                isolatedStorage: false,
            },
        },
        coverage: {
            provider: 'istanbul',
            enabled: false,
            reporter: ['text', 'json', 'html'],
        },
    },
});
