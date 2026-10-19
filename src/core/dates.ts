import { Temporal } from '@js-temporal/polyfill';
import { DomainError } from './money.js';
export { Temporal };
export function date(value: string): Temporal.PlainDate {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value))
        throw new DomainError('INVALID_DATE');
    try {
        return Temporal.PlainDate.from(value, { overflow: 'reject' });
    }
    catch {
        throw new DomainError('INVALID_DATE');
    }
}
export function localDate(instant: string, zone: string): string {
    return Temporal.Instant.from(instant).toZonedDateTimeISO(zone).toPlainDate().toString();
}
export function daysBetween(a: string, b: string): number {
    return date(a).until(date(b), { largestUnit: 'days' }).days;
}
export function weekBounds(day: string): {
    start: string;
    end: string;
    previous: string;
} {
    const d = date(day);
    const start = d.subtract({ days: d.dayOfWeek - 1 });
    return { start: start.toString(), end: start.add({ days: 7 }).toString(), previous: start.subtract({ days: 7 }).toString() };
}
export function inRange(day: string, start: string, endExclusive: string): boolean {
    return day >= start && day < endExclusive;
}
export function quietUntil(now: string, zone: string, start: string, end: string): string | null {
    const t = Temporal.Instant.from(now).toZonedDateTimeISO(zone);
    const a = Temporal.PlainTime.from(start), b = Temporal.PlainTime.from(end);
    if (Temporal.PlainTime.compare(a, b) === 0)
        return null; // Equal means quiet hours disabled.
    const cur = t.toPlainTime();
    const wraps = Temporal.PlainTime.compare(a, b) > 0;
    const afterStart = Temporal.PlainTime.compare(cur, a) >= 0;
    const beforeEnd = Temporal.PlainTime.compare(cur, b) < 0;
    if (!(wraps ? afterStart || beforeEnd : afterStart && beforeEnd))
        return null;
    const endDay = wraps && afterStart ? t.toPlainDate().add({ days: 1 }) : t.toPlainDate();
    return endDay.toZonedDateTime({ timeZone: zone, plainTime: b }).toInstant().toString();
}
