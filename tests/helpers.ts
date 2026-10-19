import { randomUUID } from 'node:crypto';
import { type Database, type Store } from '../src/server/store.js';
import { row } from '../src/server/store.js';
import { type Table, type Row } from '../src/shared/schema.js';
export { row };
export const id = () => randomUUID();
export class MemoryDb implements Database {
    data = new Map<string, Row>();
    private tail: Promise<unknown> = Promise.resolve();
    failTable: Table | null = null;
    async transaction<T>(user: string, fn: (store: Store) => Promise<T>): Promise<T> {
        const previous = this.tail;
        let release!: () => void;
        this.tail = new Promise<void>(r => { release = r; });
        await previous;
        const draft = new Map([...this.data].map(([k, v]) => [k, structuredClone(v)]));
        const key = (table: Table, id: string) => `${table}:${id}`;
        const store: Store = { user, get: async (t, i) => { const r = draft.get(key(t, i)); return r?.user_id === user ? structuredClone(r) : null; }, list: async (t, includeDeleted = false) => [...draft].filter(([k, r]) => k.startsWith(`${t}:`) && r.user_id === user && (includeDeleted || !r.deleted_at)).map(([, r]) => structuredClone(r)),
            changesAfter: async (cursor, limit) => [...draft].filter(([k, r]) => k.startsWith('sync_change:') && r.user_id === user && BigInt(String(r.sequence)) > BigInt(cursor)).map(([, r]) => structuredClone(r)).sort((a, b) => BigInt(String(a.sequence)) < BigInt(String(b.sequence)) ? -1 : 1).slice(0, limit),
            put: async (t, r, publish = true) => {
                if (t === this.failTable)
                    throw new Error('Injected database failure');
                if (r.user_id !== user)
                    throw new Error('Forbidden');
                const old = draft.get(key(t, r.id));
                if (old && old.user_id !== user)
                    throw new Error('ID collision');
                const saved = { ...r, version: old ? old.version + 1 : 1, updated_at: new Date().toISOString() };
                draft.set(key(t, r.id), saved);
                if (publish && !['sync_change', 'sync_state', 'sync_receipt'].includes(t)) {
                    const stateKey = key('sync_state', user), previous = draft.get(stateKey);
                    const sequence = (BigInt(String(previous?.sequence ?? '0')) + 1n).toString();
                    draft.set(stateKey, row(user, user, { sequence }));
                    const change = row(user, id(), { sequence, table_name: t, row_id: r.id, record_json: JSON.stringify(saved) });
                    draft.set(key('sync_change', change.id), change);
                }
                return structuredClone(saved);
            } };
        try {
            const result = await fn(store);
            this.data = draft;
            return result;
        }
        finally {
            release();
        }
    }
}
export async function seed(db: Database, user: string) {
    const wallet = id(), wallet2 = id(), category = id(), skill = id();
    await db.transaction(user, async (s) => {
        await s.put('wallet', row(user, wallet, { name: 'Cash', currency: 'RWF', method: 'Cash' }));
        await s.put('wallet', row(user, wallet2, { name: 'MoMo', currency: 'RWF', method: 'MTN MoMo' }));
        await s.put('category', row(user, category, { name: 'Loan payments', kind: 'expense' }));
        await s.put('skill', row(user, skill, { name: 'TypeScript', goal: 'Build', weekly_minutes: 300, course_cost: '0' }));
    });
    return { wallet, wallet2, category, skill };
}
