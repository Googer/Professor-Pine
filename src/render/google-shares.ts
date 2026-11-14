import { timestamp } from './text.js';

/** A number as a sentence writes it: `4,500`. */
function amount(n: number): string {
  return n.toLocaleString('en-US');
}

/**
 * What a server's staff are told when the server used its share of Google's month (plan 19B-5,
 * `ServerNotices`, once per server and month): nothing of another server, no member.
 */
export function shareUsedNotice(
  kind: 'places' | 'geocode',
  share: number,
  nextReset: number,
): string {
  const what =
    kind === 'places'
      ? `its share of this month’s places searches (${amount(share)})`
      : `its share of this month’s addresses (${amount(share)})`;
  return (
    `This server has used ${what} at Google. I share Google’s monthly budget between the ` +
    'servers I am in, by how much each has waiting.\n\n' +
    'Its gyms, PokéStops and Power Spots that still wait for Google stay in line. I ask ' +
    `about them when the month starts again, ${timestamp(nextReset, 'f')}, or sooner if the ` +
    'shares give this server more.\n\n' +
    '`/gym google` shows the line and this server’s share. An operator of this Pine can ' +
    'raise the share.'
  );
}

/**
 * What the owner is told when the line used the month's budget (plan 19B-5: the instance's alert,
 * once a month): every server's part of the line waits for the month to start again.
 */
export function budgetUsedAlert(places: number, reserve: number, nextReset: number): string {
  return (
    '**Google’s budget for this month is used up.** The line of gyms, PokéStops and Power ' +
    `Spots waiting for Google has used its ${amount(Math.max(0, places - reserve))} of the ` +
    `${amount(places)} places searches; only the reserve of ${amount(reserve)} is left, for ` +
    'lookups by hand.\n\n' +
    `Every server’s part of the line waits until ${timestamp(nextReset, 'f')}. The setting ` +
    '`googleLookupsPerMonth` sets the budget.'
  );
}
