import { localDate } from '../../../src/core/dates';

let zone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Africa/Kigali';
export const timeZone = () => zone;
export function setTimeZone(value: string) {
  localDate(new Date().toISOString(), value); // Reject invalid IANA zones.
  zone = value;
}
