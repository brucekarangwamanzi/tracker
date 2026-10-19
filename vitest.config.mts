import { defineConfig } from 'vitest/config';

// The Expo repository suite has its own native-module aliases and runs separately.
export default defineConfig({ test: { include: ['tests/**/*.test.ts'] } });
