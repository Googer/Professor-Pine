import type { MeetupRequestRecord } from '../../src/domain/meetups/records.js';
import type { Party } from '../../src/domain/party/party.js';
import { MeetupSafety, type RequestAsk } from '../../src/services/meetup-safety.js';
import type { WayspotProvider } from '../../src/services/wayspot-directory.js';
import type { QuietServers } from '../../src/services/quiet-servers.js';
import { WEST_CHANNEL } from './gyms.js';
import { LIBRARY, MAKER, SAFETY_SERVER } from './meetup-safety-cases.js';
import { MemoryMeetupSafety } from './meetup-safety.js';
import { partyServiceWith, type ServiceOverrides } from './party-service.js';

/** The name of the moderators' channel in the tests of meetup safety. */
export const MODERATION = 'meetup-review';
/** The moderators' channel on the fake gateway. */
export const MOD_CHANNEL = '600000000000000777';

export interface SafetyOptions {
  /**
   * The name of the server's moderators' channel (`MOD_CHANNEL` in its values); null for none
   * set (the safety off).
   */
  moderation?: string | null;
  /** Whether the server has that channel. Default yes. */
  channel?: boolean;
  /** The server's `flaggedWords` (plan 19A-1: its own; `meetupSafety.flaggedWords` of the file). */
  flaggedWords?: string[];
  /** The kept Wayspots a ruled place of none kept is read from (`wayspotsWith`); none without. */
  wayspots?: Pick<WayspotProvider, 'stored'>;
  /** The quiet servers (plans 19C-1, 19C-2): their records are not expired. Default none. */
  quiet?: QuietServers;
}

/**
 * Meetup safety over the services of `partyServiceWith` (the fake gateway, the party service,
 * the store, the clock, the recorded DMs) and `MemoryMeetupSafety` (`storage`): the settings
 * name the moderators' channel `MODERATION`, which the server has as `MOD_CHANNEL`, unless
 * `options` say otherwise. `held(ask?)` asks the moderators about Alice's book swap at the
 * Little Free Library (a PokéStop), a day ahead, and gives the request as it was stored.
 */
export async function meetupSafetyWith(
  options: SafetyOptions = {},
  parties: readonly Party[] = [],
  overrides: ServiceOverrides = {},
) {
  const made = await partyServiceWith(parties, overrides);
  const { moderation = MODERATION, channel = true, flaggedWords, wayspots } = options;
  const { settings } = made;
  // The server's moderators' channel (plan 19A-1: by id), for every service of `made`.
  const { moderation: _none, ...channels } = made.servers.values.channels;
  made.servers.values = {
    ...made.servers.values,
    channels: moderation === null ? channels : { ...channels, moderation: MOD_CHANNEL },
    ...(flaggedWords === undefined ? {} : { flaggedWords }),
  };
  if (channel && moderation !== null) made.gateway.addChannel(MOD_CHANNEL, moderation);
  const storage = new MemoryMeetupSafety();
  const safety = new MeetupSafety({
    storage,
    gateway: made.gateway,
    parties: made.service,
    regions: made.regions,
    dms: made.dms,
    gyms: made.gyms,
    ...(wayspots === undefined ? {} : { wayspots }),
    store: made.store,
    guilds: {
      idFor: (snowflake) => Promise.resolve(snowflake === made.gateway.guildId ? 1 : undefined),
    },
    settings,
    servers: made.servers,
    // The notices of the party services' world (plan 19B-1): `made.notices`.
    notices: made.notices,
    log: made.log,
    now: () => made.clock.now,
    ...(options.quiet === undefined ? {} : { quiet: options.quiet }),
  });
  const held = async (ask: Partial<RequestAsk> = {}): Promise<MeetupRequestRecord> => {
    const outcome = await safety.submit(bookSwap(made.clock.now, ask));
    if (outcome.kind !== 'sent') throw new Error(`the request was not sent: ${outcome.kind}`);
    return outcome.request;
  };
  /** The moderators' post of a request, as it is now. */
  const postOf = (request: MeetupRequestRecord) =>
    made.gateway.messagesIn(MOD_CHANNEL).find((message) => message.id === request.messageId);
  return { ...made, settings, storage, safety, held, postOf };
}

/** Alice's book swap at the Little Free Library, a day after `now`, as `/meetup` asks for it. */
export function bookSwap(now: number, ask: Partial<RequestAsk> = {}): RequestAsk {
  return {
    serverId: SAFETY_SERVER,
    regionChannelId: WEST_CHANNEL,
    maker: { id: MAKER, name: 'Alice', team: 'mystic' },
    place: LIBRARY,
    name: 'Book swap',
    startTime: now + 24 * 3_600_000,
    description: 'Bring a book.',
    ...ask,
  };
}
