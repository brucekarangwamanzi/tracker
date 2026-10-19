import { z } from 'zod';
import { date, Temporal } from '../core/dates.js';
import { money } from '../core/money.js';
import { tables, type Table, type Column } from '../shared/schema.js';
export const uuid = z.uuid();
export const moneyString = z.string().refine(x => { try {
    money(x);
    return true;
}
catch {
    return false;
} }, 'Use a nonnegative integer RWF string within BIGINT range');
export const isoDate = z.string().refine(x => { try {
    date(x);
    return true;
}
catch {
    return false;
} });
export const instant = z.iso.datetime({ offset: true });
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const zone = z.string().max(100).refine(s => { try {
    Temporal.Now.zonedDateTimeISO(s);
    return true;
}
catch {
    return false;
} });
const json = z.string().max(64000).refine(s => { try {
    JSON.parse(s);
    return true;
}
catch {
    return false;
} });
const installment = z.strictObject({ due_on: isoDate, amount: moneyString.refine(x => BigInt(x) > 0n) });
export const scheduleSchema = z.discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('weekly'), first: isoDate, payment: moneyString, count: z.int().min(1).max(1200) }),
    z.strictObject({ kind: z.literal('monthly'), first: isoDate, payment: moneyString, count: z.int().min(1).max(1200), day: z.union([z.int().min(1).max(31), z.literal('last')]) }),
    z.strictObject({ kind: z.literal('custom'), dates: z.array(installment).max(1200) })
]);
function field(c: Column): z.ZodType {
    let s: z.ZodType = ({ text: z.string().max(64000), uuid, int: z.int().min(0).max(2147483647), money: moneyString, bool: z.boolean() })[c.type];
    return c.nullable ? s.nullable() : s;
}
export function payloadSchema(table: Table) {
    const shape: Record<string, z.ZodType> = Object.fromEntries(Object.entries(tables[table]).map(([k, c]) => [k, field(c)]));
    if (table === 'wallet') {
        shape.currency = z.literal('RWF');
        shape.method = z.enum(['Cash', 'Bank', 'MTN MoMo', 'Airtel Money']);
        shape.name = z.string().min(1).max(100);
    }
    if (table === 'entry') {
        shape.kind = z.enum(['income', 'expense']);
        shape.amount = moneyString.refine(x => BigInt(x) > 0n);
        shape.occurred_on = isoDate;
        shape.transfer_id = z.null();
        shape.payment_id = z.null();
    }
    if (table === 'category')
        shape.kind = z.enum(['income', 'expense']);
    if (table === 'budget') {
        shape.month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
        shape.limit = moneyString.refine(x => BigInt(x) > 0n);
    }
    if (table === 'study_session') {
        shape.minutes = z.int().min(1).max(1440);
        shape.started_at = instant;
    }
    if (table === 'milestone')
        shape.weight = z.int().min(1).max(10000);
    if (table === 'reminder') {
        shape.kind = z.enum(['loan', 'bill', 'study']);
        shape.time_local = time;
        shape.zone = zone;
        shape.quiet_start = time;
        shape.quiet_end = time;
        shape.due_on = isoDate.nullable();
    }
    if (table === 'setting') {
        shape.key = z.enum(['preferences', 'last_wallet']);
        shape.value_json = json;
    }
    if (table === 'device')
        shape.token = z.string().regex(/^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]+\]$/).max(250);
    return z.strictObject(shape);
}
export const mutateSchema = z.strictObject({ op_id: uuid, kind: z.literal('mutate'), table: z.string(), id: uuid, base_version: z.int().min(0), deleted_at: instant.nullable(), data: z.record(z.string(), z.unknown()) });
export const commandSchema = z.discriminatedUnion('kind', [
    mutateSchema,
    z.strictObject({ op_id: uuid, kind: z.literal('transfer'), id: uuid, out_id: uuid, in_id: uuid, from_wallet_id: uuid, to_wallet_id: uuid, amount: moneyString, occurred_on: isoDate }),
    z.strictObject({ op_id: uuid, kind: z.literal('loan_create'), id: uuid, name: z.string().min(1).max(150), lender_type: z.enum(['bank', 'sacco', 'mobile', 'friend_family']), lender_name: z.string().min(1).max(150), principal: moneyString, annual_rate_bps: z.int().min(0).max(100000), accrued_on: isoDate, schedule: scheduleSchema }),
    z.strictObject({ op_id: uuid, kind: z.literal('loan_payment'), id: uuid, expense_id: uuid, loan_id: uuid, wallet_id: uuid, category_id: uuid, base_version: z.int().min(1), amount: moneyString, paid_on: isoDate }),
    z.strictObject({ op_id: uuid, kind: z.literal('resolve'), conflict_id: uuid, base_version: z.int().min(0), choice: z.enum(['server', 'client']) })
]);
export type Command = z.infer<typeof commandSchema>;
export const pushSchema = z.strictObject({ changes: z.array(commandSchema).min(1).max(100) });
export interface Preferences {
    timezone: string;
    minimum_minutes: number;
    push_enabled: boolean;
}
export const preferencesSchema = z.strictObject({ timezone: zone, minimum_minutes: z.int().min(1).max(1440), push_enabled: z.boolean() });
