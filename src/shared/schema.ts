// One table catalog drives both schemas and the SQL identifier whitelist.
export type Column = {
    type: 'text' | 'uuid' | 'int' | 'money' | 'bool';
    nullable?: boolean;
};
const text = { type: 'text' } as const, uuid = { type: 'uuid' } as const;
const int = { type: 'int' } as const, amount = { type: 'money' } as const;
const optional = (c: Column): Column => ({ ...c, nullable: true });
export const tables = {
    wallet: { name: text, currency: text, method: text },
    category: { name: text, kind: text },
    entry: { wallet_id: uuid, category_id: optional(uuid), kind: text, amount, occurred_on: text, transfer_id: optional(uuid), payment_id: optional(uuid), skill_id: optional(uuid), note: text },
    transfer: { from_wallet_id: uuid, to_wallet_id: uuid, amount, occurred_on: text, out_id: uuid, in_id: uuid },
    budget: { category_id: uuid, month: text, limit: amount },
    budget_alert: { budget_id: uuid, month: text, level: int },
    skill: { name: text, goal: text, weekly_minutes: int, course_cost: amount },
    milestone: { skill_id: uuid, title: text, completed: { type: 'bool' }, weight: int },
    study_session: { skill_id: uuid, started_at: text, minutes: int },
    loan: { name: text, lender_type: text, lender_name: text, principal: amount, interest: amount, remainder: amount, annual_rate_bps: int, accrued_on: text, status: text, schedule_json: text },
    loan_payment: { loan_id: uuid, wallet_id: uuid, category_id: uuid, amount, principal: amount, interest: amount, paid_on: text, expense_id: uuid },
    note: { content: text },
    setting: { key: text, value_json: text },
    reminder: { kind: text, target_id: optional(uuid), due_on: optional(text), time_local: text, zone: text, quiet_start: text, quiet_end: text, enabled: { type: 'bool' } },
    device: { token: text, enabled: { type: 'bool' } },
    reminder_log: { reminder_id: uuid, occurrence: text, status: text, attempts: int, next_attempt_at: text, lease_until: optional(text), ticket_id: optional(text), expires_at: text, device_id: uuid, message_json: text },
    snapshot: { day: text, assets: amount, liabilities: amount, net: amount },
    sync_state: { sequence: amount },
    sync_change: { sequence: amount, table_name: text, row_id: uuid, record_json: text },
    sync_receipt: { fingerprint: text, result_json: text },
    sync_conflict: { table_name: text, row_id: uuid, server_json: text, client_json: text, resolved: { type: 'bool' } }
} satisfies Record<string, Record<string, Column>>;
export type Table = keyof typeof tables;
export type Value = string | number | boolean | null;
export type Row = {
    id: string;
    user_id: string;
    updated_at: string;
    version: number;
    deleted_at: string | null;
} & Record<string, Value>;
export const meta: Record<string, Column> = { id: uuid, user_id: uuid, updated_at: text, version: int, deleted_at: optional(text) };
export const financial = new Set<Table>(['wallet', 'category', 'entry', 'transfer', 'budget', 'loan', 'loan_payment']);
export const writable = new Set<Table>(['wallet', 'category', 'entry', 'budget', 'skill', 'milestone', 'study_session', 'note', 'setting', 'reminder', 'device']);
export const lww = new Set<Table>(['note', 'setting']);
