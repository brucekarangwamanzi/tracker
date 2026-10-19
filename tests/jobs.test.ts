import { describe, it, expect } from 'vitest';
import { enqueueReminders, deliverReminders, type PushGateway } from '../src/server/reminders.js';
import { snapshot, dashboard, review } from '../src/server/queries.js';
import { MemoryDb, id, seed, row } from './helpers.js';
describe('jobs, dashboard and snapshots', () => {
    it('deduplicates reminder occurrences and polls push receipts', async () => {
        const db = new MemoryDb(), user = id();
        await seed(db, user);
        await db.transaction(user, async (st) => {
            await st.put('setting', row(user, id(), { key: 'preferences', value_json: JSON.stringify({ timezone: 'Africa/Kigali', minimum_minutes: 15, push_enabled: true }) }));
            await st.put('device', row(user, id(), { token: 'ExpoPushToken[test]', enabled: true }));
            await st.put('reminder', row(user, id(), { kind: 'study', target_id: null, due_on: null, time_local: '09:00', zone: 'Africa/Kigali', quiet_start: '22:00', quiet_end: '07:00', enabled: true }));
        });
        const now = '2026-10-18T10:00:00Z';
        await Promise.all([enqueueReminders(db, user, now), enqueueReminders(db, user, now)]);
        let sent = 0;
        const gateway: PushGateway = { send: async () => { sent++; return { status: 'ok', id: 'ticket' }; }, receipt: async () => ({ status: 'ok' }) };
        await Promise.all([deliverReminders(db, user, gateway, now), deliverReminders(db, user, gateway, now)]);
        expect(sent).toBe(1);
        await deliverReminders(db, user, gateway, '2026-10-18T10:16:00Z');
        await db.transaction(user, async (st) => { const logs = await st.list('reminder_log'); expect(logs).toHaveLength(1); expect(logs[0]!.status).toBe('delivered'); });
    });
    it('keeps failed pushes retryable and disables unregistered devices', async () => {
        const db = new MemoryDb(), user = id();
        await seed(db, user);
        await db.transaction(user, async (st) => {
            await st.put('setting', row(user, id(), { key: 'preferences', value_json: JSON.stringify({ timezone: 'UTC', minimum_minutes: 15, push_enabled: true }) }));
            const device = id();
            await st.put('device', row(user, device, { token: 'ExpoPushToken[test]', enabled: true }));
            await st.put('reminder', row(user, id(), { kind: 'study', target_id: null, due_on: null, time_local: '09:00', zone: 'UTC', quiet_start: '22:00', quiet_end: '07:00', enabled: true }));
        });
        const now = '2026-10-18T10:00:00Z';
        await enqueueReminders(db, user, now);
        await deliverReminders(db, user, { send: async () => { throw new Error('network'); }, receipt: async () => null }, now);
        await db.transaction(user, async (st) => expect((await st.list('reminder_log'))[0]!.status).toBe('pending'));
        await deliverReminders(db, user, { send: async () => ({ status: 'error', details: { error: 'DeviceNotRegistered' } }), receipt: async () => null }, '2026-10-18T11:00:00Z');
        await db.transaction(user, async (st) => expect((await st.list('device'))[0]!.enabled).toBe(false));
    });
    it('returns an offline-reproducible dashboard and upserts a daily net worth snapshot', async () => {
        const db = new MemoryDb(), user = id(), s = await seed(db, user);
        await db.transaction(user, async (st) => {
            await st.put('entry', row(user, id(), { wallet_id: s.wallet, category_id: null, kind: 'income', amount: '9007199254740993', occurred_on: '2026-10-18', transfer_id: null, payment_id: null, skill_id: null, note: '' }));
            await snapshot(st, '2026-10-18T12:00:00Z');
            await snapshot(st, '2026-10-18T12:00:00Z');
            expect((await st.list('snapshot'))[0]!.net).toBe('9007199254740993');
            expect(await st.list('snapshot')).toHaveLength(1);
        });
        expect((await dashboard(db, user, '2026-10-18T12:00:00Z')).today_study_minutes).toBe(0);
        expect((await review(db, user, '2026-10-18')).current.income).toBe('9007199254740993');
    });
});
