import { readFile } from 'node:fs/promises';
import initSqlJs, { type Database as SqlDb } from 'sql.js';
import { beforeAll, describe, it, expect } from 'vitest';
import { commitLocal, applyPushResult, applyPull, readRows, syncOnce, selectExact, type SqliteDatabase, type SqliteConnection, type Pending } from '../src/mobile/local.js';
import { draftTransfer } from '../src/mobile/drafts.js';
import { id, row } from './helpers.js';
import { walletBalance } from '../src/core/money.js';
import type { Command } from '../src/server/validation.js';
let SQL: Awaited<ReturnType<typeof initSqlJs>>, schema: string;
beforeAll(async () => { SQL = await initSqlJs(); schema = await readFile('src/mobile/schema.sql', 'utf8'); });
class Adapter implements SqliteDatabase {
    raw: SqlDb;
    constructor() { this.raw = new SQL.Database(); this.raw.run(schema); }
    async runAsync(sql: string, ...params: (string | number | null)[]) { this.raw.run(sql, params); return { changes: this.raw.getRowsModified() }; }
    async getAllAsync<T>(sql: string, ...params: (string | number | null)[]): Promise<T[]> { const s = this.raw.prepare(sql); try {
        s.bind(params);
        const rows: T[] = [];
        while (s.step())
            rows.push(s.getAsObject() as T);
        return rows;
    }
    finally {
        s.free();
    } }
    async getFirstAsync<T>(sql: string, ...params: (string | number | null)[]): Promise<T | null> { return (await this.getAllAsync<T>(sql, ...params))[0] ?? null; }
    async withExclusiveTransactionAsync(fn: (tx: SqliteConnection) => Promise<void>) { this.raw.run('BEGIN'); try {
        await fn(this);
        this.raw.run('COMMIT');
    }
    catch (e) {
        this.raw.run('ROLLBACK');
        throw e;
    } }
}
function walletCommand(user: string, wallet: string): Extract<Command, {
    kind: 'mutate';
}> { return { op_id: id(), kind: 'mutate', id: wallet, table: 'wallet', base_version: 0, deleted_at: null, data: { name: 'Cash', currency: 'RWF', method: 'Cash' } }; }
describe('real SQLite offline store', () => {
    it('retains a failed push across a database reopen, then syncs the same operation without duplication', async () => {
        const first = new Adapter(), user = id(), wallet = id(), command = walletCommand(user, wallet);
        await commitLocal(first, user, command, [{table: 'wallet', row: row(user, wallet, command.data as Record<string, string>)}]);
        await expect(syncOnce(first, user, {push: async () => {throw new Error('Offline');}, pull: async () => {throw new Error('Must not pull after failed push');}})).rejects.toThrow('Offline');
        const image = first.raw.export(), reopened = new Adapter(); reopened.raw.close(); reopened.raw = new SQL.Database(image);
        expect((await reopened.getFirstAsync<Pending>('SELECT * FROM local_outbox'))!.status).toBe('dirty');
        const pushed: string[] = [];
        const transport = {push: async (changes: Command[]) => {pushed.push(...changes.map(c => c.op_id)); return {accepted: changes.map(c => ({op_id: c.op_id})), conflicts: []};}, pull: async () => ({cursor: '1', has_more: false, changes: [{sequence: '1', table: 'wallet', row: row(user, wallet, command.data as Record<string, string>)}]})};
        await syncOnce(reopened, user, transport); await syncOnce(reopened, user, transport);
        expect(pushed).toEqual([command.op_id]);
        expect((await readRows(reopened, user, 'wallet'))).toHaveLength(1);
        expect((await reopened.getFirstAsync<Pending>('SELECT * FROM local_outbox'))!.status).toBe('accepted');
    });
    it('persists full 64-bit integers without crossing the JS number boundary', async () => {
        const db = new Adapter(), user = id(), wallet = id(), c = walletCommand(user, wallet);
        await commitLocal(db, user, c, [{ table: 'wallet', row: row(user, wallet, c.data as Record<string, string>) }]);
        const entry = id(), op = id();
        const data = { wallet_id: wallet, category_id: null, kind: 'income', amount: '9007199254740993', occurred_on: '2026-10-18', transfer_id: null, payment_id: null, skill_id: null, note: '' };
        await commitLocal(db, user, { op_id: op, kind: 'mutate', table: 'entry', id: entry, base_version: 0, deleted_at: null, data }, [{ table: 'entry', row: row(user, entry, data) }]);
        expect((await readRows(db, user, 'entry'))[0]!.amount).toBe('9007199254740993');
        expect(await db.getFirstAsync<{
            t: string;
        }>('SELECT typeof(amount) AS t FROM entry WHERE id=?', entry)).toEqual({ t: 'integer' });
        const seq = await db.getAllAsync<{
            queue_sequence: number;
        }>('SELECT queue_sequence FROM local_outbox ORDER BY queue_sequence');
        expect(seq.map(x => x.queue_sequence)).toEqual([1, 2]);
    });
    it('keeps dirty drafts while storing incoming server counterparts and cursor atomically', async () => {
        const db = new Adapter(), user = id(), wallet = id(), c = walletCommand(user, wallet);
        await commitLocal(db, user, c, [{ table: 'wallet', row: row(user, wallet, c.data as Record<string, string>) }]);
        const server = { ...row(user, wallet, { name: 'Server name', currency: 'RWF', method: 'Cash' }), version: 2 };
        await applyPull(db, user, { cursor: '1', has_more: false, changes: [{ table: 'wallet', sequence: '1', row: server }] });
        expect((await readRows(db, user, 'wallet'))[0]!.name).toBe('Cash');
        expect((await db.getAllAsync('SELECT * FROM local_shadow'))).toHaveLength(1);
        const sent = await db.getAllAsync<Pending>('SELECT * FROM local_outbox');
        await applyPushResult(db, user, sent, { accepted: [{ op_id: c.op_id }], conflicts: [] });
        expect((await readRows(db, user, 'wallet'))[0]!.name).toBe('Server name');
        expect((await db.getFirstAsync<{
            cursor: string;
        }>('SELECT cursor FROM local_cursor'))!.cursor).toBe('1');
    });
    it('does not clear newer edits, rejected commands or conflicted drafts', async () => {
        const db = new Adapter(), user = id(), wallet = id(), c = walletCommand(user, wallet);
        await commitLocal(db, user, c, [{ table: 'wallet', row: row(user, wallet, c.data as Record<string, string>) }]);
        const sent = await db.getAllAsync<Pending>('SELECT * FROM local_outbox');
        await db.runAsync('UPDATE local_outbox SET local_revision=2 WHERE id=?', c.op_id);
        await applyPushResult(db, user, sent, { accepted: [{ op_id: c.op_id }], conflicts: [] });
        expect((await db.getFirstAsync<Pending>('SELECT * FROM local_outbox'))!.status).toBe('dirty');
        await applyPushResult(db, user, sent, { accepted: [], conflicts: [{ op_id: c.op_id }] });
        expect((await db.getFirstAsync<Pending>('SELECT * FROM local_outbox'))!.status).toBe('conflict');
    });
    it('rolls back invalid pull pages without advancing the cursor', async () => {
        const db = new Adapter(), user = id();
        await expect(applyPull(db, user, { cursor: '3', has_more: false, changes: [{ table: 'bad_table', sequence: '3', row: row(user, id(), {}) }] })).rejects.toThrow('INVALID_PULL');
        expect(await db.getFirstAsync('SELECT * FROM local_cursor')).toBeNull();
    });
    it('stages both transfer sides in one local transaction', async () => {
        const db = new Adapter(), user = id(), from = id(), to = id();
        for (const wallet of [from, to]) {
            const c = walletCommand(user, wallet);
            await commitLocal(db, user, c, [{ table: 'wallet', row: row(user, wallet, c.data as Record<string, string>) }]);
        }
        const draft = draftTransfer(user, from, to, '25000', '2026-10-18', id, new Date().toISOString());
        await commitLocal(db, user, draft.command, draft.changes);
        const rows = await readRows(db, user, 'entry');
        expect(rows).toHaveLength(2);
        expect(rows.map(x => x.amount)).toEqual(['25000', '25000']);
    });
});
