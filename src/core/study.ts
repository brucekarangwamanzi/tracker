import { date, localDate, Temporal } from './dates.js';
import { DomainError } from './money.js';
export interface Session {
    skill_id: string;
    started_at: string;
    minutes: number;
    deleted_at?: string | null;
}
// Split elapsed study at actual local midnights (including 23/25-hour DST days).
export function studyByDay(sessions: readonly Session[], zone: string): Map<string, number> {
    const result = new Map<string, number>();
    for (const s of sessions) {
        if (s.deleted_at)
            continue;
        if (!Number.isInteger(s.minutes) || s.minutes < 1 || s.minutes > 1440)
            throw new DomainError('INVALID_STUDY_DURATION');
        let cursor = Temporal.Instant.from(s.started_at);
        const end = cursor.add({ seconds: s.minutes * 60 });
        while (Temporal.Instant.compare(cursor, end) < 0) {
            const local = cursor.toZonedDateTimeISO(zone);
            const nextMidnight = local.toPlainDate().add({ days: 1 }).toZonedDateTime(zone).toInstant();
            const stop = Temporal.Instant.compare(nextMidnight, end) < 0 ? nextMidnight : end;
            const seconds = cursor.until(stop).total('seconds');
            const day = local.toPlainDate().toString();
            // Seconds are duration units, never money; accumulate seconds before flooring.
            result.set(day, (result.get(day) ?? 0) + seconds);
            cursor = stop;
        }
    }
    return new Map([...result].map(([day, seconds]) => [day, Math.floor(seconds / 60)]));
}
export function streak(sessions: readonly Session[], minimum: number, now: string, zone: string): number {
    if (!Number.isInteger(minimum) || minimum < 1)
        throw new DomainError('INVALID_STREAK_MINIMUM');
    const totals = studyByDay(sessions, zone);
    let day = date(localDate(now, zone));
    if ((totals.get(day.toString()) ?? 0) < minimum)
        day = day.subtract({ days: 1 });
    let count = 0;
    while ((totals.get(day.toString()) ?? 0) >= minimum) {
        count++;
        day = day.subtract({ days: 1 });
    }
    return count;
}
