import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

loadEnv({ path: resolve(__dirname, '../../.env'), quiet: true });

export default defineConfig({
  test: {
    include: ['test/integration/**/*.test.ts'],
    fileParallelism: false,
  },
});
