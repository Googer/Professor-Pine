/*
 * The words of a member's own stats (plan 8H-6, design Part E), for `/stats me` on Discord and
 * "Your Pine" on the web alike; apart from the stats themselves so that the web page, whose type
 * check has no Temporal, can import them.
 */

/** What each number of a member's card is. */
export const MEMBER_STAT_LABELS = {
  raids: 'Raids and max battles reported that others completed',
  trains: 'Trains conducted that others came to',
  meetups: 'Meetups hosted that others came to',
  reports: 'Reports at stops that counted',
  completed: 'Raids and max battles completed',
  trainsCame: 'Trains ridden',
  meetupsCame: 'Meetups attended',
  region: 'Busiest region',
  bosses: 'Bosses done most',
  sent: 'Raids, max battles, trains and reports sent to',
} as const;

const n = (count: number): string => count.toLocaleString('en-US');

/** After a count of the member's own card: how many were anonymous, on no board; none for 0. */
export function anonymousNote(count: number): string {
  return count > 0 ? ` (${n(count)} anonymous, on no board)` : '';
}

/** After the count of reports: their confirmations; none for 0. */
export function confirmationsNote(count: number): string {
  return count === 0 ? '' : ` (${n(count)} ${count === 1 ? 'confirmation' : 'confirmations'})`;
}

/** The bosses done most: "Mewtwo (5), Dialga (3)". */
export function bossesWords(bosses: readonly { name: string; count: number }[]): string {
  return bosses.map((boss) => `${boss.name} (${n(boss.count)})`).join(', ');
}

/** How many members: "37 members", "1 member". */
export function membersWords(count: number): string {
  return `${n(count)} ${count === 1 ? 'member' : 'members'}`;
}
