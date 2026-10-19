import { cashflow, bounded, money, type MoneyEntry } from './money.js';
import { inRange, weekBounds } from './dates.js';
import { studyByDay, type Session } from './study.js';
export interface PrincipalPayment {
    paid_on: string;
    principal: string;
    deleted_at?: string | null;
}
export function weeklyReview(day: string, zone: string, entries: readonly MoneyEntry[], sessions: readonly Session[], payments: readonly PrincipalPayment[]) {
    const bounds = weekBounds(day);
    const current = cashflow(entries.filter(e => inRange(e.occurred_on, bounds.start, bounds.end)));
    const previous = cashflow(entries.filter(e => inRange(e.occurred_on, bounds.previous, bounds.start)));
    const minutes: Record<string, number> = {};
    for (const skill of new Set(sessions.map(s => s.skill_id))) {
        minutes[skill] = [...studyByDay(sessions.filter(s => s.skill_id === skill), zone)]
            .filter(([d]) => inRange(d, bounds.start, bounds.end)).reduce((sum, [, n]) => sum + n, 0);
    }
    const principal = payments.filter(p => !p.deleted_at && inRange(p.paid_on, bounds.start, bounds.end)).reduce((sum, p) => sum + money(p.principal), 0n);
    const insights: string[] = [];
    if (previous.expense > 0n && current.expense * 100n > previous.expense * 120n)
        insights.push('Spending increased by more than 20%.');
    if (previous.expense === 0n && current.expense > 0n)
        insights.push('You recorded spending this week; last week had none.');
    if (principal > 0n)
        insights.push('You reduced your loan principal this week.');
    return { ...bounds, study_minutes: minutes, current: { income: current.income.toString(), expense: current.expense.toString() },
        previous: { income: previous.income.toString(), expense: previous.expense.toString() }, principal_paid: bounded(principal).toString(), insights };
}
export function netWorth(assetBalances: readonly string[], loanBalances: readonly string[]): string {
    return bounded(assetBalances.reduce((s, x) => s + BigInt(x), 0n) - loanBalances.reduce((s, x) => s + money(x), 0n)).toString();
}
export function skillRoi(skill: string, entries: readonly MoneyEntry[], sessions: readonly Session[]) {
    const flow = cashflow(entries.filter(e => e.skill_id === skill));
    const minutes = sessions.filter(s => !s.deleted_at && s.skill_id === skill).reduce((n, s) => n + s.minutes, 0);
    const net = flow.income - flow.expense;
    return { cost: flow.expense.toString(), attributed_income: flow.income.toString(), net: net.toString(), minutes,
        roi_basis_points: flow.expense > 0n ? (net * 10000n / flow.expense).toString() : null };
}
