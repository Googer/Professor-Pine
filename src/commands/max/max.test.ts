import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  dialogChoices,
  dialogOf,
  dialogTexts,
  shownDialog,
} from '../../../test/support/dialogs.js';
import {
  fakeAutocomplete,
  FAKE_GUILD_ID,
  FAKE_USER_ID,
  fakeButton,
  fakeChatInput,
  fakeModal,
  sent,
  type FakeInteraction,
} from '../../../test/support/fake-interactions.js';
import { WEST_CHANNEL, WEST_FORUM } from '../../../test/support/gyms.js';
import { MAX_ZONE, pokebattlerFeed } from '../../../test/support/max-bosses.js';
import { feedReply } from '../../../test/support/raid-bosses.js';
import { maxBossServiceWith } from '../../../test/support/max-boss-service.js';
import { readMaxEventFeed } from '../../../test/support/max-events.js';
import { ALICE, asMax, at, BOB, TEST_SPOT } from '../../../test/support/parties.js';
import { MOD_CHANNEL, type SafetyOptions } from '../../../test/support/meetup-safety-service.js';
import { reportsWith } from '../../../test/support/reports-service.js';
import { accentOf, buttonNames, linksOf, textDisplays } from '../../../test/support/messages.js';
import { EXPIRED_ACCENT } from '../../render/meetup-safety.js';
import { NEWS_COLOUR } from '../../render/notify-dm.js';
import { raidEventsFixture } from '../../../test/support/raid-events.js';
import { createTestContext } from '../../../test/support/test-context.js';
import { MemoryUsers } from '../../../test/support/users.js';
import { keptRow } from '../../../test/support/wayspot-cases.js';
import type { WayspotRow } from '../../domain/wayspots/kept.js';
import { wayspotsWith } from '../../../test/support/wayspots.js';
import { InteractionRouter, STALE_COMPONENT } from '../../discord/router.js';
import { Throttles } from '../../discord/throttle.js';
import { PartyStatus } from '../../domain/party/status.js';
import { parseBigEventFeed, parseMaxEventFeed } from '../../domain/time/max-events.js';
import { maxPinControls } from '../../components/max-pin.js';
import { closeControls } from '../parties/delete.js';
import { end } from '../raids/change.js';
import { max, maxControls } from './max.js';
import { maxBossOptions } from './max-input.js';
import { MAX_BARRED, MAX_ENDED, MAX_PIN_BLOCKED, maxReportWords } from './max-report.js';

/** Thursday 2026-10-22, 14:00: an ordinary day, after the max feed was read (10-20). */
const THURSDAY = at('2026-10-22T14:00');

/** The power spot of `TEST_SPOT`, kept as the Wayfarer import keeps it. */
const SPOT_ROW = keptRow(1, {
  id: TEST_SPOT.id,
  kind: 'powerspot',
  title: 'Gazebo of the Park',
  lat: TEST_SPOT.lat,
  lon: TEST_SPOT.lon,
  address: '1 Park Lane, Pinewood, PA 15000, USA',
  image: null,
});

/**
 * `/max` and `/end` over the services, the controls of `/max`, of a pin's notice and of `/delete`'s
 * dialog; without the moderators' channel unless `safety` names it (`reportsWith`).
 */
async function setup(
  safety: SafetyOptions = { moderation: null },
  moreSpots: readonly WayspotRow[] = [],
) {
  const made = await reportsWith(safety);
  // The services read the faked Date, as the bot's read the clock (a battle is made when reported).
  Object.defineProperty(made.clock, 'now', { get: () => Date.now() });
  const bosses = await maxBossServiceWith();
  await bosses.service.sync();
  // The service's clock is the test's (Date is faked to the day of each test).
  bosses.state.now = Date.now();
  const { wayspots } = await wayspotsWith([SPOT_ROW, ...moreSpots]);
  const feed = readMaxEventFeed();
  const throttles = new Throttles();
  const { ctx, entries } = createTestContext({
    partyService: made.service,
    parties: made.store,
    regions: made.regions,
    attendance: made.attendance,
    maxBosses: bosses.service,
    maxBossAdmin: bosses.service,
    raidEvents: raidEventsFixture(MAX_ZONE, {
      max: parseMaxEventFeed(feed, MAX_ZONE).events,
      big: parseBigEventFeed(feed, MAX_ZONE),
    }),
    wayspots,
    users: new MemoryUsers(made.userSettings),
    maxBattles: made.maxes,
    meetupSafety: made.safety,
    reports: made.reports,
  });
  await ctx.placeFinder.built();
  // `/end` too, in the post a report made (plan 8X-3, Q-B).
  const router = new InteractionRouter(
    ctx,
    [max, end],
    [maxControls, maxPinControls, closeControls],
    {
      throttles,
    },
  );
  const run = async (options: Record<string, string>, extra: object = {}) => {
    const interaction = fakeChatInput({
      commandName: 'max',
      channelId: WEST_CHANNEL,
      options,
      ...extra,
    });
    await router.handle(interaction as never);
    return interaction;
  };
  const handle = async (interaction: FakeInteraction) => {
    await router.handle(interaction as never);
    return interaction;
  };
  // `entries` is the context's log; `logged` the services' (the reports' among them).
  return { ...made, ctx, bosses, entries, logged: made.entries, router, run, handle, throttles };
}

/** What the member was told last: a follow-up, else the edit of the deferred answer, else the reply. */
function told(interaction: FakeInteraction): string | undefined {
  for (const responder of [interaction.followUp, interaction.editReply, interaction.reply]) {
    if (responder.mock.calls.length > 0) return sent(responder).content;
  }
  return undefined;
}

describe('/max', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'], now: THURSDAY });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('reports a listed Dynamax boss at a Power Spot picked from the list, until 21:00', async () => {
    const made = await setup();
    const interaction = await made.run({ boss: 'Machop', spot: `powerspot:${TEST_SPOT.id}` });
    const [battle] = made.store.active();
    expect(asMax(battle)).toMatchObject({
      max: { tier: 'D2', boss: { key: 'machop' }, spot: { kind: 'powerspot', id: TEST_SPOT.id } },
      endTime: at('2026-10-22T21:00'),
      forumChannelId: WEST_FORUM,
    });
    expect(told(interaction)).toBe(
      `Reported: Dynamax Machop (2★) at Gazebo of the Park, until <t:${at('2026-10-22T21:00') / 1000}:t>. ` +
        `Its post is <#${battle?.forumPostId}>.`,
    );
  });

  it('ends a Gigantamax battle outside events at the next full hour', async () => {
    const made = await setup();
    await made.run({ boss: 'Machamp', tier: 'G', spot: `powerspot:${TEST_SPOT.id}` });
    expect(made.store.active()[0]?.endTime).toBe(at('2026-10-22T15:00'));
  });

  it('takes Eternatus typed as its choice is offered, "Eternamax Eternatus"', async () => {
    const made = await setup();
    // A feed with Eternatus's Eternamax battle listed.
    made.bosses.state.respond = () =>
      Promise.resolve(
        feedReply(
          200,
          JSON.stringify(
            pokebattlerFeed({ RAID_LEVEL_6_MAX: [{ pokemonId: 'ETERNATUS_ETERNAMAX_FORM' }] }),
          ),
        ),
      );
    await made.bosses.service.sync();
    const offered = maxBossOptions(made.ctx, 'eternatus', Date.now()).map((one) => one.name);
    expect(offered).toEqual(['Eternamax Eternatus']);
    const used = await made.run({ boss: 'Eternamax Eternatus', spot: `powerspot:${TEST_SPOT.id}` });
    expect(told(used)).toMatch(/^Reported: Eternamax Eternatus at /);
    expect(made.store.active()[0]).toMatchObject({ max: { tier: 'G' } });
  });

  it('asks the tier of a boss on no list, and refuses a Pokémon that is no max boss', async () => {
    const made = await setup();
    const asked = await made.run({ boss: 'Machamp', spot: `powerspot:${TEST_SPOT.id}` });
    expect(told(asked)).toBe('Which tier? Add `tier:`.');
    const withTier = await made.run({
      boss: 'Machamp',
      tier: 'D3',
      spot: `powerspot:${TEST_SPOT.id}`,
    });
    expect(told(withTier)).toMatch(/^Reported: Dynamax Machamp \(3★\)/);
    expect(made.store.active()).toHaveLength(1);
    const unknown = await made.run({ boss: 'Zzzmon', spot: `powerspot:${TEST_SPOT.id}` });
    expect(told(unknown)).toBe(
      'I know no Pokémon called "Zzzmon". Pick a boss from the list that appears while you type.',
    );
  });

  it('takes a maps link near a Power Spot as that spot, and one near none as a pin', async () => {
    const made = await setup();
    await made.run({ boss: 'Machop', spot: `${TEST_SPOT.lat}, ${TEST_SPOT.lon + 0.0002}` });
    expect(asMax(made.store.active()[0]).max.spot).toMatchObject({ kind: 'powerspot' });
    await made.run({ boss: 'Machop', spot: '40.05, -80.05' });
    // Made within one millisecond: told apart by their spots, not by their order.
    const pin = made.store
      .active()
      .map(asMax)
      .find((one) => one.max.spot.kind === 'pin');
    expect(pin?.max.spot).toEqual({
      kind: 'pin',
      lat: 40.05,
      lon: -80.05,
      near: null,
      linkName: null,
    });
    expect(
      made.entries.some(
        (entry) => entry.msg === 'a max battle was reported at an unlisted power spot',
      ),
    ).toBe(true);
  });

  it('names the reporter and the server in the log line of a pin', async () => {
    const made = await setup();
    await made.run({ boss: 'Machop', spot: '40.05, -80.05' }, { userId: ALICE });
    expect(made.entries).toContainEqual(
      expect.objectContaining({
        msg: 'a max battle was reported at an unlisted power spot',
        reporter: ALICE,
        server: FAKE_GUILD_ID,
      }),
    );
  });

  it('joins the battle of the same boss at the spot, and refuses another boss, uncounted', async () => {
    const made = await setup();
    await made.run({ boss: 'Machop', spot: `powerspot:${TEST_SPOT.id}` });
    const [battle] = made.store.active();
    const again = await made.run(
      { boss: 'Machop', spot: `powerspot:${TEST_SPOT.id}` },
      { userId: ALICE },
    );
    // Plan 8X-F (Matt): the boss and "this spot", whatever was typed.
    expect(told(again)).toBe(
      'There is already a max battle against Dynamax Machop (2★) at this spot: ' +
        `<#${battle?.forumPostId}>. You have been marked as interested.`,
    );
    expect(asMax(made.store.get(battle?.id ?? '')).attendees[ALICE]?.status).toBe(
      PartyStatus.Interested,
    );
    // Two members with a window each: the reporter and Alice, who joined (`Throttles.size` counts
    // windows, not uses).
    expect(made.throttles.size).toBe(2);
    const other = await made.run(
      { boss: 'Sneasel', spot: `powerspot:${TEST_SPOT.id}` },
      { userId: BOB },
    );
    expect(told(other)).toBe(
      'There is already a max battle against Dynamax Machop (2★) at Gazebo of the Park: ' +
        `<#${battle?.forumPostId}>. \`/boss\` there changes its boss.`,
    );
    expect(made.store.active()).toHaveLength(1);
    // Refused by its guard: Bob's use was not counted (he has no window).
    expect(made.throttles.size).toBe(2);
  });

  // Review B, B8: the battle there by its kind; `/boss` cannot change a kind, so no hint then.
  it('names the battle there by its kind, and a pin as an unlisted power spot', async () => {
    const made = await setup();
    await made.run({ boss: 'Machop', spot: `powerspot:${TEST_SPOT.id}` });
    const [battle] = made.store.active();
    const giga = await made.run({ boss: 'Machamp', tier: 'G', spot: `powerspot:${TEST_SPOT.id}` });
    expect(told(giga)).toBe(
      'There is already a max battle against Dynamax Machop (2★) at Gazebo of the Park: ' +
        `<#${battle?.forumPostId}>.`,
    );
    await made.run({ boss: 'Machop', spot: '40.05, -80.05' });
    const pinned = made.store
      .active()
      .map(asMax)
      .find((one) => one.max.spot.kind === 'pin');
    const near = await made.run({ boss: 'Sneasel', spot: '40.05, -80.0501' });
    expect(told(near)).toBe(
      'There is already a max battle against Dynamax Machop (2★) at an unlisted power spot: ' +
        `<#${pinned?.forumPostId}>. \`/boss\` there changes its boss.`,
    );
  });

  // Review B, B10: a post the bot may not make is none of the member's doing.
  it('does not count a report whose post the bot may not make', async () => {
    const made = await setup();
    made.gateway.refusePosts.set(WEST_FORUM, ['Manage Posts']);
    for (let n = 0; n < 21; n++) {
      const refused = await made.run({ boss: 'Machop', spot: `powerspot:${TEST_SPOT.id}` });
      expect(told(refused)).toMatch(/^I am not allowed to make posts in /);
    }
    made.gateway.refusePosts.delete(WEST_FORUM);
    const reported = await made.run({ boss: 'Machop', spot: `powerspot:${TEST_SPOT.id}` });
    expect(told(reported)).toMatch(/^Reported: Dynamax Machop/);
  });

  // Fix review F2: the service's `ended`, rare enough to be met only through its words.
  it('says that the battle there has just ended', async () => {
    const made = await setup();
    const ask = {
      boss: { boss: { key: 'machop' }, tier: 'D2' as const, label: 'Dynamax Machop (2★)' },
      spot: TEST_SPOT,
      end: at('2026-10-22T21:00'),
      regionChannelId: WEST_CHANNEL,
      joins: undefined,
      guild: 1,
      asks: false,
    };
    expect(maxReportWords(made.ctx, { kind: 'ended' }, ask, PartyStatus.Interested)).toBe(
      MAX_ENDED,
    );
    expect(MAX_ENDED).toBe('The max battle there has just ended: use `/max` again.');
  });

  it('refuses a report after the last battle time', async () => {
    const made = await setup();
    vi.setSystemTime(at('2026-10-22T21:05'));
    const late = await made.run({ boss: 'Machop', spot: `powerspot:${TEST_SPOT.id}` });
    expect(told(late)).toBe(
      'Max battles are over for today: they can be fought from 06:00 to 21:00.',
    );
  });

  it('refuses a member kept out of the forum the battle would be in', async () => {
    const made = await setup();
    made.gateway.barred.set(WEST_FORUM, new Set([ALICE]));
    const refused = await made.run(
      { boss: 'Machop', spot: `powerspot:${TEST_SPOT.id}` },
      { userId: ALICE },
    );
    expect(told(refused)).toBe(MAX_BARRED);
    expect(made.store.active()).toEqual([]);
  });

  it('offers the bosses of the moment and the Power Spots while one types', async () => {
    const made = await setup();
    const bosses = fakeAutocomplete({
      commandName: 'max',
      channelId: WEST_CHANNEL,
      focusedName: 'boss',
      focused: 'mach',
    });
    await made.handle(bosses);
    const choices = bosses.respond.mock.calls[0]?.[0] as { name: string; value: string }[];
    expect(choices.map((choice) => choice.name)).toEqual(['Machop · Dynamax 2★']);
    const spots = fakeAutocomplete({
      commandName: 'max',
      channelId: WEST_CHANNEL,
      focusedName: 'spot',
      focused: 'gazebo',
    });
    await made.handle(spots);
    const offered = spots.respond.mock.calls[0]?.[0] ?? [];
    expect(offered.map((choice) => choice.value)).toEqual([`powerspot:${TEST_SPOT.id}`]);
    expect(offered[0]?.name).toMatch(/^Gazebo of the Park \(Power Spot\)/);
  });

  it("offers the region's Power Spots by name before anything is typed (staging of 8X)", async () => {
    // A second spot of West, one of East.
    const made = await setup({ moderation: null }, [
      keptRow(2, { kind: 'powerspot', title: 'Anchor Statue', lat: 40.04, lon: -80.04 }),
      keptRow(3, { kind: 'powerspot', title: 'Bell Tower', lat: 40.05, lon: -79.95 }),
    ]);
    const blank = async (channelId: string) => {
      const typing = fakeAutocomplete({
        commandName: 'max',
        channelId,
        focusedName: 'spot',
        focused: '',
      });
      await made.handle(typing);
      return (typing.respond.mock.calls[0]?.[0] ?? []) as { name: string; value: string }[];
    };
    expect(await blank(WEST_CHANNEL)).toEqual([
      { name: 'Anchor Statue (Power Spot)', value: `powerspot:${keptRow(2).id}` },
      { name: 'Gazebo of the Park (Power Spot)', value: `powerspot:${TEST_SPOT.id}` },
    ]);
    // Outside a region's channel: nothing, as before.
    expect(await blank('199999999999999999')).toEqual([]);
  });

  // Review r0, F-A6: Discord takes 25 choices; those first by name.
  it("offers at most 25 of the region's Power Spots before anything is typed, the first by name", async () => {
    const many = Array.from({ length: 30 }, (_, n) =>
      keptRow(10 + n, {
        kind: 'powerspot',
        title: `Spot ${String(n).padStart(2, '0')}`,
        lat: 40.03 + n / 10_000,
        lon: -80.03,
      }),
    );
    const made = await setup({ moderation: null }, many);
    const typing = fakeAutocomplete({
      commandName: 'max',
      channelId: WEST_CHANNEL,
      focusedName: 'spot',
      focused: '',
    });
    await made.handle(typing);
    const offered = (typing.respond.mock.calls[0]?.[0] ?? []) as readonly { name: string }[];
    expect(offered).toHaveLength(25);
    expect(offered[0]?.name).toBe('Gazebo of the Park (Power Spot)');
    expect(offered.slice(1).map((choice) => choice.name)).toEqual(
      Array.from({ length: 24 }, (_, n) => `Spot ${String(n).padStart(2, '0')} (Power Spot)`),
    );
  });
});

describe('/max: a battle that ends soon (Matt, 2026-10-21)', () => {
  beforeEach(() => {
    // The lake trio's Max Battle Day, 14:00 to 17:00: its battles rotate on the half hour.
    vi.useFakeTimers({ toFake: ['Date'], now: at('2026-10-24T14:27') });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('asks before it reports: until the next rotation first, or until the end about to pass', async () => {
    const made = await setup();
    const interaction = await made.run({ boss: 'Uxie', spot: `powerspot:${TEST_SPOT.id}` });
    expect(interaction.deferReply).not.toHaveBeenCalled();
    const dialog = shownDialog(interaction);
    expect(dialogTexts(dialog)).toEqual([
      'This max battle ends at 2:30 PM, in 3 minutes. Report it until the next rotation?',
    ]);
    expect(dialogChoices(dialog)).toEqual([
      {
        value: 'next',
        label: 'Until the next rotation, 3:00 PM',
        description: undefined,
        picked: true,
      },
      {
        value: 'soon',
        label: 'Until 2:30 PM (in 3 minutes)',
        description: undefined,
        picked: false,
      },
    ]);
    expect(made.store.active()).toEqual([]);
    const submit = await made.handle(
      fakeModal({ customId: dialog.custom_id, form: dialog, picked: { end: 'next' } }),
    );
    expect(made.store.active()[0]?.endTime).toBe(at('2026-10-24T15:00'));
    expect(told(submit)).toMatch(/^Reported: Dynamax Uxie \(5★\) at Gazebo of the Park/);
  });

  it('reports it until the end about to pass when the member picks that', async () => {
    const made = await setup();
    const interaction = await made.run({ boss: 'Uxie', spot: `powerspot:${TEST_SPOT.id}` });
    const dialog = shownDialog(interaction);
    await made.handle(
      fakeModal({ customId: dialog.custom_id, form: dialog, picked: { end: 'soon' } }),
    );
    expect(made.store.active()[0]?.endTime).toBe(at('2026-10-24T14:30'));
  });

  it('asks only whether to report it when no later rotation is left', async () => {
    const made = await setup();
    vi.setSystemTime(at('2026-10-24T20:57'));
    const interaction = await made.run({
      boss: 'Machamp',
      tier: 'G',
      spot: `powerspot:${TEST_SPOT.id}`,
    });
    const dialog = shownDialog(interaction);
    expect(dialogTexts(dialog)).toEqual([
      'This max battle ends at 9:00 PM, in 3 minutes. Report it anyway?\n\nSubmit reports it.',
    ]);
    expect(dialogChoices(dialog)).toEqual([]);
    await made.handle(fakeModal({ customId: dialog.custom_id, form: dialog }));
    expect(made.store.active()[0]?.endTime).toBe(at('2026-10-24T21:00'));
  });

  // Review B, B1: decided once, by the guard, so a deferral that crosses the mark changes nothing.
  it('reports without asking when the deferral crosses the five-minute mark', async () => {
    const made = await setup();
    vi.setSystemTime(at('2026-10-24T14:24') + 59_500);
    const interaction = fakeChatInput({
      commandName: 'max',
      channelId: WEST_CHANNEL,
      options: { boss: 'Uxie', spot: `powerspot:${TEST_SPOT.id}` },
    });
    const defer = interaction.deferReply.getMockImplementation();
    interaction.deferReply.mockImplementation((payload) => {
      vi.setSystemTime(at('2026-10-24T14:25') + 1_000);
      return defer ? defer(payload) : Promise.resolve();
    });
    await made.handle(interaction);
    expect(interaction.showModal).not.toHaveBeenCalled();
    expect(told(interaction)).toMatch(/^Reported: Dynamax Uxie \(5★\)/);
    expect(made.store.active()[0]?.endTime).toBe(at('2026-10-24T14:30'));
  });

  // Review B, B4 (Claude's call): a typed end is never second-guessed.
  it('asks nothing of a report whose end was typed, however soon', async () => {
    const made = await setup();
    const typed = await made.run({ boss: 'Uxie', spot: `powerspot:${TEST_SPOT.id}`, end: '3' });
    expect(dialogOf(typed)).toBeUndefined();
    expect(made.store.active()[0]?.endTime).toBe(at('2026-10-24T14:30'));
  });

  // Review B, B12 (Claude's call): the next rotation as things are at the end.
  it('asks only whether to report a Dynamax battle at the last boundary of its event', async () => {
    const made = await setup();
    vi.setSystemTime(at('2026-10-24T16:57'));
    const interaction = await made.run({ boss: 'Uxie', spot: `powerspot:${TEST_SPOT.id}` });
    const dialog = shownDialog(interaction);
    expect(dialogTexts(dialog)).toEqual([
      'This max battle ends at 5:00 PM, in 3 minutes. Report it anyway?\n\nSubmit reports it.',
    ]);
    expect(dialogChoices(dialog)).toEqual([]);
  });

  // Review B, B5: a Submit without the choice it was shown is a stale control.
  it('refuses a Submit without its choice, and reports nothing', async () => {
    const made = await setup();
    const dialog = shownDialog(await made.run({ boss: 'Uxie', spot: `powerspot:${TEST_SPOT.id}` }));
    const submit = await made.handle(fakeModal({ customId: dialog.custom_id }));
    expect(told(submit)).toBe(STALE_COMPONENT);
    expect(made.store.active()).toEqual([]);
  });

  // Review B, B10: the Submit decides again as things are then.
  it('refuses at the Submit another boss reported there meanwhile', async () => {
    const made = await setup();
    const dialog = shownDialog(await made.run({ boss: 'Uxie', spot: `powerspot:${TEST_SPOT.id}` }));
    await made.run(
      { boss: 'Mesprit', spot: `powerspot:${TEST_SPOT.id}`, end: '30' },
      { userId: ALICE },
    );
    const [there] = made.store.active();
    const submit = await made.handle(
      fakeModal({ customId: dialog.custom_id, form: dialog, picked: { end: 'next' } }),
    );
    expect(told(submit)).toBe(
      'There is already a max battle against Dynamax Mesprit (5★) at Gazebo of the Park: ' +
        `<#${there?.forumPostId}>. \`/boss\` there changes its boss.`,
    );
    expect(made.store.active()).toHaveLength(1);
  });

  it('refuses at the Submit a member kept out of the forum since the question', async () => {
    const made = await setup();
    const dialog = shownDialog(await made.run({ boss: 'Uxie', spot: `powerspot:${TEST_SPOT.id}` }));
    made.gateway.barred.set(WEST_FORUM, new Set([FAKE_USER_ID]));
    const submit = await made.handle(
      fakeModal({ customId: dialog.custom_id, form: dialog, picked: { end: 'next' } }),
    );
    expect(told(submit)).toBe(MAX_BARRED);
    expect(made.store.active()).toEqual([]);
  });

  it('asks nothing of a member who joins the battle at the spot', async () => {
    const made = await setup();
    const first = await made.run({ boss: 'Uxie', spot: `powerspot:${TEST_SPOT.id}`, end: '30' });
    expect(dialogOf(first)).toBeUndefined();
    const joining = await made.run(
      { boss: 'Uxie', spot: `powerspot:${TEST_SPOT.id}` },
      { userId: ALICE },
    );
    expect(dialogOf(joining)).toBeUndefined();
    expect(told(joining)).toMatch(/^There is already a max battle against Dynamax Uxie/);
  });
});

describe('/max: a Dynamax battle before a max event that day (Matt, 2026-10-21, Q-B)', () => {
  beforeEach(() => {
    // The morning of the lake trio's Max Battle Day, 14:00 to 17:00.
    vi.useFakeTimers({ toFake: ['Date'], now: at('2026-10-24T10:00') });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('ends at the start of the event, and /end moves it later within the day', async () => {
    const made = await setup();
    const reported = await made.run({ boss: 'Machop', spot: `powerspot:${TEST_SPOT.id}` });
    expect(told(reported)).toMatch(/until <t:\d+:t>\./);
    const [battle] = made.store.active();
    expect(battle?.endTime).toBe(at('2026-10-24T14:00'));
    const later = await made.handle(
      fakeChatInput({
        commandName: 'end',
        channelId: battle?.forumPostId ?? '',
        thread: { parentId: WEST_FORUM },
        userId: FAKE_USER_ID,
        options: { time: '6pm' },
      }),
    );
    expect(told(later)).toBe(`This max battle now ends at <t:${at('2026-10-24T18:00') / 1000}:t>.`);
    expect(made.store.get(battle?.id ?? '')?.endTime).toBe(at('2026-10-24T18:00'));
  });

  it('takes a later end given with end:', async () => {
    const made = await setup();
    await made.run({ boss: 'Machop', spot: `powerspot:${TEST_SPOT.id}`, end: '6pm' });
    expect(made.store.active()[0]?.endTime).toBe(at('2026-10-24T18:00'));
  });

  it('asks before the event starts as before any end: the event’s first rotation is next', async () => {
    const made = await setup();
    vi.setSystemTime(at('2026-10-24T13:57'));
    const dialog = shownDialog(
      await made.run({ boss: 'Machop', spot: `powerspot:${TEST_SPOT.id}` }),
    );
    expect(dialogChoices(dialog).map((choice) => choice.label)).toEqual([
      'Until the next rotation, 2:30 PM',
      'Until 2:00 PM (in 3 minutes)',
    ]);
  });
});

// Matt, 2026-10-21 (final review G1): a pin is a power spot nobody checked.
describe('/max at an unlisted power spot', () => {
  const MOD = { id: '200000000000000009', name: 'Mod', at: THURSDAY };
  const PIN_SPOT = '40.05, -80.05';
  const asMod = { userId: MOD.id, displayName: 'Mod', roleNames: ['Moderator'] };

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'], now: THURSDAY });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('refuses a member blocked from meetups, uncounted, and takes their known Power Spot', async () => {
    const made = await setup({});
    await made.storage.addBlock(made.gateway.guildId, ALICE, MOD);
    for (let n = 0; n < 3; n++) {
      const refused = await made.run({ boss: 'Machop', spot: PIN_SPOT }, { userId: ALICE });
      expect(told(refused)).toBe(MAX_PIN_BLOCKED);
    }
    expect(made.store.active()).toEqual([]);
    expect(made.throttles.size).toBe(0);
    await made.run({ boss: 'Machop', spot: `powerspot:${TEST_SPOT.id}` }, { userId: ALICE });
    expect(made.store.active()).toHaveLength(1);
  });

  // Fix review 4: its Join button would sign them up all the same.
  it('lets a blocked member join the battle at a pin that is there already', async () => {
    const made = await setup({});
    await made.run({ boss: 'Machop', spot: PIN_SPOT }, { userId: BOB });
    await made.storage.addBlock(made.gateway.guildId, ALICE, MOD);
    const joined = await made.run({ boss: 'Machop', spot: PIN_SPOT }, { userId: ALICE });
    expect(told(joined)).toMatch(
      /^There is already a max battle against Dynamax Machop \(2★\) at this spot: <#/,
    );
    const battle = asMax(made.store.active()[0]);
    expect(battle.attendees[ALICE]?.status).toBe(PartyStatus.Interested);
  });

  // Final review F4: the battle there ended after the guard, before the report was made.
  it('refuses a blocked member a new battle at a pin when the one there ended meanwhile', async () => {
    const made = await setup({});
    await made.run({ boss: 'Machop', spot: PIN_SPOT }, { userId: BOB });
    const bobs = asMax(made.store.active()[0]);
    await made.storage.addBlock(made.gateway.guildId, ALICE, MOD);
    const reportMax = made.service.reportMax.bind(made.service);
    vi.spyOn(made.service, 'reportMax').mockImplementationOnce(async (report) => {
      await made.store.update(bobs.id, (party) => ({
        party: { ...party, endTime: Date.now() - 60_000 },
      }));
      return reportMax(report);
    });
    const refused = await made.run({ boss: 'Machop', spot: PIN_SPOT }, { userId: ALICE });
    expect(told(refused)).toBe(MAX_PIN_BLOCKED);
    expect(made.store.active().filter((party) => party.createdById === ALICE)).toEqual([]);
  });

  // Fix review 5: staff are never blocked.
  it('lets a member of staff with a block report at a pin', async () => {
    const made = await setup({});
    await made.storage.addBlock(made.gateway.guildId, MOD.id, MOD);
    const used = await made.run({ boss: 'Machop', spot: PIN_SPOT }, asMod);
    expect(told(used)).toMatch(/^Reported: Dynamax Machop \(2★\) at an unlisted power spot/);
    expect(made.store.active()).toHaveLength(1);
  });

  it('posts the battle at once and tells the moderators of it, with Delete and Go to post', async () => {
    const made = await setup({});
    await made.run({ boss: 'Machop', spot: PIN_SPOT }, { userId: ALICE, displayName: 'Alice' });
    const battle = asMax(made.store.active()[0]);
    expect(battle.forumPostId).not.toBeNull();
    await made.reports.flush();
    const [notice] = made.gateway.messagesIn(MOD_CHANNEL);
    expect(textDisplays(notice?.message)).toEqual([
      '### Max battle at an unlisted power spot\n' +
        `Dynamax Machop (2★), reported by **Alice** (<@${ALICE}>) in <#${WEST_CHANNEL}>.\n` +
        '📍 **Unlisted power spot** · ' +
        '[Map](<https://www.google.com/maps/search/?api=1&query=40.05%2C-80.05>)\n' +
        '-# The battle is posted already, though I do not know this power spot and nobody has ' +
        'checked it. Delete… closes it as `/delete` does.',
    ]);
    expect(buttonNames(notice?.message)).toEqual(['Delete…', 'Go to post']);
    expect(linksOf(notice?.message)).toEqual([
      `Go to post https://discord.com/channels/${FAKE_GUILD_ID}/${battle.forumPostId ?? ''}`,
    ]);
    // Fix review 7: information, in a neutral colour: nothing waits on the moderators.
    expect(accentOf(notice?.message)).toBe(NEWS_COLOUR);
  });

  // Fix review, (a): the notice says how the battle went, and Delete goes.
  it('says in the notice that the battle ended, and who closed one, without Delete', async () => {
    const made = await setup({});
    await made.run({ boss: 'Machop', spot: PIN_SPOT });
    await made.run({ boss: 'Machop', spot: '40.06, -80.06' });
    await made.reports.flush();
    const [first, second] = made.store.active().map(asMax);
    const noticeOf = (battle: typeof first) =>
      made.gateway
        .messagesIn(MOD_CHANNEL)
        .find((one) => linksOf(one.message)[0]?.endsWith(battle?.forumPostId ?? '-'));
    expect(await made.service.end(first?.id ?? '')).toBe(true);
    await made.reports.flush();
    const ended = noticeOf(first)?.message;
    expect(textDisplays(ended)[0]?.split('\n').at(-1)).toBe('This max battle has ended.');
    expect(buttonNames(ended)).toEqual(['Go to post']);
    expect(accentOf(ended)).toBe(EXPIRED_ACCENT);
    const staff = await made.handle(
      fakeButton({
        customId: `maxpin:${second?.id ?? ''}:delete`,
        channelId: MOD_CHANNEL,
        ...asMod,
      }),
    );
    const dialog = shownDialog(staff);
    await made.handle(
      fakeModal({
        customId: dialog.custom_id,
        form: dialog,
        picked: { removal: 'archive' },
        channelId: MOD_CHANNEL,
        ...asMod,
      }),
    );
    await made.reports.flush();
    const closed = noticeOf(second)?.message;
    expect(textDisplays(closed)[0]?.split('\n').at(-1)).toBe(`Closed by **Mod** (<@${MOD.id}>).`);
    expect(buttonNames(closed)).toEqual(['Go to post']);
  });

  // Fix review 5: the moderators' notice is on the side; the report goes on without it.
  it('answers the report when the moderators channel is missing, and says so in the log', async () => {
    const made = await setup({ channel: false });
    const used = await made.run({ boss: 'Machop', spot: PIN_SPOT });
    await made.reports.flush();
    expect(told(used)).toMatch(/^Reported: Dynamax Machop \(2★\) at an unlisted power spot/);
    expect(made.logged).toContainEqual(
      expect.objectContaining({ level: 40, msg: "the moderators' channel is not there" }),
    );
  });

  it('logs a notice Discord refused, and changes nothing else', async () => {
    const made = await setup({});
    const send = made.gateway.sendMessage.bind(made.gateway);
    vi.spyOn(made.gateway, 'sendMessage').mockImplementation((channelId, message) =>
      channelId === MOD_CHANNEL
        ? Promise.reject(new Error('Missing Access'))
        : send(channelId, message),
    );
    const used = await made.run({ boss: 'Machop', spot: PIN_SPOT });
    await made.reports.flush();
    expect(told(used)).toMatch(/^Reported: /);
    expect(made.store.active()).toHaveLength(1);
    expect(made.logged).toContainEqual(
      expect.objectContaining({ level: 50, msg: 'could not tell the moderators of a pin battle' }),
    );
  });

  it('tells the moderators nothing without their channel, nor of a known Power Spot', async () => {
    const off = await setup();
    await off.run({ boss: 'Machop', spot: PIN_SPOT });
    await off.reports.flush();
    expect(off.store.active()).toHaveLength(1);
    expect(off.gateway.messagesIn(MOD_CHANNEL)).toEqual([]);
    const on = await setup({});
    await on.run({ boss: 'Machop', spot: `powerspot:${TEST_SPOT.id}` });
    await on.reports.flush();
    expect(on.store.active()).toHaveLength(1);
    expect(on.gateway.messagesIn(MOD_CHANNEL)).toEqual([]);
  });

  it('lets staff close the battle from the notice as /delete does, and nobody else', async () => {
    const made = await setup({});
    await made.run({ boss: 'Machop', spot: PIN_SPOT });
    await made.reports.flush();
    const battle = asMax(made.store.active()[0]);
    const deleteId = `maxpin:${battle.id}:delete`;
    const press = (extra: object) =>
      made.handle(fakeButton({ customId: deleteId, channelId: MOD_CHANNEL, ...extra }));
    const member = await press({ userId: BOB });
    expect(told(member)).toBe('Only admins and moderators can do that.');
    expect(member.showModal).not.toHaveBeenCalled();
    const staff = await press(asMod);
    const dialog = shownDialog(staff);
    expect(dialog.title).toBe('Close this max battle');
    await made.handle(
      fakeModal({
        customId: dialog.custom_id,
        form: dialog,
        picked: { removal: 'archive' },
        channelId: MOD_CHANNEL,
        ...asMod,
      }),
    );
    expect(made.store.get(battle.id)).toBeUndefined();
    // A press on the notice of a battle that is over says so.
    expect(told(await press(asMod))).toBe('This max battle has ended.');
  });

  // Fix review 1: the press reads nothing slow before its dialog; the Submit checks the server.
  it('closes nothing from a press of another server: its Submit is a stale control', async () => {
    const made = await setup({});
    await made.run({ boss: 'Machop', spot: PIN_SPOT });
    const battle = asMax(made.store.active()[0]);
    const elsewhere = { ...asMod, guildId: '499999999999999999', channelId: MOD_CHANNEL };
    const staff = await made.handle(
      fakeButton({ customId: `maxpin:${battle.id}:delete`, ...elsewhere }),
    );
    const dialog = shownDialog(staff);
    const submit = await made.handle(
      fakeModal({
        customId: dialog.custom_id,
        form: dialog,
        picked: { removal: 'archive' },
        ...elsewhere,
      }),
    );
    expect(told(submit)).toBe(STALE_COMPONENT);
    expect(made.store.get(battle.id)).toBeDefined();
  });
});

describe('/max at an unlisted power spot, asked first', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'], now: at('2026-10-24T14:27') });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('refuses at the Submit a member blocked since the question', async () => {
    const made = await setup({});
    const asked = await made.run({ boss: 'Uxie', spot: '40.05, -80.05' }, { userId: ALICE });
    const dialog = shownDialog(asked);
    await made.storage.addBlock(made.gateway.guildId, ALICE, {
      id: BOB,
      name: 'Bob',
      at: Date.now(),
    });
    const submit = await made.handle(
      fakeModal({
        customId: dialog.custom_id,
        form: dialog,
        picked: { end: 'next' },
        userId: ALICE,
        channelId: WEST_CHANNEL,
      }),
    );
    expect(told(submit)).toBe(MAX_PIN_BLOCKED);
    expect(made.store.active()).toEqual([]);
  });
});
