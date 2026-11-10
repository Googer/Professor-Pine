import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  asV2,
  fakeButton,
  fakeChatInput,
  fakeSelect,
  sent,
  type FakeInteraction,
  type FakeOptions,
} from '../../../test/support/fake-interactions.js';
import { testGym, WEST_CHANNEL, WEST_FORUM } from '../../../test/support/gyms.js';
import { textOf } from '../../../test/support/messages.js';
import { at, MINUTE, PARTY_NOW, testRaid } from '../../../test/support/parties.js';
import { partyServiceWith } from '../../../test/support/party-service.js';
import { gymsFixture } from '../../../test/support/providers.js';
import { screenshotsWith } from '../../../test/support/screenshot-service.js';
import {
  eggReading,
  maxReading,
  readingOf,
  splitOutcome,
} from '../../../test/support/screenshots.js';
import { createTestContext } from '../../../test/support/test-context.js';
import type { Gym } from '../../db/repositories/gym-repository.js';
import { enabledCommands } from '../../discord/command.js';
import { InteractionRouter } from '../../discord/router.js';
import { isRaid } from '../../domain/party/party.js';
import { raidBossCp } from '../../domain/pogo/cp.js';
import { bossStamina } from '../../domain/pogo/raid-tier.js';
import type { ScreenReading } from '../../ocr/screen-reader.js';
import type { OcrOutcome } from '../../services/ocr-service.js';
import { partyButtons } from '../../components/party.js';
import { bottomControls } from '../../render/party-controls.js';
import { renderMirror } from '../../render/mirrors.js';
import { renderRaidPost } from '../../render/raid-post.js';
import { screenshotControls } from '../screenshots/feedback.js';
import { raid, raidControls } from './raid.js';
import { besideWords } from '../screenshots/read-screenshot.js';
import { reportedBoss } from './raid-input.js';
import { buttonsOf, customIdsOf } from '../../../test/support/messages.js';

/** PARTY_NOW is 14:00 in New York: the phone's clock a minute before. */
const CLOCK = { hour: 13, minute: 59 };

async function setup(extraGyms: Gym[] = []) {
  const gyms = gymsFixture(extraGyms);
  const made = await partyServiceWith([], { gyms });
  const base = createTestContext({ gyms });
  const shots = screenshotsWith(base.ctx);
  const { ctx } = createTestContext({
    gyms,
    partyService: made.service,
    parties: made.store,
    regions: made.regions,
    screenshots: shots.screenshots,
  });
  const router = new InteractionRouter(
    ctx,
    [raid],
    [raidControls, screenshotControls, partyButtons],
  );
  const handle = async (interaction: FakeInteraction) => {
    await router.handle(interaction as never);
    return interaction;
  };
  const report = (
    reading: ScreenReading | OcrOutcome,
    options: Record<string, string> = {},
    extra: FakeOptions = {},
    name = 'shot.png',
  ) =>
    handle(
      fakeChatInput({
        commandName: 'raid',
        channelId: WEST_CHANNEL,
        options,
        resolved: { screenshot: shots.screenshot(name, reading) },
        ...extra,
      }),
    );
  return { ...shots, ...made, ctx, handle, report };
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

describe('/raid with a screenshot', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'], now: PARTY_NOW });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('reports the raid it reads unasked, with its screenshot, and offers feedback', async () => {
    const { report, store, service, screenshots } = await setup();
    const used = await report(eggReading('Old Stone Fountain', 5, CLOCK, 20 * 60));
    await service.flush();
    const [party] = store.active();
    if (!party || !isRaid(party)) throw new Error('no raid');
    expect(party).toMatchObject({
      gymId: 2,
      hatchTime: at('2026-10-13T14:19'),
      raid: { tier: { level: 'T5', shadow: false }, boss: null },
    });
    const id = party.raid.screenshot?.id ?? '';
    expect(party.raid.screenshot).toEqual({ id, timeUncertain: false });
    const answer = sent(used.editReply);
    expect(answer.content).toMatch(/^Reported: T5 egg at Old Stone Fountain\./);
    expect(rowsOf(answer)[0]?.components[0]).toMatchObject({
      custom_id: `shot:${id}:show`,
      label: 'Screenshot feedback',
    });
    // Kept while the raid lasts.
    expect(await screenshots.get(id)).toMatchObject({ record: { keepUntil: null } });
  });

  it('says in its answer that the bot may not make the post, and keeps the feedback button', async () => {
    const { report, gateway, store } = await setup();
    gateway.refusePosts.set(WEST_FORUM, ['Manage Posts']);
    const used = await report(eggReading('Old Stone Fountain', 5, CLOCK, 20 * 60));
    expect(store.active()).toEqual([]);
    const answer = sent(used.editReply);
    expect(answer.content).toMatch(/^I am not allowed to make posts in /);
    expect(rowsOf(answer)[0]?.components[0]).toMatchObject({ label: 'Screenshot feedback' });
    expect(used.followUp).not.toHaveBeenCalled();
  });

  // The audit of 2026-11-10 (L-D4; Matt's ruling 6): the whole kept picture (a member's own
  // screen: their name, their friends, their notifications) went to anybody who pressed.
  it('offers what was read on the post to anybody, the kept picture to its reporter and staff alone, while the raid lasts', async () => {
    const { report, store, service, gateway, handle } = await setup();
    const REPORTER_ID = '700000000000000001';
    await report(eggReading('Old Stone Fountain', 5, CLOCK, 20 * 60), {}, { userId: REPORTER_ID });
    await service.flush();
    const [party] = store.active();
    if (!party || !isRaid(party)) throw new Error('no raid');
    const id = party.raid.screenshot?.id ?? '';
    const button = `party:${party.id}:shot`;
    const buttons = buttonsOf(gateway.posts.get(party.forumPostId ?? '')?.message);
    expect(buttons.at(-1)).toMatchObject({ customId: button, label: 'Screenshot feedback' });
    const press = async (extra: FakeOptions) =>
      sent((await handle(fakeButton({ customId: button, ...extra }))).editReply);
    const picture = [expect.objectContaining({ name: `${id}.png` })];

    // Anybody else: the reading and the question, in words that ask of no picture, and both
    // answers; no file, and nothing in the message that names one.
    const other = await press({ userId: '700000000000000009' });
    expect(other.files).toEqual([]);
    const text = textOf(asV2(other));
    expect(text).toContain('**Gym:** read `Old Stone Fountain`');
    expect(text).toContain('Does this match what you see in the game?');
    expect(text).not.toContain('screenshot shows');
    expect(JSON.stringify(other.components)).not.toContain('attachment://');
    expect(buttonsOf(asV2(other)).map((one) => one.label)).toEqual([
      'All right',
      'Something is wrong…',
    ]);
    // A bot developer is no staff of the server.
    const developer = await press({ userId: '700000000000000008', roleNames: ['Bot Developer'] });
    expect(developer.files).toEqual([]);

    // Its reporter, and the server's staff, see the picture and are asked about it.
    const own = await press({ userId: REPORTER_ID });
    expect(own.files).toEqual(picture);
    expect(textOf(asV2(own))).toContain('Is this what the screenshot shows?');
    const staff = await press({ userId: '700000000000000007', roleNames: ['Moderator'] });
    expect(staff.files).toEqual(picture);
    expect(JSON.stringify(staff.components)).toContain(`attachment://${id}.png`);
  });

  it('takes the feedback of a member who was shown no picture', async () => {
    const { report, store, service, handle, screenshots } = await setup();
    await report(
      eggReading('Old Stone Fountain', 5, CLOCK, 20 * 60),
      {},
      { userId: '700000000000000001' },
    );
    await service.flush();
    const [party] = store.active();
    if (!party || !isRaid(party)) throw new Error('no raid');
    const id = party.raid.screenshot?.id ?? '';
    const right = await handle(
      fakeButton({ customId: `shot:${id}:right`, userId: '700000000000000009' }),
    );
    expect(sent(right.reply).content).toBe('Thank you: this helps me read screenshots better.');
    expect(await screenshots.get(id)).toMatchObject({
      record: { feedback: [{ memberId: '700000000000000009', by: 'other', verdict: 'right' }] },
    });
  });

  it('keeps the button on the copies of the post, and answers it once the raid is over', async () => {
    const { report, store, service, handle, gateway } = await setup();
    const used = await report(eggReading('Old Stone Fountain', 5, CLOCK, 20 * 60));
    await service.flush();
    const [party] = store.active();
    if (!party || !isRaid(party)) throw new Error('no raid');
    const button = `party:${party.id}:shot`;
    // The post has it, and so do its copies elsewhere: they carry the post's own controls.
    const post = gateway.posts.get(party.forumPostId ?? '');
    expect(customIdsOf(post?.message)).toContain(button);
    const rendered = renderRaidPost(service.view(party));
    const place = { postId: party.forumPostId ?? '', regionChannelId: undefined };
    expect(customIdsOf(renderMirror('remote', rendered, place))).toContain(button);
    await service.end(party.id);
    const late = await handle(fakeButton({ customId: button }));
    expect(sent(late.reply).content).toBe('This raid is over.');
    // The reporter's own button still shows it for a while.
    const own = rowsOf(sent(used.editReply))[0]?.components[0]?.custom_id ?? '';
    const shown = await handle(fakeButton({ customId: own }));
    expect(textOf(asV2(sent(shown.editReply)))).toContain('Is this what the screenshot shows?');
  });

  it('shows no button for a screenshot that could not be kept, and still says the time is a guess', () => {
    const plain = testRaid();
    const unkept = {
      ...plain,
      raid: { ...plain.raid, screenshot: { id: null, timeUncertain: true } },
    };
    const ids = bottomControls(unkept, { emoji: {} })
      .flat()
      .map(({ button }) => ('custom_id' in button ? button.custom_id : ''));
    expect(ids.some((id) => id.endsWith(':shot'))).toBe(false);
  });

  it('reports a guessed time as uncertain, and a hatched raid without its boss as hatched', async () => {
    const { report, store } = await setup();
    await report(
      readingOf(
        { gym: 'Old Stone Fountain', countdown: 30 * 60, countdownPlace: 'right' },
        { heads: 5 },
      ),
    );
    const [party] = store.active();
    if (!party || !isRaid(party)) throw new Error('no raid');
    expect(party.raid).toMatchObject({ boss: null, reportedHatched: true, stageSeen: 'hatched' });
    expect(party.raid.screenshot?.timeUncertain).toBe(true);
    expect(party.endTime).toBe(Math.floor((PARTY_NOW - 45_000 + 30 * MINUTE) / MINUTE) * MINUTE);
  });

  // Matt, 2026-10-25: a boss the feed does not list yet is reported as `/raid t5 azelf` reports it.
  it('reports a boss the list does not have by its CP and name, as the tier typed before it would', async () => {
    const { report, store, service, ctx } = await setup();
    const azelf = ctx.gameData.catalogue.byKey('azelf');
    if (!azelf) throw new Error('azelf');
    const cp = raidBossCp(azelf.stats, bossStamina({ level: 'T5', shadow: false }));
    const used = await report(
      readingOf(
        {
          gym: 'Old Stone Fountain',
          clock: CLOCK,
          countdown: 30 * 60,
          countdownPlace: 'right',
          cp,
          bossName: 'Azelf',
        },
        { heads: 5 },
      ),
    );
    await service.flush();
    const [party] = store.active();
    if (!party || !isRaid(party)) throw new Error('no raid');
    const typed = reportedBoss(ctx, 't5 azelf');
    expect(party.raid).toMatchObject({ tier: typed.tier, boss: typed.boss });
    expect(sent(used.editReply).content).toMatch(
      new RegExp(`^Reported: ${typed.label.replace(/[()]/g, '\\$&')} at Old Stone Fountain\\.`),
    );
  });

  it('names the clock it read when that clock did not fit the upload', async () => {
    const { report } = await setup();
    const used = await report(eggReading('Old Stone Fountain', 5, { hour: 9, minute: 5 }, 20 * 60));
    expect(sent(used.editReply).content).toContain(
      '- The time is a guess from when the screenshot was posted: the phone’s clock (9:05) does not fit that time.',
    );
  });

  it('lets what the member typed count instead of what it read', async () => {
    const { report, store } = await setup();
    await report(eggReading('Nowhere at all', 5, CLOCK, 20 * 60), { gym: 'g:1', time: '30' });
    const [party] = store.active();
    expect(party).toMatchObject({ gymId: 1, hatchTime: at('2026-10-13T14:30') });
  });

  it('says why it reports nothing, with what it read and the feedback buttons', async () => {
    const { report, store } = await setup();
    const used = await report(readingOf({ gym: 'Old Stone Fountain' }));
    expect(store.active()).toEqual([]);
    const answer = sent(used.editReply);
    expect(answer.content).toMatch(/does not look like the screen of a raid/);
    expect(rowsOf(answer)[0]?.components.map((c) => c.label)).toEqual([
      'All right',
      'Something is wrong…',
    ]);
  });

  it('asks which gym when gyms of one region share the name, offering each told apart', async () => {
    const twin = testGym(13, 'Old Stone Fountain', 40.061, -80.061, {
      nickname: 'Fountain by the bank',
    });
    const { report, handle, store, screenshots } = await setup([twin]);
    const used = await report(eggReading('Old Stone Fountain', 5, CLOCK, 20 * 60));
    expect(store.active()).toEqual([]);
    const question = sent(used.editReply);
    expect(question.content).toMatch(/Which gym is this\?/);
    const [menu, buttons] = rowsOf(question);
    const options = menu?.components[0]?.options ?? [];
    expect(options.map((o) => o.value).sort()).toEqual(['13', '2']);
    expect(options.find((o) => o.value === '13')?.description).toContain('Fountain by the bank');
    expect(buttons?.components[0]?.label).toBe('Cancel');
    const chose = await handle(
      fakeSelect({ customId: menu?.components[0]?.custom_id ?? '', values: ['13'] }),
    );
    expect(sent(chose.editReply).content).toMatch(/^Reported: T5 egg at Fountain by the bank\./);
    // The record keeps which gym the member chose.
    const shot = store.active().flatMap((p) => (isRaid(p) ? [p.raid.screenshot?.id] : []))[0];
    expect(await screenshots.get(shot ?? '')).toMatchObject({ record: { pickedGymId: 13 } });
    const [party] = store.active();
    expect(party?.gymId).toBe(13);
  });

  it('cancels the question about the gym', async () => {
    const twin = testGym(13, 'Old Stone Fountain', 40.061, -80.061);
    const { report, handle, store } = await setup([twin]);
    const used = await report(eggReading('Old Stone Fountain', 5, CLOCK, 20 * 60));
    const cancel = rowsOf(sent(used.editReply))[1]?.components[0]?.custom_id ?? '';
    const pressed = await handle(fakeButton({ customId: cancel }));
    expect(sent(pressed.update).content).toBe('Nothing was reported.');
    expect(store.active()).toEqual([]);
  });

  it('takes a typed gym of several hits from the screenshot when it names one of them clearly', async () => {
    const twin = testGym(13, 'Old Stone Fountain', 40.061, -80.061, { nickname: 'Bank fountain' });
    const { report, store } = await setup([twin]);
    // "Fountain" fits both; the screenshot names neither clearly but the Library clearly.
    const library = await report(eggReading('Pinewood Public Library', 5, CLOCK, 20 * 60), {
      gym: 'Fountain',
    });
    expect(store.active()).toEqual([]);
    const question = sent(library.editReply);
    expect(question.content).toBe('Several gyms fit "Fountain". Which one do you mean?');
    const options = rowsOf(question)[0]?.components[0]?.options ?? [];
    expect(options.map((o) => o.value).sort()).toEqual(['13', '2']);
    // A screenshot whose gym is not known: the typed hits are offered all the same.
    const nowhere = await report(eggReading('Nowhere at all', 5, CLOCK, 20 * 60), {
      gym: 'Fountain',
    });
    expect(sent(nowhere.editReply).content).toBe(
      'Several gyms fit "Fountain". Which one do you mean?',
    );
  });

  it('reports a clearly read gym that is one of several typed hits', async () => {
    const { report, store } = await setup();
    // "Stone" fits Old Stone Fountain and nothing else here; "Old" fits several.
    await report(eggReading('Old Stone Fountain', 5, CLOCK, 20 * 60), { gym: 'Old' });
    expect(store.active()[0]?.gymId).toBe(2);
  });

  it('refuses a max battle’s screen, also beside a typed boss and gym (plan 8X-S)', async () => {
    const { report, store } = await setup();
    for (const typed of [{}, { boss: 'e:T5:0', gym: 'g:1' }] as Record<string, string>[]) {
      const used = await report(maxReading(), typed);
      expect(sent(used.editReply).content).toBe(
        'That is a max battle: use `/max screenshot:`, or post it with a mention.',
      );
      expect(rowsOf(sent(used.editReply))[0]?.components[1]?.custom_id).toMatch(/:wrong:max$/);
    }
    expect(store.active()).toEqual([]);
  });

  describe('a split screenshot (plan 7P)', () => {
    const egg = () => eggReading('Old Stone Fountain', 5, CLOCK, 20 * 60);

    it('reports the raid of a split, and names the max battle beside it that it did not', async () => {
      const { report, store } = await setup();
      const used = await report(splitOutcome([maxReading(), egg()]));
      expect(store.active()).toMatchObject([{ gymId: 2 }]);
      expect(sent(used.editReply).content).toMatch(/^Reported: T5 egg at Old Stone Fountain\./);
      expect(sent(used.followUp).content).toBe(
        'The max battle beside it was not reported: post the screenshot in the channel with a mention of me to report both.',
      );
      // The note follows the answer: a follow-up sent before the deferred answer is edited
      // would take the answer's place, and the edit would overwrite it.
      const edited = Math.min(...used.editReply.mock.invocationCallOrder);
      expect(Math.min(...used.followUp.mock.invocationCallOrder)).toBeGreaterThan(edited);
    });

    it('points to posting it plainly where screenshots are read passively', () => {
      const ctx = createTestContext().ctx;
      const passive = {
        ...ctx,
        config: {
          ...ctx.config,
          settings: { ...ctx.config.settings, ocr: { ...ctx.config.settings.ocr, passive: true } },
        },
        features: { ocrPassive: true, autoAssignRole: false },
      };
      expect(besideWords(passive, 'max')).toBe(
        'The max battle beside it was not reported: post the screenshot in the channel to report both.',
      );
    });

    it('refuses two raids in one picture, pointing to the mention', async () => {
      const { report, store } = await setup();
      const two = splitOutcome([egg(), eggReading('Maple Leaf Mosaic', 3, CLOCK, 15 * 60)]);
      const used = await report(two, { boss: 'e:T5:0', gym: 'g:1' });
      expect(store.active()).toEqual([]);
      expect(sent(used.followUp).content).toBe(
        'This screenshot shows two raids: post it in the channel with a mention of me to report both.',
      );
    });

    it('reports what was typed beside two screens it could not tell apart', async () => {
      const { report, store } = await setup();
      const used = await report(
        { kind: 'read', reading: egg(), twoScreens: true },
        { boss: 'e:T5:0', gym: 'g:1' },
      );
      expect(store.active()[0]).toMatchObject({ gymId: 1, raid: { screenshot: null } });
      expect(sent(used.editReply).content).toMatch(/^I could not read the screenshot, so I used/);
    });
  });

  it('reports what the member typed when the screenshot is no raid screen, and says so', async () => {
    const { report, store } = await setup();
    const used = await report(readingOf({ gym: 'Old Stone Fountain' }), {
      boss: 'e:T5:0',
      gym: 'g:1',
    });
    expect(store.active()[0]).toMatchObject({ gymId: 1, raid: { screenshot: null } });
    expect(sent(used.editReply).content).toMatch(
      /^I could not read the screenshot, so I used what you typed\.\nReported: T5 egg/,
    );
  });

  it('reports what the member typed when the screenshot cannot be read at all', async () => {
    for (const kind of ['busy', 'unavailable', 'failed'] as const) {
      const { report, store } = await setup();
      const used = await report({ kind }, { boss: 'e:T5:0', gym: 'g:1' });
      expect(store.active()[0]).toMatchObject({ gymId: 1, raid: { screenshot: null } });
      expect(sent(used.editReply).content).toMatch(
        /^I could not read the screenshot, so I used what you typed\.\nReported: T5 egg/,
      );
    }
    const { report, store, attachments } = await setup();
    attachments.failing = true;
    const used = await report(eggReading('Old Stone Fountain', 5, CLOCK), {
      boss: 'e:T5:0',
      gym: 'g:1',
    });
    expect(store.active()[0]).toMatchObject({ gymId: 1 });
    expect(sent(used.editReply).content).toMatch(/^I could not read the screenshot, so I used/);
  });

  // Review 8E-1: an Elite egg needs its hatch time; a screenshot carries it in its countdown.
  it('reports an Elite egg by the countdown read when no time was typed, and refuses a typed one without its time', async () => {
    const read = await setup();
    await read.report(
      readingOf(
        { gym: 'Old Stone Fountain', clock: CLOCK, countdown: 20 * 60, countdownPlace: 'centre' },
        { heads: 5 },
      ),
      { boss: 'e:Elite:0' },
    );
    expect(read.store.active()).toMatchObject([
      { gymId: 2, hatchTime: at('2026-10-13T14:19'), raid: { tier: { level: 'Elite' } } },
    ]);
    const unread = await setup();
    const used = await unread.report({ kind: 'unavailable' }, { boss: 'e:Elite:0', gym: 'g:1' });
    expect(unread.store.active()).toEqual([]);
    expect(sent(used.followUp).content).toBe(
      'An Elite egg shows when it hatches: give its hatch time, in minutes from now (`20`) or as a clock time (`6:15pm`).',
    );
  });

  it('says why when a screenshot cannot be read and the boss or the gym was not typed', async () => {
    const { report, store } = await setup();
    const used = await report({ kind: 'busy' }, { gym: 'g:1' });
    expect(store.active()).toEqual([]);
    expect(sent(used.followUp).content).toMatch(/^Too many screenshots are waiting/);
  });

  it('asks among the typed gyms when the screenshot is no raid screen and several fit', async () => {
    const twin = testGym(13, 'Old Stone Fountain', 40.061, -80.061, { nickname: 'Bank fountain' });
    const { report, handle, store } = await setup([twin]);
    const used = await report(readingOf({ gym: 'Old Stone Fountain' }), {
      boss: 'e:T5:0',
      gym: 'Fountain',
    });
    const question = sent(used.editReply);
    expect(question.content).toBe(
      'I could not read the screenshot. Several gyms fit "Fountain". Which one do you mean?',
    );
    const menu = rowsOf(question)[0]?.components[0];
    const chose = await handle(fakeSelect({ customId: menu?.custom_id ?? '', values: ['13'] }));
    expect(sent(chose.editReply).content).toMatch(
      /^I could not read the screenshot, so I used what you typed\.\nReported: T5 egg at Bank fountain/,
    );
    expect(store.active()[0]).toMatchObject({ gymId: 13, raid: { screenshot: null } });
  });

  it('carries the screenshot through the question about another region', async () => {
    const { report, handle, store } = await setup();
    const used = await report(eggReading('Harbor Lighthouse Mural', 5, CLOCK, 20 * 60));
    const question = sent(used.editReply);
    expect(question.content).toMatch(/not in this region\. Report the raid there\?$/);
    const yes = rowsOf(question)[0]?.components[0]?.custom_id ?? '';
    await handle(fakeButton({ customId: yes }));
    const [party] = store.active();
    if (!party || !isRaid(party)) throw new Error('no raid');
    expect(party.gymId).toBe(7);
    expect(party.raid.screenshot?.id).toMatch(/^[A-Za-z0-9_-]{12}$/);
  });

  it('answers a screenshot of a raid that exists with its post and the screenshot’s feedback', async () => {
    const { report, store, service } = await setup();
    await report(eggReading('Old Stone Fountain', 5, CLOCK, 20 * 60));
    await service.flush();
    const again = await report(
      eggReading('Old Stone Fountain', 5, CLOCK, 20 * 60),
      {},
      {
        userId: '700000000000000009',
      },
    );
    const answer = sent(again.editReply);
    expect(answer.content).toMatch(/^There is already a raid at Old Stone Fountain\./);
    expect(rowsOf(answer)[0]?.components[0]?.label).toBe('Screenshot feedback');
    expect(store.active()).toHaveLength(1);
  });

  it('refuses a typed time that is no time before reading, without using up the throttle', async () => {
    const { report, reader } = await setup();
    const bad = await report(eggReading('Old Stone Fountain', 5, CLOCK), { time: 'soonish' });
    expect(sent(bad.reply).content).toMatch(/^I could not read "soonish" as a time/);
    expect(reader.reads).toBe(0);
    for (let i = 0; i < 25; i++) {
      await report(eggReading('Old Stone Fountain', 5, CLOCK), { time: 'soonish' });
    }
    const good = await report(eggReading('Old Stone Fountain', 5, CLOCK, 20 * 60));
    expect(reader.reads).toBe(1);
    expect(sent(good.editReply).content).toMatch(/^Reported/);
  });

  it('says it cannot tell the tier, and reports nothing', async () => {
    const { report, store } = await setup();
    const used = await report(
      readingOf(
        { gym: 'Old Stone Fountain', clock: CLOCK, countdown: 600, countdownPlace: 'centre' },
        { heads: 2 },
      ),
    );
    expect(store.active()).toEqual([]);
    expect(sent(used.editReply).content).toMatch(/^I could not tell the tier of this raid/);
  });

  it('needs the boss and the gym without a screenshot, and no screenshot option where none are read', async () => {
    const { handle } = await setup();
    const used = await handle(
      fakeChatInput({ commandName: 'raid', channelId: WEST_CHANNEL, options: { boss: 'e:T5:0' } }),
    );
    expect(sent(used.reply).content).toBe(
      'Give the gym of the raid (or attach a screenshot of it).',
    );
    const { ctx } = createTestContext();
    const off = {
      ...ctx.config,
      settings: { ...ctx.config.settings, ocr: { ...ctx.config.settings.ocr, enabled: false } },
    };
    const [without] = enabledCommands([raid], off);
    const options = without?.data.toJSON().options ?? [];
    expect(options.map((o) => [o.name, o.required ?? false])).toEqual([
      ['boss', true],
      ['gym', true],
      ['time', false],
    ]);
    const [withShots] = enabledCommands([raid], ctx.config);
    expect(withShots?.data.toJSON().options?.map((o) => o.name)).toContain('screenshot');
  });

  it('tells the reporter that others can see their screenshot, in the option and the help', () => {
    const { ctx } = createTestContext();
    const [withShots] = enabledCommands([raid], ctx.config);
    const option = withShots?.data.toJSON().options?.find((o) => o.name === 'screenshot');
    expect(option?.description).toMatch(/others can see it/i);
    expect(option?.description.length).toBeLessThanOrEqual(100);
    const details = withShots?.help.details;
    const text = typeof details === 'function' ? details(ctx.config.settings) : details;
    expect(text).toMatch(/others can see/i);
  });

  it('says in the help that an Elite egg needs its hatch time (review 8E-1)', () => {
    const { ctx } = createTestContext();
    const [withShots] = enabledCommands([raid], ctx.config);
    const details = withShots?.help.details;
    const text = typeof details === 'function' ? details(ctx.config.settings) : details;
    expect(text).toContain(
      'The time is optional, except for an Elite egg, which needs its hatch time:',
    );
  });
});
