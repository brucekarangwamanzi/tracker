import { splitPayment, type LoanState } from '../core/loans.js';
import { positive, DomainError } from '../core/money.js';
import { type Row, type Table } from '../shared/schema.js';
import type { Command } from '../server/validation.js';
export type UuidFactory = () => string;
const make = (user: string, id: string, data: Record<string, string | number | boolean | null>, now: string): Row => ({ ...data, id, user_id: user, updated_at: now, version: 0, deleted_at: null });
export function draftTransfer(user: string, from: string, to: string, amount: string, day: string, uuid: UuidFactory, now: string) {
    positive(amount);
    if (from === to)
        throw new DomainError('INVALID_TRANSFER');
    const id = uuid(), out = uuid(), into = uuid();
    const command: Command = { op_id: uuid(), kind: 'transfer', id, out_id: out, in_id: into, from_wallet_id: from, to_wallet_id: to, amount, occurred_on: day };
    const common = { category_id: null, amount, occurred_on: day, transfer_id: id, payment_id: null, skill_id: null, note: '' };
    const changes: {
        table: Table;
        row: Row;
    }[] = [{ table: 'transfer', row: make(user, id, { from_wallet_id: from, to_wallet_id: to, amount, occurred_on: day, out_id: out, in_id: into }, now) },
        { table: 'entry', row: make(user, out, { ...common, wallet_id: from, kind: 'transfer_out' }, now) }, { table: 'entry', row: make(user, into, { ...common, wallet_id: to, kind: 'transfer_in' }, now) }];
    return { command, changes };
}
export function draftPayment(user: string, loan: Row, wallet: string, category: string, amount: string, day: string, uuid: UuidFactory, now: string) {
    const id = uuid(), expense = uuid();
    const state: LoanState = { principal: String(loan.principal), interest: String(loan.interest), remainder: String(loan.remainder), annual_rate_bps: Number(loan.annual_rate_bps), accrued_on: String(loan.accrued_on) };
    const split = splitPayment(state, amount, day);
    const command: Command = { op_id: uuid(), kind: 'loan_payment', id, expense_id: expense, loan_id: loan.id, wallet_id: wallet, category_id: category, base_version: loan.version, amount, paid_on: day };
    const changes: {
        table: Table;
        row: Row;
    }[] = [{ table: 'loan_payment', row: make(user, id, { loan_id: loan.id, wallet_id: wallet, category_id: category, amount, paid_on: day, expense_id: expense, principal: split.principal, interest: split.interest }, now) },
        { table: 'entry', row: make(user, expense, { wallet_id: wallet, category_id: category, kind: 'expense', amount, occurred_on: day, transfer_id: null, payment_id: id, skill_id: null, note: `Payment: ${String(loan.name)}` }, now) },
        { table: 'loan', row: { ...loan, ...split.state, status: split.paid ? 'paid' : 'active', updated_at: now } }];
    return { command, changes };
}
