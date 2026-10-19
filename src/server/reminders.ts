import { randomUUID } from 'node:crypto';
import cron from 'node-cron';
import { reminderOccurrence, retryAt, type ReminderSpec } from '../core/reminders.js';
import { quietUntil, Temporal } from '../core/dates.js';
import { row, type Database } from './store.js';
import { preferences, snapshot, upcoming } from './queries.js';
export interface PushMessage {
    to: string;
    title: string;
    body: string;
    data: {
        reminder_id: string;
        occurrence: string;
    };
}
export interface PushResult {
    status: 'ok' | 'error';
    id?: string;
    details?: {
        error?: string;
    };
}
export interface PushGateway {
    send(message: PushMessage): Promise<PushResult>;
    receipt(id: string): Promise<PushResult | null>;
}
export class ExpoGateway implements PushGateway {
    constructor(private token?: string) { }
    private async request(path: string, data: unknown): Promise<unknown> {
        const response = await fetch(`https://exp.host/--/api/v2/push/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}) }, body: JSON.stringify(data), signal: AbortSignal.timeout(15000) });
        if (!response.ok)
            throw new Error(`EXPO_HTTP_${response.status}`);
        return response.json();
    }
    async send(message: PushMessage) { const response = await this.request('send', message) as {
        data: PushResult;
    }; return response.data; }
    async receipt(id: string) { const response = await this.request('getReceipts', { ids: [id] }) as {
        data: Record<string, PushResult>;
    }; return response.data[id] ?? null; }
}
export async function enqueueReminders(db: Database, user: string, now: string) {
    return db.transaction(user, async (store) => {
        const pref = await preferences(store);
        if (!pref.push_enabled)
            return;
        const [reminders, devices, logs, next] = await Promise.all([store.list('reminder'), store.list('device'), store.list('reminder_log', true), upcoming(store)]);
        for (const r of reminders) {
            const spec = { ...r, due_on: r.kind === 'loan' ? next.find(n => n.loan_id === r.target_id)?.due_on ?? null : r.due_on } as unknown as ReminderSpec;
            const occurrence = reminderOccurrence(spec, now);
            if (!occurrence)
                continue;
            for (const device of devices.filter(d => d.enabled)) {
                if (logs.some(l => l.reminder_id === r.id && l.occurrence === occurrence.key && l.device_id === device.id))
                    continue;
                const message: PushMessage = { to: String(device.token), title: "Bruce's Life", body: r.kind === 'study' ? 'Time for a little learning.' : 'You have a payment reminder.', data: { reminder_id: r.id, occurrence: occurrence.key } };
                await store.put('reminder_log', row(user, randomUUID(), { reminder_id: r.id, occurrence: occurrence.key, status: 'pending', attempts: 0, next_attempt_at: occurrence.send_at, lease_until: null, ticket_id: null, expires_at: occurrence.expires_at, device_id: device.id, message_json: JSON.stringify(message) }));
            }
        }
    });
}
export async function deliverReminders(db: Database, user: string, gateway: PushGateway, now: string) {
    const claims = await db.transaction(user, async (store) => {
        const logs = await store.list('reminder_log');
        const claimed: typeof logs = [];
        for (const log of logs) {
            if (['delivered', 'failed', 'expired'].includes(String(log.status)))
                continue;
            if (Date.parse(String(log.expires_at)) <= Date.parse(now)) {
                await store.put('reminder_log', { ...log, status: 'expired', lease_until: null });
                continue;
            }
            if (Number(log.attempts) >= 6) {
                await store.put('reminder_log', { ...log, status: 'failed', lease_until: null });
                continue;
            }
            if (Date.parse(String(log.next_attempt_at)) > Date.parse(now) || (log.lease_until && Date.parse(String(log.lease_until)) > Date.parse(now)))
                continue;
            const reminder = await store.get('reminder', String(log.reminder_id));
            const device = await store.get('device', String(log.device_id));
            const pref = await preferences(store);
            if (!pref.push_enabled || !reminder || reminder.deleted_at || !reminder.enabled || !device || device.deleted_at || !device.enabled) {
                await store.put('reminder_log', { ...log, status: 'expired', lease_until: null });
                continue;
            }
            if(reminder.kind==='loan'||reminder.kind==='bill'){
                const currentDue=reminder.kind==='loan'?(await upcoming(store)).find(n=>n.loan_id===reminder.target_id)?.due_on:reminder.due_on;
                if(!currentDue||String(log.occurrence).split(':')[1]!==currentDue){
                    await store.put('reminder_log',{...log,status:'expired',lease_until:null});continue;
                }
            }
            const deferred = quietUntil(now, String(reminder.zone), String(reminder.quiet_start), String(reminder.quiet_end));
            if (deferred) {
                await store.put('reminder_log', { ...log, next_attempt_at: deferred, lease_until: null });
                continue;
            }
            const lease = Temporal.Instant.from(now).add({ minutes: 2 }).toString();
            claimed.push(await store.put('reminder_log', { ...log, status: log.ticket_id ? 'receipting' : 'sending', lease_until: lease, attempts: Number(log.attempts) + 1 }));
            if (claimed.length >= 25)
                break;
        }
        return claimed;
    });
    for (const claim of claims) {
        try {
            const result = claim.ticket_id ? await gateway.receipt(String(claim.ticket_id)) : await gateway.send(JSON.parse(String(claim.message_json)) as PushMessage);
            await db.transaction(user, async (store) => {
                const current = await store.get('reminder_log', claim.id);
                if (!current || current.version !== claim.version)
                    return;
                const code = result?.details?.error;
                if (code === 'DeviceNotRegistered') {
                    const device = await store.get('device', String(current.device_id));
                    if (device)
                        await store.put('device', { ...device, enabled: false });
                }
                const permanent = !!code && ['DeviceNotRegistered', 'MessageTooBig', 'InvalidCredentials', 'MismatchSenderId'].includes(code);
                const delivered = !!claim.ticket_id && result?.status === 'ok';
                const ticket = result?.status==='error'?null:!claim.ticket_id && result?.status === 'ok' ? result.id ?? null : claim.ticket_id ?? null;
                await store.put('reminder_log', { ...current, status: delivered ? 'delivered' : permanent ? 'failed' : ticket ? 'ticketed' : 'pending', ticket_id: ticket,
                    lease_until: null, next_attempt_at: Temporal.Instant.from(now).add({ seconds: ticket ? 900 : Math.min(3600, 30 * 2 ** Number(current.attempts)) }).toString() });
            });
        }
        catch {
            await db.transaction(user, async (store) => { const current = await store.get('reminder_log', claim.id); if (current && current.version === claim.version)
                await store.put('reminder_log', { ...current, status: 'pending', lease_until: null, next_attempt_at: retryAt(now, Number(current.attempts)) }); });
        }
    }
}
export function startJobs(db: Database, user: string, gateway: PushGateway, onError: (error: unknown) => void) {
    const task = cron.schedule('* * * * *', async () => {
        const now = new Date().toISOString();
        try {
            await enqueueReminders(db, user, now);
            await deliverReminders(db, user, gateway, now);
            await db.transaction(user, async (store) => { const p = await preferences(store); const local = Temporal.Instant.from(now).toZonedDateTimeISO(p.timezone); if (local.hour === 23 && local.minute >= 55)
                await snapshot(store, now); });
        }
        catch (error) {
            onError(error);
        }
    }, { timezone: 'UTC', noOverlap: true });
    return task;
}
