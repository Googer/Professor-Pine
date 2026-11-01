import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FAKE_GUILD_ID } from '../../../test/support/fake-interactions.js';
import { WEST_CHANNEL } from '../../../test/support/gyms.js';
import { maxReportingWith, MAX_THURSDAY } from '../../../test/support/max-reporting.js';
import { ALICE, asMax, at, TEST_SPOT } from '../../../test/support/parties.js';
import { MOD_CHANNEL } from '../../../test/support/meetup-safety-service.js';
import { textDisplays } from '../../../test/support/messages.js';
import { PartyStatus, RaidPrivacy } from '../../domain/party/status.js';
import { endingSoonQuestion, ENDING_SOON, NEXT_ROTATION } from '../../render/max-dialog.js';
import { PIN_NOT_HERE, PLACE_GONE } from '../place-option.js';
import { spotAt } from './max-input.js';
import { MAX_ENDED, maxReportWords, reportMaxAs, takenWords, type MaxNames } from './max-report.js';

/** How the map names a post (not at all) and a region's channel (by its name), and its words. */
const MAP_NAMES: MaxNames = {
  post: () => undefined,
  channel: () => '#west',
  ended: 'The max battle there has just ended: report it again.',
  bossHint: ' Open its post and use /boss there to change its boss.',
  pinBlocked: 'You are blocked from making meetups in this server. Pick a Power Spot on the map.',
  postPending: '',
};

const MACHOP = { boss: { key: 'machop' }, tier: 'D2' as const, label: 'Dynamax Machop (2★)' };
const NINE = at('2026-10-22T21:00');

describe('reporting a max battle as a member (reportMaxAs)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'], now: MAX_THURSDAY });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('reports as the member, kept out of the post by their privacy, signed up by their automatic status', async () => {
    const made = await maxReportingWith();
    made.userSettings.set(ALICE, {
      raidPrivacy: RaidPrivacy.Anonymous,
      autoStatus: PartyStatus.Coming,
    });
    const result = await reportMaxAs(
      made.ctx,
      { id: ALICE, name: 'Alice' },
      FAKE_GUILD_ID,
      { boss: MACHOP, spot: TEST_SPOT, end: NINE, regionChannelId: WEST_CHANNEL },
      { mayJoin: () => Promise.resolve(true), staff: false },
    );
    expect(result.autoStatus).toBe(PartyStatus.Coming);
    expect(result.outcome.kind).toBe('created');
    const battle = asMax(made.store.active()[0]);
    expect(battle).toMatchObject({ anonymous: true, createdById: ALICE, endTime: NINE });
    expect(battle.attendees[ALICE]?.status).toBe(PartyStatus.Coming);
  });

  it('tells the moderators of a new battle at a pin, and logs it for staff', async () => {
    const made = await maxReportingWith({});
    const pin = { kind: 'pin' as const, lat: 40.05, lon: -80.05, near: null, linkName: null };
    await reportMaxAs(
      made.ctx,
      { id: ALICE, name: 'Alice' },
      FAKE_GUILD_ID,
      { boss: MACHOP, spot: pin, end: NINE, regionChannelId: WEST_CHANNEL },
      { mayJoin: () => Promise.resolve(true), staff: false },
    );
    await made.reports.flush();
    const [notice] = made.gateway.messagesIn(MOD_CHANNEL);
    expect(textDisplays(notice?.message)[0]).toMatch(/^### Max battle at an unlisted power spot/);
    expect(made.entries).toContainEqual(
      expect.objectContaining({
        msg: 'a max battle was reported at an unlisted power spot',
        reporter: ALICE,
        server: FAKE_GUILD_ID,
      }),
    );
  });

  it("words its outcome with the caller's names: no post and a channel by name on the map", async () => {
    const made = await maxReportingWith();
    const result = await reportMaxAs(
      made.ctx,
      { id: ALICE, name: 'Alice' },
      FAKE_GUILD_ID,
      { boss: MACHOP, spot: TEST_SPOT, end: NINE, regionChannelId: WEST_CHANNEL },
      { mayJoin: () => Promise.resolve(true), staff: false },
    );
    const ask = { boss: MACHOP, spot: TEST_SPOT, end: NINE };
    expect(maxReportWords(made.ctx, result.outcome, ask, result.autoStatus, MAP_NAMES)).toBe(
      `Reported: Dynamax Machop (2★) at Gazebo of the Park, until <t:${NINE / 1000}:t>.`,
    );
    const battle = asMax(made.store.active()[0]);
    expect(takenWords(made.ctx, battle, 'D3', MAP_NAMES)).toBe(
      'There is already a max battle against Dynamax Machop (2★) at Gazebo of the Park. ' +
        'Open its post and use /boss there to change its boss.',
    );
    // `/max` keeps its words: the post named, and its hint.
    expect(takenWords(made.ctx, battle, 'D3')).toBe(
      'There is already a max battle against Dynamax Machop (2★) at Gazebo of the Park: ' +
        `<#${battle.forumPostId}>. \`/boss\` there changes its boss.`,
    );
    const region = made.regions.byChannel(WEST_CHANNEL);
    if (!region) throw new Error('no West');
    expect(
      maxReportWords(
        made.ctx,
        { kind: 'no-forum', region },
        ask,
        PartyStatus.Interested,
        MAP_NAMES,
      ),
    ).toBe(
      'The region #west has no raid forum yet. A moderator can create it with `/admin setup-forums`.',
    );
    // A battle that ended twice while the report waited: `/max`'s words name `/max`; the caller's.
    expect(
      maxReportWords(made.ctx, { kind: 'ended' }, ask, PartyStatus.Interested, MAP_NAMES),
    ).toBe('The max battle there has just ended: report it again.');
    expect(maxReportWords(made.ctx, { kind: 'ended' }, ask, PartyStatus.Interested)).toBe(
      MAX_ENDED,
    );
  });

  // Plan 8X-F (Matt, staging of 8X): "against it at an unlisted power spot" read as any spot.
  it('says of the battle there its own boss and "this spot", with its post as the caller names it', async () => {
    const made = await maxReportingWith();
    const result = await reportMaxAs(
      made.ctx,
      { id: ALICE, name: 'Alice' },
      FAKE_GUILD_ID,
      { boss: MACHOP, spot: TEST_SPOT, end: NINE, regionChannelId: WEST_CHANNEL },
      { mayJoin: () => Promise.resolve(true), staff: false },
    );
    const battle = asMax(made.store.active()[0]);
    const ask = { boss: MACHOP, spot: TEST_SPOT, end: NINE };
    const exists = (party: typeof battle, joined: boolean) =>
      ({ kind: 'exists', party, joined }) as const;
    expect(maxReportWords(made.ctx, exists(battle, true), ask, PartyStatus.Interested)).toBe(
      `There is already a max battle against Dynamax Machop (2★) at this spot: <#${battle.forumPostId}>. ` +
        'You have been marked as interested.',
    );
    expect(
      maxReportWords(
        made.ctx,
        exists({ ...battle, forumPostId: null }, false),
        ask,
        PartyStatus.Interested,
      ),
    ).toBe(
      'There is already a max battle against Dynamax Machop (2★) at this spot: its post is ' +
        'being made.',
    );
    expect(
      maxReportWords(made.ctx, exists(battle, false), ask, PartyStatus.Interested, MAP_NAMES),
    ).toBe('There is already a max battle against Dynamax Machop (2★) at this spot.');
    // Review r0, X5-5: the map names no post, also none being made.
    const unposted = { ...battle, forumPostId: null };
    expect(
      maxReportWords(made.ctx, exists(unposted, false), ask, PartyStatus.Interested, MAP_NAMES),
    ).toBe('There is already a max battle against Dynamax Machop (2★) at this spot.');
    expect(takenWords(made.ctx, unposted, 'D3', MAP_NAMES)).toBe(
      'There is already a max battle against Dynamax Machop (2★) at Gazebo of the Park. ' +
        'Open its post and use /boss there to change its boss.',
    );
    expect(takenWords(made.ctx, unposted, 'D3')).toBe(
      'There is already a max battle against Dynamax Machop (2★) at Gazebo of the Park: its ' +
        'post is being made. `/boss` there changes its boss.',
    );
    expect(result.outcome.kind).toBe('created');
  });

  it('ends a sentence with a spot whose name ends in a period once (staging of 8X)', async () => {
    const made = await maxReportingWith();
    await reportMaxAs(
      made.ctx,
      { id: ALICE, name: 'Alice' },
      FAKE_GUILD_ID,
      { boss: MACHOP, spot: TEST_SPOT, end: NINE, regionChannelId: WEST_CHANNEL },
      { mayJoin: () => Promise.resolve(true), staff: false },
    );
    const battle = asMax(made.store.active()[0]);
    const spot = battle.max.spot;
    if (spot.kind !== 'powerspot') throw new Error('not at a Power Spot');
    const inc = {
      ...battle,
      max: { ...battle.max, spot: { ...spot, title: 'Fire Company Inc.' } },
    };
    expect(takenWords(made.ctx, inc, 'D3', MAP_NAMES)).toBe(
      'There is already a max battle against Dynamax Machop (2★) at Fire Company Inc. ' +
        'Open its post and use /boss there to change its boss.',
    );
  });
});

describe('a spot named without an interaction (spotAt)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'], now: MAX_THURSDAY });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('names a kept Power Spot by its id, and refuses one Pine keeps no more', async () => {
    const made = await maxReportingWith();
    expect(spotAt(made.ctx, 1, { spot: TEST_SPOT.id })).toMatchObject({
      kind: 'powerspot',
      id: TEST_SPOT.id,
      title: 'Gazebo of the Park',
    });
    expect(() => spotAt(made.ctx, 1, { spot: 'deadbeef.16' })).toThrow(PLACE_GONE);
  });

  it('takes a point near a Power Spot as that spot, one near none as a pin, and refuses one outside the regions', async () => {
    const made = await maxReportingWith();
    expect(spotAt(made.ctx, 1, { lat: TEST_SPOT.lat, lon: TEST_SPOT.lon + 0.0002 })).toMatchObject({
      kind: 'powerspot',
      id: TEST_SPOT.id,
    });
    expect(spotAt(made.ctx, 1, { lat: 40.05, lon: -80.05 })).toEqual({
      kind: 'pin',
      lat: 40.05,
      lon: -80.05,
      near: null,
      linkName: null,
    });
    expect(() => spotAt(made.ctx, 1, { lat: 10, lon: 10 })).toThrow(PIN_NOT_HERE);
  });
});

describe('the ending-soon question (endingSoonQuestion)', () => {
  const zone = 'America/New_York';
  const now = at('2026-10-22T14:57');
  const end = at('2026-10-22T15:00');

  it('offers the next rotation first, then the end about to pass, each with the end it reports', () => {
    const next = at('2026-10-22T16:00');
    expect(endingSoonQuestion({ end, next, now, zone })).toEqual({
      text: 'This max battle ends at 3:00 PM, in 3 minutes. Report it until the next rotation?',
      choices: [
        { value: NEXT_ROTATION, label: 'Until the next rotation, 4:00 PM', end: next },
        { value: ENDING_SOON, label: 'Until 3:00 PM (in 3 minutes)', end },
      ],
    });
  });

  it('asks only whether to report it where no later rotation is left', () => {
    expect(endingSoonQuestion({ end, next: undefined, now, zone })).toEqual({
      text: 'This max battle ends at 3:00 PM, in 3 minutes. Report it anyway?',
      choices: [{ value: ENDING_SOON, label: 'Until 3:00 PM (in 3 minutes)', end }],
    });
  });
});
