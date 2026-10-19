import { describe, it, expect } from 'vitest';
import { money, MAX_MONEY, formatRwf, walletBalance, cashflow, budgetLevels, type MoneyEntry } from '../src/core/money.js';
import { schedule, splitPayment, accrue, amortize, payoffComparison, debtStrategy, remainingSchedule, type LoanState } from '../src/core/loans.js';
import { localDate, quietUntil, weekBounds } from '../src/core/dates.js';
import { studyByDay, streak, type Session } from '../src/core/study.js';
import { weeklyReview, netWorth, skillRoi } from '../src/core/reports.js';
import { reminderOccurrence, retryAt, type ReminderSpec } from '../src/core/reminders.js';
const loan = (p = '1000', rate = 0): LoanState => ({ principal: p, interest: '0', remainder: '0', annual_rate_bps: rate, accrued_on: '2026-01-01' });
const e = (kind: MoneyEntry['kind'], amount: string, overrides: Partial<MoneyEntry> = {}): MoneyEntry => ({ kind, amount, wallet_id: 'cash', occurred_on: '2026-10-13', ...overrides });
describe('integer money and wallet ledger', () => {
    it.each(['1.00', '-1', '1e6', '1,000', '01', '', ' 1', '9223372036854775808'])('rejects %s', s => expect(() => money(s)).toThrow());
    it('preserves the full BIGINT range and formats millions', () => { expect(money(MAX_MONEY.toString())).toBe(MAX_MONEY); expect(formatRwf(125000000n)).toBe('RWF 125,000,000'); });
    it('derives balances, excludes transfers in reports and ignores tombstones', () => {
        const entries = [e('income', '100'), e('expense', '30'), e('transfer_out', '20'), e('transfer_in', '10'), e('expense', '99', { deleted_at: '2026-10-14' })];
        expect(walletBalance(entries, 'cash')).toBe(60n);
        expect(cashflow(entries)).toEqual({ income: 100n, expense: 30n });
    });
    it('does not silently overflow stored balances', () => expect(() => walletBalance([e('income', MAX_MONEY.toString()), e('income', '1')], 'cash')).toThrow());
    it('budget thresholds are exact and do not spam', () => {
        expect(budgetLevels(79n, 100n, [])).toEqual([]);
        expect(budgetLevels(80n, 100n, [])).toEqual([80]);
        expect(budgetLevels(110n, 100n, [])).toEqual([80, 100]);
        expect(budgetLevels(110n, 100n, [80, 100])).toEqual([]);
        expect(() => budgetLevels(1n, 0n, [])).toThrow();
    });
});
describe('loan schedules and payment allocation', () => {
    it('clamps monthly due days without drifting after February', () => expect(schedule({ kind: 'monthly', first: '2028-01-31', day: 31, payment: '100', count: 3 }).map(x => x.due_on)).toEqual(['2028-01-31', '2028-02-29', '2028-03-31']));
    it('supports weekly, custom and rejects duplicate custom dates', () => {
        expect(schedule({ kind: 'weekly', first: '2026-12-28', count: 2, payment: '10' })[1]!.due_on).toBe('2027-01-04');
        expect(schedule({ kind: 'custom', dates: [{ due_on: '2026-02-01', amount: '1' }, { due_on: '2026-01-01', amount: '2' }] })[0]!.amount).toBe('2');
        expect(() => schedule({ kind: 'custom', dates: [{ due_on: '2026-01-01', amount: '1' }, { due_on: '2026-01-01', amount: '2' }] })).toThrow();
    });
    it('amortizes informal zero-interest loans and caps the final payment', () => {
        const result = amortize(loan('100'), schedule({ kind: 'weekly', first: '2026-01-08', payment: '30', count: 5 }));
        expect(result.rows.map(x => x.amount)).toEqual(['30', '30', '30', '10']);
        expect(result.interest).toBe('0');
        expect(result.state.principal).toBe('0');
    });
    it('accrues ACT/365 interest using real days, not floats', () => {
        expect(accrue(loan('365000', 1000), '2026-01-11').interest).toBe('1000');
        expect(splitPayment(loan('365000', 1000), '100', '2026-01-11')).toMatchObject({ interest: '100', principal: '0', paid: false });
    });
    it('distinguishes early and late payments', () => {
        expect(BigInt(splitPayment(loan('365000', 1000), '10000', '2026-01-11').interest)).toBeLessThan(BigInt(splitPayment(loan('365000', 1000), '10000', '2026-02-11').interest));
    });
    it('preserves sub-franc interest and settles it in the last payment', () => {
        const first = splitPayment(loan('100', 1), '50', '2026-01-02');
        expect(first.state.remainder).not.toBe('0');
        expect(splitPayment(first.state, '51', '2026-01-02')).toMatchObject({ interest: '1', principal: '50', paid: true });
    });
    it('rejects overpayment, zero and backdated payments', () => {
        expect(() => splitPayment(loan(), '1001', '2026-01-01')).toThrow('OVERPAYMENT');
        expect(() => splitPayment(loan(), '0', '2026-01-01')).toThrow();
        expect(() => splitPayment(loan(), '1', '2025-12-31')).toThrow('BACKDATED');
    });
    it('keeps incomplete/non-amortizing schedules explicit', () => expect(amortize(loan('1000', 10000), [{ due_on: '2027-01-01', amount: '1' }]).payoff).toBeNull());
    it('compares extra payments only when both plans finish', () => {
        const dates = schedule({ kind: 'monthly', first: '2026-02-01', payment: '100', count: 30, day: 1 });
        const result = payoffComparison(loan('1000', 1200), dates, '100');
        expect(result.months_saved).toBeGreaterThan(0);
        expect(BigInt(result.interest_saved!)).toBeGreaterThan(0n);
        expect(payoffComparison(loan('1000'), dates.slice(0, 1), '1').interest_saved).toBeNull();
    });
    it('removes prior payments and moves arrears to forecast start', () => expect(remainingSchedule([{ due_on: '2026-01-01', amount: '100' }, { due_on: '2026-02-01', amount: '100' }], '50', '2026-01-15')).toEqual([{ due_on: '2026-01-15', amount: '50' }, { due_on: '2026-02-01', amount: '100' }]));
    it('compares snowball and avalanche without mutating the loans', () => {
        const dates = schedule({ kind: 'monthly', first: '2026-02-01', payment: '100', count: 40, day: 1 });
        const loans = [{ id: 'small', state: loan('200', 0), payments: dates }, { id: 'costly', state: loan('1000', 2400), payments: dates }];
        const original = structuredClone(loans);
        const a = debtStrategy(loans, '100', 'avalanche'), s = debtStrategy(loans, '100', 'snowball');
        expect(a.payoff).not.toBeNull();
        expect(BigInt(a.interest)).toBeLessThanOrEqual(BigInt(s.interest));
        expect(loans).toEqual(original);
    });
});
describe('study dates and streaks', () => {
    const s = (started_at: string, minutes = 15): Session => ({ skill_id: 'ts', started_at, minutes });
    it('keeps yesterday’s streak alive until today ends', () => { const ss = [s('2026-10-17T12:00:00Z'), s('2026-10-16T12:00:00Z')]; expect(streak(ss, 15, '2026-10-18T21:59:59Z', 'Africa/Kigali')).toBe(2); expect(streak(ss, 15, '2026-10-18T22:00:00Z', 'Africa/Kigali')).toBe(0); });
    it('crosses month and year boundaries', () => expect(streak([s('2026-12-31T12:00:00Z'), s('2027-01-01T12:00:00Z')], 15, '2027-01-02T10:00:00Z', 'UTC')).toBe(2));
    it('splits study across local midnight and respects the minimum', () => { const totals = studyByDay([s('2026-10-17T21:50:00Z', 30)], 'Africa/Kigali'); expect(totals.get('2026-10-17')).toBe(10); expect(totals.get('2026-10-18')).toBe(20); });
    it('handles DST fall-back, spring-forward and deleted sessions', () => {
        expect(studyByDay([s('2026-11-01T05:30:00Z', 120)], 'America/New_York').get('2026-11-01')).toBe(120);
        expect(studyByDay([s('2026-03-08T06:30:00Z', 120)], 'America/New_York').get('2026-03-08')).toBe(120);
        expect(streak([{ ...s('2026-10-18T12:00:00Z'), deleted_at: 'x' }], 15, '2026-10-18T20:00:00Z', 'UTC')).toBe(0);
    });
    it('uses the requested zone and rejects nonexistent dates', () => { expect(localDate('2027-01-01T00:30:00Z', 'America/Los_Angeles')).toBe('2026-12-31'); expect(() => schedule({ kind: 'weekly', first: '2026-02-30', payment: '1', count: 1 })).toThrow(); });
});
describe('weekly review, net worth and ROI', () => {
    it('compares adjacent Monday-based weeks, excluding transfers', () => {
        const entries = [e('expense', '100', { occurred_on: '2026-10-05' }), e('expense', '121'), e('transfer_out', '999')];
        const result = weeklyReview('2026-10-18', 'UTC', entries, [], [{ paid_on: '2026-10-12', principal: '40' }]);
        expect(result.current.expense).toBe('121');
        expect(result.principal_paid).toBe('40');
        expect(result.insights[0]).toContain('20%');
        expect(weekBounds('2027-01-01').start).toBe('2026-12-28');
    });
    it('handles no prior spending and the exact 20% boundary', () => {
        expect(weeklyReview('2026-10-18', 'UTC', [e('expense', '120'), e('expense', '100', { occurred_on: '2026-10-05' })], [], []).insights).toEqual([]);
        expect(weeklyReview('2026-10-18', 'UTC', [e('expense', '1')], [], []).insights[0]).toContain('last week had none');
    });
    it('allows negative net worth and leaves ROI undefined for free skills', () => {
        expect(netWorth(['100'], ['200'])).toBe('-100');
        expect(skillRoi('ts', [], []).roi_basis_points).toBeNull();
        expect(skillRoi('ts', [e('income', '150', { skill_id: 'ts' }), e('expense', '100', { skill_id: 'ts' })], [])).toMatchObject({ cost: '100', attributed_income: '150', roi_basis_points: '5000' });
    });
});
describe('reminder scheduling and quiet hours', () => {
    const r: ReminderSpec = { id: 'r', kind: 'loan', due_on: '2026-10-21', time_local: '09:00', zone: 'Africa/Kigali', quiet_start: '22:00', quiet_end: '07:00', enabled: true };
    it('creates reminders 3 days, 1 day and day-of only', () => { expect(reminderOccurrence(r, '2026-10-18T08:00:00Z')).not.toBeNull(); expect(reminderOccurrence(r, '2026-10-19T08:00:00Z')).toBeNull(); expect(reminderOccurrence(r, '2026-10-20T08:00:00Z')).not.toBeNull(); expect(reminderOccurrence(r, '2026-10-21T08:00:00Z')).not.toBeNull(); });
    it('waits until scheduled local time and honors disabled reminders', () => { expect(reminderOccurrence(r, '2026-10-18T06:59:59Z')).toBeNull(); expect(reminderOccurrence({ ...r, enabled: false }, '2026-10-18T08:00:00Z')).toBeNull(); });
    it('handles wrapped and daytime quiet periods including DST', () => {
        expect(quietUntil('2026-10-18T21:00:00Z', 'Africa/Kigali', '22:00', '07:00')).toBe('2026-10-19T05:00:00Z');
        expect(quietUntil('2026-10-18T11:00:00Z', 'UTC', '10:00', '12:00')).toBe('2026-10-18T12:00:00Z');
        expect(quietUntil('2026-10-18T11:00:00Z', 'UTC', '10:00', '10:00')).toBeNull();
    });
    it('backs off retries with a cap', () => expect(Date.parse(retryAt('2026-01-01T00:00:00Z', 20, 0)) - Date.parse('2026-01-01T00:00:00Z')).toBe(3600000));
    it('defers late study reminders until quiet hours end the next morning',()=>{
        const result=reminderOccurrence({...r,kind:'study',due_on:null,time_local:'23:00'},'2026-10-18T21:00:00Z');
        expect(result!.send_at).toBe('2026-10-19T05:00:00Z');
        expect(Date.parse(result!.expires_at)).toBeGreaterThan(Date.parse(result!.send_at));
    });
});
