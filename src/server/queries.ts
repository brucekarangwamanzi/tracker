import { localDate, weekBounds, inRange, Temporal } from '../core/dates.js';
import { streak, studyByDay, type Session } from '../core/study.js';
import { cashflow, walletBalance } from '../core/money.js';
import { accrue, settlement, type Installment } from '../core/loans.js';
import { weeklyReview, netWorth, skillRoi, type PrincipalPayment } from '../core/reports.js';
import { entry, loanState } from './finance.js';
import { row, type Database, type Store } from './store.js';
import { preferencesSchema, type Preferences } from './validation.js';
import { randomUUID } from 'node:crypto';
import { homeSummary, nextPayments } from '../core/dashboard.js';
export function session(r: Record<string, unknown>): Session { return { skill_id: String(r.skill_id), started_at: String(r.started_at), minutes: Number(r.minutes), deleted_at: r.deleted_at as string | null }; }
export async function preferences(store: Store): Promise<Preferences> {
    const p = (await store.list('setting')).find(s => s.key === 'preferences');
    return p ? preferencesSchema.parse(JSON.parse(String(p.value_json))) : { timezone: 'Africa/Kigali', minimum_minutes: 15, push_enabled: false };
}
export async function upcoming(store: Store) { const [loans, payments] = await Promise.all([store.list('loan'), store.list('loan_payment')]); return nextPayments(loans, payments); }
export async function dashboard(db: Database, user: string, now: string) {
    return db.transaction(user, async (store) => {
        const pref = await preferences(store);
        const [sessions, entries, budgets, loans, payments] = await Promise.all([store.list('study_session'), store.list('entry'), store.list('budget'), store.list('loan'), store.list('loan_payment')]);
        return homeSummary({ now, timezone: pref.timezone, minimum_minutes: pref.minimum_minutes, sessions, entries, budgets, loans, payments });
    });
}
export async function review(db: Database, user: string, day: string) {
    return db.transaction(user, async (store) => {
        const pref = await preferences(store);
        const [entries, sessions, payments] = await Promise.all([store.list('entry'), store.list('study_session'), store.list('loan_payment')]);
        return weeklyReview(day, pref.timezone, entries.map(entry), sessions.map(session), payments.map(p => ({ paid_on: String(p.paid_on), principal: String(p.principal) } satisfies PrincipalPayment)));
    });
}
export async function snapshot(store: Store, now: string) {
    const pref = await preferences(store), day = localDate(now, pref.timezone);
    const [wallets, entries, loans, old] = await Promise.all([store.list('wallet'), store.list('entry'), store.list('loan'), store.list('snapshot')]);
    const assets = wallets.map(w => walletBalance(entries.map(entry), w.id).toString());
    const liabilities = loans.map(l => settlement(accrue(loanState(l), day)).toString());
    const value = { day, assets: assets.reduce((n, x) => n + BigInt(x), 0n).toString(), liabilities: liabilities.reduce((n, x) => n + BigInt(x), 0n).toString(), net: netWorth(assets, liabilities) };
    const existing = old.find(s => s.day === day);
    return store.put('snapshot', existing ? { ...existing, ...value } : row(store.user, randomUUID(), value));
}
export async function roi(db: Database, user: string, skill: string) {
    return db.transaction(user, async (store) => {
        const [entries, sessions] = await Promise.all([store.list('entry'), store.list('study_session')]);
        return skillRoi(skill, entries.map(entry), sessions.map(session));
    });
}
