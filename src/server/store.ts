import { randomUUID } from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { meta, tables, type Table, type Row, type Column } from '../shared/schema.js';
import { DomainError } from '../core/money.js';
export interface Store {
    readonly user: string;
    get(table: Table, id: string): Promise<Row | null>;
    list(table: Table, includeDeleted?: boolean): Promise<Row[]>;
    changesAfter(cursor: string, limit: number): Promise<Row[]>;
    put(table: Table, row: Row, publish?: boolean): Promise<Row>;
}
export interface Database {
    transaction<T>(user: string, fn: (store: Store) => Promise<T>): Promise<T>;
}
export function row(user: string, id: string, fields: Record<string, string | number | boolean | null>, now = new Date().toISOString()): Row {
    return { ...fields, id, user_id: user, updated_at: now, version: 1, deleted_at: null };
}
const internal = new Set<Table>(['sync_change', 'sync_state', 'sync_receipt']);
function sqlName(name: string) { return Prisma.raw(`"${name}"`); } // Only catalog-validated identifiers.
function sqlTable(table: Table) { return Prisma.sql `"life".${sqlName(table)}`; }
export class PgDatabase implements Database {
    readonly prisma: PrismaClient;
    constructor(url: string) { this.prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }, { schema: 'life' }) }); }
    async transaction<T>(user: string, fn: (store: Store) => Promise<T>): Promise<T> {
        return this.prisma.$transaction(async (tx) => {
            await tx.$queryRaw `SELECT set_config('app.user_id', ${user}, true)`;
            // Serialize this individual's writes. Locks release on rollback/commit;
            // this also makes the user's change cursor commit ordered (no sequence gaps).
            await tx.$executeRaw `SELECT pg_advisory_xact_lock(hashtextextended(${user}, 0))`;
            const store = new PgStore(tx, user);
            return fn(store);
        }, { timeout: 20000, maxWait: 10000 });
    }
}
class PgStore implements Store {
    constructor(private tx: Prisma.TransactionClient, readonly user: string) { }
    private select(table: Table): Prisma.Sql {
        const columns: Record<string, Column> = { ...meta, ...tables[table] };
        return Prisma.join(Object.entries(columns).map(([key, c]) => c.type === 'money' ? Prisma.sql `${sqlName(key)}::text AS ${sqlName(key)}` : sqlName(key)));
    }
    async get(table: Table, id: string) {
        const rows = await this.tx.$queryRaw<Row[]>(Prisma.sql `SELECT ${this.select(table)} FROM ${sqlTable(table)} WHERE user_id = ${this.user}::uuid AND id = ${id}::uuid FOR UPDATE`);
        return rows[0] ?? null;
    }
    async list(table: Table, includeDeleted = false) {
        return this.tx.$queryRaw<Row[]>(Prisma.sql `SELECT ${this.select(table)} FROM ${sqlTable(table)} WHERE user_id = ${this.user}::uuid ${includeDeleted ? Prisma.empty : Prisma.sql `AND deleted_at IS NULL`}`);
    }
    async changesAfter(cursor: string, limit: number) {
        return this.tx.$queryRaw<Row[]>(Prisma.sql `SELECT ${this.select('sync_change')} FROM life.sync_change WHERE user_id=${this.user}::uuid AND sequence > ${cursor}::bigint ORDER BY sequence LIMIT ${limit}`);
    }
    async put(table: Table, input: Row, publish = true): Promise<Row> {
        if (input.user_id !== this.user)
            throw new DomainError('FORBIDDEN');
        const old = await this.get(table, input.id);
        const next: Row = { ...input, user_id: this.user, version: old ? old.version + 1 : 1, updated_at: new Date().toISOString() };
        const columns: Record<string, Column> = { ...meta, ...tables[table] };
        const keys = Object.keys(columns);
        const values = keys.map(key => {
            const val = next[key] ?? null;
            if (columns[key]!.type === 'uuid')
                return Prisma.sql `${val}::uuid`;
            if (columns[key]!.type === 'money')
                return Prisma.sql `${val}::bigint`;
            return Prisma.sql `${val}`;
        });
        if (old) {
            await this.tx.$executeRaw(Prisma.sql `UPDATE ${sqlTable(table)} SET ${Prisma.join(keys.filter(k => k !== 'id' && k !== 'user_id').map(k => Prisma.sql `${sqlName(k)} = ${values[keys.indexOf(k)]!}`))} WHERE user_id=${this.user}::uuid AND id=${next.id}::uuid`);
        }
        else
            await this.tx.$executeRaw(Prisma.sql `INSERT INTO ${sqlTable(table)} (${Prisma.join(keys.map(sqlName))}) VALUES (${Prisma.join(values)})`);
        if (publish && !internal.has(table)) {
            let state = await this.get('sync_state', this.user);
            state = await this.put('sync_state', row(this.user, this.user, { sequence: (BigInt(String(state?.sequence ?? '0')) + 1n).toString() }), false);
            await this.put('sync_change', row(this.user, randomUUID(), { sequence: state.sequence!, table_name: table, row_id: next.id, record_json: JSON.stringify(next) }), false);
        }
        return next;
    }
}
