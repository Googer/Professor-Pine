import { describe, expect, it } from 'vitest';
import { FakePartyGateway } from '../../test/support/fake-gateway.js';
import { WEST_CHANNEL, WEST_FORUM } from '../../test/support/gyms.js';
import { ALICE, REPORTER } from '../../test/support/parties.js';
import { partyServiceWith, type ServiceOverrides } from '../../test/support/party-service.js';
import { gymsFixture } from '../../test/support/providers.js';
import { labNotices, setLab } from '../../test/support/server-notices.js';
import { TestServers } from '../../test/support/server-values.js';
import { PartyStatus } from '../domain/party/status.js';

/** The party services over a fake gateway that refuses posts in West's forum (no Manage Posts). */
async function refusing(overrides: ServiceOverrides = {}) {
  const gateway = new FakePartyGateway();
  gateway.refusePosts.set(WEST_FORUM, ['Manage Posts']);
  const made = await partyServiceWith([], overrides, { gateway });
  const gym = gymsFixture().get(1);
  if (!gym) throw new Error('no gym 1');
  const report = () =>
    made.service.reportRaid({
      gym,
      reporterId: REPORTER,
      anonymous: false,
      autoStatus: PartyStatus.Interested,
      tier: { level: 'T5', shadow: false },
      boss: null,
    });
  return { ...made, gateway, report };
}

const REFUSED = { kind: 'no-post', refused: { forumId: WEST_FORUM, missing: ['Manage Posts'] } };

describe('PartyService: a forum where the bot may not make posts', () => {
  it('keeps no raid, meetup or train there, and says what the bot lacks', async () => {
    const made = await refusing();
    expect(await made.report()).toEqual(REFUSED);
    expect(
      await made.service.createMeetup({
        name: 'Picnic',
        creatorId: ALICE,
        regionChannelId: WEST_CHANNEL,
      }),
    ).toEqual(REFUSED);
    expect(
      await made.service.createTrain({
        name: 'Loop',
        creatorId: ALICE,
        regionChannelId: WEST_CHANNEL,
      }),
    ).toEqual(REFUSED);
    expect(made.store.active()).toEqual([]);
    expect(made.gateway.posts.size).toBe(0);
    // Asked once each: what was refused is not tried in other forms.
    expect(made.gateway.calls.filter((call) => call.startsWith('createPost '))).toHaveLength(3);
  });

  it('logs it once per forum, for the owner to see, however often members try', async () => {
    const made = await refusing();
    await made.report();
    await made.report();
    const said = made.entries.filter(
      (entry) =>
        entry.msg === 'the bot may not make posts in a forum: staff must give it the permissions',
    );
    expect(said).toHaveLength(1);
    expect(said[0]).toMatchObject({
      level: 40,
      server: made.gateway.guildId,
      forum: WEST_FORUM,
      missing: ['Manage Posts'],
    });
  });

  // Plan 19B-1: what is wrong with a server's setup is told to its own staff.
  it('tells the server’s staff in their moderators’ bot lab what the bot lacks there', async () => {
    const made = await refusing();
    await made.report();
    expect(made.notices.told).toEqual([
      {
        server: made.gateway.guildId,
        key: `forum-posts:${WEST_FORUM}`,
        text:
          `I may not make posts in <#${WEST_FORUM}>: I lack the permission Manage Posts there, ` +
          'so no raid, max battle, train or meetup of its region can be posted. Staff give me ' +
          'what it needs in the forum’s settings.',
      },
    ]);
  });

  // Fix round 2, G2: the once per forum is the log's; the notice is asked at every refusal, so
  // a lab set later hears of it (`ServerNotices` says it once).
  it('tells the staff at the next refusal once their server has a moderators’ bot lab', async () => {
    const servers = new TestServers();
    const SERVER = new FakePartyGateway().guildId;
    const LAB = '300000000000000099';
    setLab(servers, SERVER, undefined);
    const lab = labNotices(servers);
    const made = await refusing({ servers, notices: lab.notices });
    await made.report();
    await lab.notices.flush();
    expect(lab.sent).toEqual([]);
    setLab(servers, SERVER, LAB);
    await made.report();
    await made.report();
    await lab.notices.flush();
    expect(lab.sent.map((one) => one.channelId)).toEqual([LAB]);
    expect(
      made.entries.filter(
        (entry) =>
          entry.msg === 'the bot may not make posts in a forum: staff must give it the permissions',
      ),
    ).toHaveLength(1);
  });
});
