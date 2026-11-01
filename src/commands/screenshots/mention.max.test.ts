import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FAKE_GUILD_ID,
  fakeButton,
  fakeSelect,
  sent,
} from '../../../test/support/fake-interactions.js';
import { EAST_CHANNEL, WEST_CHANNEL } from '../../../test/support/gyms.js';
import { maxReportingWith, MAX_THURSDAY } from '../../../test/support/max-reporting.js';
import { MOD_CHANNEL, type SafetyOptions } from '../../../test/support/meetup-safety-service.js';
import { asMax, at, BOB, TEST_SPOT } from '../../../test/support/parties.js';
import { AUTHOR, OTHER, posted } from '../../../test/support/posted-message.js';
import { screenshotsWith } from '../../../test/support/screenshot-service.js';
import { maxReading } from '../../../test/support/screenshots.js';
import { keptRow } from '../../../test/support/wayspot-cases.js';
import { InteractionRouter } from '../../discord/router.js';
import type { RaidBossRef } from '../../domain/party/party.js';
import type { MaxTier } from '../../domain/pogo/max-tier.js';
import type { WayspotRow } from '../../domain/wayspots/kept.js';
import type { ScreenReading } from '../../ocr/screen-reader.js';
import { reportMaxAs } from '../max/max-report.js';
import { screenshotControls } from './feedback.js';
import { DONE, READING, ScreenshotTrigger, type ReplyPayload } from './mention.js';

/*
 * A max battle's screenshot posted in a region channel (plan 8X-S, task 5): with a mention of the
 * bot, and read passively. `MAX_THURSDAY` is 14:00; `maxReading()` is a Dynamax Machop (2★) at
 * the test spot's Power Spot, its clock read surely at 13:58 and 30 minutes to go.
 */

const MINUTE = 60_000;
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

/** A Power Spot of the East region whose name begins as the test spot's (plan 8F-1). */
const PAVILION = keptRow(3, {
  id: 'c0ffee00c0ffee00c0ffee00c0ffee02.16',
  kind: 'powerspot',
  title: 'Gazebo of the Pavilion',
  lat: 40.05,
  lon: -79.95,
});

async function setup(
  options: { passive?: boolean; safety?: SafetyOptions; rows?: WayspotRow[] } = {},
) {
  const made = await maxReportingWith(options.safety ?? { moderation: null }, options.rows ?? []);
  const shots = screenshotsWith(made.ctx);
  const passive = options.passive ?? false;
  const ocr = { ...made.ctx.config.settings.ocr, passive, enabled: true };
  const ctx = {
    ...made.ctx,
    screenshots: shots.screenshots,
    config: { ...made.ctx.config, settings: { ...made.ctx.config.settings, ocr } },
    features: { ocrPassive: passive, autoAssignRole: false },
  };
  const trigger = new ScreenshotTrigger({ ctx, replyMs: 20, questionMs: 60_000 });
  const router = new InteractionRouter(ctx, [], [screenshotControls]);
  /** Posts a message of this screenshot, as the author unless `more` says otherwise. */
  const post = async (
    reading: ScreenReading,
    more: Parameters<typeof posted>[1] = {},
    name = 'max.png',
  ) => {
    const sent = posted([shots.screenshot(name, reading)], { mentionsBot: !passive, ...more });
    await trigger.handle(sent.message);
    await made.service.flush();
    return sent;
  };
  /** Bob's battle of this boss at the test spot, reported ten minutes before 14:00 by default. */
  const battle = async (
    boss: { boss: RaidBossRef; tier: MaxTier; label: string },
    when = MAX_THURSDAY - 10 * MINUTE,
  ) => {
    vi.setSystemTime(when);
    await reportMaxAs(
      made.ctx,
      { id: BOB, name: 'Bob' },
      FAKE_GUILD_ID,
      { boss, spot: TEST_SPOT, end: at('2026-10-22T15:00'), regionChannelId: WEST_CHANNEL },
      { mayJoin: () => Promise.resolve(true), staff: false },
    );
    vi.setSystemTime(MAX_THURSDAY);
    await made.service.flush();
    return asMax(made.store.active()[0]);
  };
  return { ...shots, ...made, ctx, trigger, router, post, battle };
}

const MACHOP = { boss: { key: 'machop' }, tier: 'D2' as const, label: 'Dynamax Machop (2★)' };
const MACHAMP = { boss: { key: 'machamp' }, tier: 'D2' as const, label: 'Dynamax Machamp (2★)' };
const GIANT = { boss: { key: 'machamp' }, tier: 'G' as const, label: 'Gigantamax Machamp' };

const menuOf = (reply: ReplyPayload | undefined) =>
  reply?.components?.[0]?.components[0] as {
    custom_id: string;
    options: { label: string; value: string; description?: string }[];
  };
const buttonsOf = (reply: ReplyPayload | undefined) =>
  (reply?.components?.[0]?.components ?? []) as { custom_id: string; label: string }[];

describe('a max battle’s screenshot posted with a mention of the bot', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'], now: MAX_THURSDAY });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('reports a clear Power Spot of the channel’s region unasked, with its screenshot, and deletes the message', async () => {
    const made = await setup();
    const { did, replies } = await made.post(maxReading());
    const battle = asMax(made.store.active()[0]);
    expect(battle).toMatchObject({
      createdById: AUTHOR,
      endTime: END,
      max: { boss: { key: 'machop' }, tier: 'D2', spot: { id: TEST_SPOT.id } },
    });
    const id = battle.max.screenshot?.id ?? '';
    expect(battle.max.screenshot).toEqual({ id, timeUncertain: false });
    // Its post shows it: kept while the battle lasts.
    expect(await made.screenshots.get(id)).toMatchObject({ record: { keepUntil: null } });
    expect(replies).toEqual([]);
    expect(did).toEqual([`react ${READING}`, `unreact ${READING}`, 'deleted']);
  });

  it('joins the battle of its boss there, and answers with its post', async () => {
    const made = await setup();
    const there = await made.battle(MACHOP);
    const { replies, did } = await made.post(maxReading(), { bare: false });
    expect(made.store.active()).toHaveLength(1);
    expect(asMax(made.store.get(there.id)).attendees[AUTHOR]).toBeDefined();
    expect(replies[0]?.content).toMatch(
      new RegExp(
        `^There is already a max battle against Dynamax Machop \\(2★\\) at this spot: <#${there.forumPostId ?? ''}>\\. You have been marked as \\w+\\.$`,
      ),
    );
    expect(did).toContain(`react ${DONE}`);
  });

  it('changes the boss there from a newer screenshot, and says so', async () => {
    const made = await setup();
    const there = await made.battle(MACHAMP);
    const { replies } = await made.post(maxReading());
    expect(asMax(made.store.get(there.id))).toMatchObject({
      endTime: END,
      max: { boss: { key: 'machop' }, tier: 'D2' },
    });
    expect(replies[0]?.content).toBe(
      `Changed the boss of the max battle at Gazebo of the Park to Dynamax Machop (2★) from your ` +
        `screenshot, until ${t(END)}. Its post is <#${there.forumPostId ?? ''}>.`,
    );
  });

  it('refuses another boss on an older screenshot, naming the post and `/boss`', async () => {
    const made = await setup();
    // Reported at 14:00, after the screenshot was taken (13:58).
    const there = await made.battle(MACHAMP, MAX_THURSDAY);
    const { replies } = await made.post(maxReading());
    expect(asMax(made.store.get(there.id)).max.boss).toEqual({ key: 'machamp' });
    expect(replies[0]?.content).toBe(
      'There is already a max battle against Dynamax Machamp (2★) at Gazebo of the Park: ' +
        `<#${there.forumPostId ?? ''}>. \`/boss\` there changes its boss.`,
    );
  });

  it('refuses the other kind of battle without the `/boss` hint, even when newer', async () => {
    const made = await setup();
    const there = await made.battle(GIANT);
    const { replies } = await made.post(maxReading());
    expect(replies[0]?.content).toBe(
      'There is already a max battle against Gigantamax Machamp at Gazebo of the Park: ' +
        `<#${there.forumPostId ?? ''}>.`,
    );
  });

  it('asks which Power Spot a name cut short may be, and reports at the one picked', async () => {
    const made = await setup({ rows: [POND] });
    const { replies, did } = await made.post(maxReading('GAZEBO OF THE P'));
    expect(made.store.active()).toEqual([]);
    expect(replies[0]?.content).toBe(
      `Dynamax Machop (2★), ending at ${t(END)}. Which Power Spot is it? I read "GAZEBO OF THE P".`,
    );
    const menu = menuOf(replies[0]);
    expect(menu.custom_id).toMatch(/^shot:[\w-]+:spot$/);
    expect(menu.options.map((option) => option.label)).toEqual([
      'Gazebo of the Park',
      'Gazebo of the Pond',
    ]);
    const stranger = fakeSelect({ customId: menu.custom_id, values: [POND.id], userId: OTHER });
    await made.router.handle(stranger as never);
    expect(sent(stranger.reply).content).toBe('That is somebody else’s screenshot.');
    const pick = fakeSelect({ customId: menu.custom_id, values: [POND.id], userId: AUTHOR });
    await made.router.handle(pick as never);
    await made.service.flush();
    const battle = asMax(made.store.active()[0]);
    expect(battle.max.spot).toMatchObject({ id: POND.id });
    expect(sent(pick.editReply).content).toBe(
      `Reported: Dynamax Machop (2★) at Gazebo of the Pond, until ${t(END)}. Its post is ` +
        `<#${battle.forumPostId ?? ''}>.`,
    );
    const kept = await made.screenshots.get(battle.max.screenshot?.id ?? '');
    expect(kept).toMatchObject({ record: { pickedSpotId: POND.id } });
    expect(did).toContain('deleted');
  });

  // Plan 8F-1 (Matt, 2026-10-29): a cut name that fits a spot here and one elsewhere is asked.
  it('asks about a name cut short that fits a spot of the region and one of another', async () => {
    const made = await setup({ rows: [PAVILION] });
    const { replies } = await made.post(maxReading('GAZEBO OF THE PA'));
    expect(made.store.active()).toEqual([]);
    expect(menuOf(replies[0]).options).toEqual([
      { label: 'Gazebo of the Park', value: TEST_SPOT.id },
      { label: 'Gazebo of the Pavilion', value: PAVILION.id, description: 'east' },
    ]);
    // The whole name is still the spot of that name, unasked.
    await made.post(maxReading(), {}, 'b.png');
    expect(asMax(made.store.active()[0]).max.spot).toMatchObject({ id: TEST_SPOT.id });
  });

  it('asks about a clear Power Spot of another region, naming its region in the menu', async () => {
    const made = await setup();
    const { replies } = await made.post(maxReading(), { channelId: EAST_CHANNEL });
    expect(made.store.active()).toEqual([]);
    expect(menuOf(replies[0]).options).toEqual([
      { label: 'Gazebo of the Park', value: TEST_SPOT.id, description: 'west' },
    ]);
    const pick = fakeSelect({
      customId: menuOf(replies[0]).custom_id,
      values: [TEST_SPOT.id],
      userId: AUTHOR,
    });
    await made.router.handle(pick as never);
    expect(asMax(made.store.active()[0]).max.spot).toMatchObject({ id: TEST_SPOT.id });
  });

  it('refuses a Power Spot it does not know, and tells the staff of a name read surely', async () => {
    const made = await setup({ safety: {} });
    const { replies } = await made.post(maxReading('NOWHERE IN PARTICULAR'));
    expect(replies[0]?.content).toBe(
      'I do not know a Power Spot called "NOWHERE IN PARTICULAR" here: use `/max spot:`. ' +
        'I have let the staff know Pine may be missing this Power Spot.',
    );
    await made.reports.flush();
    expect(made.gateway.messagesIn(MOD_CHANNEL)).toHaveLength(1);
    // A name read poorly is no news for the staff.
    const poorly = await made.post(
      maxReading('SOMEWHERE ELSE ENTIRELY', { spotConfidence: 0.5 }),
      {},
      'max2.png',
    );
    expect(poorly.replies[0]?.content).toBe(
      'I do not know a Power Spot called "SOMEWHERE ELSE ENTIRELY" here: use `/max spot:`.',
    );
    await made.reports.flush();
    expect(made.gateway.messagesIn(MOD_CHANNEL)).toHaveLength(1);
  });

  // Review S-1 (Matt, 2026-10-23): an event's picture of a boss has no countdown.
  it('refuses a Power Spot it does not know on a screen without a countdown, telling no staff', async () => {
    const made = await setup({ safety: {} });
    const { replies } = await made.post(
      maxReading('NOWHERE IN PARTICULAR', {}, { countdown: null }),
    );
    expect(replies[0]?.content).toBe(
      'I do not know a Power Spot called "NOWHERE IN PARTICULAR" here: use `/max spot:`.',
    );
    await made.reports.flush();
    expect(made.gateway.messagesIn(MOD_CHANNEL)).toEqual([]);
  });

  it('says nothing of the staff where there is no moderators’ channel', async () => {
    const made = await setup();
    const { replies } = await made.post(maxReading('NOWHERE IN PARTICULAR'));
    expect(replies[0]?.content).toBe(
      'I do not know a Power Spot called "NOWHERE IN PARTICULAR" here: use `/max spot:`.',
    );
  });

  it('refuses a screenshot taken after the day’s last battle, and one of no boss it can tell', async () => {
    const made = await setup();
    vi.setSystemTime(at('2026-10-22T21:10'));
    const late = await made.post(
      maxReading(undefined, {}, { clock: null }),
      {},
      'Screenshot_20261022-210500.png',
    );
    expect(late.replies[0]?.content).toBe(
      'Max battles are over for today: they can be fought from 06:00 to 21:00.',
    );
    vi.setSystemTime(MAX_THURSDAY);
    const unknown = await made.post(maxReading(undefined, { species: 'MEWTWO' }), {}, 'b.png');
    expect(unknown.replies[0]?.content).toBe('I could not tell which boss: use `/max`.');
    expect(made.store.active()).toEqual([]);
  });

  // Review r4 B7: as a raid's post lost while it was made (plan 8S-3).
  it('does not count a screenshot whose max battle’s post was lost while it was made', async () => {
    const made = await setup();
    made.gateway.losePosts = true;
    for (let n = 0; n < 21; n++) {
      const { replies } = await made.post(maxReading(), {}, `max${String(n)}.png`);
      expect(replies.at(-1)?.content).not.toMatch(/many screenshots/);
    }
    // The twenty-first was read too: none of the earlier ones counted.
    expect(made.reader.reads).toBe(21);
    made.gateway.losePosts = false;
    await made.post(maxReading(), {}, 'last.png');
    expect(made.store.active()).toHaveLength(1);
    await made.trigger.close();
  });
});

describe('a max battle’s screenshot read passively', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'], now: MAX_THURSDAY });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('reports a clear Power Spot of its region and says nothing', async () => {
    const made = await setup({ passive: true });
    const { replies } = await made.post(maxReading());
    expect(made.store.active()).toHaveLength(1);
    expect(replies).toEqual([]);
  });

  it('says only that it cannot tell the Power Spot, pinging the author, and tells no staff', async () => {
    const made = await setup({ passive: true, safety: {}, rows: [POND] });
    const unknown = await made.post(maxReading('NOWHERE IN PARTICULAR'));
    expect(unknown.replies).toEqual([
      {
        content: `<@${AUTHOR}> I could not tell which Power Spot this is: use \`/max screenshot:\`.`,
        ping: AUTHOR,
      },
    ]);
    const unclear = await made.post(maxReading('GAZEBO OF THE P'), {}, 'b.png');
    expect(unclear.replies[0]?.content).toBe(
      `<@${AUTHOR}> I could not tell which Power Spot this is: use \`/max screenshot:\`.`,
    );
    await made.reports.flush();
    expect(made.gateway.messagesIn(MOD_CHANNEL)).toEqual([]);
    expect(made.store.active()).toEqual([]);
  });

  // Plan 8F-1 (Matt, 2026-10-29): a missed report is safer than a wrong spot.
  it('reports nothing for a name cut short that fits a spot of the region and one of another', async () => {
    const made = await setup({ passive: true, rows: [PAVILION] });
    const { replies } = await made.post(maxReading('GAZEBO OF THE PA'));
    expect(made.store.active()).toEqual([]);
    expect(replies[0]?.content).toBe(
      `<@${AUTHOR}> I could not tell which Power Spot this is: use \`/max screenshot:\`.`,
    );
    // The whole name is still reported.
    await made.post(maxReading(), {}, 'b.png');
    expect(made.store.active()).toHaveLength(1);
  });

  // Review S-1 (Matt, 2026-10-23): an event's picture of a boss has no countdown, a battle's
  // screen has one.
  it('does nothing at all with a screen without a countdown, whatever its Power Spot', async () => {
    const made = await setup({ passive: true, safety: {} });
    const unknown = await made.post(maxReading('NOWHERE IN PARTICULAR', {}, { countdown: null }));
    expect(unknown.replies).toEqual([]);
    expect(unknown.did).toEqual([`react ${READING}`, `unreact ${READING}`]);
    const clear = await made.post(maxReading(undefined, {}, { countdown: null }), {}, 'b.png');
    expect(clear.replies).toEqual([]);
    expect(made.store.active()).toEqual([]);
    // Neither is kept: each is a member's ordinary picture.
    expect(made.files('held')).toEqual([]);
    await made.reports.flush();
    expect(made.gateway.messagesIn(MOD_CHANNEL)).toEqual([]);
  });

  // Review r4 B7.
  it('says once that it cannot tell the Power Spot of two screenshots in one message', async () => {
    const made = await setup({ passive: true });
    const message = posted(
      [
        made.screenshot('a.png', maxReading('NOWHERE IN PARTICULAR')),
        made.screenshot('b.png', maxReading('SOMEWHERE ELSE ENTIRELY')),
      ],
      { mentionsBot: false },
    );
    await made.trigger.handle(message.message);
    await made.service.flush();
    expect(message.replies).toEqual([
      {
        content: `<@${AUTHOR}> I could not tell which Power Spot this is: use \`/max screenshot:\`.`,
        ping: AUTHOR,
      },
    ]);
  });

  it('stays silent on a boss it cannot tell and on another boss’s battle there', async () => {
    const made = await setup({ passive: true });
    const unknown = await made.post(maxReading(undefined, { species: 'MEWTWO' }));
    expect(unknown.replies).toEqual([]);
    await made.battle(MACHAMP, MAX_THURSDAY);
    const older = await made.post(maxReading(), {}, 'b.png');
    expect(older.replies).toEqual([]);
  });

  it('says in its reply that it changed the boss there', async () => {
    const made = await setup({ passive: true });
    const there = await made.battle(MACHAMP);
    const { replies } = await made.post(maxReading());
    expect(replies[0]).toEqual({
      content:
        `<@${AUTHOR}> Changed the boss of the max battle at Gazebo of the Park to Dynamax Machop ` +
        `(2★) from your screenshot, until ${t(END)}. Its post is <#${there.forumPostId ?? ''}>.`,
      ping: AUTHOR,
    });
  });

  it('joins the battle at a clear Power Spot of another region unasked', async () => {
    const made = await setup({ passive: true });
    const there = await made.battle(MACHOP);
    const { replies } = await made.post(maxReading(), { channelId: EAST_CHANNEL });
    expect(asMax(made.store.get(there.id)).attendees[AUTHOR]).toBeDefined();
    expect(replies[0]?.content).toMatch(
      new RegExp(`^<@${AUTHOR}> There is already a max battle against Dynamax Machop`),
    );
  });

  it('asks Yes or No about a clear Power Spot of another region with no battle, and Yes reports it there', async () => {
    const made = await setup({ passive: true });
    const { replies } = await made.post(maxReading(), { channelId: EAST_CHANNEL });
    expect(made.store.active()).toEqual([]);
    expect(replies[0]).toMatchObject({
      content: `<@${AUTHOR}> Gazebo of the Park is in <#${WEST_CHANNEL}>. Report it there?`,
      ping: AUTHOR,
    });
    const [yes, no] = buttonsOf(replies[0]);
    expect([yes?.label, no?.label]).toEqual(['Yes', 'No']);
    const press = fakeButton({ customId: yes?.custom_id ?? '', userId: AUTHOR });
    await made.router.handle(press as never);
    await made.service.flush();
    const battle = asMax(made.store.active()[0]);
    expect(battle).toMatchObject({ max: { spot: { id: TEST_SPOT.id } }, createdById: AUTHOR });
    expect(sent(press.editReply).content).toMatch(/^Reported: Dynamax Machop \(2★\)/);
    // A Yes is no pick from a menu.
    const kept = await made.screenshots.get(battle.max.screenshot?.id ?? '');
    expect(kept).not.toMatchObject({ record: { pickedSpotId: expect.anything() as unknown } });
  });
});
