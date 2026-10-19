import Fastify from 'fastify';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import cors from '@fastify/cors';
import { createRemoteJWKSet, jwtVerify, type JWTPayload, type JWTVerifyGetKey } from 'jose';
import { z, ZodError } from 'zod';
import { type Database } from './store.js';
import { push, pull } from './sync.js';
import { pushSchema, uuid, isoDate, moneyString } from './validation.js';
import { dashboard, review, roi } from './queries.js';
import { active, loanState } from './finance.js';
import { payoffComparison, debtStrategy, remainingSchedule, accrue, type Installment } from '../core/loans.js';
import { localDate } from '../core/dates.js';
import { preferences } from './queries.js';
import { DomainError } from '../core/money.js';
export interface AuthConfig {
    issuer: string;
    audience: string;
    owner: string;
}
export type VerifyToken = (token: string) => Promise<JWTPayload>;
export function verifier(config: AuthConfig, resolver?: JWTVerifyGetKey): VerifyToken {
    const issuer = new URL(config.issuer);
    if (issuer.protocol !== 'https:')
        throw new Error('Auth issuer must use HTTPS');
    const keys = resolver ?? createRemoteJWKSet(new URL(`${config.issuer.replace(/\/$/, '')}/.well-known/jwks.json`), { timeoutDuration: 5000 });
    return async (token) => (await jwtVerify(token, keys, { issuer: config.issuer, audience: config.audience, algorithms: ['ES256', 'RS256'], requiredClaims: ['sub', 'exp', 'iat'], clockTolerance: 5 })).payload;
}
export async function buildApp(db: Database, config: AuthConfig, options: {
    verify?: VerifyToken;
    production?: boolean;
    trustProxy?: string;
    logger?: boolean;
    webOrigins?: string[];
} = {}) {
    uuid.parse(config.owner);
    const app = Fastify({ logger: options.logger ? { redact: ['req.headers.authorization', 'req.headers.cookie', 'res.headers.set-cookie'] } : false,
        bodyLimit: 256 * 1024, trustProxy: options.trustProxy ?? false, requestTimeout: 20000 });
    await app.register(helmet);
    await app.register(cors,{origin:options.webOrigins??(options.production?[]:['http://localhost:8080', 'http://127.0.0.1:8080', 'http://localhost:8081', 'http://127.0.0.1:8081']),methods:['GET','POST','OPTIONS'],allowedHeaders:['Authorization','Content-Type'],credentials:false});
    await app.register(rateLimit, { max: 120, timeWindow: '1 minute' });
    const verify = options.verify ?? verifier(config);
    app.decorateRequest('userId', '');
    app.addHook('onRequest', async (request, reply) => {
        if (request.url === '/health')
            return;
        if (options.production && request.protocol !== 'https')
            return reply.code(400).send({ error: 'HTTPS_REQUIRED' });
        const header = request.headers.authorization;
        if (!header?.startsWith('Bearer ') || header.length > 8192)
            return reply.code(401).send({ error: 'UNAUTHORIZED' });
        try {
            const claims = await verify(header.slice(7));
            if (claims.sub !== config.owner || claims.role !== 'authenticated' || claims.is_anonymous === true)
                throw new Error('Unauthorized');
            (request as typeof request & {
                userId: string;
            }).userId = uuid.parse(claims.sub);
        }
        catch {
            return reply.code(401).send({ error: 'UNAUTHORIZED' });
        }
    });
    const owner = (r: unknown) => (r as {
        userId: string;
    }).userId;
    app.get('/health', async () => ({ ok: true }));
    app.post('/sync/push', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (request) => {
        const { changes } = pushSchema.parse(request.body);
        return push(db, owner(request), changes);
    });
    app.get('/sync/pull', async (request) => {
        const q = z.strictObject({ cursor: z.string().default('0'), limit: z.coerce.number().int().min(1).max(1000).default(250) }).parse(request.query);
        return pull(db, owner(request), q.cursor, q.limit);
    });
    app.get('/dashboard', async (request) => dashboard(db, owner(request), new Date().toISOString()));
    app.get('/weekly-review', async (request) => { const q = z.strictObject({ day: isoDate }).parse(request.query); return review(db, owner(request), q.day); });
    app.get('/skills/:id/roi', async (request) => { const p = z.strictObject({ id: uuid }).parse(request.params); return roi(db, owner(request), p.id); });
    app.get('/loans/:id/planner', async (request) => {
        const { id } = z.strictObject({ id: uuid }).parse(request.params);
        const { extra } = z.strictObject({ extra: moneyString.default('0') }).parse(request.query);
        return db.transaction(owner(request), async (store) => {
            const loan = await active(store, 'loan', id);
            const pref = await preferences(store);
            const today = localDate(new Date().toISOString(), pref.timezone);
            const paid = (await store.list('loan_payment')).filter(p => p.loan_id === id).reduce((n, p) => n + BigInt(String(p.amount)), 0n);
            return payoffComparison(accrue(loanState(loan), today), remainingSchedule(JSON.parse(String(loan.schedule_json)) as Installment[], paid.toString(), today), extra);
        });
    });
    app.post('/loans/compare', async (request) => {
        const c = z.strictObject({ extra_per_event: moneyString, loan_ids: z.array(uuid).min(1).max(50) }).parse(request.body);
        return db.transaction(owner(request), async (store) => {
            const loans = await Promise.all([...new Set(c.loan_ids)].map(id => active(store, 'loan', id)));
            const pref = await preferences(store), today = localDate(new Date().toISOString(), pref.timezone), payments = await store.list('loan_payment');
            const records = loans.map(l => ({ id: l.id, state: accrue(loanState(l), today), payments: remainingSchedule(JSON.parse(String(l.schedule_json)) as Installment[], payments.filter(p => p.loan_id === l.id).reduce((n, p) => n + BigInt(String(p.amount)), 0n).toString(), today) }));
            return { snowball: debtStrategy(records, c.extra_per_event, 'snowball'), avalanche: debtStrategy(records, c.extra_per_event, 'avalanche') };
        });
    });
    app.setErrorHandler((error, request, reply) => {
        if (error instanceof ZodError)
            return reply.code(400).send({ error: 'INVALID_REQUEST', issues: error.issues.map(i => ({ path: i.path.join('.'), message: i.message })) });
        if (error instanceof DomainError)
            return reply.code(error.code === 'NOT_FOUND' ? 404 : 409).send({ error: error.code });
        const status = (error as {
            statusCode?: number;
        }).statusCode;
        if (status && status < 500)
            return reply.code(status).send({ error: status === 429 ? 'RATE_LIMITED' : 'INVALID_REQUEST' });
        request.log.error({ err: { name: error instanceof Error ? error.name : 'UnknownError', message: 'Internal operation failed' } }, 'request failed');
        return reply.code(500).send({ error: 'INTERNAL_ERROR' });
    });
    return app;
}
