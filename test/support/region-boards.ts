import { RegionBoards } from '../../src/services/region-boards.js';
import { MemoryActivity } from './activity.js';
import { FakePartyGateway } from './fake-gateway.js';
import { FAKE_GUILD_ID } from './fake-interactions.js';
import { EAST_CHANNEL, EAST_FORUM, UNBOUNDED_CHANNEL, WEST_CHANNEL, WEST_FORUM } from './gyms.js';
import { regionsFixture } from './providers.js';

/**
 * The region board (plan 8H-5) over memory: `activity` (`MemoryActivity`, empty) holds the
 * buckets, `gateway` (a `FakePartyGateway` with West's and East's forums, their channels named
 * `west` and `east` and known to the server, as region 3's is, which has no name, so it is
 * "Region 3") says who a forum keeps
 * out (`barred`), and the invented regions are those of the fakes' server, row 1. Pass `boards`
 * as `regionBoards` to `createTestContext`.
 */
export function regionBoardsWith(zone = 'America/New_York') {
  const activity = new MemoryActivity();
  const gateway = new FakePartyGateway();
  gateway.addForum(WEST_FORUM);
  gateway.addForum(EAST_FORUM);
  gateway.addChannel(WEST_CHANNEL, 'west');
  gateway.addChannel(EAST_CHANNEL, 'east');
  // Known to the server (a Share asks of it), with no name the board shows.
  gateway.channels.set(UNBOUNDED_CHANNEL, {
    name: 'unbounded',
    kind: 'text',
    categoryId: null,
    guildId: gateway.guildId,
  });
  const boards = new RegionBoards({
    reader: activity,
    regions: regionsFixture(),
    guilds: { idFor: (snowflake) => Promise.resolve(snowflake === FAKE_GUILD_ID ? 1 : undefined) },
    gateway,
    zone,
  });
  return { boards, activity, gateway };
}
