import { metresBetween } from '@pine/wayspot-core/distance';
import { ApplicationCommandOptionType, PermissionFlagsBits } from 'discord.js';
import { describe, expect, it, vi } from 'vitest';
import { answerOf, buttonId, buttonsOf, said } from '../../../test/support/gym-commands.js';
import {
  fakeAutocomplete,
  fakeButton,
  fakeChatInput,
  fakeMessage,
  fakeModal,
  fakeSelect,
  asV2,
  FAKE_GUILD_ID,
  type FakeInteraction,
  type FakeOptions,
} from '../../../test/support/fake-interactions.js';
import { FakePartyGateway } from '../../../test/support/fake-gateway.js';
import {
  boardedRegions,
  EAST_FORUM,
  UNBOUNDED_CHANNEL,
  WEST_CHANNEL,
  WEST_FORUM,
} from '../../../test/support/gyms.js';
import { regionsFixture } from '../../../test/support/providers.js';
import { selectsOf, textDisplays } from '../../../test/support/messages.js';
import { expectV2Sendable } from '../../../test/support/post-limits.js';
import { renderSubcommandHelp } from '../util/help-render.js';
import { distanceWords } from '../../render/distance-words.js';
import { dialogField, dialogText, shownDialog } from '../../../test/support/dialogs.js';
import { pageTask, pikachuTask, researchTasksFixture } from '../../../test/support/research.js';
import { MemoryStopReports, fixtureRewardHash } from '../../../test/support/stop-reports.js';
import { createTestContext } from '../../../test/support/test-context.js';
import { keptRow, wayspotId } from '../../../test/support/wayspot-cases.js';
import { wayspotsWith } from '../../../test/support/wayspots.js';
import type { WayspotRow } from '../../domain/wayspots/kept.js';
import { taskKeyOf, type ResearchTask, type TaskReward } from '../../domain/research/task.js';
import { DIALOG_READ_MS, SLOW_READ } from '../../discord/dialog.js';
import { InteractionRouter } from '../../discord/router.js';
import { Throttles } from '../../discord/throttle.js';
import { StopReportService } from '../../services/stop-reports.js';
import {
  noStopAtPin,
  NO_STOPS_HERE,
  NOT_A_STOP,
  PICK_THE_REWARD,
  readTask,
  RESEARCH_FROM_A_REGION,
  TASK_LIST_CHANGED,
} from './research-input.js';
import { Rehearsal } from '../../services/rehearsal.js';
import { ListChanged } from '../../discord/errors.js';
import { stopsByKey } from './research-report.js';
import {
  NOT_YOUR_REPORT,
  PERIOD_ENDED,
  REPORT_CHANGED,
  REPORT_ENDED,
  research,
  researchControls,
} from './research.js';
import { zonedAt } from '../../../test/support/time.js';

const ASH = '200000000000000061';
const MISTY = '200000000000000062';
const DRAGON = pageTask('Catch a Dragon-type Pokémon');

/** Stops in West: two side by side, one a kilometer north, one beyond 2 km; a power spot. */
const STOPS: WayspotRow[] = [
  keptRow(1, { title: 'Yellow Mural', lat: 40.06, lon: -80.06, address: null }),
  keptRow(2, { title: 'Paititi Inti', lat: 40.061, lon: -80.06, address: null }),
  keptRow(3, { title: 'Little Bench', lat: 40.07, lon: -80.06, address: null }),
  keptRow(4, { title: 'Far Stop', lat: 40.09, lon: -80.06, address: null }),
  keptRow(5, { title: 'Library Garden', kind: 'powerspot', lat: 40.0502, lon: -80.0502 }),
];

async function setup(rows: readonly WayspotRow[] = STOPS) {
  const { wayspots } = await wayspotsWith(rows);
  const store = new MemoryStopReports();
  // West and East with their boards recorded, as after `/admin setup-forums` (plan 8R-9).
  const { ctx } = createTestContext({ wayspots, regions: regionsFixture(boardedRegions()) });
  // How a member stands to a region's forum, which a report at its stops asks (plan 8Z-2).
  const gateway = new FakePartyGateway();
  gateway.addForum(WEST_FORUM);
  gateway.addForum(EAST_FORUM);
  Object.assign(ctx, {
    stopReports: new StopReportService({
      rewardHash: fixtureRewardHash,
      store,
      events: ctx.raidEvents,
      zone: ctx.config.settings.timezone,
      log: ctx.log,
    }),
    partyService: {
      memberAccess: (forumId: string, memberId: string) => gateway.memberAccess(forumId, memberId),
    },
  });
  await ctx.placeFinder.built();
  const throttles = new Throttles();
  const router = new InteractionRouter(ctx, [research], [researchControls], { throttles });
  const as = (userId: string): FakeOptions => ({
    userId,
    displayName: userId === ASH ? 'Ash' : 'Misty',
    channelId: WEST_CHANNEL,
    guildId: FAKE_GUILD_ID,
  });
  const handled = async (interaction: FakeInteraction) => {
    await router.handle(interaction as never);
    return interaction;
  };
  return {
    ctx,
    gateway,
    store,
    throttles,
    report: (options: Record<string, string>, extra: FakeOptions = {}) =>
      handled(
        fakeChatInput({
          commandName: 'research',
          subcommand: 'report',
          options,
          ...as(ASH),
          ...extra,
        }),
      ),
    remove: (stop: string, extra: FakeOptions = {}) =>
      handled(
        fakeChatInput({
          commandName: 'research',
          subcommand: 'remove',
          options: { stop },
          ...as(ASH),
          ...extra,
        }),
      ),
    press: (customId: string, extra: FakeOptions = {}) =>
      handled(
        fakeButton({ customId, v2Message: true, ephemeralMessage: true, ...as(ASH), ...extra }),
      ),
    pick: (customId: string, values: string[], extra: FakeOptions = {}) =>
      handled(
        fakeSelect({
          customId,
          values,
          v2Message: true,
          ephemeralMessage: true,
          ...as(ASH),
          ...extra,
        }),
      ),
    submit: (
      dialog: { custom_id: string },
      checked: Record<string, string[]>,
      extra: FakeOptions = {},
    ) =>
      handled(
        fakeModal({ customId: dialog.custom_id, form: dialog, checked, ...as(ASH), ...extra }),
      ),
    typing: (focusedName: string, focused: string, options: Record<string, string> = {}) =>
      handled(
        fakeAutocomplete({
          commandName: 'research',
          subcommand: 'report',
          focusedName,
          focused,
          options,
          ...as(ASH),
        }),
      ),
    as,
    handled,
  };
}

const stop = (n: number): string => `stop:${wayspotId(n)}`;

/** Misty reports Catch 7 Pokémon at stop 1, replacing what stands there as if she ticked it. */
async function replaceAsMisty(made: Awaited<ReturnType<typeof setup>>): Promise<void> {
  const there = await made.ctx.stopReports.at(FAKE_GUILD_ID, wayspotId(1));
  const task = pageTask('Catch 7 Pokémon');
  await made.ctx.stopReports.reportResearch({
    serverId: FAKE_GUILD_ID,
    stops: [there!.stop],
    subject: {
      subjectKey: task.key,
      research: { text: task.text, category: task.category, rewards: task.rewards, typed: false },
    },
    reporter: { id: MISTY, name: 'Misty' },
    replacing: [there!.id],
  });
}

describe('/research report', () => {
  it('reports a task at the stops named, privately, with more stops to offer and Take back', async () => {
    const made = await setup();
    const answer = answerOf(
      await made.report({ task: DRAGON.key, stop: stop(1), stop2: 'paititi inti' }),
    );
    expect(said(answer)).toContain('### Field research reported');
    expect(said(answer)).toContain(
      // The task's key alone is its "one of": its encounters only (plan 8R-5).
      '**Catch a Dragon-type Pokémon** · one of Dratini, Bagon, Axew',
    );
    expect(said(answer)).toContain('- **Yellow Mural**\n- **Paititi Inti**');
    expect(said(answer)).toContain(
      `-# In "Today’s Stops" on the board of <#${WEST_CHANNEL}>, until midnight.`,
    );
    // Within 2 km and without the task: Little Bench, not Far Stop nor the power spot.
    const [menu] = selectsOf(asV2(answer));
    expect(menu?.placeholder).toBe('Same task at more stops…');
    expect(menu?.options.map((option) => option.label)).toEqual(['Little Bench']);
    expect(buttonsOf(answer).map(([label]) => label)).toEqual(['Take back (2 stops)']);
    const kept = [...made.store.rows.values()];
    expect(kept.map((one) => [one.stop.name, one.subjectKey, one.reporter])).toEqual([
      ['Yellow Mural', DRAGON.key, { id: ASH, name: 'Ash' }],
      ['Paititi Inti', DRAGON.key, { id: ASH, name: 'Ash' }],
    ]);
  });

  it('says what a report replaced', async () => {
    const made = await setup();
    await made.report({ task: pageTask('Catch 7 Pokémon').key, stop: stop(1) });
    // The reporter's own report is corrected without asking (plan 8R-5).
    const answer = answerOf(await made.report({ task: DRAGON.key, stop: stop(1) }));
    expect(said(answer)).toContain('- **Yellow Mural** (was: Catch 7 Pokémon)');
    expect(made.store.rows.size).toBe(1);
  });

  it('takes a task typed in full, with its reward, and its text as typed', async () => {
    const made = await setup();
    const answer = answerOf(
      await made.report({
        task: 'Win 3 raids in the rain http://x.test',
        stop: stop(1),
        reward: 'rare candy',
      }),
    );
    expect(said(answer)).toContain('**Win 3 raids in the rain http:\u200B//x.test** · Rare Candy');
    expect([...made.store.rows.values()][0]).toMatchObject({
      research: {
        text: 'Win 3 raids in the rain http://x.test',
        category: null,
        rewards: [
          { kind: 'item', item: 'rare-candy', name: 'Rare Candy', quantity: 0, image: null },
        ],
        typed: true,
      },
    });
  });

  it('refuses before counting: no region, no stops, a task gone from the list, no stop', async () => {
    const made = await setup();
    const refused = async (options: Record<string, string>, extra: FakeOptions = {}) =>
      said(answerOf(await made.report(options, extra)));
    expect(
      await refused({ task: DRAGON.key, stop: stop(1) }, { channelId: UNBOUNDED_CHANNEL }),
    ).toBe(RESEARCH_FROM_A_REGION);
    expect(await refused({ task: '0123456789abcdef', stop: stop(1) })).toBe(TASK_LIST_CHANGED);
    expect(await refused({ task: DRAGON.key, stop: `powerspot:${wayspotId(5)}` })).toBe(NOT_A_STOP);
    expect(await refused({ task: DRAGON.key, stop: '40.03, -80.09' })).toBe(noStopAtPin('metric'));
    expect(made.store.rows.size).toBe(0);
    // Nothing counted: the limit is all there.
    // Each a correction of the one before (plan 8R-5: the same task again is reported already).
    const tasks = [DRAGON.key, pageTask('Catch 7 Pokémon').key];
    for (let n = 0; n < 10; n++) await made.report({ task: tasks[n % 2] ?? '', stop: stop(1) });
    expect(said(answerOf(await made.report({ task: DRAGON.key, stop: stop(1) })))).toMatch(
      /^You can use \/research report again in/,
    );

    const empty = await setup([]);
    expect(said(answerOf(await empty.report({ task: DRAGON.key, stop: 'mural' })))).toBe(
      NO_STOPS_HERE,
    );
  });

  // Plan 8Z-2 (the audit's W7): the rule the map's routes ask (`stopReportBarred`).
  it('refuses a member kept out of the region of one of its stops, before counting, and the menu’s more stops', async () => {
    const made = await setup();
    made.ctx.config.settings.research.throttle.uses = 2;
    // Reported while they were let in: the answer offers the same task at more stops.
    const answer = answerOf(await made.report({ task: DRAGON.key, stop: stop(1) }));
    const [menu] = selectsOf(asV2(answer));
    made.gateway.barred.set(WEST_FORUM, new Set([ASH]));
    const keptOut = 'You cannot report at Paititi Inti: you are kept out of its region.';
    for (let use = 0; use < 3; use++) {
      const refused = await made.report({ task: pageTask('Catch 7 Pokémon').key, stop: stop(2) });
      expect(said(answerOf(refused))).toBe(keptOut);
    }
    const picked = await made.pick(menu?.customId ?? '', [wayspotId(3)]);
    expect(said(answerOf(picked))).toBe(
      'You cannot report at Little Bench: you are kept out of its region.',
    );
    expect([...made.store.rows.values()].map((one) => one.stop.name)).toEqual(['Yellow Mural']);
    // Somebody the forum is only hidden from reports as before; nor is an administrator asked.
    made.gateway.shutOut(WEST_FORUM, MISTY);
    const hidden = await made.report({ task: DRAGON.key, stop: stop(2) }, made.as(MISTY));
    expect(said(answerOf(hidden))).toContain('### Field research reported');
    made.gateway.failing.set('memberAccess', new Error('not asked of an administrator'));
    const admin = await made.report(
      { task: DRAGON.key, stop: stop(3) },
      { memberPermissions: PermissionFlagsBits.Administrator },
    );
    expect(said(answerOf(admin))).toContain('### Field research reported');
    // While Discord cannot say, nobody else reports.
    const away = await made.report({ task: DRAGON.key, stop: stop(4) }, made.as(MISTY));
    expect(said(answerOf(away))).toBe(
      'I could not check with Discord just now whether you may do that. Try again in a moment.',
    );
    made.ctx.config.settings.research.throttle.uses = 10;
  });

  it('names the stop nearest to a pin, within 50 meters', async () => {
    const made = await setup();
    await made.report({ task: DRAGON.key, stop: '40.0601, -80.0601' });
    expect([...made.store.rows.values()].map((one) => one.stop.name)).toEqual(['Yellow Mural']);
  });

  it('offers the period’s tasks by their text and by their rewards’ names', async () => {
    const made = await setup();
    const choices = (await made.typing('task', 'dratini')).respond.mock.calls[0]?.[0] as {
      name: string;
      value: string;
    }[];
    // A choice per version that holds Dratini (plan 8R-5), in the list's order.
    expect(choices.map((choice) => choice.name)).toEqual([
      'Catch a Dragon-type Pokémon · Dratini',
      'Catch a Dragon-type Pokémon · one of Dratini, Bagon, Axew',
      'Make 2 Excellent Throws · Dratini',
    ]);
    expect(choices[1]?.value).toBe(DRAGON.key);
    const stops = (await made.typing('stop2', 'mural')).respond.mock.calls[0]?.[0];
    expect(stops?.map((one) => one.value)).toEqual([stop(1)]);
  });
});

describe('/research report: nearby stops first (Matt, 2026-10-27)', () => {
  type Choices = { name: string; value: string }[];
  const offered = async (
    made: Awaited<ReturnType<typeof setup>>,
    focusedName: string,
    focused: string,
    options: Record<string, string>,
  ) =>
    ((await made.typing(focusedName, focused, options)).respond.mock.calls[0]?.[0] ??
      []) as Choices;
  const away = (a: number, b: number): string =>
    distanceWords(metresBetween(STOPS[a - 1]!, STOPS[b - 1]!), 'metric');

  it('lists the PokéStops within 2 km of the stops named, nearest first, without those', async () => {
    const made = await setup();
    // Far Stop lies beyond 2 km, the Power Spot is none; Yellow Mural is named already.
    expect(await offered(made, 'stop2', '', { stop: stop(1) })).toEqual([
      {
        name: `Paititi Inti (PokéStop) · near Old Stone Fountain · ${away(2, 1)}`,
        value: stop(2),
      },
      { name: `Little Bench (PokéStop) · near St. Mary's Church · ${away(3, 1)}`, value: stop(3) },
    ]);
    // Each from the nearest stop named: Far Stop has none within 2 km, Yellow Mural two.
    expect(await offered(made, 'stop2', '', { stop: stop(4), stop3: stop(1) })).toEqual([
      {
        name: `Paititi Inti (PokéStop) · near Old Stone Fountain · ${away(2, 1)}`,
        value: stop(2),
      },
      { name: `Little Bench (PokéStop) · near St. Mary's Church · ${away(3, 1)}`, value: stop(3) },
    ]);
    // `stop:` changed after the others has them as its anchors.
    expect((await offered(made, 'stop', '', { stop2: stop(3) })).map((one) => one.value)).toEqual([
      stop(2),
      stop(1),
    ]);
  });

  it('says the distances in the settings’ units, feet where they are imperial', async () => {
    const made = await setup();
    Object.assign(made.ctx, {
      config: {
        ...made.ctx.config,
        settings: { ...made.ctx.config.settings, distanceUnits: 'imperial' },
      },
    });
    const names = (await offered(made, 'stop2', '', { stop: stop(1) })).map((one) => one.name);
    const imperial = (a: number, b: number): string =>
      distanceWords(metresBetween(STOPS[a - 1]!, STOPS[b - 1]!), 'imperial');
    expect(names).toEqual([
      `Paititi Inti (PokéStop) · near Old Stone Fountain · ${imperial(2, 1)}`,
      `Little Bench (PokéStop) · near St. Mary's Church · ${imperial(3, 1)}`,
    ]);
    expect(names[0]).toMatch(/ ft$/u);
  });

  it('lists nothing while no other stop is a choice of the list', async () => {
    const made = await setup();
    expect(await offered(made, 'stop2', '', {})).toEqual([]);
    // Typed text and a value of no stop are no anchor.
    expect(await offered(made, 'stop2', '', { stop: 'yellow mural' })).toEqual([]);
    expect(await offered(made, 'stop2', '', { stop: 'stop:abc.16' })).toEqual([]);
  });

  it('offers the nearer of stops that fit alike first', async () => {
    const made = await setup([
      ...STOPS,
      keptRow(6, { title: 'East Garden', lat: 40.095, lon: -80.06, address: null }),
      keptRow(7, { title: 'West Garden', lat: 40.062, lon: -80.06, address: null }),
    ]);
    const titles = async (options: Record<string, string>) =>
      (await offered(made, 'stop2', 'garden', options)).map((one) => one.name.split(' (')[0]);
    expect(await titles({})).toEqual(['East Garden', 'West Garden']);
    expect(await titles({ stop: stop(1) })).toEqual(['West Garden', 'East Garden']);
    expect(await titles({ stop: stop(4) })).toEqual(['East Garden', 'West Garden']);
  });
});

describe('the controls of /research report’s answer', () => {
  it('reports the same task at more stops, counted in /research report’s window', async () => {
    const made = await setup();
    made.ctx.config.settings.research.throttle.uses = 2;
    const answer = answerOf(await made.report({ task: DRAGON.key, stop: stop(1) }));
    const [menu] = selectsOf(asV2(answer));
    const picked = await made.pick(menu?.customId ?? '', [wayspotId(3)]);
    expect(said(answerOf(picked))).toContain('### Also reported');
    expect(said(answerOf(picked))).toContain('- **Little Bench**');
    expect([...made.store.rows.values()].map((one) => one.stop.name)).toEqual([
      'Yellow Mural',
      'Little Bench',
    ]);
    // Two uses of two: the menu again is refused in the command's words.
    const again = await made.pick(menu?.customId ?? '', [wayspotId(2)]);
    expect(said(answerOf(again))).toMatch(/^You can use \/research report again in/);
    made.ctx.config.settings.research.throttle.uses = 10;
  });

  it('gives the menu’s use back where its stops were all reported already meanwhile (plan 8R-6)', async () => {
    const made = await setup();
    made.ctx.config.settings.research.throttle.uses = 2;
    try {
      const answer = answerOf(await made.report({ task: DRAGON.key, stop: stop(1) }));
      const [menu] = selectsOf(asV2(answer));
      // Misty reports the same task at the stop the menu offers, before Ash picks it.
      await made.report({ task: DRAGON.key, stop: stop(3) }, made.as(MISTY));
      const picked = await made.pick(menu?.customId ?? '', [wayspotId(3)]);
      expect(said(answerOf(picked))).toMatch(/^Already reported:/);
      // Ash's second use is still there.
      expect(said(answerOf(await made.report({ task: DRAGON.key, stop: stop(2) })))).toContain(
        '### Field research reported',
      );
      expect(said(answerOf(await made.report({ task: DRAGON.key, stop: stop(2) })))).toMatch(
        /^You can use \/research report again in/,
      );
    } finally {
      made.ctx.config.settings.research.throttle.uses = 10;
    }
  });

  it('acts on nothing of a report replaced since, and gives the menu’s use back (A1, B11)', async () => {
    const made = await setup();
    made.ctx.config.settings.research.throttle.uses = 2;
    const first = answerOf(await made.report({ task: DRAGON.key, stop: stop(1) }));
    await replaceAsMisty(made);
    const [menu] = selectsOf(asV2(first));
    // A menu of before plan 8R-5, without the version it reports (R14), reports its first one's.
    const before = (menu?.customId ?? '').split(':').slice(0, 3).join(':');
    expect(said(answerOf(await made.pick(before, [wayspotId(3)])))).toBe(REPORT_ENDED);
    const taken = answerOf(await made.press(buttonId(first, 'Take back')));
    expect(said(taken)).toBe(
      'There was nothing left to take back: the report has ended, was taken back, or was replaced by a newer one.',
    );
    // Misty's report stands, and Ash's second use is still there: the menu's was given back.
    expect([...made.store.rows.values()].map((one) => one.reporter.name)).toEqual(['Misty']);
    expect(said(answerOf(await made.report({ task: DRAGON.key, stop: stop(2) })))).toContain(
      '### Field research reported',
    );
    made.ctx.config.settings.research.throttle.uses = 10;
  });

  it('takes back every stop of the answer', async () => {
    const made = await setup();
    const answer = answerOf(await made.report({ task: DRAGON.key, stop: stop(1), stop2: stop(2) }));
    const taken = answerOf(await made.press(buttonId(answer, 'Take back (2 stops)')));
    expect(said(taken)).toBe(
      'Took back **Catch a Dragon-type Pokémon** at **Yellow Mural**, **Paititi Inti**.',
    );
    expect(made.store.rows.size).toBe(0);
  });
});

describe('/research remove', () => {
  it('takes back one’s own report at a stop, another’s only as staff', async () => {
    const made = await setup();
    await made.report({ task: DRAGON.key, stop: stop(1) });
    expect(said(answerOf(await made.remove(stop(1), made.as(MISTY))))).toBe(NOT_YOUR_REPORT);
    expect(made.store.rows.size).toBe(1);
    expect(
      answerOf(await made.remove(stop(1), { ...made.as(MISTY), roleNames: ['Moderator'] })).content,
    ).toBe('Took back **Catch a Dragon-type Pokémon** at **Yellow Mural**.');
    expect(made.store.rows.size).toBe(0);
    expect(said(answerOf(await made.remove(stop(1))))).toBe(
      'No field research is reported at that PokéStop now.',
    );
  });

  it('takes back nothing of a report replaced while it read the stop (A1)', async () => {
    const made = await setup();
    await made.report({ task: DRAGON.key, stop: stop(1) });
    const read = await made.ctx.stopReports.at(FAKE_GUILD_ID, wayspotId(1));
    // Misty replaces it between the read and the taking back.
    await replaceAsMisty(made);
    made.ctx.stopReports.at = () => Promise.resolve(read);
    expect(said(answerOf(await made.remove(stop(1))))).toBe(REPORT_CHANGED);
    expect([...made.store.rows.values()].map((one) => one.reporter.name)).toEqual(['Misty']);
  });
});

describe('/research in rehearsal mode', () => {
  it('names no post of the stops in its answer: rehearsal mode makes none (B10)', async () => {
    const made = await setup();
    Object.assign(made.ctx, {
      rehearsal: new Rehearsal({ allowlist: [ASH], regions: ['west'], staffRoles: [] }),
    });
    const answer = answerOf(await made.report({ task: DRAGON.key, stop: stop(1) }));
    expect(said(answer)).not.toContain('Today’s Stops');
    expect(said(answer)).toContain('-# It lasts until midnight.');
  });
});

describe('/research report and the versions of a task (plan 8R-5)', () => {
  const THROWS = pageTask('Make 3 Excellent Throws in a row');
  const version = (label: string): string => {
    const found = researchTasksFixture()
      .versions(THROWS)
      .find((one) => one.label === label);
    if (!found) throw new Error(`no version ${label}`);
    return found.value;
  };
  const GIBLE = version('Gible');
  const BELDUM = version('Beldum');
  type Choices = { name: string; value: string }[];

  it('offers a choice per version, the typed words found across the task and its reward', async () => {
    const made = await setup();
    const choices = (await made.typing('task', 'excellent gible')).respond.mock
      .calls[0]?.[0] as Choices;
    expect(choices).toEqual([
      { name: 'Make 3 Excellent Throws in a row · Gible', value: GIBLE },
      // "One of" with the reward typed first (R12).
      {
        name: 'Make 3 Excellent Throws in a row · one of Gible, Larvitar, Beldum',
        value: THROWS.key,
      },
    ]);
  });

  it('finds the "one of" choices by "one of" (plan 8R-6, the staging’s finding 6)', async () => {
    const made = await setup();
    const choices = (await made.typing('task', 'one of')).respond.mock.calls[0]?.[0] as Choices;
    expect(choices.length).toBeGreaterThan(1);
    for (const choice of choices) expect(choice.name).toContain(' · one of ');
    expect(choices).toContainEqual({
      name: 'Make 3 Excellent Throws in a row · one of Larvitar, Beldum, Gible',
      value: THROWS.key,
    });
    const narrowed = (await made.typing('task', 'one of beldum excellent')).respond.mock
      .calls[0]?.[0] as Choices;
    expect(narrowed).toEqual([
      {
        name: 'Make 3 Excellent Throws in a row · one of Beldum, Larvitar, Gible',
        value: THROWS.key,
      },
    ]);
  });

  it('reads the version a choice, a key or a text with its reward names (R2)', () => {
    const { ctx } = createTestContext();
    const subject = (task: string, reward: string | null = null) =>
      readTask(ctx, task, reward).subjectKey;
    expect(subject(GIBLE)).toBe(GIBLE);
    expect(subject(THROWS.key, 'gible')).toBe(GIBLE);
    expect(subject('make 3 excellent throws in a row', 'Gible')).toBe(GIBLE);
    // Without a reward: "one of" of a task of encounters, the only reward of a task of one.
    expect(subject(THROWS.key)).toBe(THROWS.key);
    const dratini = pageTask('Make 2 Excellent Throws');
    expect(subject(dratini.key)).toMatch(new RegExp(`^${dratini.key}:[0-9a-f]{8}$`));
    // A task of items asks which; a reward it does not give is refused.
    expect(() => subject(pageTask('Catch a Ditto').key)).toThrow(PICK_THE_REWARD);
    expect(() => subject(THROWS.key, 'rare candy')).toThrow(
      'Make 3 Excellent Throws in a row does not give Rare Candy: pick the reward from the list.',
    );
    expect(() => subject(`${THROWS.key}:00000000`)).toThrow(TASK_LIST_CHANGED);
    // Known by its kind, not its words (review F8): the map asks for its lists again.
    expect(() => subject(`${THROWS.key}:00000000`)).toThrow(ListChanged);
    expect(() => subject('0123456789abcdef')).toThrow(ListChanged);
    // A typed task with its reward is a version of it (R11).
    expect(subject('Win 3 raids in the rain', 'rare candy')).toMatch(
      /^typed:[0-9a-f]{16}:[0-9a-f]{8}$/,
    );
  });

  it('says what "one of" it narrowed', async () => {
    const made = await setup();
    await made.report({ task: THROWS.key, stop: stop(1) }, made.as(MISTY));
    const answer = answerOf(await made.report({ task: GIBLE, stop: stop(1) }));
    expect(said(answer)).toContain('**Make 3 Excellent Throws in a row** · Gible');
    expect(said(answer)).toContain('- **Yellow Mural** (was: one of Larvitar, Beldum, Gible)');
  });

  it('answers a version that stands already with its post, and nothing to take back', async () => {
    const made = await setup();
    Object.assign(made.ctx, {
      stopPostLinks: {
        linkOf: () => ({ channelId: '300000000000000099', messageId: '300000000000000077' }),
      },
    });
    await made.report({ task: GIBLE, stop: stop(1) }, made.as(MISTY));
    const answer = answerOf(await made.report({ task: THROWS.key, stop: stop(1) }));
    expect(said(answer)).toMatch(
      /^Already reported: \*\*Make 3 Excellent Throws in a row\*\* · Gible at \*\*Yellow Mural\*\*, by \*\*Misty\*\* <t:\d+:R>\. https:\/\/discord\.com\/channels\/\d+\/300000000000000099\/300000000000000077$/,
    );
    expect(buttonsOf(answer)).toEqual([]);
    expect(selectsOf(asV2(answer))).toEqual([]);
    // Beside a stop reported now: the answer as before, the stop reported already said apart.
    const mixed = answerOf(await made.report({ task: GIBLE, stop: stop(1), stop2: stop(2) }));
    expect(said(mixed)).toContain('- **Paititi Inti**\nAlready reported:');
    expect(buttonsOf(mixed).map(([label]) => label)).toEqual(['Take back']);
  });

  it('asks before contradicting another’s report, replacing only the stops ticked (R7)', async () => {
    const made = await setup();
    await made.report({ task: GIBLE, stop: stop(1), stop2: stop(2) }, made.as(MISTY));
    const asked = await made.report({
      task: BELDUM,
      stop: stop(1),
      stop2: stop(2),
      stop3: stop(3),
    });
    const dialog = shownDialog(asked);
    expect(dialog.title).toBe('Replace field research?');
    expect(dialogText(dialog)).toContain('**Make 3 Excellent Throws in a row** · Beldum');
    expect(dialogText(dialog)).toContain('at stops you named');
    // Little Bench has no contest: Submit reports it too (review L4).
    expect(dialogText(dialog)).toContain('Submit reports at the other stops as well.');
    const field = dialogField(dialog, 'Replace the report at');
    expect(field.kind).toBe('group');
    expect(field.options?.map((option) => [option.label, option.ticked])).toEqual([
      ['Yellow Mural', false],
      ['Paititi Inti', false],
    ]);
    expect(field.options?.[0]?.description).toMatch(
      /^Make 3 Excellent Throws in a row · Gible, by Misty at \d{1,2}:\d{2} [AP]M$/,
    );
    // Nothing reported before the Submit (Cancel reports nothing).
    expect(made.store.rows.size).toBe(2);
    const [first] = [...made.store.rows.values()];
    const submitted = await made.submit(dialog, { [field.id]: [String(first?.id)] });
    const answer = said(answerOf(submitted));
    expect(answer).toContain('- **Yellow Mural** (was: Gible)\n- **Little Bench**');
    expect(answer).toContain(
      'Already reported: **Make 3 Excellent Throws in a row** · Gible at **Paititi Inti**',
    );
    expect(
      [...made.store.rows.values()].map((one) => [
        one.stop.name,
        one.subjectKey,
        one.reporter.name,
      ]),
    ).toEqual([
      ['Paititi Inti', GIBLE, 'Misty'],
      ['Yellow Mural', BELDUM, 'Ash'],
      ['Little Bench', BELDUM, 'Ash'],
    ]);
  });

  it('gives back the use of a Submit that reports nothing: every contest left unticked, the rest reported already (plan 8R-6)', async () => {
    const made = await setup();
    made.ctx.config.settings.research.throttle.uses = 2;
    try {
      await made.report({ task: BELDUM, stop: stop(1) }, made.as(MISTY));
      await made.report({ task: GIBLE, stop: stop(2) }, made.as(MISTY));
      const dialog = shownDialog(await made.report({ task: GIBLE, stop: stop(1), stop2: stop(2) }));
      const answer = said(answerOf(await made.submit(dialog, {})));
      expect(answer).toMatch(/^Already reported: \*\*Make 3 Excellent Throws in a row\*\* · Gible/);
      expect(answer).not.toContain('### Field research reported');
      expect([...made.store.rows.values()].map((one) => one.reporter.name)).toEqual([
        'Misty',
        'Misty',
      ]);
      // The dialog's use went back: two more reports are taken, a third is not.
      for (const task of [GIBLE, BELDUM]) {
        expect(said(answerOf(await made.report({ task, stop: stop(3) })))).toContain(
          '### Field research reported',
        );
      }
      expect(said(answerOf(await made.report({ task: GIBLE, stop: stop(3) })))).toMatch(
        /^You can use \/research report again in/,
      );
    } finally {
      made.ctx.config.settings.research.throttle.uses = 10;
    }
  });

  it('reports the same version at more stops, also once the first was narrowed (R14)', async () => {
    const made = await setup();
    // Gible stands at Paititi Inti: the "one of" of its task is not offered there (R8).
    await made.report({ task: GIBLE, stop: stop(2) }, made.as(MISTY));
    const answer = answerOf(await made.report({ task: THROWS.key, stop: stop(1) }));
    const [menu] = selectsOf(asV2(answer));
    expect(menu?.options.map((option) => option.label)).toEqual(['Little Bench']);
    // Misty narrows Yellow Mural meanwhile: the menu still reports "one of".
    await made.report({ task: GIBLE, stop: stop(1) }, made.as(MISTY));
    const picked = said(answerOf(await made.pick(menu?.customId ?? '', [wayspotId(3)])));
    expect(picked).toContain('### Also reported');
    expect(
      [...made.store.rows.values()].find((one) => one.stop.name === 'Little Bench')?.subjectKey,
    ).toBe(THROWS.key);
  });

  it('reports the version of a menu whose first report was taken back, in its period', async () => {
    const made = await setup();
    const answer = answerOf(await made.report({ task: GIBLE, stop: stop(1) }));
    await made.press(buttonId(answer, 'Take back'));
    const [menu] = selectsOf(asV2(answer));
    const picked = said(answerOf(await made.pick(menu?.customId ?? '', [wayspotId(3)])));
    expect(picked).toContain('### Also reported');
    expect([...made.store.rows.values()].map((one) => [one.stop.name, one.subjectKey])).toEqual([
      ['Little Bench', GIBLE],
    ]);
  });

  it('reports nothing into a new period from a menu whose first report is gone (review L1)', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      const made = await setup();
      const zone = made.ctx.config.settings.timezone;
      vi.setSystemTime(zonedAt('2026-11-21T23:50', zone));
      const answer = answerOf(await made.report({ task: GIBLE, stop: stop(1) }));
      const shownAt = Date.now();
      await made.press(buttonId(answer, 'Take back'));
      vi.setSystemTime(zonedAt('2026-11-22T00:10', zone));
      const [menu] = selectsOf(asV2(answer));
      const picked = await made.pick(menu?.customId ?? '', [wayspotId(3)], {
        message: { ...fakeMessage([]), createdTimestamp: shownAt },
      });
      expect(said(answerOf(picked))).toBe(REPORT_ENDED);
      expect(made.store.rows.size).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('asks from the menu too, and its Submit answers "Also reported" (review L4, L10)', async () => {
    const made = await setup();
    await made.report({ task: BELDUM, stop: stop(3) }, made.as(MISTY));
    const answer = answerOf(await made.report({ task: GIBLE, stop: stop(1) }));
    const [menu] = selectsOf(asV2(answer));
    // Only the contested stop picked: nothing is said of other stops.
    const alone = shownDialog(await made.pick(menu?.customId ?? '', [wayspotId(3)]));
    expect(dialogText(alone)).toContain('at a stop you picked');
    expect(dialogText(alone)).not.toContain('other stops');
    const asked = shownDialog(await made.pick(menu?.customId ?? '', [wayspotId(3), wayspotId(2)]));
    expect(dialogText(asked)).toContain('Submit reports at the other stops as well.');
    const field = dialogField(asked, 'Replace the report at');
    const [beldum] = [...made.store.rows.values()];
    const submitted = said(
      answerOf(await made.submit(asked, { [field.id]: [String(beldum?.id)] })),
    );
    expect(submitted).toContain('### Also reported');
    expect(submitted).toContain('- **Little Bench** (was: Beldum)\n- **Paititi Inti**');
  });

  it('answers a dialog’s Submit that is another’s, or answered already', async () => {
    const made = await setup();
    await made.report({ task: BELDUM, stop: stop(1) }, made.as(MISTY));
    const dialog = shownDialog(await made.report({ task: GIBLE, stop: stop(1) }));
    expect(said(answerOf(await made.submit(dialog, {}, made.as(MISTY))))).toBe(
      'That is somebody else’s report.',
    );
    await made.submit(dialog, {});
    expect(said(answerOf(await made.submit(dialog, {})))).toBe(
      'That question has expired. Use `/research report` again.',
    );
  });

  it('opens no dialog after Discord’s three seconds, and gives the use back', async () => {
    const made = await setup();
    made.ctx.config.settings.research.throttle.uses = 1;
    try {
      await made.report({ task: BELDUM, stop: stop(1) }, made.as(MISTY));
      const late = await made.report(
        { task: GIBLE, stop: stop(1) },
        { createdTimestamp: Date.now() - DIALOG_READ_MS - 100 },
      );
      expect(late.showModal).not.toHaveBeenCalled();
      expect(said(answerOf(late))).toBe(SLOW_READ);
      // The use was given back: the next one is not refused by the limit.
      expect(said(answerOf(await made.report({ task: GIBLE, stop: stop(2) })))).toContain(
        '### Field research reported',
      );
    } finally {
      made.ctx.config.settings.research.throttle.uses = 10;
    }
  });

  /**
   * A pick of the menu made past Discord's budget whose read of the stops' reports comes back
   * only once the press was deferred: the read raced against `DIALOG_READ_MS` (review F1).
   */
  async function slowPick(made: Awaited<ReturnType<typeof setup>>, customId: string) {
    const picked = fakeSelect({
      customId,
      values: [wayspotId(3)],
      v2Message: true,
      ephemeralMessage: true,
      ...made.as(ASH),
      createdTimestamp: Date.now() - DIALOG_READ_MS - 100,
    });
    let deferred = (): void => undefined;
    const isDeferred = new Promise<void>((resolve) => {
      deferred = resolve;
    });
    const defer = picked.deferReply.getMockImplementation();
    picked.deferReply.mockImplementation((payload) => {
      deferred();
      return defer ? defer(payload) : Promise.resolve();
    });
    const { stopReports } = made.ctx;
    const contested = stopReports.contested.bind(stopReports);
    const slow = vi.spyOn(stopReports, 'contested').mockImplementationOnce(async (...args) => {
      await isDeferred;
      return contested(...args);
    });
    try {
      return await made.handled(picked);
    } finally {
      slow.mockRestore();
    }
  }

  it('reports a slow menu’s pick without a contest once deferred (review F1)', async () => {
    const made = await setup();
    const answer = answerOf(await made.report({ task: GIBLE, stop: stop(1) }));
    const [menu] = selectsOf(asV2(answer));
    const picked = await slowPick(made, menu?.customId ?? '');
    expect(picked.deferReply).toHaveBeenCalledTimes(1);
    expect(said(answerOf(picked))).toContain('### Also reported');
    expect([...made.store.rows.values()].map((one) => one.stop.name)).toEqual([
      'Yellow Mural',
      'Little Bench',
    ]);
  });

  it('answers a slow menu’s pick that meets a contest with SLOW_READ, the use given back (review F1)', async () => {
    const made = await setup();
    made.ctx.config.settings.research.throttle.uses = 2;
    try {
      await made.report({ task: BELDUM, stop: stop(3) }, made.as(MISTY));
      const answer = answerOf(await made.report({ task: GIBLE, stop: stop(1) }));
      const [menu] = selectsOf(asV2(answer));
      const picked = await slowPick(made, menu?.customId ?? '');
      expect(picked.showModal).not.toHaveBeenCalled();
      expect(picked.deferReply).toHaveBeenCalledTimes(1);
      expect(said(answerOf(picked))).toBe(SLOW_READ);
      expect(
        [...made.store.rows.values()].map((one) => [one.stop.name, one.reporter.name]),
      ).toEqual([
        ['Little Bench', 'Misty'],
        ['Yellow Mural', 'Ash'],
      ]);
      // The pick's use was given back: Ash's second of two is still there.
      expect(said(answerOf(await made.report({ task: GIBLE, stop: stop(2) })))).toContain(
        '### Field research reported',
      );
    } finally {
      made.ctx.config.settings.research.throttle.uses = 10;
    }
  });

  it('says a contradiction met after the check as reported already, keeping it (call 4)', async () => {
    const made = await setup();
    const { stopReports } = made.ctx;
    // Misty reports Gible at Yellow Mural just after Ash's check found nothing to ask about.
    vi.spyOn(stopReports, 'contested').mockImplementationOnce(async () => {
      const there = await stopsByKey(made.ctx, FAKE_GUILD_ID, [wayspotId(1)]);
      await stopReports.reportResearch({
        serverId: FAKE_GUILD_ID,
        stops: there,
        subject: readTask(made.ctx, GIBLE, null),
        reporter: { id: MISTY, name: 'Misty' },
      });
      return [];
    });
    const answer = answerOf(await made.report({ task: BELDUM, stop: stop(1) }));
    expect(said(answer)).toMatch(
      /^Already reported: \*\*Make 3 Excellent Throws in a row\*\* · Gible at \*\*Yellow Mural\*\*, by \*\*Misty\*\* <t:\d+:R>\.$/,
    );
    expect(buttonsOf(answer)).toEqual([]);
    expect(selectsOf(asV2(answer))).toEqual([]);
    expect(
      [...made.store.rows.values()].map((one) => [
        one.stop.name,
        one.subjectKey,
        one.reporter.name,
      ]),
    ).toEqual([['Yellow Mural', GIBLE, 'Misty']]);
  });

  it('keeps the time whole with the name and the rewards at their longest (review F2)', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      const made = await setup();
      const zone = made.ctx.config.settings.timezone;
      vi.setSystemTime(zonedAt('2026-11-21T10:05', zone));
      const there = await stopsByKey(made.ctx, FAKE_GUILD_ID, [wayspotId(1)]);
      const berry = (name: string): TaskReward => ({
        kind: 'item',
        item: name.toLowerCase().replaceAll(' ', '-'),
        name,
        quantity: 0,
        image: null,
      });
      await made.ctx.stopReports.reportResearch({
        serverId: FAKE_GUILD_ID,
        stops: there,
        subject: {
          subjectKey: DRAGON.key,
          research: {
            text: DRAGON.text,
            category: DRAGON.category,
            rewards: [
              berry('Silver Pinap Berry'),
              berry('Golden Razz Berry'),
              berry('Nanab Berry'),
            ],
            typed: false,
          },
        },
        reporter: { id: MISTY, name: 'Misty of the Cerulean City Gym, Water-type Gym Leader' },
      });
      const dialog = shownDialog(await made.report({ task: GIBLE, stop: stop(1) }));
      const [option] = dialogField(dialog, 'Replace the report at').options ?? [];
      // The name cut to 32 and the rewards to 40; the time whole at the end.
      expect(option?.description).toBe(
        'Catch a… · one of Silver Pinap Berry, Golden Razz…, by Misty of the Cerulean City Gym,… at 10:05 AM',
      );
      expect(option?.description?.length).toBeLessThanOrEqual(100);
    } finally {
      vi.useRealTimers();
    }
  });

  it('refuses a dialog’s Submit once its version left the list, the use given back (review L8)', async () => {
    const made = await setup();
    made.ctx.config.settings.research.throttle.uses = 1;
    try {
      await made.report({ task: BELDUM, stop: stop(1) }, made.as(MISTY));
      const dialog = shownDialog(await made.report({ task: GIBLE, stop: stop(1), stop2: stop(2) }));
      const listed = made.ctx.researchTasks;
      Object.assign(made.ctx, { researchTasks: researchTasksFixture([]) });
      expect(said(answerOf(await made.submit(dialog, {})))).toBe(TASK_LIST_CHANGED);
      expect([...made.store.rows.values()].map((one) => one.stop.name)).toEqual(['Yellow Mural']);
      Object.assign(made.ctx, { researchTasks: listed });
      expect(said(answerOf(await made.report({ task: GIBLE, stop: stop(2) })))).toContain(
        '### Field research reported',
      );
    } finally {
      made.ctx.config.settings.research.throttle.uses = 10;
    }
  });

  it('refuses a dialog’s Submit once its period has ended, the use given back (review W2)', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const made = await setup();
    made.ctx.config.settings.research.throttle.uses = 1;
    try {
      const zone = made.ctx.config.settings.timezone;
      vi.setSystemTime(zonedAt('2026-11-21T23:58', zone));
      await made.report({ task: BELDUM, stop: stop(1) }, made.as(MISTY));
      const dialog = shownDialog(await made.report({ task: GIBLE, stop: stop(1), stop2: stop(2) }));
      vi.setSystemTime(zonedAt('2026-11-22T00:01', zone));
      expect(said(answerOf(await made.submit(dialog, {})))).toBe(PERIOD_ENDED);
      expect([...made.store.rows.values()].map((one) => one.stop.name)).toEqual(['Yellow Mural']);
      expect(said(answerOf(await made.report({ task: GIBLE, stop: stop(2) })))).toContain(
        '### Field research reported',
      );
    } finally {
      made.ctx.config.settings.research.throttle.uses = 10;
      vi.useRealTimers();
    }
  });

  it('asks from a menu of before plan 8R-5 whose task has items only, then reports it (review W5)', async () => {
    const made = await setup();
    const ditto = pageTask('Catch a Ditto');
    expect(ditto.rewards.length).toBeGreaterThan(1);
    expect(ditto.rewards.every((reward) => reward.kind === 'item')).toBe(true);
    // A report of before: the task's key alone, every reward of the task in its detail.
    const [first] = await stopsByKey(made.ctx, FAKE_GUILD_ID, [wayspotId(1)]);
    const base = await made.ctx.stopReports.reportResearch({
      serverId: FAKE_GUILD_ID,
      stops: [first!],
      subject: {
        subjectKey: ditto.key,
        research: {
          text: ditto.text,
          category: ditto.category,
          rewards: ditto.rewards,
          typed: false,
        },
      },
      reporter: { id: ASH, name: 'Ash' },
    });
    const baseId = base.saved[0]?.report.id;
    await made.report({ task: GIBLE, stop: stop(3) }, made.as(MISTY));
    // Its menu carries no version: the first report's is reported.
    const asked = shownDialog(await made.pick(`research:${String(baseId)}:more`, [wayspotId(3)]));
    const field = dialogField(asked, 'Replace the report at');
    const gible = [...made.store.rows.values()].find((one) => one.stop.name === 'Little Bench');
    // A version the list never had is not refused when the list changes (review L8's check).
    Object.assign(made.ctx, { researchTasks: researchTasksFixture([]) });
    const submitted = said(answerOf(await made.submit(asked, { [field.id]: [String(gible?.id)] })));
    expect(submitted).toContain('### Also reported');
    expect(submitted).toContain('- **Little Bench** (was: Make 3 Excellent Throws in a row)');
    expect(
      [...made.store.rows.values()].map((one) => [
        one.stop.name,
        one.subjectKey,
        one.reporter.name,
      ]),
    ).toEqual([
      ['Yellow Mural', ditto.key, 'Ash'],
      ['Little Bench', ditto.key, 'Ash'],
    ]);
  });

  it('keeps who and when in a contested stop’s description, a long name cut (review L3)', async () => {
    const made = await setup();
    await made.report(
      { task: BELDUM, stop: stop(1) },
      { ...made.as(MISTY), displayName: 'Misty of the Cerulean City Gym, Water-type Gym Leader' },
    );
    const dialog = shownDialog(await made.report({ task: GIBLE, stop: stop(1) }));
    const [option] = dialogField(dialog, 'Replace the report at').options ?? [];
    expect(option?.description).toMatch(/, by Misty of the .*… at \d{1,2}:\d{2} [AP]M$/);
    expect(option?.description?.length).toBeLessThanOrEqual(100);
  });

  it('says no "was" where a typed task gets its reward (review L6)', async () => {
    const made = await setup();
    const typed = 'Win 3 raids in the rain';
    await made.report({ task: typed, stop: stop(1) }, made.as(MISTY));
    const answer = said(
      answerOf(await made.report({ task: typed, stop: stop(1), reward: 'rare candy' })),
    );
    expect(answer).toContain('**Win 3 raids in the rain** · Rare Candy\n- **Yellow Mural**\n');
  });

  it('gives back a use that found every stop reported already, and counts one that reports at any (plan 8R-6)', async () => {
    const made = await setup();
    made.ctx.config.settings.research.throttle.uses = 2;
    try {
      await made.report({ task: GIBLE, stop: stop(1) }, made.as(MISTY));
      // Given back as the router gives back: at most as many as the window holds.
      for (let n = 0; n < 2; n++) {
        expect(said(answerOf(await made.report({ task: GIBLE, stop: stop(1) })))).toMatch(
          /^Already reported:/,
        );
      }
      // Reported at one stop, already at the other (review Q8): counted.
      const mixed = said(
        answerOf(await made.report({ task: GIBLE, stop: stop(1), stop2: stop(2) })),
      );
      expect(mixed).toContain('### Field research reported');
      expect(mixed).toContain('Already reported:');
      expect(said(answerOf(await made.report({ task: GIBLE, stop: stop(3) })))).toContain(
        '### Field research reported',
      );
      expect(said(answerOf(await made.report({ task: GIBLE, stop: stop(3) })))).toMatch(
        /^You can use \/research report again in/,
      );
    } finally {
      made.ctx.config.settings.research.throttle.uses = 10;
    }
  });

  it('explains versions, "one of", the question and "Already reported" in its help (review W3)', () => {
    const { ctx } = createTestContext();
    const message = renderSubcommandHelp(research, 'report', ctx.config.settings);
    if (!message) throw new Error('no help');
    expectV2Sendable(message);
    const [details = ''] = textDisplays(message);
    expect(details).toContain('a choice for each of its rewards');
    expect(details).toContain('also "one of", for when you have not done it yet');
    expect(details).toContain('Another member’s report is asked about first');
    expect(details).toContain('or one that says less, is answered "Already reported"');
    // Where the reports show since plan 8R-9: the region's board, and a line for a new task.
    expect(details).toContain('"Today’s Stops" on the region’s board');
    expect(details).toContain('a line in the region’s channel');
    // Open to commands since plan 8R-9F: no longer "locked".
    expect(details).toContain('where you can report too');
    // The radius of the nearby stops in the settings' units (Matt, 2026-10-27).
    expect(details).toContain(
      `the stops within ${distanceWords(2_000, 'metric')} of them, nearest first`,
    );
    const imperial = renderSubcommandHelp(research, 'report', {
      ...ctx.config.settings,
      distanceUnits: 'imperial',
    });
    expect(textDisplays(imperial)[0]).toContain(
      `the stops within ${distanceWords(2_000, 'imperial')} of them, nearest first`,
    );
    expect(distanceWords(2_000, 'imperial')).toMatch(/ mi$/u);
    expect(details).not.toContain('locked');
    expect(details).not.toMatch(/…$/);
    const report = research.data.toJSON().options?.find((option) => option.name === 'report');
    const reward =
      report?.type === ApplicationCommandOptionType.Subcommand
        ? report.options?.find((option) => option.name === 'reward')
        : undefined;
    expect(reward?.description).toMatch(/listed task/);
  });

  it('tells a costumed version from the plain one in the dialog and its answer (review W1)', async () => {
    const made = await setup();
    const { task, plain, costumed } = pikachuTask();
    Object.assign(made.ctx, { researchTasks: researchTasksFixture([task]) });
    await made.report({ task: costumed.value, stop: stop(1) }, made.as(MISTY));
    const dialog = shownDialog(await made.report({ task: plain.value, stop: stop(1) }));
    expect(dialogText(dialog)).toContain(
      'with **Catch 5 Electric-type Pokémon** · Pikachu; a stop',
    );
    const field = dialogField(dialog, 'Replace the report at');
    expect(field.options?.[0]?.description).toMatch(
      /^Catch 5 Electric-type Pokémon · Pikachu \(costumed\), by Misty at /,
    );
    const [standing] = [...made.store.rows.values()];
    const answer = said(
      answerOf(await made.submit(dialog, { [field.id]: [String(standing?.id)] })),
    );
    expect(answer).toContain('- **Yellow Mural** (was: Pikachu (costumed))');
  });

  // Review of the event's end: past it the list no longer has the task, so "pick it" is a dead end.
  it('takes the text of a task past its event’s end as a typed task, not "pick it from the list"', () => {
    const { ctx } = createTestContext();
    const candy = (quantity: number): TaskReward => ({
      kind: 'item',
      item: 'rare-candy',
      name: 'Rare Candy',
      quantity,
      image: null,
    });
    const task: ResearchTask = {
      key: taskKeyOf('Spin 5 PokéStops'),
      text: 'Spin 5 PokéStops',
      category: 'Halloween',
      rewards: [candy(1), candy(3)],
    };
    Object.assign(ctx, {
      researchTasks: researchTasksFixture([{ ...task, endsAt: Date.now() + 60_000 }]),
    });
    expect(() => readTask(ctx, task.text, null)).toThrow(PICK_THE_REWARD);
    Object.assign(ctx, {
      researchTasks: researchTasksFixture([{ ...task, endsAt: Date.now() - 1 }]),
    });
    const typed = readTask(ctx, task.text, null);
    expect(typed.research).toMatchObject({ text: task.text, typed: true });
    expect(typed.subjectKey).toMatch(/^typed:/);
  });

  it('refuses a reward that fits two versions, and takes the plain one before a costume (L7)', () => {
    const { ctx } = createTestContext();
    const crop = 'https://cdn.leekduck.com/assets/img/pokemon_icons_crop/';
    const candy = (quantity: number): TaskReward => ({
      kind: 'item',
      item: 'rare-candy',
      name: 'Rare Candy',
      quantity,
      image: null,
    });
    const pikachu = (picture: string): TaskReward => ({
      kind: 'encounter',
      name: 'Pikachu',
      key: 'pikachu',
      dex: 25,
      shiny: false,
      cp: null,
      image: `${crop}${picture}`,
    });
    const candies: ResearchTask = {
      key: taskKeyOf('Spin 5 PokéStops'),
      text: 'Spin 5 PokéStops',
      category: 'Exploring',
      rewards: [candy(1), candy(3)],
    };
    const electric: ResearchTask = {
      key: taskKeyOf('Catch 5 Electric-type Pokémon'),
      text: 'Catch 5 Electric-type Pokémon',
      category: 'Catching',
      rewards: [pikachu('pm25.fPXP_2026.icon.png'), pikachu('pm25.icon.png')],
    };
    Object.assign(ctx, { researchTasks: researchTasksFixture([candies, electric]) });
    expect(() => readTask(ctx, candies.key, 'rare candy')).toThrow(PICK_THE_REWARD);
    const plain = ctx.researchTasks.versions(electric).find((one) => !one.costumed);
    expect(readTask(ctx, electric.key, 'pikachu').subjectKey).toBe(plain?.value);
  });
});
