import { describe, it, expect } from 'vitest';
import { generateKeyPair, exportJWK, createLocalJWKSet, SignJWT } from 'jose';
import { buildApp, verifier } from '../src/server/app.js';
import { MemoryDb, id, seed } from './helpers.js';
describe('request security pipeline', () => {
    it('allows configured browser preflight without bypassing authentication', async () => {
        const app = await buildApp(new MemoryDb(), { owner: id(), issuer: 'https://auth.example', audience: 'authenticated' }, { webOrigins: ['http://localhost:8080'] });
        try {
            const preflight = await app.inject({ method: 'OPTIONS', url: '/sync/push', headers: { origin: 'http://localhost:8080', 'access-control-request-method': 'POST', 'access-control-request-headers': 'authorization,content-type' } });
            expect(preflight.statusCode).toBe(204);
            expect(preflight.headers['access-control-allow-origin']).toBe('http://localhost:8080');
            const unauthenticated = await app.inject({ method: 'POST', url: '/sync/push', headers: { origin: 'http://localhost:8080' }, payload: { changes: [] } });
            expect(unauthenticated.statusCode).toBe(401);
            expect(unauthenticated.headers['access-control-allow-origin']).toBe('http://localhost:8080');
            const foreignOrigin = await app.inject({ method: 'OPTIONS', url: '/sync/push', headers: { origin: 'https://untrusted.example', 'access-control-request-method': 'POST' } });
            expect(foreignOrigin.headers['access-control-allow-origin']).toBeUndefined();
        } finally { await app.close(); }
    });
    it('verifies signature, issuer, audience and expiry with asymmetric keys', async () => {
        const pair = await generateKeyPair('RS256');
        const jwk = await exportJWK(pair.publicKey);
        jwk.kid = 'test';
        const config = { issuer: 'https://auth.example/auth/v1', audience: 'authenticated', owner: id() };
        const verify = verifier(config, createLocalJWKSet({ keys: [jwk] }));
        const token = await new SignJWT({ role: 'authenticated' }).setProtectedHeader({ alg: 'RS256', kid: 'test' }).setSubject(config.owner).setIssuer(config.issuer).setAudience(config.audience).setIssuedAt().setExpirationTime('5m').sign(pair.privateKey);
        expect((await verify(token)).sub).toBe(config.owner);
        await expect(verify(token.slice(0, -10) + 'bogus')).rejects.toThrow();
        const expired = await new SignJWT({ role: 'authenticated' }).setProtectedHeader({ alg: 'RS256', kid: 'test' }).setSubject(config.owner).setIssuer(config.issuer).setAudience(config.audience).setIssuedAt(1).setExpirationTime(2).sign(pair.privateKey);
        await expect(verify(expired)).rejects.toThrow();
    });
    it('rejects unauthenticated, foreign and anonymous users; validates before services', async () => {
        const db = new MemoryDb(), owner = id();
        await seed(db, owner);
        const app = await buildApp(db, { owner, issuer: 'https://auth.example', audience: 'authenticated' }, { verify: async (token) => ({ sub: token === 'owner' ? owner : id(), role: 'authenticated', is_anonymous: token === 'anonymous' }) });
        try {
            expect((await app.inject('/health')).statusCode).toBe(200);
            expect((await app.inject('/dashboard')).statusCode).toBe(401);
            expect((await app.inject({ url: '/dashboard', headers: { authorization: 'Bearer other' } })).statusCode).toBe(401);
            expect((await app.inject({ url: '/dashboard', headers: { authorization: 'Bearer anonymous' } })).statusCode).toBe(401);
            expect((await app.inject({ url: '/dashboard', headers: { authorization: 'Bearer owner' } })).statusCode).toBe(200);
            expect((await app.inject({ method: 'POST', url: '/sync/push', headers: { authorization: 'Bearer owner' }, payload: { user_id: owner, changes: [] } })).statusCode).toBe(400);
        }
        finally {
            await app.close();
        }
    });
    it('requires HTTPS when production is enabled', async () => {
        const owner = id();
        const app = await buildApp(new MemoryDb(), { owner, issuer: 'https://auth.example', audience: 'authenticated' }, { production: true, verify: async () => ({ sub: owner, role: 'authenticated' }) });
        try {
            expect((await app.inject({ url: '/dashboard', headers: { authorization: 'Bearer t', 'x-forwarded-proto': 'https' } })).statusCode).toBe(400);
        }
        finally {
            await app.close();
        }
    });
});
