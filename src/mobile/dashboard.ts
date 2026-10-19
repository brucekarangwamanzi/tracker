import { homeSummary } from '../core/dashboard.js';
import { readRows, type SqliteConnection } from './local.js';
export async function localDashboard(db: SqliteConnection, user: string, now: string) {
    const [sessions, entries, budgets, loans, payments, settings] = await Promise.all(['study_session', 'entry', 'budget', 'loan', 'loan_payment', 'setting'].map(t => readRows(db, user, t as Parameters<typeof readRows>[2])));
    const prefs = settings!.find(s => s.key === 'preferences');
    const p = prefs ? JSON.parse(String(prefs.value_json)) as {
        timezone: string;
        minimum_minutes: number;
    } : { timezone: 'Africa/Kigali', minimum_minutes: 15 };
    return homeSummary({ now, timezone: p.timezone, minimum_minutes: p.minimum_minutes, sessions: sessions!, entries: entries!, budgets: budgets!, loans: loans!, payments: payments! });
}
