import { describe, expect, it } from 'vitest';
import { TEST_GUILD_ROW, WEST_CHANNEL } from '../../../test/support/gyms.js';
import { ALICE, PARTY_NOW, PARTY_ZONE } from '../../../test/support/parties.js';
import { partyServiceWith } from '../../../test/support/party-service.js';
import { gymsFixture } from '../../../test/support/providers.js';
import { createTestContext } from '../../../test/support/test-context.js';
import { MemoryUsers } from '../../../test/support/users.js';
import type { Gym } from '../../db/repositories/gym-repository.js';
import type { UserSettings } from '../../db/repositories/user-repository.js';
import { PartyStatus, RaidPrivacy } from '../../domain/party/status.js';
import { reportedBoss, reportedTime } from './raid-input.js';
import {
  DISCORD_NAMES,
  reportRaidAs,
  reportWords,
  type ReportNames,
  type ReportResult,
} from './report.js';

const ALICE_MEMBER = { id: ALICE, name: 'Alice', team: 'valor' } as const;

function libraryGym(): Gym {
  const gym = gymsFixture().stored(1);
  if (!gym) throw new Error('no gym 1');
  return gym;
}

/** The page's names: no post (the page opens the raid), a region by its channel's name. */
const PAGE: ReportNames = { post: () => undefined, channel: () => '#west' };

/**
 * A report as `/raid` and the live map make it: as the member, with their own privacy and
 * automatic status, and the command's words for each outcome.
 */
async function setup(settings = new Map<string, Partial<UserSettings>>()) {
  const made = await partyServiceWith();
  const { ctx } = createTestContext({
    partyService: made.service,
    parties: made.store,
    regions: made.regions,
    users: new MemoryUsers(settings),
  });
  return { ...made, ctx };
}

describe('reporting a raid, as /raid and the map share it', () => {
  it('reports as the member, signed up by their automatic status with their name and team, named unless their privacy says not', async () => {
    const made = await setup(
      new Map([[ALICE, { raidPrivacy: RaidPrivacy.Anonymous, autoStatus: PartyStatus.Coming }]]),
    );
    const reported = reportedBoss(made.ctx, null, 'e:T5:0', PARTY_ZONE);
    const result = await reportRaidAs(made.ctx, ALICE_MEMBER, libraryGym(), {
      reported,
      time: reportedTime(made.ctx, reported, '30', PARTY_NOW, PARTY_ZONE),
      regionChannelId: WEST_CHANNEL,
      guildRow: TEST_GUILD_ROW,
    });
    expect(result.outcome.kind).toBe('created');
    expect(result.autoStatus).toBe(PartyStatus.Coming);
    const [party] = made.store.active();
    expect(party).toMatchObject({ createdById: ALICE, anonymous: true, gymId: 1 });
    expect(party?.attendees[ALICE]).toMatchObject({
      status: PartyStatus.Coming,
      name: 'Alice',
      team: 'valor',
    });
  });

  it('words each outcome as /raid does, naming the post and the region as the surface can', async () => {
    const made = await setup();
    const gym = libraryGym();
    const reported = reportedBoss(made.ctx, null, 'e:T5:0', PARTY_ZONE);
    const request = {
      reported,
      time: undefined,
      regionChannelId: WEST_CHANNEL,
      guildRow: TEST_GUILD_ROW,
    };
    const first = await reportRaidAs(made.ctx, ALICE_MEMBER, gym, request);
    const post = first.outcome.kind === 'created' ? first.outcome.party.forumPostId : null;
    expect(reportWords(first, gym, reported.label, DISCORD_NAMES)).toBe(
      `Reported: T5 egg at The Stacks. Its post is <#${post}>.`,
    );
    expect(reportWords(first, gym, reported.label, PAGE)).toBe('Reported: T5 egg at The Stacks.');
    const again = await reportRaidAs(made.ctx, { id: '200000000000000099' }, gym, request);
    expect(again.outcome.kind).toBe('exists');
    expect(reportWords(again, gym, reported.label, PAGE)).toBe(
      'There is already a raid at The Stacks. You have been marked as interested.',
    );
    const west = made.regions.byChannel(WEST_CHANNEL);
    if (!west) throw new Error('no West');
    const noForum: ReportResult = {
      autoStatus: first.autoStatus,
      outcome: { kind: 'no-forum', region: west },
    };
    expect(reportWords(noForum, gym, reported.label, PAGE)).toBe(
      'The region #west has no raid forum yet. A moderator can create it with `/admin setup-forums`.',
    );
  });
});
