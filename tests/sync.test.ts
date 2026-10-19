import { describe, it, expect } from 'vitest';
import { MemoryDb, id, seed, row } from './helpers.js';
import { push, pull, fingerprint } from '../src/server/sync.js';
import { walletBalance } from '../src/core/money.js';
import { entry } from '../src/server/finance.js';
import type { Command } from '../src/server/validation.js';
const expense = (wallet: string, category: string, idValue = id(), version = 0): Extract<Command, {
    kind: 'mutate';
}> => ({ op_id: id(), kind: 'mutate', table: 'entry', id: idValue, base_version: version, deleted_at: null, data: { wallet_id: wallet, category_id: category, kind: 'expense', amount: '80', occurred_on: '2026-10-18', transfer_id: null, payment_id: null, skill_id: null, note: '' } });
describe('sync and transactional financial commands', () => {
    it('accepts a batch twice without double-counting a transfer', async () => {
        const db = new MemoryDb(), user = id(), s = await seed(db, user);
        const c: Command = { op_id: id(), kind: 'transfer', id: id(), out_id: id(), in_id: id(), from_wallet_id: s.wallet, to_wallet_id: s.wallet2, amount: '25000', occurred_on: '2026-10-18' };
        const first = await push(db, user, [c]), second = await push(db, user, [c]);
        expect(second).toEqual(first);
        await db.transaction(user, async (st) => { const entries = (await st.list('entry')).map(entry); expect(entries).toHaveLength(2); expect(walletBalance(entries, s.wallet)).toBe(-25000n); expect(walletBalance(entries, s.wallet2)).toBe(25000n); });
    });
    it('rolls back all transfer rows when the second operation fails', async () => {
        const db = new MemoryDb(), user = id(), s = await seed(db, user);
        db.failTable = 'entry';
        await expect(push(db, user, [{ op_id: id(), kind: 'transfer', id: id(), out_id: id(), in_id: id(), from_wallet_id: s.wallet, to_wallet_id: s.wallet2, amount: '1', occurred_on: '2026-10-18' }])).rejects.toThrow('Injected database failure');
        await db.transaction(user, async (st) => expect(await st.list('transfer')).toHaveLength(0));
    });
    it('rejects a different payload with an already accepted idempotency key', async () => {
        const db = new MemoryDb(), user = id(), s = await seed(db, user), c = expense(s.wallet, s.category);
        await push(db, user, [c]);
        expect((await push(db, user, [{ ...c, data: { ...c.data, amount: '1' } }])).rejected[0]!.code).toBe('IDEMPOTENCY_KEY_REUSED');
        expect(fingerprint(c)).toBe(fingerprint({ ...c, data: Object.fromEntries(Object.entries(c.data).reverse()) }));
    });
    it('keeps both financial versions and requires a reviewed resolution', async () => {
        const db = new MemoryDb(), user = id(), s = await seed(db, user), c = expense(s.wallet, s.category);
        await push(db, user, [c]);
        const stale = { ...c, op_id: id(), data: { ...c.data, amount: '90' } };
        const result = await push(db, user, [stale]);
        expect(result.conflicts).toHaveLength(1);
        await db.transaction(user, async (st) => { expect((await st.get('entry', c.id))!.amount).toBe('80'); const conflict = (await st.list('sync_conflict'))[0]!; expect(JSON.parse(String(conflict.client_json)).data.amount).toBe('90'); });
        expect((await push(db, user, [{ op_id: id(), kind: 'resolve', conflict_id: stale.op_id, base_version: 1, choice: 'client' }])).accepted).toHaveLength(1);
        await db.transaction(user, async (st) => expect((await st.get('entry', c.id))!.amount).toBe('90'));
    });
    it('uses server-arrival last-write-wins only for notes/settings', async () => {
        const db = new MemoryDb(), user = id(), note = id();
        for (const content of ['first', 'second'])
            await push(db, user, [{ op_id: id(), kind: 'mutate', table: 'note', id: note, base_version: 0, deleted_at: null, data: { content } }]);
        await db.transaction(user, async (st) => expect((await st.get('note', note))!.content).toBe('second'));
    });
    it('rejects unknown tables, ownership injection and foreign references', async () => {
        const db = new MemoryDb(), user = id(), s = await seed(db, user), other = id();
        expect((await push(db, other, [expense(s.wallet, s.category)])).rejected).toHaveLength(1);
        expect((await push(db, user, [{ ...expense(s.wallet, s.category), table: 'sync_receipt' }])).rejected).toHaveLength(1);
        const malformed = expense(s.wallet, s.category);
        malformed.data.user_id = other;
        expect((await push(db, user, [malformed])).rejected).toHaveLength(1);
        expect((await pull(db, other, '0')).changes).toHaveLength(0);
    });
    it('pulls all changes in sequence and includes tombstones', async () => {
        const db = new MemoryDb(), user = id(), s = await seed(db, user), c = expense(s.wallet, s.category);
        await push(db, user, [c]);
        await push(db, user, [{ ...c, op_id: id(), base_version: 1, deleted_at: '2026-10-18T12:00:00Z' }]);
        let cursor = '0', deleted = false, total = 0;
        for (let i = 0; i < 20; i++) {
            const page = await pull(db, user, cursor, 1);
            cursor = page.cursor;
            total += page.changes.length;
            deleted ||= page.changes.some(x => x.row.deleted_at !== null);
            if (!page.has_more)
                break;
        }
        expect(total).toBeGreaterThan(4);
        expect(deleted).toBe(true);
        expect((await pull(db, user, cursor)).changes).toEqual([]);
        await expect(pull(db, user, '-1')).rejects.toThrow('INVALID_CURSOR');
    });
    it('budget levels are inserted once per category/month even on retries', async () => {
        const db = new MemoryDb(), user = id(), s = await seed(db, user);
        await db.transaction(user, st => st.put('budget', row(user, id(), { category_id: s.category, month: '2026-10', limit: '100' })));
        const c = expense(s.wallet, s.category);
        await push(db, user, [c, c]);
        await push(db, user, [expense(s.wallet, s.category)]);
        await db.transaction(user, async (st) => expect((await st.list('budget_alert')).map(x => x.level).sort()).toEqual([100, 80]));
    });
    it('records a payment, expense, principal split and paid status atomically', async () => {
        const db = new MemoryDb(), user = id(), s = await seed(db, user), loan = id();
        await push(db, user, [{ op_id: id(), kind: 'loan_create', id: loan, name: 'Family', lender_type: 'friend_family', lender_name: 'Family', principal: '100', annual_rate_bps: 0, accrued_on: '2026-01-01', schedule: { kind: 'custom', dates: [{ due_on: '2026-10-18', amount: '100' }] } }]);
        const c: Command = { op_id: id(), kind: 'loan_payment', id: id(), expense_id: id(), loan_id: loan, wallet_id: s.wallet, category_id: s.category, amount: '100', base_version: 1, paid_on: '2026-10-18' };
        expect((await push(db, user, [c, c])).accepted).toHaveLength(2);
        await db.transaction(user, async (st) => { expect(await st.list('entry')).toHaveLength(1); expect((await st.get('loan', loan))!.status).toBe('paid'); expect((await st.list('loan_payment'))[0]!.principal).toBe('100'); });
    });
    it('concurrent stale loan payments do not both apply', async () => {
        const db = new MemoryDb(), user = id(), s = await seed(db, user), loan = id();
        await db.transaction(user, st => st.put('loan', row(user, loan, { name: 'Family', lender_type: 'friend_family', lender_name: 'A', principal: '100', interest: '0', remainder: '0', annual_rate_bps: 0, accrued_on: '2026-01-01', status: 'active', schedule_json: '[]' })));
        const c = (): Command => ({ op_id: id(), kind: 'loan_payment', id: id(), expense_id: id(), loan_id: loan, wallet_id: s.wallet, category_id: s.category, amount: '60', base_version: 1, paid_on: '2026-10-18' });
        const results = await Promise.all([push(db, user, [c()]), push(db, user, [c()])]);
        expect(results.reduce((n, r) => n + r.accepted.length, 0)).toBe(1);
        expect(results.reduce((n, r) => n + r.conflicts.length, 0)).toBe(1);
    });
});
