import { tables, meta, type Row, type Table, type Column } from '../shared/schema.js';
import { money, DomainError } from '../core/money.js';
import type { Command } from '../server/validation.js';
// Structural subset of expo-sqlite. Pass the actual database from openDatabaseAsync.
export interface SqliteConnection {
    runAsync(sql: string, ...params: (string | number | null)[]): Promise<unknown>;
    getAllAsync<T>(sql: string, ...params: (string | number | null)[]): Promise<T[]>;
    getFirstAsync<T>(sql: string, ...params: (string | number | null)[]): Promise<T | null>;
}
export interface SqliteDatabase extends SqliteConnection {
    withExclusiveTransactionAsync(fn: (tx: SqliteConnection) => Promise<void>): Promise<void>;
}
export interface Pending {
    id: string;
    command_json: string;
    local_revision: number;
    status: string;
    affected_json: string;
}
export interface PullPage {
    cursor: string;
    has_more: boolean;
    changes: {
        sequence: string;
        table: string;
        row: Row;
    }[];
}
function columnNames(table: Table): Record<string, Column> { return { ...meta, ...tables[table] }; }
export function selectExact(table: Table): string {
    return Object.entries(columnNames(table)).map(([key, c]) => c.type === 'money' ? `CAST("${key}" AS TEXT) AS "${key}"` : `"${key}"`).join(',');
}
export async function readRows(db: SqliteConnection, user: string, table: Table): Promise<Row[]> {
    const rows = await db.getAllAsync<Row>(`SELECT ${selectExact(table)} FROM "${table}" WHERE user_id=? AND deleted_at IS NULL`, user);
    const bools = Object.entries(columnNames(table)).filter(([, c]) => c.type === 'bool').map(([k]) => k);
    return rows.map(r => { for (const k of bools)
        r[k] = Boolean(r[k]); return r; });
}
export async function writeRow(tx: SqliteConnection, table: Table, r: Row) {
    const columns = columnNames(table), keys = Object.keys(columns);
    const values: (string | number | null)[] = keys.map(k => {
        const v = r[k] ?? null;
        if (columns[k]!.type === 'money' && v !== null) {
            // Negative snapshots are permitted; user-entered amounts use money() instead.
            if (!/^-?(0|[1-9]\d*)$/.test(String(v)) || BigInt(String(v)) > 9223372036854775807n || BigInt(String(v)) < -9223372036854775807n)
                throw new DomainError('MONEY_OVERFLOW');
            return String(v);
        }
        return typeof v === 'boolean' ? (v ? 1 : 0) : v;
    });
    const slots = keys.map(k => columns[k]!.type === 'money' ? 'CAST(? AS INTEGER)' : '?').join(',');
    await tx.runAsync(`INSERT INTO "${table}" (${keys.map(k => `"${k}"`).join(',')}) VALUES (${slots}) ON CONFLICT(id) DO UPDATE SET ${keys.filter(k => k !== 'id').map(k => `"${k}"=excluded."${k}"`).join(',')}`, ...values);
}
export async function commitLocal(db: SqliteDatabase, user: string, command: Command, changes: {
    table: Table;
    row: Row;
}[]) {
    if (changes.some(c => c.row.user_id !== user))
        throw new DomainError('FORBIDDEN');
    await db.withExclusiveTransactionAsync(async (tx) => {
        for (const change of changes)
            await writeRow(tx, change.table, change.row);
        const order = await tx.getFirstAsync<{
            n: number;
        }>('SELECT COALESCE(MAX(queue_sequence),0)+1 AS n FROM local_outbox WHERE user_id=?', user);
        await tx.runAsync('INSERT INTO local_outbox(id,user_id,updated_at,version,deleted_at,command_json,local_revision,queue_sequence,status,affected_json) VALUES(?,?,?,1,NULL,?,1,?,?,?)', command.op_id, user, new Date().toISOString(), JSON.stringify(command), order!.n, 'dirty', JSON.stringify(changes.map(c => ({ table: c.table, id: c.row.id }))));
    });
}
export async function applyPushResult(db: SqliteDatabase, user: string, sent: readonly Pending[], result: {
    accepted: {
        op_id: string;
    }[];
    conflicts: {
        op_id: string;
    }[];
    rejected?: {
        op_id: string;
        code?: string;
    }[];
}) {
    await db.withExclusiveTransactionAsync(async (tx) => {
        for (const outcome of result.accepted) {
            const snapshot = sent.find(s => s.id === outcome.op_id);
            if (!snapshot)
                continue;
            // Acknowledge exactly what was sent, not a newer local edit of the same row.
            await tx.runAsync("UPDATE local_outbox SET status='accepted',updated_at=? WHERE user_id=? AND id=? AND local_revision=? AND command_json=?", new Date().toISOString(), user, snapshot.id, snapshot.local_revision, snapshot.command_json);
            const command = JSON.parse(snapshot.command_json) as Command;
            if (command.kind === 'resolve')
                await tx.runAsync("UPDATE local_outbox SET status='resolved' WHERE user_id=? AND id=? AND status='conflict'", user, command.conflict_id);
        }
        for (const conflict of result.conflicts)
            await tx.runAsync("UPDATE local_outbox SET status='conflict' WHERE user_id=? AND id=? AND status='dirty'", user, conflict.op_id);
        const held = await tx.getAllAsync<Pending>("SELECT affected_json FROM local_outbox WHERE user_id=? AND status IN ('dirty','conflict')", user);
        const ids = new Set(held.flatMap(p => (JSON.parse(p.affected_json) as {
            table: string;
            id: string;
        }[]).map(x => `${x.table}:${x.id}`)));
        const shadows = await tx.getAllAsync<{
            id: string;
            table_name: Table;
            row_id: string;
            record_json: string;
        }>('SELECT id,table_name,row_id,record_json FROM local_shadow WHERE user_id=? AND deleted_at IS NULL', user);
        for (const shadow of shadows)
            if (!ids.has(`${shadow.table_name}:${shadow.row_id}`)) {
                await writeRow(tx, shadow.table_name, JSON.parse(shadow.record_json) as Row);
                await tx.runAsync('UPDATE local_shadow SET deleted_at=? WHERE user_id=? AND id=?', new Date().toISOString(), user, shadow.id);
            }
    });
}
export async function applyPull(db: SqliteDatabase, user: string, page: PullPage) {
    await db.withExclusiveTransactionAsync(async (tx) => {
        const pending = await tx.getAllAsync<Pending>("SELECT id,command_json,local_revision,status,affected_json FROM local_outbox WHERE user_id=? AND status IN ('dirty','conflict')", user);
        const held = new Set(pending.flatMap(p => (JSON.parse(p.affected_json) as {
            table: Table;
            id: string;
        }[]).map(x => `${x.table}:${x.id}`)));
        for (const change of page.changes) {
            if (!Object.hasOwn(tables, change.table) || change.row.user_id !== user)
                throw new DomainError('INVALID_PULL');
            const table = change.table as Table;
            if (held.has(`${table}:${change.row.id}`)) {
                // Preserve the server counterpart; do not overwrite a dirty financial draft.
                await tx.runAsync('INSERT INTO local_shadow(id,user_id,updated_at,version,deleted_at,table_name,row_id,record_json) VALUES(?,?,?,?,NULL,?,?,?) ON CONFLICT(id) DO UPDATE SET record_json=excluded.record_json,version=excluded.version,updated_at=excluded.updated_at,deleted_at=NULL', change.row.id, user, change.row.updated_at, change.row.version, table, change.row.id, JSON.stringify(change.row));
            }
            else {
                const existing = await tx.getFirstAsync<{
                    version: number;
                }>(`SELECT version FROM "${table}" WHERE user_id=? AND id=?`, user, change.row.id);
                if (!existing || existing.version <= change.row.version)
                    await writeRow(tx, table, change.row);
            }
        }
        await tx.runAsync('INSERT INTO local_cursor(id,user_id,updated_at,version,deleted_at,cursor) VALUES(?,?,?,1,NULL,?) ON CONFLICT(id) DO UPDATE SET cursor=excluded.cursor,updated_at=excluded.updated_at', user, user, new Date().toISOString(), page.cursor);
    });
}
export interface SyncTransport {
    push(changes: Command[]): Promise<{
        accepted: {
            op_id: string;
        }[];
        conflicts: {
            op_id: string;
        }[];
    }>;
    pull(cursor: string): Promise<PullPage>;
}
export async function syncOnce(db: SqliteDatabase, user: string, transport: SyncTransport) {
    // Caller serializes syncOnce per database; retry an immutable outbox command.
    const sent = await db.getAllAsync<Pending>("SELECT id,command_json,local_revision,status,affected_json FROM local_outbox WHERE user_id=? AND status='dirty' ORDER BY queue_sequence LIMIT 100", user);
    if (sent.length) {
        const result = await transport.push(sent.map(p => JSON.parse(p.command_json) as Command));
        await applyPushResult(db, user, sent, result);
    }
    const cursor = await db.getFirstAsync<{
        cursor: string;
    }>('SELECT cursor FROM local_cursor WHERE user_id=? AND id=?', user, user);
    let next = cursor?.cursor ?? '0';
    for (let count = 0; count < 100; count++) {
        const page = await transport.pull(next);
        await applyPull(db, user, page);
        next = page.cursor;
        if (!page.has_more)
            return;
    }
}
export class SyncCoordinator {
    private current: Promise<void> | null = null;
    constructor(private db: SqliteDatabase, private user: string, private transport: SyncTransport) { }
    run(): Promise<void> { if (this.current)
        return this.current; this.current = syncOnce(this.db, this.user, this.transport).finally(() => { this.current = null; }); return this.current; }
}
export function httpTransport(base: string, accessToken: () => Promise<string>): SyncTransport {
    if (!base.startsWith('https://'))
        throw new DomainError('HTTPS_REQUIRED');
    async function request(path: string, body?: unknown) {
        const token = await accessToken();
        const response = await fetch(`${base.replace(/\/$/, '')}${path}`, { method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(20000) });
        if (!response.ok)
            throw new DomainError(response.status === 401 ? 'AUTH_REQUIRED' : `SYNC_HTTP_${response.status}`);
        return response.json() as Promise<unknown>;
    }
    return { push: async (changes) => await request('/sync/push', { changes }) as Awaited<ReturnType<SyncTransport['push']>>, pull: async (cursor) => await request(`/sync/pull?cursor=${encodeURIComponent(cursor)}`) as PullPage };
}
