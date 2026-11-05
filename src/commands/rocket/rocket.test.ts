import { metresBetween } from '@pine/wayspot-core/distance';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { distanceWords } from '../../render/distance-words.js';
import { pageTask } from '../../../test/support/research.js';
import { DIALOG_READ_MS, SLOW_READ } from '../../discord/dialog.js';
import { shownDialog, dialogText } from '../../../test/support/dialogs.js';
import { FakePartyGateway } from '../../../test/support/fake-gateway.js';
import { answerOf, buttonId, buttonsOf, said } from '../../../test/support/gym-commands.js';
import {
  fakeAutocomplete,
  fakeButton,
  fakeChatInput,
  fakeModal,
  FAKE_GUILD_ID,
  type FakeInteraction,
  type FakeOptions,
} from '../../../test/support/fake-interactions.js';
import { boardedRegions, UNBOUNDED_CHANNEL, WEST_CHANNEL } from '../../../test/support/gyms.js';
import { regionsFixture } from '../../../test/support/providers.js';
import { textDisplays, textOf } from '../../../test/support/messages.js';
import { renderSubcommandHelp } from '../util/help-render.js';
import {
  feedChoice,
  rocketChoicesOfFeed,
  rocketLineupsFixture,
} from '../../../test/support/rocket.js';
import { lineupChoice, lineupFingerprint, lineupValue } from '../../domain/rocket/lineups.js';
import { MemoryGruntMessages } from '../../../test/support/rocket-store.js';
import { MemoryStopReports, fixtureRewardHash } from '../../../test/support/stop-reports.js';
import { createTestContext } from '../../../test/support/test-context.js';
import { keptRow, wayspotId } from '../../../test/support/wayspot-cases.js';
import { wayspotsWith } from '../../../test/support/wayspots.js';
import type { WayspotRow } from '../../domain/wayspots/kept.js';
import { InteractionRouter } from '../../discord/router.js';
import { Throttles } from '../../discord/throttle.js';
import { GruntMessageService } from '../../services/grunt-messages.js';
import { Rehearsal } from '../../services/rehearsal.js';
import { RocketService, rocketSubject } from '../../services/rocket-reports.js';
import { StopReportService } from '../../services/stop-reports.js';
import { NO_STOPS_HERE } from '../research/research-input.js';
import { NOT_YOUR_REPORT, REPORT_CHANGED } from '../research/research.js';
import { HIDEOUT_CHANGED, NOTHING_AT_STOP, rocket, rocketControls } from './rocket.js';
import {
  LINEUPS_CHANGED,
  NOT_A_ROCKET_STOP,
  readWho,
  ROCKET_FROM_A_REGION,
} from './rocket-input.js';
import { ListChanged } from '../../discord/errors.js';

const ASH = '200000000000000061';
const MISTY = '200000000000000062';

// Noon in Pittsburgh on 2026-10-22 (fix A2): a report never meets a real midnight.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: Date.UTC(2026, 9, 22, 16) });
});
afterEach(() => {
  vi.useRealTimers();
});

/** Stops in West, and a power spot. */
const STOPS: WayspotRow[] = [
  keptRow(1, { title: 'Yellow Mural', lat: 40.06, lon: -80.06, address: null }),
  keptRow(2, { title: 'Paititi Inti', lat: 40.061, lon: -80.06, address: null }),
  keptRow(5, { title: 'Library Garden', kind: 'powerspot', lat: 40.0502, lon: -80.0502 }),
];

async function setup(rows: readonly WayspotRow[] = STOPS) {
  const { wayspots } = await wayspotsWith(rows);
  const store = new MemoryStopReports();
  const gateway = new FakePartyGateway();
  // West and East with their boards recorded, as after `/admin setup-forums` (plan 8R-9).
  const { ctx, entries } = createTestContext({
    wayspots,
    regions: regionsFixture(boardedRegions()),
  });
  const stopReports = new StopReportService({
    rewardHash: fixtureRewardHash,
    store,
    events: ctx.raidEvents,
    zone: ctx.config.settings.timezone,
    log: ctx.log,
  });
  const messages = new GruntMessageService({
    gateway,
    store: new MemoryGruntMessages(),
    reports: stopReports,
    log: ctx.log,
    setTimer: () => () => undefined,
  });
  Object.assign(ctx, {
    stopReports,
    rocket: new RocketService({
      reports: stopReports,
      messages,
      regions: ctx.regions,
      guilds: ctx.guilds,
      log: ctx.log,
    }),
  });
  await ctx.placeFinder.built();
  const throttles = new Throttles();
  const router = new InteractionRouter(ctx, [rocket], [rocketControls], { throttles });
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
    entries,
    store,
    gateway,
    messages,
    report: (options: Record<string, string>, extra: FakeOptions = {}) =>
      handled(
        fakeChatInput({
          commandName: 'rocket',
          subcommand: 'report',
          options,
          ...as(ASH),
          ...extra,
        }),
      ),
    remove: (stop: string, extra: FakeOptions = {}) =>
      handled(
        fakeChatInput({
          commandName: 'rocket',
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
    submit: (opener: FakeInteraction, extra: FakeOptions = {}) => {
      const dialog = shownDialog(opener);
      return handled(
        fakeModal({
          customId: dialog.custom_id,
          form: dialog,
          modalFromCommand: true,
          ...as(ASH),
          ...extra,
        }),
      );
    },
    typing: (focusedName: string, focused: string) =>
      handled(
        fakeAutocomplete({
          commandName: 'rocket',
          subcommand: 'report',
          focusedName,
          focused,
          ...as(ASH),
        }),
      ),
    as,
  };
}

const stop = (n: number): string => `stop:${wayspotId(n)}`;
const posted = (made: Awaited<ReturnType<typeof setup>>) =>
  made.gateway.messagesIn(WEST_CHANNEL).map(({ message }) => textOf(message));

describe('/rocket report', () => {
  it('reports a grunt at a stop: its message in the region, the answer with Take back', async () => {
    const made = await setup();
    const answer = answerOf(await made.report({ who: 'grunt:water', stop: stop(1) }));
    expect(said(answer)).toContain('### Team GO Rocket reported');
    expect(said(answer)).toContain(
      '**Water-type grunt** at **Yellow Mural** · catch one of Mudkip, Tentacool, Krabby, Magikarp, Feebas',
    );
    expect(said(answer)).toMatch(/Posted in <#100000000000000001>; it goes away <t:\d+:R>\./);
    expect(buttonsOf(answer).map(([label]) => label)).toEqual(['Take back']);
    expect(posted(made)).toHaveLength(1);
    expect(posted(made)[0]).toContain('### Water-type grunt');
  });

  it('records a grunt its reporter takes back by Take back as withdrawn (plan 8H-2)', async () => {
    const made = await setup();
    const ash = answerOf(await made.report({ who: 'grunt:water', stop: stop(1) }));
    await made.press(buttonId(ash, 'Take back'));
    expect(made.store.records.map(({ subjectKey, ending }) => [subjectKey, ending])).toEqual([
      ['grunt:water', 'withdrawn'],
    ]);
  });

  it('records a grunt staff take back by /rocket remove as staff’s (plan 8H-2)', async () => {
    const made = await setup();
    await made.report({ who: 'grunt:fire', stop: stop(2) }, made.as(MISTY));
    await made.remove(stop(2), { ...made.as(ASH), roleNames: ['Moderator'] });
    expect(made.store.records.map(({ subjectKey, ending }) => [subjectKey, ending])).toEqual([
      ['grunt:fire', 'staff'],
    ]);
  });

  it('answers the same grunt again as reported already, with a link, and posts nothing', async () => {
    const made = await setup();
    await made.report({ who: 'grunt:water', stop: stop(1) });
    const answer = answerOf(await made.report({ who: 'water', stop: stop(1) }, made.as(MISTY)));
    const [message] = made.gateway.messagesIn(WEST_CHANNEL);
    expect(said(answer)).toContain('Already reported: a **Water-type grunt** at **Yellow Mural**');
    expect(said(answer)).toContain(
      `https://discord.com/channels/${FAKE_GUILD_ID}/${WEST_CHANNEL}/${message?.id ?? ''}`,
    );
    expect(posted(made)).toHaveLength(1);
  });

  it('replaces a grunt by another, its message deleted at once', async () => {
    const made = await setup();
    await made.report({ who: 'grunt:water', stop: stop(1) });
    const [first] = made.gateway.messagesIn(WEST_CHANNEL);
    const answer = answerOf(await made.report({ who: 'grunt:fire', stop: stop(1) }));
    await made.messages.flush();
    expect(said(answer)).toContain('(was: Water-type grunt)');
    expect(made.gateway.deleted.map((one) => one.messageId)).toEqual([first?.id]);
  });

  it('reports a hideout without a message, and asks before a grunt replaces it', async () => {
    const made = await setup();
    const arlo = answerOf(await made.report({ who: 'leader:arlo', stop: stop(1) }));
    expect(said(arlo)).toContain('**Arlo** at **Yellow Mural** · catch Alolan Grimer');
    expect(said(arlo)).toContain(
      'In "Today’s Stops" on the board of <#100000000000000001>, until midnight.',
    );
    expect(posted(made)).toEqual([]);
    const asking = await made.report({ who: 'grunt:water', stop: stop(1) });
    const dialog = shownDialog(asking);
    expect(dialog.title).toBe('Replace a hideout?');
    expect(dialogText(dialog)).toBe(
      'Arlo was reported here today, and a hideout keeps grunts away all day. Replace Arlo’s ' +
        'report with the Water-type grunt?\n\nSubmit replaces it.',
    );
    expect(posted(made)).toEqual([]);
    const replaced = answerOf(await made.submit(asking));
    expect(said(replaced)).toContain('**Water-type grunt** at **Yellow Mural**');
    expect(said(replaced)).toContain('(was: Arlo)');
    expect(posted(made)).toHaveLength(1);
  });

  it('reports nothing where another hideout came while the dialog was open', async () => {
    const made = await setup();
    await made.report({ who: 'leader:arlo', stop: stop(1) });
    const asking = await made.report({ who: 'grunt:water', stop: stop(1) });
    await made.report({ who: 'giovanni', stop: stop(1) }, made.as(MISTY));
    expect(said(answerOf(await made.submit(asking)))).toBe(HIDEOUT_CHANGED);
    expect(posted(made)).toEqual([]);
    expect([...made.store.rows.values()].map((one) => one.subjectKey)).toEqual(['giovanni']);
  });

  it('refuses before counting: no region, no stops, a choice gone from the lineups, no stop', async () => {
    const made = await setup();
    const refused = async (options: Record<string, string>, extra: FakeOptions = {}) =>
      said(answerOf(await made.report(options, extra)));
    expect(
      await refused({ who: 'grunt:water', stop: stop(1) }, { channelId: UNBOUNDED_CHANNEL }),
    ).toBe(ROCKET_FROM_A_REGION);
    // The lineups were read anew meanwhile, without the water grunts.
    Object.assign(made.ctx, { rocketLineups: rocketLineupsFixture([feedChoice('decoy')]) });
    expect(await refused({ who: 'grunt:water', stop: stop(1) })).toBe(LINEUPS_CHANGED);
    Object.assign(made.ctx, { rocketLineups: rocketLineupsFixture() });
    expect(await refused({ who: 'grunt:water', stop: `powerspot:${wayspotId(5)}` })).toBe(
      NOT_A_ROCKET_STOP,
    );
    expect(await refused({ who: 'someone', stop: stop(1) })).toMatch(
      /^I do not know "someone" in Team GO Rocket/,
    );
    expect(made.store.rows.size).toBe(0);
    // Nothing counted: the limit is all there (ten grunts of other types, none reported already).
    const types = [
      'water',
      'fire',
      'grass',
      'ice',
      'rock',
      'ground',
      'dark',
      'bug',
      'poison',
      'ghost',
    ];
    for (const [n, type] of types.entries()) {
      await made.report({ who: `grunt:${type}`, stop: stop(n % 2 ? 1 : 2) });
    }
    expect(made.store.rows.size).toBe(2);
    expect(said(answerOf(await made.report({ who: 'grunt:dragon', stop: stop(1) })))).toMatch(
      /^You can use \/rocket report again in/,
    );

    const empty = await setup([]);
    expect(said(answerOf(await empty.report({ who: 'grunt:water', stop: 'mural' })))).toBe(
      NO_STOPS_HERE,
    );
  });

  it('offers who by name and by what can be caught, Giovanni’s with its warning', async () => {
    const made = await setup();
    const choices = async (typed: string) =>
      (await made.typing('who', typed)).respond.mock.calls[0]?.[0] as {
        name: string;
        value: string;
      }[];
    expect(await choices('dratini')).toEqual([]);
    expect((await choices('noibat')).map((one) => one.value)).toEqual(['grunt:dragon']);
    expect(await choices('fire')).toContainEqual({
      name: 'Fire-type grunt · Litwick, Ponyta, Torchic',
      value: 'grunt:fire',
    });
    expect(await choices('giov')).toEqual([
      { name: 'Giovanni (only when sure it is him) · Zekrom', value: 'giovanni' },
    ]);
    expect((await choices('')).map((one) => one.value).slice(0, 2)).toEqual([
      'grunt:bug',
      'grunt:dark',
    ]);
  });
});

describe('/rocket report of one lineup of a grunt type (plan 8R-4L)', () => {
  const water = feedChoice('grunt:water');
  const [mudkips, magikarps] = water.lineups ?? [];
  if (!mudkips || !magikarps) throw new Error('the water grunt has two lineups');
  const MAGIKARPS = lineupValue(water, magikarps);
  const MUDKIPS = lineupValue(water, mudkips);

  async function choicesOf(made: Awaited<ReturnType<typeof setup>>, typed: string) {
    return (await made.typing('who', typed)).respond.mock.calls[0]?.[0] as {
      name: string;
      value: string;
    }[];
  }

  it('offers a type’s lineups by their first slot, then not sure which, once the words match it', async () => {
    const made = await setup();
    const three = [
      { name: 'Water-type grunt · Mudkip, Tentacool, Krabby', value: MUDKIPS },
      { name: 'Water-type grunt · Magikarp, Feebas', value: MAGIKARPS },
      { name: 'Water-type grunt · not sure which', value: 'grunt:water' },
    ];
    expect(MAGIKARPS).toMatch(/^grunt:water:male#[0-9a-z]+$/);
    expect(await choicesOf(made, 'water')).toEqual(three);
    // Found by a catch of one lineup: the type's three all the same.
    expect(await choicesOf(made, 'magikarp')).toEqual(three);
    // With nothing typed, one choice per type (24; with the lineups, 28): as before.
    const all = await choicesOf(made, '');
    expect(all).toHaveLength(24);
    expect(all).toContainEqual({
      name: 'Water-type grunt · Mudkip, Tentacool, Krabby +2',
      value: 'grunt:water',
    });
    expect(all.some((one) => one.value.includes('#'))).toBe(false);
  });

  it('offers the merged choices only where the lineups would pass 25 choices', async () => {
    const made = await setup();
    // Every grunt type with two lineups: "grunt" matches 20 choices, 58 with the lineups.
    const doubled = rocketChoicesOfFeed().map((choice) =>
      choice.key.startsWith('grunt:') ? { ...choice, lineups: water.lineups } : choice,
    );
    Object.assign(made.ctx, { rocketLineups: rocketLineupsFixture(doubled) });
    const choices = await choicesOf(made, 'grunt');
    expect(choices).toHaveLength(20);
    expect(choices.some((one) => one.value.includes('#'))).toBe(false);
    expect(choices).toContainEqual({
      name: 'Water-type grunt · Mudkip, Tentacool, Krabby +2',
      value: 'grunt:water',
    });
  });

  it('expands a list of exactly 25 choices, and lists one of 26 merged only (L4)', async () => {
    const made = await setup();
    // Three grunt types with two lineups each (the feed's water and untyped grunts, and fire):
    // six choices more where all three are found.
    const doubled = rocketChoicesOfFeed().map((choice) =>
      choice.key === 'grunt:fire' ? { ...choice, lineups: water.lineups } : choice,
    );
    expect(doubled.filter((choice) => choice.lineups !== undefined)).toHaveLength(3);
    Object.assign(made.ctx, { rocketLineups: rocketLineupsFixture(doubled) });
    // "type" finds the 18 typed grunts and "Grunt (no type)": 19 merged, 25 expanded.
    const typeChoices = await choicesOf(made, 'type');
    expect(typeChoices).toHaveLength(25);
    expect(typeChoices.filter((one) => one.value.includes('#'))).toHaveLength(6);
    // "grunt" also finds the decoy: 20 merged, 26 expanded, so merged only.
    const gruntChoices = await choicesOf(made, 'grunt');
    expect(gruntChoices).toHaveLength(20);
    expect(gruntChoices.some((one) => one.value.includes('#'))).toBe(false);
  });

  it('reports a lineup with its own catches, named by its type everywhere it is posted', async () => {
    const made = await setup();
    const answer = answerOf(await made.report({ who: MAGIKARPS, stop: stop(1) }));
    expect(said(answer)).toContain(
      '**Water-type grunt** at **Yellow Mural** · catch one of Magikarp, Feebas',
    );
    const [kept] = [...made.store.rows.values()];
    expect(kept).toMatchObject({
      subjectKey: 'grunt:water:male',
      rocket: { name: 'Water-type grunt', catches: magikarps.catches, lineup: 'Magikarp, Feebas' },
    });
    expect(posted(made)).toEqual([expect.stringContaining('### Water-type grunt\n')]);
    expect(posted(made)[0]).not.toMatch(/male/i);
  });

  it('reads a typed type as not sure which, with both lineups’ catches', async () => {
    const made = await setup();
    await made.report({ who: 'water grunt', stop: stop(1) });
    expect([...made.store.rows.values()][0]).toMatchObject({
      subjectKey: 'grunt:water',
      rocket: { catches: water.catches },
    });
    expect([...made.store.rows.values()][0]).not.toHaveProperty('rocket.lineup');
  });

  it('refuses a lineup whose fingerprint is not the lineup’s of now, before counting', async () => {
    const made = await setup();
    const refused = async (who: string) =>
      said(answerOf(await made.report({ who, stop: stop(1) })));
    // A rotation changed the lineup.
    expect(await refused(`grunt:water:male#${mudkips.fingerprint}`)).toBe(LINEUPS_CHANGED);
    // A lineup's key without its fingerprint, a merged key with one, a "#" value of no key.
    expect(await refused('grunt:water:male')).toBe(LINEUPS_CHANGED);
    expect(await refused(`grunt:water#${magikarps.fingerprint}`)).toBe(LINEUPS_CHANGED);
    expect(await refused(`grunt:shadow:male#${magikarps.fingerprint}`)).toBe(LINEUPS_CHANGED);
    // The type lost its second lineup.
    const { lineups: _gone, ...merged } = water;
    Object.assign(made.ctx, {
      rocketLineups: rocketLineupsFixture(
        rocketChoicesOfFeed().map((choice) => (choice.key === 'grunt:water' ? merged : choice)),
      ),
    });
    expect(await refused(MAGIKARPS)).toBe(LINEUPS_CHANGED);
    expect(made.store.rows.size).toBe(0);
    // Known by its kind, not its words (review F8): the map asks for its lists again.
    for (const who of [
      MAGIKARPS,
      'grunt:water:male',
      `grunt:shadow:male#${magikarps.fingerprint}`,
    ]) {
      expect(() => readWho(made.ctx, who), who).toThrow(ListChanged);
    }
  });

  it('suggests each type once for words that find it by its catches (B5)', async () => {
    const made = await setup();
    expect(said(answerOf(await made.report({ who: 'magikarp', stop: stop(1) })))).toBe(
      'I do not know "magikarp" in Team GO Rocket’s lineups. Did you mean Water-type grunt? ' +
        'Pick one from the list that appears while you type.',
    );
  });

  it('answers not sure which over a lineup as reported already, naming the lineup', async () => {
    const made = await setup();
    await made.report({ who: MAGIKARPS, stop: stop(1) });
    const answer = answerOf(await made.report({ who: 'water', stop: stop(1) }, made.as(MISTY)));
    expect(said(answer)).toContain(
      'Already reported: a **Water-type grunt · Magikarp, Feebas** at **Yellow Mural**',
    );
    expect(posted(made)).toHaveLength(1);
  });

  it('names what a lineup replaced of its type: not sure which, or the other lineup', async () => {
    const made = await setup();
    await made.report({ who: 'grunt:water', stop: stop(1) });
    expect(said(answerOf(await made.report({ who: MAGIKARPS, stop: stop(1) })))).toContain(
      '(was: Water-type grunt, not sure which)',
    );
    expect(said(answerOf(await made.report({ who: MUDKIPS, stop: stop(1) })))).toContain(
      '(was: Water-type grunt · Magikarp, Feebas)',
    );
  });

  it('refines not sure which in place: one message, edited; Take back is the new reporter’s (B2, L1)', async () => {
    const made = await setup();
    const ash = answerOf(await made.report({ who: 'grunt:water', stop: stop(1) }));
    vi.setSystemTime(Date.now() + 60_000);
    const misty = answerOf(await made.report({ who: MAGIKARPS, stop: stop(1) }, made.as(MISTY)));
    expect(said(misty)).toContain('(was: Water-type grunt, not sure which)');
    // Its message was edited, not posted (plan 8R-6, the staging's finding 3).
    expect(said(ash)).toMatch(/Posted in <#\d+>; it goes away/);
    expect(said(misty)).toMatch(/Changed in <#\d+>; it goes away <t:\d+:R>\./);
    expect(said(misty)).not.toContain('Posted in');
    await made.messages.flush();
    expect(made.gateway.deleted).toEqual([]);
    expect(made.gateway.messagesIn(WEST_CHANNEL)).toHaveLength(1);
    expect(posted(made)[0]).toContain('**Catch** one of Magikarp, Feebas');
    // The same report by its id, another by its version (L1): Ash's Take back says it changed,
    // and staff pressing it take back nothing either.
    expect(buttonId(ash, 'Take back').split(':')[1]).toBe(
      buttonId(misty, 'Take back').split(':')[1],
    );
    expect(said(answerOf(await made.press(buttonId(ash, 'Take back'))))).toBe(REPORT_CHANGED);
    const moderator = { ...made.as(ASH), roleNames: ['Moderator'] };
    expect(said(answerOf(await made.press(buttonId(ash, 'Take back'), moderator)))).toBe(
      REPORT_CHANGED,
    );
    expect([...made.store.rows.values()].map((row) => row.subjectKey)).toEqual([
      'grunt:water:male',
    ]);
    expect(said(answerOf(await made.press(buttonId(misty, 'Take back'), made.as(MISTY))))).toBe(
      'Took back **Water-type grunt** at **Yellow Mural**.',
    );
  });

  it('asks before a lineup replaces a hideout, naming the lineup', async () => {
    const made = await setup();
    await made.report({ who: 'leader:arlo', stop: stop(1) });
    expect(dialogText(shownDialog(await made.report({ who: MAGIKARPS, stop: stop(1) })))).toBe(
      'Arlo was reported here today, and a hideout keeps grunts away all day. Replace Arlo’s ' +
        'report with the Water-type grunt · Magikarp, Feebas?\n\nSubmit replaces it.',
    );
  });

  it('takes a lineup back by its meaning at the longest Wayfarer key (S9, B10)', async () => {
    // The electric grunts with two lineups, at a stop of the longest Wayfarer id.
    const electric = feedChoice('grunt:electric');
    const [voltorb, magnemite] = [electric.catches.slice(0, 3), electric.catches.slice(3)];
    const lineups = [
      { lineup: 'female' as const, first: ['Voltorb', 'Shinx'], catches: voltorb },
      { lineup: 'male' as const, first: ['Magnemite'], catches: magnemite },
    ].map((one) => ({ ...one, fingerprint: lineupFingerprint(one) }));
    const twoElectric = { ...electric, lineups };
    const longest = `${'f'.repeat(32)}.999`;
    const made = await setup([
      keptRow(1, { id: longest, title: 'Yellow Mural', lat: 40.06, lon: -80.06, address: null }),
    ]);
    Object.assign(made.ctx, {
      rocketLineups: rocketLineupsFixture(
        rocketChoicesOfFeed().map((choice) =>
          choice.key === 'grunt:electric' ? twoElectric : choice,
        ),
      ),
    });
    const [female] = lineups;
    if (!female) throw new Error('two lineups');
    /** Reports the lineup and moves its row to another id, as a report put back would be. */
    const reportedUnderAnotherId = async (): Promise<string> => {
      const answer = answerOf(
        await made.report({ who: lineupValue(twoElectric, female), stop: `stop:${longest}` }),
      );
      const [[id, row] = []] = [...made.store.rows.entries()];
      if (id === undefined || row === undefined) throw new Error('reported');
      made.store.rows.delete(id);
      made.store.rows.set(id + 100, { ...row, id: id + 100 });
      return buttonId(answer, 'Take back');
    };
    const back = await reportedUnderAnotherId();
    expect(back).toContain(`:back:${longest}:grunt.electric.female:`);
    // Its id gone, it is found by what it is.
    expect(said(answerOf(await made.press(back)))).toBe(
      'Took back **Electric-type grunt** at **Yellow Mural**.',
    );
    expect(made.store.rows.size).toBe(0);
    // A fourth argument is no Take back of this version.
    const again = await reportedUnderAnotherId();
    expect(said(answerOf(await made.press(`${again}:x`)))).toContain(
      'There was nothing left to take back',
    );
    expect(made.store.rows.size).toBe(1);
  });
});

describe('/rocket report’s throttle around the dialog (fix B7)', () => {
  const refusedLater = /^You can use \/rocket report again in/;

  it('gives the use back when another hideout came while the dialog was open', async () => {
    const made = await setup();
    made.ctx.config.settings.rocket.throttle.uses = 2;
    try {
      await made.report({ who: 'leader:arlo', stop: stop(1) });
      const asking = await made.report({ who: 'grunt:water', stop: stop(1) });
      await made.report({ who: 'giovanni', stop: stop(1) }, made.as(MISTY));
      expect(said(answerOf(await made.submit(asking)))).toBe(HIDEOUT_CHANGED);
      // The second use went back: a third report is taken, a fourth is not.
      expect(said(answerOf(await made.report({ who: 'grunt:fire', stop: stop(2) })))).toContain(
        '### Team GO Rocket reported',
      );
      expect(said(answerOf(await made.report({ who: 'grunt:ice', stop: stop(2) })))).toMatch(
        refusedLater,
      );
    } finally {
      made.ctx.config.settings.rocket.throttle.uses = 10;
    }
  });

  it('gives back the use of a dialog’s Submit that finds the same grunt reported meanwhile (plan 8R-6)', async () => {
    const made = await setup();
    made.ctx.config.settings.rocket.throttle.uses = 2;
    try {
      await made.report({ who: 'leader:arlo', stop: stop(1) }, made.as(MISTY));
      const asking = await made.report({ who: 'grunt:water', stop: stop(1) });
      // Misty replaces Arlo with the same grunt first.
      const hers = await made.report({ who: 'grunt:water', stop: stop(1) }, made.as(MISTY));
      await made.submit(hers, made.as(MISTY));
      expect(said(answerOf(await made.submit(asking)))).toMatch(
        /^Already reported: a \*\*Water-type grunt\*\* at \*\*Yellow Mural\*\*/,
      );
      // The dialog's use went back: two more reports are taken, a third is not.
      for (const who of ['grunt:fire', 'grunt:ice']) {
        expect(said(answerOf(await made.report({ who, stop: stop(2) })))).toContain(
          '### Team GO Rocket reported',
        );
      }
      expect(said(answerOf(await made.report({ who: 'grunt:grass', stop: stop(2) })))).toMatch(
        refusedLater,
      );
    } finally {
      made.ctx.config.settings.rocket.throttle.uses = 10;
    }
  });

  it('gives back the use of a grunt reported already (plan 8R-6)', async () => {
    const made = await setup();
    made.ctx.config.settings.rocket.throttle.uses = 2;
    try {
      await made.report({ who: 'grunt:water', stop: stop(1) });
      expect(said(answerOf(await made.report({ who: 'water', stop: stop(1) })))).toMatch(
        /^Already reported:/,
      );
      // The second use is still there, and then the window is full.
      expect(said(answerOf(await made.report({ who: 'grunt:fire', stop: stop(2) })))).toContain(
        '### Team GO Rocket reported',
      );
      expect(said(answerOf(await made.report({ who: 'grunt:ice', stop: stop(2) })))).toMatch(
        refusedLater,
      );
    } finally {
      made.ctx.config.settings.rocket.throttle.uses = 10;
    }
  });

  it('counts the dialog’s Submit as the command’s one use', async () => {
    const made = await setup();
    made.ctx.config.settings.rocket.throttle.uses = 2;
    try {
      await made.report({ who: 'leader:arlo', stop: stop(1) });
      const asking = await made.report({ who: 'grunt:water', stop: stop(1) });
      expect(said(answerOf(await made.submit(asking)))).toContain('(was: Arlo)');
      expect(said(answerOf(await made.report({ who: 'grunt:fire', stop: stop(2) })))).toMatch(
        refusedLater,
      );
    } finally {
      made.ctx.config.settings.rocket.throttle.uses = 10;
    }
  });

  it('opens no dialog after a slow read, and gives the use back', async () => {
    const made = await setup();
    made.ctx.config.settings.rocket.throttle.uses = 2;
    try {
      await made.report({ who: 'leader:arlo', stop: stop(1) });
      const late = await made.report(
        { who: 'grunt:water', stop: stop(1) },
        { createdTimestamp: Date.now() - DIALOG_READ_MS - 500 },
      );
      expect(late.showModal).not.toHaveBeenCalled();
      expect(said(answerOf(late))).toBe(SLOW_READ);
      expect(said(answerOf(await made.report({ who: 'grunt:fire', stop: stop(2) })))).toContain(
        '### Team GO Rocket reported',
      );
    } finally {
      made.ctx.config.settings.rocket.throttle.uses = 10;
    }
  });

  it('refuses a grunt where a hideout came between its read and the report, giving the use back', async () => {
    const made = await setup();
    made.ctx.config.settings.rocket.throttle.uses = 2;
    try {
      await made.report({ who: 'leader:arlo', stop: stop(1) }, made.as(MISTY));
      // The guard read the stop before Arlo was there.
      made.ctx.stopReports.rocketAt = () => Promise.resolve(undefined);
      const answer = answerOf(await made.report({ who: 'grunt:water', stop: stop(1) }));
      expect(said(answer)).toBe(
        '**Arlo** was reported at that PokéStop just now, and a hideout keeps grunts away all ' +
          'day. Use `/rocket report` again to replace it.',
      );
      await made.report({ who: 'grunt:fire', stop: stop(2) });
      expect(said(answerOf(await made.report({ who: 'grunt:ice', stop: stop(2) })))).toContain(
        '### Team GO Rocket reported',
      );
    } finally {
      made.ctx.config.settings.rocket.throttle.uses = 10;
    }
  });

  it('says a grunt was posted nowhere, reports nothing, and gives the use back (fix A5)', async () => {
    const made = await setup();
    made.ctx.config.settings.rocket.throttle.uses = 1;
    try {
      made.gateway.failing.set('sendMessage', new Error('503 Service Unavailable'));
      expect(said(answerOf(await made.report({ who: 'grunt:water', stop: stop(1) })))).toBe(
        `I could not post the grunt in <#${WEST_CHANNEL}>, so nothing was reported. Try again ` +
          'in a moment.',
      );
      expect(made.store.rows.size).toBe(0);
      made.gateway.failing.delete('sendMessage');
      expect(said(answerOf(await made.report({ who: 'grunt:water', stop: stop(1) })))).toContain(
        '### Team GO Rocket reported',
      );
    } finally {
      made.ctx.config.settings.rocket.throttle.uses = 10;
    }
  });
});

describe('a grunt replaced while its message was being posted (fix F3)', () => {
  it('says a newer report took its place, and gives the use back', async () => {
    const made = await setup();
    made.ctx.config.settings.rocket.throttle.uses = 1;
    try {
      const send = made.gateway.sendMessage.bind(made.gateway);
      // Misty's grunt is reported while Ash's first message is on its way (her own send plain).
      made.gateway.sendMessage = async (channelId, message) => {
        made.gateway.sendMessage = send;
        const sent = await send(channelId, message);
        await made.report({ who: 'grunt:fire', stop: stop(1) }, made.as(MISTY));
        return sent;
      };
      const answer = answerOf(await made.report({ who: 'grunt:water', stop: stop(1) }));
      expect(said(answer)).toBe(
        'A newer report at that PokéStop took the place of your **Water-type grunt** while it ' +
          'was being posted, so it was not reported.',
      );
      await made.messages.flush();
      expect(posted(made)).toEqual([expect.stringContaining('### Fire-type grunt')]);
      made.gateway.sendMessage = send;
      expect(said(answerOf(await made.report({ who: 'grunt:ice', stop: stop(2) })))).toContain(
        '### Team GO Rocket reported',
      );
    } finally {
      made.ctx.config.settings.rocket.throttle.uses = 10;
    }
  });
});

describe('a grunt posted nowhere in the place of another report (fix R2)', () => {
  it('names the grunt it replaced, which is gone', async () => {
    const made = await setup();
    await made.report({ who: 'grunt:fire', stop: stop(1) }, made.as(MISTY));
    made.gateway.failing.set('sendMessage', new Error('503 Service Unavailable'));
    expect(said(answerOf(await made.report({ who: 'grunt:water', stop: stop(1) })))).toBe(
      `I could not post the grunt in <#${WEST_CHANNEL}>, so nothing was reported, and the ` +
        '**Fire-type grunt** reported before was taken off. Try again in a moment.',
    );
    expect(made.store.rows.size).toBe(0);
  });

  it('says the hideout it replaced stands again', async () => {
    const made = await setup();
    await made.report({ who: 'leader:arlo', stop: stop(1) }, made.as(MISTY));
    const asking = await made.report({ who: 'grunt:water', stop: stop(1) });
    made.gateway.failing.set('sendMessage', new Error('503 Service Unavailable'));
    expect(said(answerOf(await made.submit(asking)))).toBe(
      `I could not post the grunt in <#${WEST_CHANNEL}>, so nothing was reported; **Arlo** ` +
        'stands as before. Try again in a moment.',
    );
    expect([...made.store.rows.values()].map((one) => one.subjectKey)).toEqual(['leader:arlo']);
  });
});

describe('Take back of a hideout put back under a new id (fix S3)', () => {
  it('takes back the reporter’s same hideout at the same stop by its meaning', async () => {
    const made = await setup();
    const arlo = answerOf(await made.report({ who: 'leader:arlo', stop: stop(1) }, made.as(MISTY)));
    const asking = await made.report({ who: 'grunt:water', stop: stop(1) });
    made.gateway.failing.set('sendMessage', new Error('503 Service Unavailable'));
    await made.submit(asking);
    made.gateway.failing.delete('sendMessage');
    const [back] = [...made.store.rows.values()];
    expect(back?.subjectKey).toBe('leader:arlo');
    const taken = answerOf(await made.press(buttonId(arlo, 'Take back'), made.as(MISTY)));
    expect(said(taken)).toBe('Took back **Arlo** at **Yellow Mural**.');
    expect(made.store.rows.size).toBe(0);
  });

  it('takes back nothing of the reporter’s newer report of the same who (fix F1)', async () => {
    const made = await setup();
    const old = answerOf(await made.report({ who: 'grunt:water', stop: stop(1) }));
    // The first grunt ends; the same member reports the same grunt there anew.
    vi.setSystemTime(Date.now() + 31 * 60_000);
    await made.report({ who: 'grunt:water', stop: stop(1) });
    const [newer] = [...made.store.rows.values()].filter((one) => one.endsAt > Date.now());
    expect(newer?.subjectKey).toBe('grunt:water');
    const taken = answerOf(await made.press(buttonId(old, 'Take back')));
    expect(said(taken)).toContain('There was nothing left to take back');
    expect(await made.ctx.stopReports.rocketAt(FAKE_GUILD_ID, wayspotId(1))).toEqual(newer);
  });

  it('takes back nothing of another member’s, or of another subject', async () => {
    const made = await setup();
    const arlo = answerOf(await made.report({ who: 'leader:arlo', stop: stop(1) }, made.as(MISTY)));
    await made.report({ who: 'leader:cliff', stop: stop(1) }, made.as(MISTY));
    const taken = answerOf(await made.press(buttonId(arlo, 'Take back'), made.as(MISTY)));
    expect(said(taken)).toContain('There was nothing left to take back');
    expect(made.store.rows.size).toBe(1);
  });
});

describe('the hideouts in /rocket report’s choices (fix B5)', () => {
  it('offers and takes the hideouts whatever the lineups list; a grunt type missing is changed', async () => {
    const made = await setup();
    Object.assign(made.ctx, { rocketLineups: rocketLineupsFixture([feedChoice('grunt:water')]) });
    const choices = (await made.typing('who', '')).respond.mock.calls[0]?.[0] ?? [];
    expect(choices.map((one) => one.value)).toEqual([
      'grunt:water',
      'decoy',
      'leader:cliff',
      'leader:arlo',
      'leader:sierra',
      'giovanni',
    ]);
    expect(said(answerOf(await made.report({ who: 'leader:cliff', stop: stop(1) })))).toContain(
      '**Cliff** at **Yellow Mural**',
    );
    expect(said(answerOf(await made.report({ who: 'grunt:fire', stop: stop(2) })))).toBe(
      LINEUPS_CHANGED,
    );
  });
});

describe('/rocket report before any lineups were read', () => {
  it('offers every grunt type, the leaders and Giovanni, and reports them without catches', async () => {
    const made = await setup();
    Object.assign(made.ctx, { rocketLineups: rocketLineupsFixture([], undefined) });
    const choices = (await made.typing('who', 'fai')).respond.mock.calls[0]?.[0] as {
      name: string;
      value: string;
    }[];
    expect(choices).toEqual([{ name: 'Fairy-type grunt', value: 'grunt:fairy' }]);
    const answer = answerOf(await made.report({ who: 'sierra', stop: stop(1) }));
    expect(said(answer)).toContain('**Sierra** at **Yellow Mural**\n');
  });
});

describe('the Take back of /rocket report’s answer and /rocket remove', () => {
  it('takes back the report of the answer, its message deleted', async () => {
    const made = await setup();
    const answer = answerOf(await made.report({ who: 'grunt:water', stop: stop(1) }));
    const taken = answerOf(await made.press(buttonId(answer, 'Take back')));
    await made.messages.flush();
    expect(said(taken)).toBe('Took back **Water-type grunt** at **Yellow Mural**.');
    expect(made.store.rows.size).toBe(0);
    expect(made.gateway.deleted).toHaveLength(1);
  });

  it('takes back one’s own report at a stop, another’s only as staff', async () => {
    const made = await setup();
    await made.report({ who: 'leader:cliff', stop: stop(1) });
    expect(said(answerOf(await made.remove(stop(1), made.as(MISTY))))).toBe(NOT_YOUR_REPORT);
    expect(
      said(answerOf(await made.remove(stop(1), { ...made.as(MISTY), roleNames: ['Moderator'] }))),
    ).toBe('Took back **Cliff** at **Yellow Mural**.');
    expect(said(answerOf(await made.remove(stop(1))))).toBe(NOTHING_AT_STOP);
  });

  it('takes back by the version it read: a report refined meanwhile is not taken back (F6)', async () => {
    const made = await setup();
    await made.report({ who: 'grunt:water', stop: stop(1) });
    const water = feedChoice('grunt:water');
    const magikarps = water.lineups?.[1];
    if (!magikarps) throw new Error('the water grunt has two lineups');
    // Misty refines Ash's grunt between the read of what stands and the take back.
    const { stopReports } = made.ctx;
    const read = stopReports.rocketAt.bind(stopReports);
    vi.spyOn(stopReports, 'rocketAt').mockImplementation(async (serverId, stopKey) => {
      const standing = await read(serverId, stopKey);
      if (standing?.reporter.id === ASH) {
        vi.setSystemTime(Date.now() + 60_000);
        await stopReports.reportRocket({
          serverId,
          stop: standing.stop,
          subject: rocketSubject(lineupChoice(water, magikarps)),
          reporter: { id: MISTY, name: 'Misty' },
        });
      }
      return standing;
    });
    const moderator = { ...made.as(ASH), roleNames: ['Moderator'] };
    expect(said(answerOf(await made.remove(stop(1), moderator)))).toBe(REPORT_CHANGED);
    expect([...made.store.rows.values()].map((row) => row.subjectKey)).toEqual([
      'grunt:water:male',
    ]);
  });
});

describe('/rocket in rehearsal mode', () => {
  it('posts no message and names no post: the report stands for its time', async () => {
    const made = await setup();
    Object.assign(made.ctx, {
      rehearsal: new Rehearsal({ allowlist: [ASH], regions: ['west'], staffRoles: [] }),
      rocket: new RocketService({
        reports: made.ctx.stopReports,
        messages: undefined,
        regions: made.ctx.regions,
        guilds: made.ctx.guilds,
        log: made.ctx.log,
      }),
    });
    const answer = answerOf(await made.report({ who: 'grunt:water', stop: stop(1) }));
    expect(said(answer)).toMatch(/It stands until <t:\d+:t> \(rehearsal mode posts nothing\)\./);
    expect(posted(made)).toEqual([]);
  });
});

describe('/rocket report stop: near the member’s last report (Matt, 2026-10-27)', () => {
  /** Two stops by Yellow Mural, one a kilometer north, one beyond 2 km, two gardens. */
  const NEARBY: WayspotRow[] = [
    ...STOPS,
    keptRow(3, { title: 'Little Bench', lat: 40.07, lon: -80.06, address: null }),
    keptRow(4, { title: 'Far Stop', lat: 40.09, lon: -80.06, address: null }),
    keptRow(6, { title: 'East Garden', lat: 40.095, lon: -80.06, address: null }),
    keptRow(7, { title: 'West Garden', lat: 40.062, lon: -80.06, address: null }),
  ];
  const at = (n: number) => NEARBY.find((row) => row.id === wayspotId(n))!;
  const offered = async (made: Awaited<ReturnType<typeof setup>>, typed: string) =>
    ((await made.typing('stop', typed)).respond.mock.calls[0]?.[0] ?? []) as {
      name: string;
      value: string;
    }[];
  /** Ash's research at stop `n`, as `/research report` makes it. */
  const researchAt = (made: Awaited<ReturnType<typeof setup>>, n: number) => {
    const task = pageTask('Catch 7 Pokémon');
    const row = at(n);
    return made.ctx.stopReports.reportResearch({
      serverId: FAKE_GUILD_ID,
      stops: [
        { key: row.id, name: row.title, address: null, image: null, lat: row.lat, lon: row.lon },
      ],
      subject: {
        subjectKey: task.key,
        research: { text: task.text, category: task.category, rewards: task.rewards, typed: false },
      },
      reporter: { id: ASH, name: 'Ash' },
    });
  };

  it('lists the PokéStops within 2 km of the member’s own last report of today, nearest first', async () => {
    const made = await setup(NEARBY);
    expect(await offered(made, '')).toEqual([]);
    // Another member's report is no anchor of Ash's.
    await made.report({ who: 'grunt:water', stop: stop(1) }, made.as(MISTY));
    expect(await offered(made, '')).toEqual([]);
    // Research counts: from Far Stop, only Far Stop and East Garden lie within 2 km.
    await researchAt(made, 4);
    expect((await offered(made, '')).map((one) => one.value)).toEqual([stop(4), stop(6)]);
    // The latest counts: a grunt at Yellow Mural a minute later.
    vi.setSystemTime(Date.now() + 60_000);
    await made.report({ who: 'grunt:fire', stop: stop(1) });
    const near = await offered(made, '');
    expect(near.map((one) => one.value)).toEqual([stop(1), stop(2), stop(7), stop(3)]);
    expect(near[2]?.name).toBe(
      `West Garden (PokéStop) · near Old Stone Fountain · ${distanceWords(metresBetween(at(7), at(1)), 'metric')}`,
    );
    // Once the grunt has gone, and the hourly upkeep has run, it is still the last of today
    // (Matt, 2026-10-27, "Last today"), not the research that stands.
    vi.setSystemTime(Date.now() + 61 * 60_000);
    await made.ctx.stopReports.sweep();
    expect((await offered(made, '')).map((one) => one.value)).toEqual([
      stop(1),
      stop(2),
      stop(7),
      stop(3),
    ]);
    // Past local midnight it is yesterday's: no anchor (the research of yesterday neither).
    vi.setSystemTime(Date.UTC(2026, 9, 23, 4, 30));
    expect(await offered(made, '')).toEqual([]);
  });

  it('offers the nearer of stops that fit alike first', async () => {
    const made = await setup(NEARBY);
    const titles = async () =>
      (await offered(made, 'garden')).map((one) => one.name.split(' (')[0]);
    expect(await titles()).toEqual(['East Garden', 'West Garden']);
    await made.report({ who: 'grunt:water', stop: stop(1) });
    expect(await titles()).toEqual(['West Garden', 'East Garden']);
  });

  it('reads the last report only where the list could use it, not for a maps link (review P2)', async () => {
    const made = await setup(NEARBY);
    await made.report({ who: 'grunt:water', stop: stop(1) });
    const read = vi.spyOn(made.ctx.stopReports, 'latestToday');
    expect(await offered(made, 'https://maps.google.com/?q=40.06,-80.06')).toEqual([]);
    expect(await offered(made, '40.06, -80.06')).toEqual([]);
    expect(read).not.toHaveBeenCalled();
    await offered(made, 'garden');
    await offered(made, '');
    expect(read).toHaveBeenCalledTimes(2);
  });

  it('lists as without an anchor when the reports do not answer within a second (review P1)', async () => {
    const made = await setup(NEARBY);
    await made.report({ who: 'grunt:water', stop: stop(1) });
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'], now: Date.now() });
    // A slow pool after a restart (no record): the read never answers.
    vi.spyOn(made.ctx.stopReports, 'latestToday').mockReturnValue(new Promise(() => undefined));
    let answered = false;
    const typing = made.typing('stop', 'garden').then((interaction) => {
      answered = true;
      return interaction;
    });
    await vi.advanceTimersByTimeAsync(999);
    expect(answered).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    const choices = (await typing).respond.mock.calls[0]?.[0] ?? [];
    // The list as before: of the gardens alike, the feed's order, not the nearer to Yellow Mural.
    expect(choices.map((one) => one.name.split(' (')[0])).toEqual(['East Garden', 'West Garden']);
    expect(made.entries).toContainEqual(
      expect.objectContaining({
        level: 20,
        msg: 'the reports at stops did not answer in time for /rocket report’s list',
      }),
    );
  });
});

describe('/rocket report’s help (plan 8R-9)', () => {
  it('says that a hideout goes in "Today’s Stops" on the region’s board, a leader with a line', () => {
    const { ctx } = createTestContext();
    const message = renderSubcommandHelp(rocket, 'report', ctx.config.settings);
    if (!message) throw new Error('no help');
    const [details = ''] = textDisplays(message);
    expect(details).toContain('goes in "Today’s Stops" on the region’s board until midnight');
    expect(details).toContain('a line in the region’s channel');
    // The board is open to commands since plan 8R-9F.
    expect(details).toContain('You can report from the board too');
  });

  it('says the stops are offered near the member’s last report, in the settings’ units', () => {
    const { ctx } = createTestContext();
    for (const distanceUnits of ['metric', 'imperial'] as const) {
      const message = renderSubcommandHelp(rocket, 'report', {
        ...ctx.config.settings,
        distanceUnits,
      });
      expect(textDisplays(message)[0]).toContain(
        'Those near the stop where you last reported today (research or Team GO Rocket, also a ' +
          'report that has ended or changed since, but not one you took back) come first among ' +
          `stops that fit what you type equally well. With nothing typed, it lists the PokéStops within ` +
          `${distanceWords(2_000, distanceUnits)} of that stop, nearest first.`,
      );
    }
  });
});
