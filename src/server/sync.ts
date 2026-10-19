import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import { DomainError } from '../core/money.js';
import { financial, lww, tables, writable, type Row, type Table } from '../shared/schema.js';
import { row, type Database, type Store } from './store.js';
import { commandSchema, payloadSchema, preferencesSchema, type Command } from './validation.js';
import { active, budgetAlerts, checkEntryReferences, createLoan, recordPayment, transfer } from './finance.js';
export type Outcome = {
    op_id: string;
    status: 'accepted' | 'conflict' | 'rejected';
    row?: Row;
    conflict_id?: string;
    code?: string;
};
function canonical(v: unknown): string {
    if (v === null || typeof v !== 'object')
        return JSON.stringify(v);
    if (Array.isArray(v))
        return `[${v.map(canonical).join(',')}]`;
    return `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`).join(',')}}`;
}
export function fingerprint(c: Command): string { return createHash('sha256').update(canonical(c)).digest('hex'); }
async function conflict(store: Store, c: Command, table: Table, id: string, server: Row | null): Promise<Outcome> {
    await store.put('sync_conflict', row(store.user, c.op_id, { table_name: table, row_id: id, server_json: JSON.stringify(server), client_json: JSON.stringify(c), resolved: false }));
    return { op_id: c.op_id, status: 'conflict', conflict_id: c.op_id };
}
async function mutate(store: Store, c: Extract<Command, {
    kind: 'mutate';
}>, force = false): Promise<Outcome> {
    if (!Object.hasOwn(tables, c.table) || !writable.has(c.table as Table))
        throw new DomainError('TABLE_NOT_WRITABLE');
    const table = c.table as Table;
    const data = payloadSchema(table).parse(c.data) as Record<string, string | number | boolean | null>;
    const old = await store.get(table, c.id);
    if (table === 'entry' && old && (old.transfer_id || old.payment_id))
        throw new DomainError('LINKED_ENTRY_IMMUTABLE');
    if (old?.deleted_at)
        throw new DomainError('RECORD_DELETED');
    if (!force && !lww.has(table) && (old?.version ?? 0) !== c.base_version)
        return conflict(store, c, table, c.id, old);
    if (!old && c.deleted_at)
        throw new DomainError('NOT_FOUND');
    if (table === 'wallet' && old && old.currency !== data.currency)
        throw new DomainError('WALLET_CURRENCY_IMMUTABLE');
    if (c.deleted_at && (table === 'wallet' || table === 'category')) {
        const used = (await store.list('entry', true)).some(e => e[table === 'wallet' ? 'wallet_id' : 'category_id'] === c.id);
        if (used)
            throw new DomainError('REFERENCED_FINANCIAL_RECORD');
    }
    if (table === 'entry')
        await checkEntryReferences(store, row(store.user, c.id, data));
    if (table === 'milestone' || table === 'study_session')
        await active(store, 'skill', String(data.skill_id));
    if (table === 'study_session' && new Date(String(data.started_at)).getTime() + Number(data.minutes) * 60000 > Date.now() + 60000)
        throw new DomainError('FUTURE_STUDY_SESSION');
    if (table === 'budget') {
        const cat = await active(store, 'category', String(data.category_id));
        if (cat.kind !== 'expense')
            throw new DomainError('CATEGORY_TYPE_MISMATCH');
    }
    if (table === 'setting' && data.key === 'preferences')
        preferencesSchema.parse(JSON.parse(String(data.value_json)));
    if (table === 'setting') {
        const duplicate = (await store.list('setting', true)).find(s => s.key === data.key && s.id !== c.id);
        if (duplicate)
            throw new DomainError('SETTING_ID_MISMATCH');
    }
    if (table === 'reminder') {
        if (data.kind === 'loan') {
            if (!data.target_id)
                throw new DomainError('LOAN_REQUIRED');
            await active(store, 'loan', String(data.target_id));
        }
        if (data.kind === 'bill' && !data.due_on)
            throw new DomainError('DUE_DATE_REQUIRED');
    }
    const saved = await store.put(table, { ...row(store.user, c.id, data), deleted_at: c.deleted_at ? new Date().toISOString() : null });
    if (table === 'entry' && !saved.deleted_at)
        await budgetAlerts(store, saved);
    return { op_id: c.op_id, status: 'accepted', row: saved };
}
async function execute(store: Store, c: Command): Promise<Outcome> {
    if (c.kind === 'mutate')
        return mutate(store, c);
    if (c.kind === 'transfer')
        return { op_id: c.op_id, status: 'accepted', row: await transfer(store, c) };
    if (c.kind === 'loan_create')
        return { op_id: c.op_id, status: 'accepted', row: await createLoan(store, c) };
    if (c.kind === 'loan_payment') {
        const loan = await active(store, 'loan', c.loan_id);
        if (loan.version !== c.base_version)
            return conflict(store, c, 'loan', loan.id, loan);
        return { op_id: c.op_id, status: 'accepted', row: await recordPayment(store, c) };
    }
    const saved = await active(store, 'sync_conflict', c.conflict_id);
    if (saved.resolved)
        throw new DomainError('CONFLICT_ALREADY_RESOLVED');
    const original = commandSchema.parse(JSON.parse(String(saved.client_json)));
    if (c.choice === 'client') {
        if (original.kind !== 'mutate')
            throw new DomainError('REVIEW_AND_RESUBMIT_PAYMENT');
        const table = String(saved.table_name) as Table;
        const latest = await store.get(table, String(saved.row_id));
        if ((latest?.version ?? 0) !== c.base_version)
            throw new DomainError('CONFLICT_CHANGED_AGAIN');
        await mutate(store, { ...original, base_version: c.base_version }, true);
    }
    await store.put('sync_conflict', { ...saved, resolved: true });
    return { op_id: c.op_id, status: 'accepted' };
}
export async function push(db: Database, user: string, commands: readonly Command[]) {
    const outcomes: Outcome[] = [];
    for (const raw of commands) {
        const c = commandSchema.parse(raw);
        try {
            const result = await db.transaction(user, async (store) => {
                const hash = fingerprint(c), receipt = await store.get('sync_receipt', c.op_id);
                if (receipt) {
                    if (receipt.fingerprint !== hash)
                        throw new DomainError('IDEMPOTENCY_KEY_REUSED');
                    return JSON.parse(String(receipt.result_json)) as Outcome;
                }
                const result = await execute(store, c);
                await store.put('sync_receipt', row(user, c.op_id, { fingerprint: hash, result_json: JSON.stringify(result) }), false);
                return result;
            });
            outcomes.push(result);
        }
        catch (error) {
            if (error instanceof DomainError) {
                outcomes.push({ op_id: c.op_id, status: 'rejected', code: error.code });
                continue;
            }
            if (error instanceof ZodError) {
                outcomes.push({ op_id: c.op_id, status: 'rejected', code: 'INVALID_RECORD' });
                continue;
            }
            if (error instanceof Prisma.PrismaClientKnownRequestError && ['P2002', 'P2003', 'P2004', 'P2010'].includes(error.code)) {
                const pgCode = String(error.meta?.code ?? '');
                if (error.code !== 'P2010' || ['23505', '23503', '23514', '22P02'].includes(pgCode)) {
                    outcomes.push({ op_id: c.op_id, status: 'rejected', code: 'CONSTRAINT_FAILED' });
                    continue;
                }
            }
            // A database outage is a retryable HTTP failure, not a bad user record.
            // Earlier committed commands remain replay-safe through their receipts.
            throw error;
        }
    }
    return { accepted: outcomes.filter(x => x.status === 'accepted'), conflicts: outcomes.filter(x => x.status === 'conflict'), rejected: outcomes.filter(x => x.status === 'rejected') };
}
export async function pull(db: Database, user: string, cursor: string, limit = 250) {
    if (!/^(0|[1-9]\d*)$/.test(cursor) || BigInt(cursor) > 9223372036854775807n)
        throw new DomainError('INVALID_CURSOR');
    if (!Number.isInteger(limit) || limit < 1 || limit > 1000)
        throw new DomainError('INVALID_LIMIT');
    return db.transaction(user, async (store) => {
        const state = await store.get('sync_state', user);
        const high = BigInt(String(state?.sequence ?? '0'));
        if (BigInt(cursor) > high)
            throw new DomainError('CURSOR_AHEAD_OF_SERVER');
        const all = await store.changesAfter(cursor, limit + 1);
        const page = all.slice(0, limit);
        return { changes: page.map(r => ({ sequence: String(r.sequence), table: r.table_name, row: JSON.parse(String(r.record_json)) as Row })), cursor: page.length ? String(page.at(-1)!.sequence) : cursor, has_more: all.length > limit };
    });
}
