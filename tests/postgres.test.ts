import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PgDatabase, row } from '../src/server/store.js';
import { push, pull } from '../src/server/sync.js';
import { seed, id } from './helpers.js';
import type { Command } from '../src/server/validation.js';
const url = process.env.TEST_DATABASE_URL;
describe.skipIf(!url)('real PostgreSQL transactions and RLS', () => {
    let db: PgDatabase;
    beforeAll(() => { db = new PgDatabase(url!); });
    afterAll(async () => { await db?.prisma.$disconnect(); });
    it('scopes rows and enforces RLS even when a query forgets its WHERE clause', async () => {
        const user = id(), other = id(), s = await seed(db, user);
        await db.transaction(other, async (st) => { expect(await st.get('wallet', s.wallet)).toBeNull(); expect(await st.list('wallet')).toHaveLength(0); });
        const none = await db.prisma.$queryRaw<{
            id: string;
        }[]> `SELECT id FROM life.wallet`;
        expect(none).toHaveLength(0);
        await expect(db.prisma.$executeRaw `DELETE FROM life.wallet`).rejects.toThrow();
    });
    it('preserves BIGINTs through Prisma, JSON and a repeated transfer', async () => {
        const user = id(), s = await seed(db, user);
        const command: Command = { op_id: id(), kind: 'transfer', id: id(), out_id: id(), in_id: id(), from_wallet_id: s.wallet, to_wallet_id: s.wallet2, amount: '9007199254740993', occurred_on: '2026-10-18' };
        expect((await push(db, user, [command])).accepted).toHaveLength(1);
        expect((await push(db, user, [command])).accepted).toHaveLength(1);
        await db.transaction(user, async (st) => { const entries = await st.list('entry'); expect(entries).toHaveLength(2); expect(entries[0]!.amount).toBe(command.amount); });
    });
    it('rolls back a multi-row operation when a later SQL constraint fails', async () => {
        const user = id(), s = await seed(db, user), transfer = id();
        await expect(db.transaction(user, async (st) => {
            await st.put('transfer', row(user, transfer, { from_wallet_id: s.wallet, to_wallet_id: s.wallet2, amount: '10', occurred_on: '2026-10-18', out_id: id(), in_id: id() }));
            await st.put('entry', row(user, id(), { wallet_id: id(), category_id: null, kind: 'income', amount: '10', occurred_on: '2026-10-18', transfer_id: null, payment_id: null, skill_id: null, note: '' }));
        })).rejects.toThrow();
        await db.transaction(user, async (st) => expect(await st.get('transfer', transfer)).toBeNull());
    });
    it('serializes concurrent payments and returns a conflict instead of losing money', async () => {
        const user = id(), s = await seed(db, user), loan = id();
        expect((await push(db, user, [{ op_id: id(), kind: 'loan_create', id: loan, name: 'Family', lender_type: 'friend_family', lender_name: 'A', principal: '100', annual_rate_bps: 0, accrued_on: '2026-01-01', schedule: { kind: 'custom', dates: [{ due_on: '2026-10-18', amount: '100' }] } }])).accepted).toHaveLength(1);
        const payment = (): Command => ({ op_id: id(), kind: 'loan_payment', id: id(), expense_id: id(), loan_id: loan, wallet_id: s.wallet, category_id: s.category, base_version: 1, amount: '60', paid_on: '2026-10-18' });
        const results = await Promise.all([push(db, user, [payment()]), push(db, user, [payment()])]);
        expect(results.reduce((n, r) => n + r.accepted.length, 0)).toBe(1);
        expect(results.reduce((n, r) => n + r.conflicts.length, 0)).toBe(1);
        await db.transaction(user, async (st) => { expect((await st.get('loan', loan))!.principal).toBe('40'); expect(await st.list('loan_payment')).toHaveLength(1); expect(await st.list('entry')).toHaveLength(1); });
    });
    it('uses commit-ordered incremental cursors across simultaneous mutations', async () => {
        const user = id();
        await Promise.all(Array.from({ length: 5 }, (_, i) => push(db, user, [{ op_id: id(), kind: 'mutate', table: 'note', id: id(), base_version: 0, deleted_at: null, data: { content: `Note ${i}` } }])));
        let cursor = '0';
        const seen = new Set<string>();
        for (let i = 0; i < 10; i++) {
            const page = await pull(db, user, cursor, 1);
            for (const c of page.changes)
                if (c.table === 'note')
                    seen.add(c.row.id);
            cursor = page.cursor;
            if (!page.has_more)
                break;
        }
        expect(seen.size).toBe(5);
    });
});
