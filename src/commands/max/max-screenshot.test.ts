import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FAKE_GUILD_ID,
  FAKE_USER_ID,
  fakeButton,
  fakeChatInput,
  fakeSelect,
  sent,
  type FakeInteraction,
} from '../../../test/support/fake-interactions.js';
import { EAST_CHANNEL, WEST_CHANNEL, WEST_FORUM } from '../../../test/support/gyms.js';
import { maxReportingWith, MAX_THURSDAY } from '../../../test/support/max-reporting.js';
import { MOD_CHANNEL, type SafetyOptions } from '../../../test/support/meetup-safety-service.js';
import { asMax, at, BOB, TEST_SPOT } from '../../../test/support/parties.js';
import { screenshotsWith } from '../../../test/support/screenshot-service.js';
import {
  eggReading,
  maxReading,
  readingOf,
  splitOutcome,
} from '../../../test/support/screenshots.js';
import { createTestContext } from '../../../test/support/test-context.js';
import { keptRow } from '../../../test/support/wayspot-cases.js';
import { enabledCommands } from '../../discord/command.js';
import { InteractionRouter } from '../../discord/router.js';
import { Throttles } from '../../discord/throttle.js';
import type { RaidBossRef } from '../../domain/party/party.js';
import type { MaxTier } from '../../domain/pogo/max-tier.js';
import type { WayspotRow } from '../../domain/wayspots/kept.js';
import type { ScreenReading } from '../../ocr/screen-reader.js';
import type { OcrOutcome } from '../../services/ocr-service.js';
import type { KeptScreenshot } from '../../services/screenshot-store.js';
import { maxDecisionWords, screenshotControls } from '../screenshots/feedback.js';
import { max, maxControls } from './max.js';
import { WHICH_TIER } from './max-input.js';
import { MAX_COMMAND, MAX_PIN_BLOCKED, MAX_THROTTLE, reportMaxAs } from './max-report.js';

/*
 * `/max screenshot:` (plan 8X-S, task 6). `MAX_THURSDAY` is 14:00; `maxReading()` is a Dynamax
 * Machop (2★) at the test spot's Power Spot, its clock read surely at 13:58 and 30 minutes to go.
 */

const END = at('2026-10-22T14:28');
const t = (time: number) => `<t:${String(time / 1000)}:t>`;

/** A second Power Spot whose name begins as the test spot's. */
const POND = keptRow(2, {
  id: 'c0ffee00c0ffee00c0ffee00c0ffee01.16',
  kind: 'powerspot',
  title: 'Gazebo of the Pond',
  lat: TEST_SPOT.lat + 0.0001,
  lon: TEST_SPOT.lon,
});

async function setup(safety: SafetyOptions = { moderation: null }, rows: WayspotRow[] = []) {
  const made = await maxReportingWith(safety, rows);
  const shots = screenshotsWith(made.ctx);
  const ctx = { ...made.ctx, screenshots: shots.screenshots };
  const throttles = new Throttles();
  const router = new InteractionRouter(ctx, [max], [maxControls, screenshotControls], {
    throttles,
  });
  const handle = async (interaction: FakeInteraction) => {
    await router.handle(interaction as never);
    await made.service.flush();
    return interaction;
  };
  /** `/max` with these options, and this screenshot attached when one is given. */
  const run = (
    options: Record<string, string>,
    reading?: ScreenReading | OcrOutcome,
    channelId = WEST_CHANNEL,
  ) =>
    handle(
      fakeChatInput({
        commandName: 'max',
        channelId,
        options,
        ...(reading === undefined
          ? {}
          : { resolved: { screenshot: shots.screenshot('max.png', reading) } }),
      }),
    );
  return { ...shots, ...made, ctx, router, throttles, handle, run };
}

const MACHOP = { boss: { key: 'machop' }, tier: 'D2' as const, label: 'Dynamax Machop (2★)' };
const MACHAMP = { boss: { key: 'machamp' }, tier: 'D2' as const, label: 'Dynamax Machamp (2★)' };

/** Bob's battle of this boss at the test spot until `end`, reported ten minutes before 14:00. */
async function battleOf(
  made: Awaited<ReturnType<typeof setup>>,
  boss: { boss: RaidBossRef; tier: MaxTier; label: string },
  end = at('2026-10-22T15:00'),
) {
  vi.setSystemTime(MAX_THURSDAY - 10 * 60_000);
  await reportMaxAs(
    made.ctx,
    { id: BOB, name: 'Bob' },
    FAKE_GUILD_ID,
    { boss, spot: TEST_SPOT, end, regionChannelId: WEST_CHANNEL },
    { mayJoin: () => Promise.resolve(true), staff: false },
  );
  vi.setSystemTime(MAX_THURSDAY);
  await made.service.flush();
  return asMax(made.store.active()[0]);
}

/** What the member was told: a follow-up, else the edit of the deferred answer, else the reply. */
function told(interaction: FakeInteraction) {
  for (const responder of [interaction.followUp, interaction.editReply, interaction.reply]) {
    if (responder.mock.calls.length > 0) return sent(responder);
  }
  throw new Error('nothing was told');
}

/** The id of the one screenshot kept. */
function keptId(made: { files: (folder: 'held' | 'review') => string[] }): string {
  const records = made.files('held').filter((name) => name.endsWith('.json'));
  expect(records).toHaveLength(1);
  return (records[0] ?? '').replace(/\.json$/, '');
}

function rowsOf(payload: { components?: readonly unknown[] }) {
  return (payload.components ?? []).map(
    (row) =>
      ((row as { toJSON?: () => unknown }).toJSON?.() ?? row) as {
        components: {
          custom_id: string;
          label?: string;
          options?: { label: string; value: string; description?: string }[];
        }[];
      },
  );
}

describe('/max screenshot:', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'], now: MAX_THURSDAY });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('reports the battle it reads, with its screenshot and the button that shows it', async () => {
    const made = await setup();
    const used = await made.run({}, maxReading());
    const battle = asMax(made.store.active()[0]);
    expect(battle).toMatchObject({
      endTime: END,
      max: { boss: { key: 'machop' }, tier: 'D2', spot: { id: TEST_SPOT.id } },
    });
    const id = battle.max.screenshot?.id ?? '';
    expect(id).not.toBe('');
    const answer = told(used);
    expect(answer.content).toBe(
      `Reported: Dynamax Machop (2★) at Gazebo of the Park, until ${t(END)}. Its post is ` +
        `<#${battle.forumPostId ?? ''}>.`,
    );
    expect(rowsOf(answer)[0]?.components[0]).toMatchObject({
      custom_id: `shot:${id}:show`,
      label: 'Screenshot feedback',
    });
    const kept = await made.screenshots.get(id);
    expect(kept).toMatchObject({ record: { use: 'max', keepUntil: null } });
  });

  // Review F-5: the member's own end is no guess, however unsure the screenshot's moment.
  it('takes a typed end as no guessed time', async () => {
    const unsure = { clock: { hour: 13, minute: 58, confidence: 0.3 } };
    const made = await setup();
    await made.run({}, maxReading(undefined, {}, unsure));
    const read = asMax(made.store.active()[0]);
    expect(read.max.screenshot?.timeUncertain).toBe(true);
    const other = await setup();
    await other.run({ end: '20' }, maxReading(undefined, {}, unsure));
    const typed = asMax(other.store.active()[0]);
    expect(typed.endTime).toBe(at('2026-10-22T14:20'));
    expect(typed.max.screenshot?.timeUncertain).toBe(false);
  });

  it('lets what the member typed count instead of what it read', async () => {
    const made = await setup(undefined, [POND]);
    await made.run(
      { boss: 'Machamp', tier: 'D3', spot: `powerspot:${POND.id}`, end: '20' },
      maxReading(),
    );
    expect(asMax(made.store.active()[0])).toMatchObject({
      endTime: at('2026-10-22T14:20'),
      max: { boss: { key: 'machamp' }, tier: 'D3', spot: { id: POND.id } },
    });
  });

  // Review S-5: the record says what was typed and what was decided with it.
  it('keeps what was typed beside it in the record, decided with it', async () => {
    const made = await setup(undefined, [POND]);
    await made.run(
      { boss: 'Machamp', tier: 'D3', spot: `powerspot:${POND.id}`, end: '20' },
      maxReading('SOMEWHERE ELSE ENTIRELY'),
    );
    const battle = asMax(made.store.active()[0]);
    const kept = await made.screenshots.get(battle.max.screenshot?.id ?? '');
    expect(kept).toMatchObject({
      record: {
        decision: { kind: 'report' },
        typed: null,
        maxTyped: {
          spot: { id: POND.id, title: 'Gazebo of the Pond' },
          boss: { ref: { key: 'machamp' }, tier: 'D3' },
          end: at('2026-10-22T14:20'),
        },
        // The reader's own report, as it read it.
        max: { spot: { read: 'SOMEWHERE ELSE ENTIRELY', match: { kind: 'unknown' } } },
      },
    });
  });

  // Review F-2, F-3: a typed boss the screen cannot take fails the use, and its record goes to
  // review as one the screen could not do.
  it('asks the tier of a typed boss on no list when the screen does not tell it', async () => {
    const made = await setup();
    const used = await made.run({ boss: 'Machamp' }, maxReading(undefined, {}, {}, 0));
    expect(told(used).content).toBe(WHICH_TIER);
    expect(made.store.active()).toEqual([]);
    const id = keptId(made);
    expect(await made.screenshots.get(id)).toMatchObject({
      record: { decision: { kind: 'ask', doubts: ['tier-unknown'] } },
    });
    expect(made.files('review')).toContain(`${id}.json`);
  });

  it('refuses a typed boss that cannot battle as the screen shows', async () => {
    const made = await setup();
    const used = await made.run(
      { boss: 'Charmeleon' },
      maxReading(undefined, { form: 'gigantamax', species: 'CHARIZARD' }),
    );
    expect(told(used).content).toBe('Charmeleon is no Gigantamax boss.');
    expect(made.store.active()).toEqual([]);
    const id = keptId(made);
    const kept = await made.screenshots.get(id);
    expect(kept).toMatchObject({
      record: { decision: { kind: 'refuse', reason: 'typed-boss' } },
    });
    expect(made.files('review')).toContain(`${id}.json`);
    // Its record says so when it is shown.
    const { record } = kept as KeptScreenshot;
    expect(
      maxDecisionWords(record.decision, record.max!, made.ctx.config.settings.maxBattles),
    ).toBe('The boss typed beside it cannot battle as this screen shows, so nothing was reported.');
  });

  it('shows what it read, not what was typed, beside a refusal', async () => {
    const made = await setup();
    const used = await made.run(
      { spot: `powerspot:${TEST_SPOT.id}` },
      maxReading('SOMEWHERE ELSE ENTIRELY', { species: 'QQQQQQ' }),
    );
    const { content } = told(used);
    expect(content).toMatch(/Nothing was reported\. This is what I read:/);
    expect(content).toContain('`SOMEWHERE ELSE ENTIRELY` → no Power Spot');
    expect(content).not.toContain('Gazebo of the Park');
  });

  it('takes the tier of a typed boss on no list from the heads it read', async () => {
    const made = await setup();
    await made.run({ boss: 'Machamp' }, maxReading(undefined, {}, {}, 3));
    expect(asMax(made.store.active()[0]).max).toMatchObject({
      boss: { key: 'machamp' },
      tier: 'D3',
    });
  });

  // Review r4 B1.
  it('takes `tier:` typed alone as the tier of a boss on no list whose heads it did not read', async () => {
    const made = await setup();
    const used = await made.run(
      { tier: 'D3' },
      maxReading(undefined, { species: 'MACHAMP' }, {}, 0),
    );
    expect(told(used).content).toMatch(/^Reported: Dynamax Machamp \(3★\)/);
    expect(asMax(made.store.active()[0]).max).toMatchObject({
      boss: { key: 'machamp' },
      tier: 'D3',
    });
  });

  // Review r4 B3: as `/max` gives a refusal at a pin back.
  it('refuses a pin typed beside it to a member blocked from meetups, uncounted', async () => {
    const made = await setup({});
    await made.storage.addBlock(made.gateway.guildId, FAKE_USER_ID, {
      id: '200000000000000009',
      name: 'Mod',
      at: MAX_THURSDAY,
    });
    // One more than `/max` allows: none of them counted.
    for (let n = 0; n <= MAX_THROTTLE.uses; n++) {
      const refused = await made.run({ spot: '40.05, -80.05' }, maxReading());
      expect(told(refused).content).toContain(MAX_PIN_BLOCKED);
    }
    expect(made.store.active()).toEqual([]);
  });

  it('reports what was typed when the screenshot cannot be read, and says why otherwise', async () => {
    const made = await setup();
    const typed = await made.run(
      { boss: 'Machop', spot: `powerspot:${TEST_SPOT.id}` },
      { kind: 'unavailable' },
    );
    expect(told(typed).content).toMatch(
      /^I could not read the screenshot, so I used what you typed\.\nReported: Dynamax Machop \(2★\) at Gazebo of the Park/,
    );
    expect(made.store.active()).toHaveLength(1);
    const bare = await made.run({}, { kind: 'unavailable' });
    expect(told(bare).content).toBe(
      'I cannot read screenshots at the moment. Report the max battle with `/max` and its options.',
    );
  });

  it('reports the max battle of a split screenshot, and names the raid beside it (plan 7P)', async () => {
    const made = await setup();
    const egg = eggReading('Old Stone Fountain', 5, { hour: 13, minute: 59 }, 20 * 60);
    const used = await made.run({}, splitOutcome([egg, maxReading()]));
    expect(asMax(made.store.active()[0])).toMatchObject({ max: { boss: { key: 'machop' } } });
    expect(sent(used.followUp).content).toBe(
      'The raid beside it was not reported: post the screenshot in the channel with a mention of me to report both.',
    );
    // After the answer, never before it (a first follow-up takes the deferred answer's place).
    const edited = Math.min(...used.editReply.mock.invocationCallOrder);
    expect(Math.min(...used.followUp.mock.invocationCallOrder)).toBeGreaterThan(edited);
  });

  it('refuses two max battles in one picture, pointing to the mention (plan 7P)', async () => {
    const made = await setup();
    const used = await made.run({}, splitOutcome([maxReading(), maxReading()]));
    expect(made.store.active()).toEqual([]);
    expect(told(used).content).toBe(
      'This screenshot shows two max battles: post it in the channel with a mention of me to report both.',
    );
  });

  // Review S1: the reading of two screens is unusable, so no tier is taken from it.
  it('asks the tier of a typed boss on no list beside two screens it could not tell apart', async () => {
    const made = await setup();
    const gigantamax = maxReading(undefined, { form: 'gigantamax', species: 'CHARIZARD' });
    const used = await made.run(
      { boss: 'Machamp', spot: `powerspot:${TEST_SPOT.id}` },
      { kind: 'read', reading: gigantamax, twoScreens: true },
    );
    expect(told(used).content).toBe(WHICH_TIER);
    expect(made.store.active()).toEqual([]);
  });

  it('refuses a raid’s screen, also beside a typed boss and spot', async () => {
    const made = await setup();
    const egg = eggReading('Old Stone Fountain', 5, { hour: 13, minute: 59 }, 20 * 60);
    for (const typed of [{}, { boss: 'Machop', spot: `powerspot:${TEST_SPOT.id}` }] as Record<
      string,
      string
    >[]) {
      const used = await made.run(typed, egg);
      expect(told(used).content).toBe(
        'That is a raid: use `/raid screenshot:`, or post it with a mention.',
      );
    }
    expect(made.store.active()).toEqual([]);
  });

  it('takes a picture that is no screen as unreadable: what was typed, else why not', async () => {
    const made = await setup();
    const picture = readingOf({ gym: 'Old Stone Fountain' });
    const bare = await made.run({}, picture);
    expect(told(bare).content).toBe(
      'This does not look like the screen of a max battle, so I made nothing of it.',
    );
    const typed = await made.run({ boss: 'Machop', spot: `powerspot:${TEST_SPOT.id}` }, picture);
    expect(told(typed).content).toMatch(
      /^I could not read the screenshot, so I used what you typed\.\nReported: Dynamax Machop/,
    );
  });

  it('needs the boss and the spot without a screenshot, before counting the use', async () => {
    const made = await setup();
    const none = await made.run({});
    expect(told(none).content).toBe(
      'Give the boss and the spot of the max battle (or attach a screenshot of it).',
    );
    const noSpot = await made.run({ boss: 'Machop' });
    expect(told(noSpot).content).toBe(
      'Give the spot of the max battle (or attach a screenshot of it).',
    );
    const now = Date.now();
    for (let i = 0; i < MAX_THROTTLE.uses; i++) {
      expect(made.throttles.use(MAX_COMMAND, FAKE_USER_ID, MAX_THROTTLE, now)).toBeUndefined();
    }
  });

  it('refuses a typed end that is no time before reading the screenshot', async () => {
    const made = await setup();
    const used = await made.run({ end: 'soonish' }, maxReading());
    expect(told(used).content).toBe(
      'I could not read "soonish" as the time the battle ends. Try `20` (minutes from now) or `6:15pm`.',
    );
    expect(made.reader.reads).toBe(0);
  });

  it('asks which Power Spot a name cut short may be, and reports at the one picked', async () => {
    const made = await setup(undefined, [POND]);
    const used = await made.run({}, maxReading('GAZEBO OF THE P'));
    expect(made.store.active()).toEqual([]);
    const question = told(used);
    expect(question.content).toBe(
      `Dynamax Machop (2★), ending at ${t(END)}. Which Power Spot is it? I read "GAZEBO OF THE P".`,
    );
    const [menu] = rowsOf(question)[0]?.components ?? [];
    expect(menu?.options?.map((option) => option.value)).toEqual([TEST_SPOT.id, POND.id]);
    const pick = await made.handle(
      fakeSelect({ customId: menu?.custom_id ?? '', values: [POND.id] }),
    );
    const battle = asMax(made.store.active()[0]);
    expect(battle.max.spot).toMatchObject({ id: POND.id });
    expect(told(pick).content).toMatch(/^Reported: Dynamax Machop \(2★\) at Gazebo of the Pond/);
    // A second pick after the answer is only acknowledged.
    const again = await made.handle(
      fakeSelect({ customId: menu?.custom_id ?? '', values: [TEST_SPOT.id] }),
    );
    expect(again.deferUpdate).toHaveBeenCalled();
    expect(again.update).not.toHaveBeenCalled();
    expect(made.store.active()).toHaveLength(1);
    const kept = await made.screenshots.get(battle.max.screenshot?.id ?? '');
    expect(kept).toMatchObject({ record: { pickedSpotId: POND.id } });
  });

  it('gives the use back when the battle chosen from the menu gets no post', async () => {
    const made = await setup(undefined, [POND]);
    made.gateway.refusePosts.set(WEST_FORUM, ['Manage Posts']);
    // Nineteen uses before it: the menu's use is the twentieth.
    for (let i = 0; i < MAX_THROTTLE.uses - 1; i++) {
      made.throttles.use(MAX_COMMAND, FAKE_USER_ID, MAX_THROTTLE, Date.now());
    }
    const used = await made.run({}, maxReading('GAZEBO OF THE P'));
    const [menu] = rowsOf(told(used))[0]?.components ?? [];
    const pick = await made.handle(
      fakeSelect({ customId: menu?.custom_id ?? '', values: [POND.id] }),
    );
    expect(told(pick).content).toMatch(/^I am not allowed to make posts in /);
    expect(made.throttles.use(MAX_COMMAND, FAKE_USER_ID, MAX_THROTTLE, Date.now())).toBeUndefined();
  });

  it('confirms a clear Power Spot of another region before reporting it there', async () => {
    const made = await setup();
    const used = await made.run({}, maxReading(), EAST_CHANNEL);
    expect(made.store.active()).toEqual([]);
    const question = told(used);
    expect(question.content).toBe(
      `Gazebo of the Park is in <#${WEST_CHANNEL}>, not in this region. Report the max battle there?`,
    );
    const [yes, no] = rowsOf(question)[0]?.components ?? [];
    expect([yes?.label, no?.label]).toEqual(['Report it there', 'Cancel']);
    const press = await made.handle(fakeButton({ customId: yes?.custom_id ?? '' }));
    expect(asMax(made.store.active()[0]).max.spot).toMatchObject({ id: TEST_SPOT.id });
    expect(told(press).content).toMatch(/^Reported: Dynamax Machop \(2★\)/);
    // A second press after the answer is only acknowledged: "Reported: …" stays.
    const again = await made.handle(fakeButton({ customId: yes?.custom_id ?? '' }));
    expect(again.deferUpdate).toHaveBeenCalled();
    expect(again.update).not.toHaveBeenCalled();
    expect(again.editReply).not.toHaveBeenCalled();
    const cancel = await made.handle(fakeButton({ customId: no?.custom_id ?? '' }));
    expect(cancel.update).not.toHaveBeenCalled();
    expect(made.store.active()).toHaveLength(1);
  });

  it('refuses a Power Spot it does not know, and tells the staff of a name read surely', async () => {
    const made = await setup({});
    const used = await made.run({}, maxReading('NOWHERE IN PARTICULAR'));
    expect(told(used).content).toMatch(
      /^I do not know a Power Spot called "NOWHERE IN PARTICULAR" here: use `\/max spot:`\. I have let the staff know Pine may be missing this Power Spot\.\nNothing was reported\. This is what I read:\n/,
    );
    // Its feedback is a max battle's.
    expect(rowsOf(told(used))[0]?.components[1]?.custom_id).toMatch(/^shot:[\w-]+:wrong:max$/);
    await made.reports.flush();
    expect(made.gateway.messagesIn(MOD_CHANNEL)).toHaveLength(1);
    // A spot typed beside it is reported, and nobody is told.
    await made.run({ spot: `powerspot:${TEST_SPOT.id}` }, maxReading('SOMEWHERE ELSE'));
    expect(made.store.active()).toHaveLength(1);
    await made.reports.flush();
    expect(made.gateway.messagesIn(MOD_CHANNEL)).toHaveLength(1);
  });

  // Review S-2 (Matt, 2026-10-23): only a boss and spot the screen itself showed change a boss.
  it('changes no boss of a battle there when the boss or the spot was typed', async () => {
    const made = await setup();
    const there = await battleOf(made, MACHAMP);
    const refused = new RegExp(
      `^There is already a max battle against Dynamax Machamp \\(2★\\) at Gazebo of the Park: ` +
        `<#${there.forumPostId ?? ''}>\\. \`/boss\` there changes its boss\\.`,
    );
    const bySpot = await made.run({ spot: `powerspot:${TEST_SPOT.id}` }, maxReading());
    expect(told(bySpot).content).toMatch(refused);
    // Even when the boss typed is the one the screen shows.
    const byBoss = await made.run({ boss: 'Machop' }, maxReading());
    expect(told(byBoss).content).toMatch(refused);
    expect(asMax(made.store.get(there.id)).max.boss).toEqual({ key: 'machamp' });
    // Read alone, the same screenshot changes it.
    await made.run({}, maxReading());
    expect(asMax(made.store.get(there.id)).max.boss).toEqual({ key: 'machop' });
  });

  // Review F-1: as `/max`'s guard refuses another boss there uncounted.
  it('gives the use back when a battle of another boss there refuses it', async () => {
    const made = await setup();
    const there = await battleOf(made, MACHAMP);
    // One more than `/max` allows: none of them counted.
    for (let n = 0; n <= MAX_THROTTLE.uses; n++) {
      const refused = await made.run({ spot: `powerspot:${TEST_SPOT.id}` }, maxReading());
      expect(told(refused).content).toMatch(
        /^There is already a max battle against Dynamax Machamp/,
      );
    }
    expect(asMax(made.store.get(there.id)).max.boss).toEqual({ key: 'machamp' });
  });

  it('gives the use back when what was typed alone meets a battle of another boss', async () => {
    const made = await setup();
    await battleOf(made, MACHAMP);
    for (let n = 0; n <= MAX_THROTTLE.uses; n++) {
      const refused = await made.run(
        { boss: 'Machop', spot: `powerspot:${TEST_SPOT.id}` },
        { kind: 'unavailable' },
      );
      expect(told(refused).content).toMatch(
        /^I could not read the screenshot, so I used what you typed\.\nThere is already a max battle against Dynamax Machamp/,
      );
    }
  });

  it('moves no end of the same boss there when the spot was typed', async () => {
    const made = await setup();
    const there = await battleOf(made, MACHOP, at('2026-10-22T14:20'));
    await made.run({ spot: `powerspot:${TEST_SPOT.id}` }, maxReading());
    expect(asMax(made.store.get(there.id))).toMatchObject({
      endTime: at('2026-10-22T14:20'),
      attendees: { [FAKE_USER_ID]: expect.anything() as unknown },
    });
    // Read alone, its clean read moves the end.
    await made.run({}, maxReading());
    expect(asMax(made.store.get(there.id)).endTime).toBe(END);
  });

  // Review S-1 (Matt, 2026-10-23): an event's picture of a boss has no countdown.
  it('tells no staff of a Power Spot it does not know on a screen without a countdown', async () => {
    const made = await setup({});
    const used = await made.run({}, maxReading('NOWHERE IN PARTICULAR', {}, { countdown: null }));
    expect(told(used).content).toMatch(
      /^I do not know a Power Spot called "NOWHERE IN PARTICULAR" here: use `\/max spot:`\.\nNothing was reported\./,
    );
    await made.reports.flush();
    expect(made.gateway.messagesIn(MOD_CHANNEL)).toEqual([]);
  });

  it('offers the screenshot option where screenshots are read, boss and spot optional there', () => {
    const { ctx } = createTestContext();
    const off = {
      ...ctx.config,
      settings: { ...ctx.config.settings, ocr: { ...ctx.config.settings.ocr, enabled: false } },
    };
    const required = (config: typeof off) =>
      enabledCommands([max], config)[0]
        ?.data.toJSON()
        .options?.map((o) => [o.name, o.required ?? false]);
    expect(required(off)).toEqual([
      ['boss', true],
      ['spot', true],
      ['tier', false],
      ['end', false],
    ]);
    expect(required(ctx.config)).toEqual([
      ['boss', false],
      ['spot', false],
      ['tier', false],
      ['end', false],
      ['screenshot', false],
    ]);
  });

  // Matt, 2026-10-23 (review r4 B4): "Power Spot" as the game writes it, but the pin's name.
  it('writes Power Spot as the game does in the definition and the help, but the pin’s name', () => {
    const { ctx } = createTestContext();
    const command = enabledCommands([max], ctx.config)[0];
    const json = command?.data.toJSON();
    const details = command?.help?.details;
    const texts = [
      json?.description,
      ...(json?.options ?? []).map((option) => option.description),
      typeof details === 'function' ? details(ctx.config.settings) : details,
    ].join('\n');
    expect(texts).toContain('Power Spot');
    expect(texts.replaceAll('unlisted power spot', '')).not.toMatch(/power spot/);
  });

  // Review S-3: a max battle's post has no Screenshot feedback, so nobody sees it from there.
  it('promises nothing of the screenshot that a max battle’s post does not do', () => {
    const { ctx } = createTestContext();
    const command = enabledCommands([max], ctx.config)[0];
    const option = command?.data.toJSON().options?.find((one) => one.name === 'screenshot');
    const details = command?.help?.details;
    const help = typeof details === 'function' ? details(ctx.config.settings) : (details ?? '');
    for (const text of [option?.description ?? '', help]) {
      expect(text).not.toMatch(/see it from the post/i);
      expect(text).toMatch(/kept/);
      expect(text).toMatch(/improve the reader/);
    }
  });
});
