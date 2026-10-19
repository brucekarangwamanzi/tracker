import {defineConfig} from 'vitest/config';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const here=fileURLToPath(new URL('.',import.meta.url));
export default defineConfig({resolve:{alias:{'react-native':path.resolve(here,'tests/native.ts'),'expo-crypto':path.resolve(here,'tests/crypto.ts'),'expo-sqlite':path.resolve(here,'tests/sqlite-module.ts')}},test:{include:['tests/**/*.test.ts'],environment:'node'}});
