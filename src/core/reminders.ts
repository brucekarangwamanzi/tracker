import { daysBetween, localDate, quietUntil, Temporal } from './dates.js';
export interface ReminderSpec {
    id: string;
    kind: 'loan' | 'bill' | 'study';
    due_on: string | null;
    time_local: string;
    zone: string;
    quiet_start: string;
    quiet_end: string;
    enabled: boolean;
}
export interface Occurrence {
    key: string;
    send_at: string;
    expires_at: string;
}
export function reminderOccurrence(r: ReminderSpec, now: string): Occurrence | null {
    if (!r.enabled)
        return null;
    const day = localDate(now, r.zone), local = Temporal.Instant.from(now).toZonedDateTimeISO(r.zone);
    const due = r.due_on;
    if (r.kind !== 'study' && (!due || ![3, 1, 0].includes(daysBetween(day, due))))
        return null;
    const target = local.toPlainDate().toZonedDateTime({ timeZone: r.zone, plainTime: r.time_local }).toInstant();
    // Catch up on job restarts later the same day, but never before today's time.
    if (Temporal.Instant.compare(Temporal.Instant.from(now), target) < 0)
        return null;
    const expires = target.add({ hours: 24 }).toString();
    const deferred = quietUntil(now, r.zone, r.quiet_start, r.quiet_end) ?? now;
    // Quiet hours may defer into tomorrow, but never beyond the 24-hour lifetime.
    if (Temporal.Instant.compare(Temporal.Instant.from(deferred), Temporal.Instant.from(expires)) >= 0)
        return null;
    return { key: `${r.kind}:${due ?? day}:${day}`, send_at: deferred, expires_at: expires };
}
export function retryAt(now: string, attempt: number, random = 0.5): string {
    const seconds = Math.min(3600, 30 * 2 ** Math.min(attempt, 10)) + Math.floor(15 * random);
    return Temporal.Instant.from(now).add({ seconds }).toString();
}
