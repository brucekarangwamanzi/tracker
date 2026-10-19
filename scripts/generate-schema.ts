import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { tables, meta, type Column } from '../src/shared/schema.js';
const models = Object.entries(tables);
const uniques: Record<string, string[]> = {
    budget: ['category_id', 'month'], budget_alert: ['budget_id', 'month', 'level'],
    setting: ['key'], sync_state: [], sync_change: ['sequence'],
    reminder_log: ['reminder_id', 'occurrence', 'device_id'], snapshot: ['day']
};
const refs: [
    string,
    string,
    string
][] = [
    ['entry', 'wallet_id', 'wallet'], ['entry', 'category_id', 'category'], ['entry', 'skill_id', 'skill'],
    ['transfer', 'from_wallet_id', 'wallet'], ['transfer', 'to_wallet_id', 'wallet'],
    ['budget', 'category_id', 'category'], ['budget_alert', 'budget_id', 'budget'],
    ['milestone', 'skill_id', 'skill'], ['study_session', 'skill_id', 'skill'],
    ['loan_payment', 'loan_id', 'loan'], ['loan_payment', 'wallet_id', 'wallet'], ['loan_payment', 'category_id', 'category'],
    ['reminder_log', 'reminder_id', 'reminder'], ['reminder_log', 'device_id', 'device']
];
function prismaType(c: Column) { return ({ text: 'String', uuid: 'String @db.Uuid', int: 'Int', money: 'BigInt', bool: 'Boolean' })[c.type]; }
let prisma = 'generator client {\n  provider = "prisma-client-js"\n}\ndatasource db {\n  provider = "postgresql"\n}\n';
let pg = 'CREATE SCHEMA IF NOT EXISTS life;\nSET search_path TO life;\n';
let sqlite = 'PRAGMA journal_mode = WAL;\nPRAGMA foreign_keys = ON;\n';
for (const [name, columns] of models) {
    const all: Record<string, Column> = { ...meta, ...columns };
    prisma += `\nmodel ${name} {\n` + Object.entries(all).map(([key, c]) => {
        let type = prismaType(c);
        if (c.nullable)
            type = type.replace(/^(String|Int|BigInt|Boolean)/, '$1?');
        return `  ${key} ${type}${key === 'id' ? ' @id' : ''}`;
    }).join('\n') + '\n  @@unique([user_id, id])\n  @@index([user_id, updated_at])\n';
    if (name in uniques)
        prisma += `  @@unique([user_id${uniques[name]!.map(x => `, ${x}`).join('')}])\n`;
    prisma += '}\n';
    for (const dialect of ['pg', 'sqlite'] as const) {
        const sqlCols = Object.entries(all).map(([key, c]) => {
            const type = dialect === 'pg' ? ({ text: 'TEXT', uuid: 'UUID', int: 'INTEGER', money: 'BIGINT', bool: 'BOOLEAN' })[c.type] : c.type === 'money' || c.type === 'int' || c.type === 'bool' ? 'INTEGER' : 'TEXT';
            return `"${key}" ${type}${c.nullable ? '' : ' NOT NULL'}${key === 'id' ? ' PRIMARY KEY' : ''}${dialect === 'sqlite' && c.type === 'money' ? ` CHECK (typeof("${key}") = 'integer')` : ''}`;
        });
        sqlCols.push('UNIQUE (user_id, id)');
        if (name in uniques)
            sqlCols.push(`UNIQUE (user_id${uniques[name]!.map(x => `, "${x}"`).join('')})`);
        if (dialect === 'sqlite')
            for (const [, column, target] of refs.filter(([source]) => source === name))
                sqlCols.push(`FOREIGN KEY(user_id,"${column}") REFERENCES "${target}"(user_id,id)`);
        let sql = `CREATE TABLE "${name}" (\n  ${sqlCols.join(',\n  ')}\n);\nCREATE INDEX "${name}_owner_updated" ON "${name}"(user_id,updated_at);\n`;
        if (dialect === 'pg')
            pg += sql;
        else
            sqlite += sql;
    }
}
for (const [source, column, target] of refs)
    pg += `ALTER TABLE "${source}" ADD CONSTRAINT "${source}_${column}_owner_fk" FOREIGN KEY (user_id,"${column}") REFERENCES "${target}"(user_id,id);\n`;
for (const name of ['entry', 'transfer', 'budget', 'loan', 'loan_payment', 'skill']) {
    const columns = Object.entries(tables[name as keyof typeof tables]).filter(([, c]) => c.type === 'money').map(([key]) => key);
    for (const column of columns)
        pg += `ALTER TABLE "${name}" ADD CHECK ("${column}" >= 0);\n`;
}
pg += `ALTER TABLE entry ADD CHECK(amount > 0);\nALTER TABLE entry ADD CHECK(kind IN ('income','expense','transfer_in','transfer_out'));\nALTER TABLE wallet ADD CHECK(currency = 'RWF');\nALTER TABLE transfer ADD CHECK(from_wallet_id <> to_wallet_id);\n`;
// Database-level ownership defense. API transaction sets app.user_id locally.
for (const [name] of models)
    pg += `ALTER TABLE "${name}" ENABLE ROW LEVEL SECURITY;\nALTER TABLE "${name}" FORCE ROW LEVEL SECURITY;\nCREATE POLICY owner ON "${name}" USING (user_id = NULLIF(current_setting('app.user_id', true), '')::uuid) WITH CHECK (user_id = NULLIF(current_setting('app.user_id', true), '')::uuid);\n`;
sqlite += `CREATE TABLE local_outbox (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, updated_at TEXT NOT NULL, version INTEGER NOT NULL, deleted_at TEXT, command_json TEXT NOT NULL, local_revision INTEGER NOT NULL, queue_sequence INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'dirty', affected_json TEXT NOT NULL);\nCREATE TABLE local_cursor (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, updated_at TEXT NOT NULL, version INTEGER NOT NULL, deleted_at TEXT, cursor TEXT NOT NULL);\nCREATE TABLE local_shadow (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, updated_at TEXT NOT NULL, version INTEGER NOT NULL, deleted_at TEXT, table_name TEXT NOT NULL, row_id TEXT NOT NULL, record_json TEXT NOT NULL);\n`;
await mkdir('prisma/migrations/202610180001_initial', { recursive: true });
await mkdir('src/mobile', { recursive: true });
const initialPath='prisma/migrations/202610180001_initial/migration.sql';
let previous:string|null=null;
try{previous=await readFile(initialPath,'utf8');}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
if(previous!==null&&previous!==pg)throw new Error('The initial migration is frozen. Add a new PostgreSQL migration and versioned mobile migration for schema evolution; do not rewrite applied history.');
await writeFile('prisma/schema.prisma', prisma);
if(previous===null)await writeFile(initialPath,pg);
await writeFile('prisma/migrations/migration_lock.toml', 'provider = "postgresql"\n');
await writeFile('src/mobile/schema.sql', sqlite);
