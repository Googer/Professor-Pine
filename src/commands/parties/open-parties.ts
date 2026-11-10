import type { AppContext } from '../../app-context.js';
import { MAX_OPEN_PARTIES, mayOpenParty, openPartiesOf } from '../../domain/party/open-parties.js';
import type { MeetupSafety } from '../../services/meetup-safety.js';
import type { PartyProvider } from '../../services/party-store.js';

/** What a member is told who has as many open trains and meetups as one member may (plan 8Z). */
export const OPEN_PARTIES_FULL =
  `You have ${MAX_OPEN_PARTIES} open trains and meetups on this server, the most one member may ` +
  'have; meetups waiting for a moderator count too. Try again once one of them is over.';

/** What asking takes: the active parties, the server's row, and who waits for a moderator. */
export interface OpenPartiesReading {
  parties: Pick<PartyProvider, 'active'>;
  guilds: AppContext['guilds'];
  meetupSafety: Pick<MeetupSafety, 'pendingCount'>;
}

/**
 * Whether a member has no room for one more train or meetup in a server (a snowflake), the one
 * question of every path that makes one: `/train`, `/meetup` and its form, a split, and the map's
 * of each. Nothing is read for staff. An approval never asks: a moderator decided.
 */
export async function openPartiesFull(
  reading: OpenPartiesReading,
  serverId: string,
  memberId: string,
  staff: boolean,
): Promise<boolean> {
  if (staff) return false;
  const guildId = await reading.guilds.idFor(serverId);
  if (guildId === undefined) return false;
  const open = openPartiesOf(reading.parties.active(), guildId, memberId);
  if (!mayOpenParty(open, 0)) return true;
  return !mayOpenParty(open, await reading.meetupSafety.pendingCount(serverId, memberId));
}
