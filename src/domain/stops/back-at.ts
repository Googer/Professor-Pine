/*
 * Imports nothing: the map's page takes it (plan 8M-9B, B5), so that the post of the stops and the
 * map say the day's research waiting under an event's window in the same words.
 */

/**
 * When the day's research comes back after an intra-day event's window (plan 8R-6): `Back at
 * <time>`, and `, after <event>` where the event is named. The time and the event's name are the
 * caller's, written as its medium writes them (the post a Discord timestamp and `plain`, the map
 * its clock's words, as text).
 */
export function backAtWords(time: string, event?: string): string {
  return `Back at ${time}${event === undefined ? '' : `, after ${event}`}`;
}
