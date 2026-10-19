export const MAX_MONEY = 9223372036854775807n;
export class DomainError extends Error {
    constructor(public code: string, message = code) { super(message); }
}
export function money(value: string): bigint {
    if (!/^(0|[1-9][0-9]{0,18})$/.test(value))
        throw new DomainError('INVALID_MONEY');
    const n = BigInt(value);
    if (n > MAX_MONEY)
        throw new DomainError('MONEY_OVERFLOW');
    return n;
}
export function positive(value: string): bigint {
    const n = money(value);
    if (!n)
        throw new DomainError('AMOUNT_MUST_BE_POSITIVE');
    return n;
}
export function bounded(n: bigint): bigint {
    if (n < -MAX_MONEY || n > MAX_MONEY)
        throw new DomainError('MONEY_OVERFLOW');
    return n;
}
export function formatRwf(n: bigint): string {
    return `${n < 0n ? '-' : ''}RWF ${(n < 0n ? -n : n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
}
export type EntryKind = 'income' | 'expense' | 'transfer_in' | 'transfer_out';
export interface MoneyEntry {
    amount: string;
    kind: EntryKind;
    wallet_id: string;
    category_id?: string | null;
    occurred_on: string;
    deleted_at?: string | null;
    skill_id?: string | null;
}
export function walletBalance(entries: readonly MoneyEntry[], wallet: string): bigint {
    return entries.filter(e => e.wallet_id === wallet && !e.deleted_at).reduce((sum, e) => bounded(sum + (e.kind === 'income' || e.kind === 'transfer_in' ? 1n : -1n) * positive(e.amount)), 0n);
}
export function cashflow(entries: readonly MoneyEntry[]): {
    income: bigint;
    expense: bigint;
} {
    let income = 0n, expense = 0n;
    for (const e of entries)
        if (!e.deleted_at) {
            if (e.kind === 'income')
                income += positive(e.amount);
            if (e.kind === 'expense')
                expense += positive(e.amount);
        }
    return { income: bounded(income), expense: bounded(expense) };
}
export function budgetLevels(spent: bigint, limit: bigint, previouslySent: readonly number[]): number[] {
    if (spent < 0n || limit <= 0n)
        throw new DomainError('INVALID_BUDGET');
    return [80, 100].filter(level => spent * 100n >= limit * BigInt(level) && !previouslySent.includes(level));
}
