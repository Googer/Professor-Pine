import { isMeetup, isTrain, type Party } from './party.js';

/** The open trains and meetups one member may have in a server (plan 8Z); staff are exempt. */
export const MAX_OPEN_PARTIES = 5;

/**
 * How many of `parties` (the active ones) count against a member's cap in a server (by its row):
 * the trains and meetups they made. A train a split made is the presser's (`createdById`), a
 * train still being split off counts, and so does one past its end until it is archived.
 */
export function openPartiesOf(parties: Iterable<Party>, guildId: number, memberId: string): number {
  let open = 0;
  for (const party of parties) {
    if (
      (isTrain(party) || isMeetup(party)) &&
      party.guildId === guildId &&
      party.createdById === memberId
    ) {
      open += 1;
    }
  }
  return open;
}

/**
 * Whether a member may make one more train or meetup: `open` parties of theirs
 * (`openPartiesOf`) and `pending` meetups waiting for a moderator leave room; staff always.
 */
export function mayOpenParty(open: number, pending: number, staff: boolean): boolean {
  return staff || open + pending < MAX_OPEN_PARTIES;
}
