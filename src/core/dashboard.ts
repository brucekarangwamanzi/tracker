import { type Row } from '../shared/schema.js';
import { localDate } from './dates.js';
import { cashflow, type MoneyEntry } from './money.js';
import { studyByDay, streak, type Session } from './study.js';
import type { Installment } from './loans.js';
export function asEntry(r: Row): MoneyEntry { return { amount: String(r.amount), kind: r.kind as MoneyEntry['kind'], wallet_id: String(r.wallet_id), category_id: r.category_id as string | null, occurred_on: String(r.occurred_on), deleted_at: r.deleted_at, skill_id: r.skill_id as string | null }; }
export function asSession(r: Row): Session { return { skill_id: String(r.skill_id), started_at: String(r.started_at), minutes: Number(r.minutes), deleted_at: r.deleted_at }; }
export function nextPayments(loans: readonly Row[], payments: readonly Row[]) {
    const result: {
        loan_id: string;
        name: string;
        due_on: string;
        amount: string;
    }[] = [];
    for (const loan of loans.filter(l => !l.deleted_at && l.status !== 'paid')) {
        let paid = payments.filter(p => !p.deleted_at && p.loan_id === loan.id).reduce((n, p) => n + BigInt(String(p.amount)), 0n);
        for (const due of JSON.parse(String(loan.schedule_json)) as Installment[]) {
            const amount = BigInt(due.amount);
            if (paid >= amount) {
                paid -= amount;
                continue;
            }
            result.push({ loan_id: loan.id, name: String(loan.name), due_on: due.due_on, amount: (amount - paid).toString() });
            break;
        }
    }
    return result.sort((a, b) => a.due_on.localeCompare(b.due_on) || a.loan_id.localeCompare(b.loan_id));
}
export function homeSummary(input: {
    now: string;
    timezone: string;
    minimum_minutes: number;
    sessions: readonly Row[];
    entries: readonly Row[];
    budgets: readonly Row[];
    loans: readonly Row[];
    payments: readonly Row[];
}) {
    const today = localDate(input.now, input.timezone), sessions = input.sessions.map(asSession);
    const monthly = input.entries.map(asEntry).filter(e => !e.deleted_at && e.occurred_on.startsWith(today.slice(0, 7)));
    const budgets = input.budgets.filter(b => !b.deleted_at && b.month === today.slice(0, 7));
    const limit = budgets.reduce((n, b) => n + BigInt(String(b.limit)), 0n), categories = new Set(budgets.map(b => b.category_id));
    const spent = monthly.filter(e => e.kind === 'expense' && categories.has(e.category_id ?? null)).reduce((n, e) => n + BigInt(e.amount), 0n);
    const flow = cashflow(monthly);
    return { as_of: input.now, local_date: today, today_study_minutes: studyByDay(sessions, input.timezone).get(today) ?? 0, budget_left: (limit - spent).toString(), budget_limit: limit.toString(), monthly: { income: flow.income.toString(), expense: flow.expense.toString() },
        next_loan_payment: nextPayments(input.loans, input.payments)[0] ?? null, streak: streak(sessions, input.minimum_minutes, input.now, input.timezone) };
}
