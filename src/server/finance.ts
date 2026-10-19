import { randomUUID } from 'node:crypto';
import { budgetLevels, DomainError, positive, type MoneyEntry } from '../core/money.js';
import { schedule, splitPayment, type LoanState } from '../core/loans.js';
import { type Store, row } from './store.js';
import { type Row } from '../shared/schema.js';
import { type Command } from './validation.js';
import { preferencesSchema } from './validation.js';
import { localDate } from '../core/dates.js';
async function today(store: Store) { const settings = (await store.list('setting')).find(s => s.key === 'preferences'); const zone = settings ? preferencesSchema.parse(JSON.parse(String(settings.value_json))).timezone : 'Africa/Kigali'; return localDate(new Date().toISOString(), zone); }
export async function active(store: Store, table: Parameters<Store['get']>[0], id: string): Promise<Row> {
    const value = await store.get(table, id);
    if (!value || value.deleted_at)
        throw new DomainError('NOT_FOUND');
    return value;
}
export function loanState(r: Row): LoanState { return { principal: String(r.principal), interest: String(r.interest), remainder: String(r.remainder), annual_rate_bps: Number(r.annual_rate_bps), accrued_on: String(r.accrued_on) }; }
export function entry(r: Row): MoneyEntry { return { amount: String(r.amount), kind: r.kind as MoneyEntry['kind'], wallet_id: String(r.wallet_id), category_id: r.category_id as string | null, occurred_on: String(r.occurred_on), deleted_at: r.deleted_at, skill_id: r.skill_id as string | null }; }
export async function checkEntryReferences(store: Store, r: Row) {
    await active(store, 'wallet', String(r.wallet_id));
    if (r.category_id) {
        const cat = await active(store, 'category', String(r.category_id));
        if (cat.kind !== r.kind)
            throw new DomainError('CATEGORY_TYPE_MISMATCH');
    }
    if (r.skill_id)
        await active(store, 'skill', String(r.skill_id));
}
export async function budgetAlerts(store: Store, r: Row) {
    if (r.kind !== 'expense' || !r.category_id)
        return;
    const month = String(r.occurred_on).slice(0, 7);
    const budgets = (await store.list('budget')).filter(b => b.category_id === r.category_id && b.month === month);
    const expenses = (await store.list('entry')).filter(e => e.kind === 'expense' && e.category_id === r.category_id && String(e.occurred_on).startsWith(month));
    const spent = expenses.reduce((n, e) => n + BigInt(String(e.amount)), 0n);
    for (const budget of budgets) {
        const sent = (await store.list('budget_alert', true)).filter(a => a.budget_id === budget.id && a.month === month).map(a => Number(a.level));
        for (const level of budgetLevels(spent, BigInt(String(budget.limit)), sent))
            await store.put('budget_alert', row(store.user, randomUUID(), { budget_id: budget.id, month, level }));
    }
}
export async function transfer(store: Store, c: Extract<Command, {
    kind: 'transfer';
}>) {
    positive(c.amount);
    if (c.from_wallet_id === c.to_wallet_id || new Set([c.id, c.out_id, c.in_id]).size !== 3)
        throw new DomainError('INVALID_TRANSFER');
    await active(store, 'wallet', c.from_wallet_id);
    await active(store, 'wallet', c.to_wallet_id);
    for (const [table, id] of [['transfer', c.id], ['entry', c.out_id], ['entry', c.in_id]] as const)
        if (await store.get(table, id))
            throw new DomainError('ID_ALREADY_EXISTS');
    const op = await store.put('transfer', row(store.user, c.id, { from_wallet_id: c.from_wallet_id, to_wallet_id: c.to_wallet_id, amount: c.amount, occurred_on: c.occurred_on, out_id: c.out_id, in_id: c.in_id }));
    const common = { category_id: null, amount: c.amount, occurred_on: c.occurred_on, transfer_id: c.id, payment_id: null, skill_id: null, note: '' };
    await store.put('entry', row(store.user, c.out_id, { ...common, wallet_id: c.from_wallet_id, kind: 'transfer_out' }));
    await store.put('entry', row(store.user, c.in_id, { ...common, wallet_id: c.to_wallet_id, kind: 'transfer_in' }));
    return op;
}
export async function createLoan(store: Store, c: Extract<Command, {
    kind: 'loan_create';
}>) {
    positive(c.principal);
    if (c.accrued_on > await today(store))
        throw new DomainError('FUTURE_LOAN_START');
    if (await store.get('loan', c.id))
        throw new DomainError('ID_ALREADY_EXISTS');
    const dates = schedule(c.schedule);
    if (dates.some(d => d.due_on < c.accrued_on))
        throw new DomainError('DUE_BEFORE_LOAN_START');
    return store.put('loan', row(store.user, c.id, { name: c.name, lender_type: c.lender_type, lender_name: c.lender_name, principal: c.principal, interest: '0', remainder: '0', annual_rate_bps: c.annual_rate_bps, accrued_on: c.accrued_on, status: 'active', schedule_json: JSON.stringify(dates) }));
}
export async function recordPayment(store: Store, c: Extract<Command, {
    kind: 'loan_payment';
}>) {
    // PgStore.get uses FOR UPDATE and every mutation also holds the user's lock.
    const loan = await active(store, 'loan', c.loan_id);
    if (c.paid_on > await today(store))
        throw new DomainError('FUTURE_PAYMENT');
    if (loan.version !== c.base_version)
        throw new DomainError('LOAN_VERSION_CONFLICT');
    if (loan.status === 'paid')
        throw new DomainError('LOAN_ALREADY_PAID');
    if (await store.get('loan_payment', c.id) || await store.get('entry', c.expense_id))
        throw new DomainError('ID_ALREADY_EXISTS');
    const cat = await active(store, 'category', c.category_id);
    if (cat.kind !== 'expense')
        throw new DomainError('CATEGORY_TYPE_MISMATCH');
    await active(store, 'wallet', c.wallet_id);
    const split = splitPayment(loanState(loan), c.amount, c.paid_on);
    const payment = await store.put('loan_payment', row(store.user, c.id, { loan_id: c.loan_id, wallet_id: c.wallet_id, category_id: c.category_id, amount: c.amount, paid_on: c.paid_on, expense_id: c.expense_id, principal: split.principal, interest: split.interest }));
    const expense = await store.put('entry', row(store.user, c.expense_id, { wallet_id: c.wallet_id, category_id: c.category_id, kind: 'expense', amount: c.amount, occurred_on: c.paid_on, transfer_id: null, payment_id: c.id, skill_id: null, note: `Payment: ${String(loan.name)}` }));
    await store.put('loan', { ...loan, ...split.state, status: split.paid ? 'paid' : 'active' });
    await budgetAlerts(store, expense);
    return payment;
}
