import { date, daysBetween } from './dates.js';
import { bounded, DomainError, money, positive } from './money.js';
// ACT/365 Fixed; annual rate is integer basis points: 1200 = 12%.
const DENOMINATOR = 3650000n;
export interface LoanState {
    principal: string;
    interest: string;
    remainder: string;
    annual_rate_bps: number;
    accrued_on: string;
}
export interface Installment {
    due_on: string;
    amount: string;
}
export function remainingSchedule(dates: readonly Installment[], paid: string, asOf: string): Installment[] {
    let credit = money(paid);
    const grouped = new Map<string, bigint>();
    date(asOf);
    for (const item of [...dates].sort((a, b) => a.due_on.localeCompare(b.due_on))) {
        date(item.due_on);
        let due = positive(item.amount);
        const used = credit < due ? credit : due;
        credit -= used;
        due -= used;
        if (!due)
            continue;
        const day = item.due_on < asOf ? asOf : item.due_on;
        grouped.set(day, (grouped.get(day) ?? 0n) + due);
    }
    return [...grouped].map(([due_on, amount]) => ({ due_on, amount: amount.toString() }));
}
export type Schedule = {
    kind: 'weekly';
    first: string;
    payment: string;
    count: number;
} | {
    kind: 'monthly';
    first: string;
    payment: string;
    count: number;
    day: number | 'last';
} | {
    kind: 'custom';
    dates: Installment[];
};
export function schedule(input: Schedule): Installment[] {
    if (input.kind === 'custom') {
        const rows = [...input.dates].sort((a, b) => a.due_on.localeCompare(b.due_on));
        if (rows.length > 1200)
            throw new DomainError('SCHEDULE_TOO_LONG');
        const seen = new Set<string>();
        for (const row of rows) {
            date(row.due_on);
            positive(row.amount);
            if (seen.has(row.due_on))
                throw new DomainError('DUPLICATE_DUE_DATE');
            seen.add(row.due_on);
        }
        return rows;
    }
    positive(input.payment);
    if (!Number.isInteger(input.count) || input.count < 1 || input.count > 1200)
        throw new DomainError('INVALID_COUNT');
    const first = date(input.first);
    if (input.kind === 'monthly' && input.day !== 'last' && (!Number.isInteger(input.day) || input.day < 1 || input.day > 31))
        throw new DomainError('INVALID_DUE_DAY');
    return Array.from({ length: input.count }, (_, i) => {
        let d = input.kind === 'weekly' ? first.add({ days: 7 * i }) : first.with({ day: 1 }).add({ months: i });
        if (input.kind === 'monthly')
            d = d.with({ day: input.day === 'last' ? d.daysInMonth : Math.min(input.day, d.daysInMonth) });
        if (date(input.first).until(d).sign < 0)
            throw new DomainError('FIRST_DUE_BEFORE_START');
        return { due_on: d.toString(), amount: input.payment };
    });
}
export function accrue(loan: LoanState, paidOn: string): LoanState {
    const days = daysBetween(loan.accrued_on, paidOn);
    if (days < 0)
        throw new DomainError('BACKDATED_PAYMENT_REQUIRES_REPLAY');
    if (!Number.isInteger(loan.annual_rate_bps) || loan.annual_rate_bps < 0 || loan.annual_rate_bps > 100000)
        throw new DomainError('INVALID_RATE');
    const p = money(loan.principal), carried = money(loan.remainder);
    if (carried >= DENOMINATOR)
        throw new DomainError('INVALID_INTEREST_REMAINDER');
    const numerator = p * BigInt(loan.annual_rate_bps) * BigInt(days) + carried;
    return { ...loan, accrued_on: paidOn, interest: bounded(money(loan.interest) + numerator / DENOMINATOR).toString(), remainder: (numerator % DENOMINATOR).toString() };
}
export function settlement(loan: LoanState): bigint {
    return bounded(money(loan.principal) + money(loan.interest) + (money(loan.remainder) > 0n ? 1n : 0n));
}
export interface PaymentSplit {
    state: LoanState;
    interest: string;
    principal: string;
    amount: string;
    paid: boolean;
}
export function splitPayment(loan: LoanState, amount: string, paidOn: string): PaymentSplit {
    const n = positive(amount);
    const next = accrue(loan, paidOn);
    if (n > settlement(next))
        throw new DomainError('OVERPAYMENT');
    let interestDue = money(next.interest);
    // Carry fractions through normal installments. At near/final settlement, charge
    // the remaining fraction as one franc rather than silently discarding debt.
    const roundFinal = n >= money(next.principal) + interestDue && money(next.remainder) > 0n;
    if (roundFinal) {
        interestDue += 1n;
        next.remainder = '0';
    }
    const interest = n < interestDue ? n : interestDue;
    const principal = n - interest;
    next.principal = (money(next.principal) - principal).toString();
    next.interest = (interestDue - interest).toString();
    return { state: next, interest: interest.toString(), principal: principal.toString(), amount, paid: settlement(next) === 0n };
}
export interface PlanRow extends Installment {
    interest: string;
    principal: string;
    remaining: string;
}
export function amortize(loan: LoanState, dates: readonly Installment[], extra = '0'): {
    rows: PlanRow[];
    state: LoanState;
    payoff: string | null;
    interest: string;
} {
    let state = { ...loan };
    let totalInterest = 0n;
    const rows: PlanRow[] = [];
    const add = money(extra);
    if (settlement(state) === 0n)
        return { rows, state, payoff: loan.accrued_on, interest: '0' };
    for (const item of dates) {
        const accrued = accrue(state, item.due_on);
        const offered = bounded(positive(item.amount) + add);
        const amount = offered < settlement(accrued) ? offered : settlement(accrued);
        const split = splitPayment(state, amount.toString(), item.due_on);
        state = split.state;
        totalInterest += money(split.interest);
        rows.push({ due_on: item.due_on, amount: amount.toString(), interest: split.interest, principal: split.principal, remaining: state.principal });
        if (split.paid)
            return { rows, state, payoff: item.due_on, interest: totalInterest.toString() };
    }
    return { rows, state, payoff: null, interest: totalInterest.toString() };
}
export function payoffComparison(loan: LoanState, dates: readonly Installment[], extra: string) {
    const base = amortize(loan, dates), accelerated = amortize(loan, dates, extra);
    const months = base.payoff && accelerated.payoff ? date(accelerated.payoff).until(date(base.payoff), { largestUnit: 'months' }).months : null;
    return { base, accelerated, months_saved: months, days_saved: base.payoff && accelerated.payoff ? daysBetween(accelerated.payoff, base.payoff) : null,
        interest_saved: base.payoff && accelerated.payoff ? (money(base.interest) - money(accelerated.interest)).toString() : null };
}
export interface PortfolioLoan {
    id: string;
    state: LoanState;
    payments: Installment[];
}
// Events use real dates; freed minimums and extra are rolled into the priority loan.
export function debtStrategy(loans: readonly PortfolioLoan[], extraPerEvent: string, strategy: 'snowball' | 'avalanche') {
    const extra = money(extraPerEvent);
    const states = new Map(loans.map(l => [l.id, { ...l.state }]));
    const events = [...new Set(loans.flatMap(l => l.payments.map(p => p.due_on)))].sort();
    let interest = 0n;
    let payoff: string | null = null;
    for (const day of events) {
        let pool = extra;
        for (const loan of loans) {
            const state = states.get(loan.id)!;
            const installment = loan.payments.find(p => p.due_on === day);
            if (!installment)
                continue;
            const minimum = positive(installment.amount);
            if (settlement(state) === 0n) {
                pool += minimum;
                continue;
            }
            const due = settlement(accrue(state, day));
            const paid = minimum < due ? minimum : due;
            const split = splitPayment(state, paid.toString(), day);
            states.set(loan.id, split.state);
            interest += money(split.interest);
            pool += minimum - paid;
        }
        while (pool > 0n) {
            const remaining = loans.filter(l => settlement(states.get(l.id)!) > 0n).sort((a, b) => {
                const x = states.get(a.id)!, y = states.get(b.id)!;
                if (strategy === 'avalanche' && x.annual_rate_bps !== y.annual_rate_bps)
                    return y.annual_rate_bps - x.annual_rate_bps;
                const xp = money(x.principal), yp = money(y.principal);
                return xp === yp ? a.id.localeCompare(b.id) : xp < yp ? -1 : 1;
            });
            const target = remaining[0];
            if (!target)
                break;
            const state = states.get(target.id)!;
            if (day < state.accrued_on)
                throw new DomainError('INCONSISTENT_PORTFOLIO_START');
            const due = settlement(accrue(state, day));
            const paid = pool < due ? pool : due;
            const split = splitPayment(state, paid.toString(), day);
            states.set(target.id, split.state);
            interest += money(split.interest);
            pool -= paid;
        }
        if ([...states.values()].every(s => settlement(s) === 0n)) {
            payoff = day;
            break;
        }
    }
    return { strategy, payoff, interest: interest.toString(), remaining: Object.fromEntries(states) };
}
