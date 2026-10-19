import { z } from 'zod';
import { PgDatabase } from './store.js';
import { buildApp } from './app.js';
import { startJobs, ExpoGateway } from './reminders.js';
const env = z.object({ DATABASE_URL: z.string().min(1), AUTH_ISSUER: z.url(), AUTH_AUDIENCE: z.string().default('authenticated'), OWNER_USER_ID: z.uuid(), PORT: z.coerce.number().int().default(3000), HOST: z.string().default('127.0.0.1'), TRUST_PROXY: z.string().optional(), WEB_ORIGINS:z.string().optional(), EXPO_ACCESS_TOKEN: z.string().optional(), NODE_ENV: z.string().default('development') }).parse(process.env);
const db = new PgDatabase(env.DATABASE_URL);
const app = await buildApp(db, { issuer: env.AUTH_ISSUER, audience: env.AUTH_AUDIENCE, owner: env.OWNER_USER_ID }, { production: env.NODE_ENV === 'production', trustProxy: env.TRUST_PROXY,webOrigins:env.WEB_ORIGINS?.split(',').map(x=>x.trim()).filter(Boolean), logger: true });
await app.listen({ host: env.HOST, port: env.PORT });
const task = startJobs(db, env.OWNER_USER_ID, new ExpoGateway(env.EXPO_ACCESS_TOKEN), () => app.log.error('scheduled job failed; pending rows remain retryable'));
let closing = false;
const close = async () => { if (closing)
    return; closing = true; await task.stop(); await app.close(); await db.prisma.$disconnect(); };
process.once('SIGINT', () => void close());
process.once('SIGTERM', () => void close());
