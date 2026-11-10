import { describe, expect, it } from 'vitest';
import { WEST_CHANNEL } from '../../test/support/gyms.js';
import { dmReasons, dmSentence, linksOf, textDisplays } from '../../test/support/messages.js';
import {
  ALICE,
  BOB,
  CAROL,
  MINUTE,
  REPORTER,
  TEST_PIN,
  TEST_SPOT,
} from '../../test/support/parties.js';
import { keptRow } from '../../test/support/wayspot-cases.js';
import { wayspotsWith } from '../../test/support/wayspots.js';
import { partyServiceWith, reportedMax } from '../../test/support/party-service.js';
import { watchEachTest } from '../../test/support/timers.js';
import { pokemonTarget, type NotificationTarget } from '../domain/pogo/notification-target.js';
import { boxTarget, type TargetWant } from '../domain/notify/target-wants.js';
import { PartyStatus } from '../domain/party/status.js';
import { postLink } from '../render/notify-dm.js';

const MACHAMP = pokemonTarget(68);
/** The boxes of `/want`'s dialog a max battle's DMs follow since plan 8R-1. */
const DYNAMAX_MACHAMP = boxTarget('dynamax', 68);
const GIGANTAMAX_MACHAMP = boxTarget('gigantamax', 68);
const box = (want: TargetWant) => ({ add: [want], remove: [] });
const T5: NotificationTarget = { kind: 'tier', tier: { level: 'T5', shadow: false } };
const OTHER_SPOT = { ...TEST_SPOT, id: 'beef0000beef0000beef0000beef0000.16', title: 'Old Mill' };
const background = watchEachTest();

type Kept = Awaited<ReturnType<typeof partyServiceWith>>;

/** A max battle reported after `before` filled the wants: the first event the notifier sees. */
async function reported(
  before: (kept: Kept) => Promise<void>,
  report: Parameters<typeof reportedMax>[0] = {},
  overrides: Parameters<typeof reportedMax>[1] = {},
) {
  const kept = await partyServiceWith();
  await before(kept);
  const made = await reportedMax({ reporter: { name: 'Rita' }, ...report }, overrides, {
    storage: kept.storage,
    gateway: kept.gateway,
    regions: kept.regions,
    clock: kept.clock,
    tags: kept.tags,
    wants: kept.wants,
    targetWants: kept.targetWants,
    gymTargets: kept.gymTargets,
    userSettings: kept.userSettings,
  });
  await made.notify.flush();
  return made;
}

describe('NotifyService: a max battle is reported (plan 8X-3, design 3.4)', () => {
  it('tells who ticked its Dynamax box, and says it tells no more of it for an hour', async () => {
    const made = await reported(async ({ wants, targetWants, gateway }) => {
      await targetWants.change(ALICE, gateway.guildId, box(DYNAMAX_MACHAMP), 0);
      // A tier want never fits a max battle; since plan 8R-1 nor does a want of the species in
      // raids (Matt's answer 9 of the stop reports design), nor the Gigantamax box alone.
      await wants.set(BOB, gateway.guildId, T5, 'raid');
      await wants.set(BOB, gateway.guildId, MACHAMP, 'both');
      await targetWants.change(CAROL, gateway.guildId, box(GIGANTAMAX_MACHAMP), 0);
      await targetWants.change(REPORTER, gateway.guildId, box(DYNAMAX_MACHAMP), 0);
    });
    expect(made.dms.recipients).toEqual([ALICE]);
    const [message] = made.dms.to(ALICE);
    expect(dmSentence(message)).toBe(
      `A **Dynamax Machamp (2★)** battle has been reported at **Gazebo of the Park** ` +
        `(<#${WEST_CHANNEL}>) by **Rita**.`,
    );
    expect(dmReasons(message)).toEqual(['Machamp · Dynamax']);
    // Under the news, above the reasons and their Stop buttons (plan 8X-F).
    expect(textDisplays(message)[1]).toBe(
      "-# You won't be told about more Dynamax Machamp battles for an hour.",
    );
    expect(linksOf(message)).toEqual([
      `Go to post ${postLink(made.gateway.guildId, made.postId)}`,
      'Map https://www.google.com/maps/search/?api=1&query=40.0005%2C-80.0005',
    ]);
  });

  it('tells a member of one battle of a boss an hour, a battle of another boss at once', async () => {
    const made = await reported(async ({ targetWants, gateway }) => {
      await targetWants.change(
        ALICE,
        gateway.guildId,
        { add: [DYNAMAX_MACHAMP, boxTarget('dynamax', 66)], remove: [] },
        0,
      );
    });
    expect(made.dms.to(ALICE)).toHaveLength(1);
    const report = {
      reporterId: BOB,
      anonymous: false,
      autoStatus: PartyStatus.Interested,
      tier: 'D2' as const,
      boss: { key: 'machamp' },
      endTime: made.party.endTime ?? 0,
      regionChannelId: WEST_CHANNEL,
    };
    expect((await made.service.reportMax({ ...report, spot: OTHER_SPOT })).kind).toBe('created');
    await made.notify.flush();
    expect(made.dms.to(ALICE)).toHaveLength(1);
    // Machop is another boss.
    const machop = await made.service.reportMax({
      ...report,
      spot: { ...OTHER_SPOT, id: 'feed0000feed0000feed0000feed0000.16' },
      boss: { key: 'machop' },
    });
    expect(machop.kind).toBe('created');
    await made.notify.flush();
    expect(made.dms.to(ALICE)).toHaveLength(2);
    // An hour after the first, a battle of Machamp is told again.
    made.clock.now += 61 * MINUTE;
    const later = await made.service.reportMax({
      ...report,
      spot: { ...OTHER_SPOT, id: 'aaaa0000aaaa0000aaaa0000aaaa0000.16' },
      endTime: made.clock.now + 60 * MINUTE,
    });
    expect(later.kind).toBe('created');
    await made.notify.flush();
    expect(made.dms.to(ALICE)).toHaveLength(3);
    await background.settle();
  });

  // Review B, B3: the hour is per boss and kind, as the DM names it ("Dynamax Machamp").
  it('tells of a Gigantamax battle of a boss within the hour of a Dynamax one', async () => {
    const made = await reported(async ({ targetWants, gateway }) => {
      await targetWants.change(
        ALICE,
        gateway.guildId,
        { add: [DYNAMAX_MACHAMP, GIGANTAMAX_MACHAMP], remove: [] },
        0,
      );
    });
    expect(made.dms.to(ALICE)).toHaveLength(1);
    const gigantamax = await made.service.reportMax({
      spot: OTHER_SPOT,
      reporterId: BOB,
      anonymous: false,
      autoStatus: PartyStatus.Interested,
      tier: 'G',
      boss: { key: 'machamp' },
      endTime: made.party.endTime ?? 0,
      regionChannelId: WEST_CHANNEL,
    });
    expect(gigantamax.kind).toBe('created');
    await made.notify.flush();
    const told = made.dms.to(ALICE);
    expect(told).toHaveLength(2);
    expect(textDisplays(told[1])[1]).toBe(
      "-# You won't be told about more Gigantamax Machamp battles for an hour.",
    );
    await background.settle();
  });

  // Review B, B9: a spot's name reaches other members' DMs: no address in it is a link.
  it('breaks the addresses in the name of the spot it tells of', async () => {
    const made = await reported(
      async ({ targetWants, gateway }) => {
        await targetWants.change(ALICE, gateway.guildId, box(DYNAMAX_MACHAMP), 0);
      },
      { spot: { ...TEST_SPOT, title: 'Gazebo www.example.test' }, anonymous: true },
    );
    expect(dmSentence(made.dms.to(ALICE)[0])).toBe(
      'A **Dynamax Machamp (2★)** battle has been reported at **Gazebo www.\u200Bexample.test** ' +
        `(<#${WEST_CHANNEL}>).`,
    );
  });

  // Final review, X3-F1: `/meet` and Meet… say "I have told the others"; so it is.
  it('tells the others of a group the meeting time, naming the max battle at its spot', async () => {
    const made = await reported(() => Promise.resolve());
    const alice = { id: ALICE, name: 'Alice' };
    await made.attendance.signUp(made.party.id, alice, PartyStatus.Coming);
    await made.attendance.signUp(made.party.id, { id: BOB, name: 'Bob' }, PartyStatus.Coming);
    await made.notify.flush();
    const meet = made.clock.now + 20 * MINUTE;
    await made.attendance.setMeetingTime(made.party.id, alice, meet);
    await made.notify.flush();
    expect(made.dms.recipients.sort()).toEqual([BOB, REPORTER].sort());
    expect(dmSentence(made.dms.to(BOB)[0])).toBe(
      `Meet at <t:${String(meet / 1000)}:t> for the max battle at Gazebo of the Park ` +
        `(set by Alice). 3 trainers are attending: ${postLink(made.gateway.guildId, made.postId)}`,
    );
    await background.settle();
  });

  // Plan 8X-F (staging of 8X): "the max battle at Unlisted power spot" read wrong.
  it('says "at an unlisted power spot" of a battle at a pin, in the report and the meeting time', async () => {
    const made = await reported(
      async ({ targetWants, gateway }) => {
        await targetWants.change(ALICE, gateway.guildId, box(DYNAMAX_MACHAMP), 0);
      },
      { spot: TEST_PIN },
    );
    expect(dmSentence(made.dms.to(ALICE)[0])).toBe(
      `A **Dynamax Machamp (2★)** battle has been reported at an unlisted power spot ` +
        `(<#${WEST_CHANNEL}>) by **Rita**.`,
    );
    const alice = { id: ALICE, name: 'Alice' };
    await made.attendance.signUp(made.party.id, alice, PartyStatus.Coming);
    await made.attendance.signUp(made.party.id, { id: BOB, name: 'Bob' }, PartyStatus.Coming);
    await made.notify.flush();
    const meet = made.clock.now + 20 * MINUTE;
    await made.attendance.setMeetingTime(made.party.id, alice, meet);
    await made.notify.flush();
    expect(dmSentence(made.dms.to(BOB).at(-1))).toMatch(
      new RegExp(
        `^Meet at <t:${String(meet / 1000)}:t> for the max battle at an unlisted power spot \\(set by Alice\\)\\.`,
      ),
    );
    await background.settle();
  });

  it('tells who wants the boss a rotation brings, by /boss', async () => {
    const made = await reported(async ({ targetWants, gateway }) => {
      await targetWants.change(ALICE, gateway.guildId, box(boxTarget('dynamax', 215)), 0);
    });
    expect(made.dms.to(ALICE)).toEqual([]);
    await made.maxes.setBoss(
      made.party.id,
      { id: BOB },
      {
        boss: { key: 'sneasel' },
        tier: 'D1',
        label: 'Dynamax Sneasel (1★)',
      },
    );
    await made.notify.flush();
    expect(dmSentence(made.dms.to(ALICE)[0])).toBe(
      `The max battle at **Gazebo of the Park** (<#${WEST_CHANNEL}>) is now against ` +
        '**Dynamax Sneasel (1★)**.',
    );
  });

  // Fix review (b): a DM names the spot as its post does now (`PartyService.spotOf`).
  it('names the Power Spot as it is now in every DM: the report, the boss, the meeting time', async () => {
    const renamed = keptRow(1, {
      id: TEST_SPOT.id,
      kind: 'powerspot',
      title: 'Gazebo of the Old Park',
      lat: TEST_SPOT.lat,
      lon: TEST_SPOT.lon,
    });
    const { wayspots } = await wayspotsWith([renamed]);
    const made = await reported(
      async ({ targetWants, gateway }) => {
        await targetWants.change(ALICE, gateway.guildId, box(DYNAMAX_MACHAMP), 0);
        await targetWants.change(BOB, gateway.guildId, box(boxTarget('dynamax', 215)), 0);
      },
      {},
      { wayspots },
    );
    expect(dmSentence(made.dms.to(ALICE)[0])).toContain('at **Gazebo of the Old Park**');
    await made.maxes.setBoss(
      made.party.id,
      { id: REPORTER },
      { boss: { key: 'sneasel' }, tier: 'D1', label: 'Dynamax Sneasel (1★)' },
    );
    await made.notify.flush();
    expect(dmSentence(made.dms.to(BOB)[0])).toContain(
      'The max battle at **Gazebo of the Old Park**',
    );
    const alice = { id: ALICE, name: 'Alice' };
    await made.attendance.signUp(made.party.id, alice, PartyStatus.Coming);
    await made.attendance.signUp(made.party.id, { id: CAROL, name: 'Carol' }, PartyStatus.Coming);
    await made.notify.flush();
    await made.attendance.setMeetingTime(made.party.id, alice, made.clock.now + 20 * MINUTE);
    await made.notify.flush();
    expect(dmSentence(made.dms.to(CAROL).at(-1))).toContain(
      'for the max battle at Gazebo of the Old Park',
    );
    await background.settle();
  });
});
