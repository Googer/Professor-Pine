import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MessageFlags } from 'discord.js';
import { Tally } from '../../../test/support/tally.js';
import { fakeButton, fakeSelect, sent } from '../../../test/support/fake-interactions.js';
import {
  EAST_CHANNEL,
  EAST_FORUM,
  testGym,
  WEST_CHANNEL,
  WEST_FORUM,
} from '../../../test/support/gyms.js';
import { PARTY_NOW } from '../../../test/support/parties.js';
import { partyServiceWith } from '../../../test/support/party-service.js';
import { gymsFixture } from '../../../test/support/providers.js';
import { screenshotsWith } from '../../../test/support/screenshot-service.js';
import { eggReading, readingOf, splitOutcome } from '../../../test/support/screenshots.js';
import { TWO_SCREENS } from '../../render/screenshot-reading.js';
import { createTestContext } from '../../../test/support/test-context.js';
import type { Gym } from '../../db/repositories/gym-repository.js';
import { InteractionRouter } from '../../discord/router.js';
import type { GymProvider } from '../../services/gym-directory.js';
import type { ScreenReading } from '../../ocr/screen-reader.js';
import { NO_POST_MADE } from '../../render/activity.js';
import type { OcrOutcome } from '../../services/ocr-service.js';
import { Rehearsal } from '../../services/rehearsal.js';
import { REPORT_BARRED } from '../raids/report.js';
import { screenshotControls } from './feedback.js';
import { AUTHOR, OTHER, posted } from '../../../test/support/posted-message.js';
import { DONE, READING, ScreenshotTrigger, type ReplyPayload } from './mention.js';

const CLOCK = { hour: 13, minute: 59 };

async function setup(
  options: {
    gyms?: Gym[];
    passive?: boolean;
    enabled?: boolean;
    questionMs?: number;
    replyMs?: number;
    rehearsal?: Rehearsal;
    /** Gyms that lie in East as well as in West. */
    alsoInEast?: number[];
  } = {},
) {
  const fixture = gymsFixture(options.gyms ?? []);
  const alsoInEast = options.alsoInEast ?? [];
  const gyms: GymProvider =
    alsoInEast.length === 0
      ? fixture
      : Object.assign(Object.create(fixture) as GymProvider, {
          regionsOf: (gymId: number) =>
            alsoInEast.includes(gymId) ? [WEST_CHANNEL, EAST_CHANNEL] : fixture.regionsOf(gymId),
        });
  const made = await partyServiceWith([], { gyms });
  const shots = screenshotsWith(createTestContext({ gyms }).ctx);
  const { ctx: base, entries } = createTestContext({
    gyms,
    partyService: made.service,
    parties: made.store,
    regions: made.regions,
    screenshots: shots.screenshots,
  });
  const ocr = {
    ...base.config.settings.ocr,
    passive: options.passive ?? false,
    enabled: options.enabled ?? true,
  };
  const ctx = {
    ...base,
    config: { ...base.config, settings: { ...base.config.settings, ocr } },
    features: { ocrPassive: options.passive ?? false, autoAssignRole: false },
    ...(options.rehearsal ? { rehearsal: options.rehearsal } : {}),
  };
  const trigger = new ScreenshotTrigger({
    ctx,
    replyMs: options.replyMs ?? 20,
    questionMs: options.questionMs ?? 60_000,
  });
  const router = new InteractionRouter(ctx, [], [screenshotControls]);
  const image = (name: string, reading: ScreenReading | OcrOutcome) =>
    shots.screenshot(name, reading);
  return { ...shots, ...made, ctx, entries, trigger, router, image };
}

const egg = () => eggReading('Old Stone Fountain', 5, CLOCK, 20 * 60);
const menuOf = (reply: ReplyPayload | undefined) =>
  reply?.components?.[0]?.components[0] as {
    custom_id: string;
    options: { value: string; description?: string }[];
  };

describe('screenshots posted with a mention of the bot', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'], now: PARTY_NOW });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('reports the raid as the author, thinks meanwhile, and deletes the message', async () => {
    const { trigger, image, store } = await setup();
    const { message, did } = posted([image('a.png', egg())]);
    await trigger.handle(message);
    const [party] = store.active();
    expect(party).toMatchObject({ gymId: 2, createdById: AUTHOR });
    expect(Object.values(party?.attendees ?? {})).toMatchObject([
      { name: 'Rhea', team: 'instinct' },
    ]);
    expect(did).toEqual([`react ${READING}`, `unreact ${READING}`, 'deleted']);
  });

  it('reads nothing during a rehearsal, not even of its allowlist: it would answer in the channel', async () => {
    const rehearsal = new Rehearsal({ allowlist: [OTHER], regions: ['west'], staffRoles: [] });
    const { trigger, image, store } = await setup({ rehearsal });
    const { message, did } = posted([image('a.png', egg())]);
    await trigger.handle(message);
    expect(did).toEqual([]);
    expect(store.active()).toEqual([]);
    const theirs = posted([image('b.png', egg())], { authorId: OTHER });
    await trigger.handle(theirs.message);
    expect(theirs.did).toEqual([]);
    expect(store.active()).toEqual([]);
  });

  it('marks a message that says more than the mention instead of deleting it', async () => {
    const { trigger, image } = await setup();
    const { message, did } = posted([image('a.png', egg())], { bare: false });
    await trigger.handle(message);
    expect(did).toEqual([`react ${READING}`, `unreact ${READING}`, `react ${DONE}`]);
  });

  it('answers in one reply what it could not make a raid of, and lets the message go with it', async () => {
    const { trigger, image, store } = await setup();
    // The reply's timer (the setup's 20 ms) by the clock of the test.
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'], now: PARTY_NOW });
    const cat = readingOf({ gym: 'Old Stone Fountain' });
    const { message, did, replies } = posted([
      image('a.png', egg()),
      image('b.png', cat),
      image('c.png', cat),
      image('d.png', eggReading('Nowhere at all', 5, CLOCK, 600)),
    ]);
    await trigger.handle(message);
    expect(store.active()).toHaveLength(1);
    expect(replies.map((r) => r.content)).toEqual([
      '2 of 4: This does not look like the screen of a raid, so I made nothing of it.\n' +
        '1 of 4: I could not find the gym of this screenshot among this server’s gyms.',
    ]);
    expect(did).not.toContain('deleted');
    vi.advanceTimersByTime(19);
    expect(did).not.toContain('reply deleted');
    // Nothing is left for the message to do: it goes with its reply (Matt, 2026-11-03).
    vi.advanceTimersByTime(1);
    expect(did).toContain('reply deleted');
    expect(did).toContain('deleted');
  });

  it('lets a message of one refused screenshot go with its reply, but keeps one with words', async () => {
    const { trigger, image } = await setup();
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'], now: PARTY_NOW });
    const cat = readingOf({ gym: 'Old Stone Fountain' });
    const bare = posted([image('a.png', cat)]);
    await trigger.handle(bare.message);
    expect(bare.did).not.toContain('deleted');
    vi.advanceTimersByTime(19);
    expect(bare.did).not.toContain('deleted');
    // The message and its reply go together, in either order.
    vi.advanceTimersByTime(1);
    expect(bare.did.slice(0, 3)).toEqual([`react ${READING}`, `unreact ${READING}`, 'reply']);
    expect(bare.did.slice(3).sort()).toEqual(['deleted', 'reply deleted']);
    // A message that says more than the mention says it to the others too: it stays.
    const said = posted([image('b.png', cat)], { bare: false });
    await trigger.handle(said.message);
    vi.advanceTimersByTime(20);
    expect(said.did).toEqual([`react ${READING}`, `unreact ${READING}`, 'reply', 'reply deleted']);
  });

  it('answers a screenshot of a raid that exists with its post, and lets the message go', async () => {
    const { trigger, image, store, service } = await setup();
    await trigger.handle(posted([image('a.png', egg())]).message);
    await service.flush();
    const again = posted([image('b.png', egg())], { authorId: OTHER });
    await trigger.handle(again.message);
    expect(store.active()).toHaveLength(1);
    expect(again.replies[0]?.content).toMatch(
      /^There is already a raid at Old Stone Fountain: <#\d+>\. You have been signed up for it\.$/,
    );
    expect(again.did).toContain('deleted');
  });

  it('answers screenshots of raids that exist in the one reply of the message', async () => {
    const { trigger, image, service } = await setup();
    await trigger.handle(posted([image('a.png', egg())]).message);
    await service.flush();
    const cat = readingOf({ gym: 'Old Stone Fountain' });
    const again = posted([image('b.png', egg()), image('c.png', egg()), image('d.png', cat)], {
      authorId: OTHER,
    });
    await trigger.handle(again.message);
    expect(again.replies).toHaveLength(1);
    const lines = again.replies[0]?.content.split('\n') ?? [];
    expect(lines).toEqual([
      expect.stringMatching(/^There is already a raid at Old Stone Fountain: <#\d+>\./),
      expect.stringMatching(/^There is already a raid at Old Stone Fountain: <#\d+>\.$/),
      '1 of 3: This does not look like the screen of a raid, so I made nothing of it.',
    ]);
  });

  it('asks its author which gym, reports the one they choose, and then lets the message go', async () => {
    const twin = testGym(13, 'Old Stone Fountain', 40.061, -80.061, { nickname: 'Bank fountain' });
    const { trigger, image, store, router } = await setup({ gyms: [twin] });
    const { message, replies, did } = posted([image('a.png', egg())]);
    await trigger.handle(message);
    expect(store.active()).toEqual([]);
    expect(did).not.toContain('deleted');
    const [question] = replies;
    // The gym is what is asked: it is not named.
    expect(question?.content).toMatch(
      /^T5 egg, hatching at <t:\d+:t>\. Which gym is it\? I read "Old Stone Fountain"\.$/,
    );
    const menu = menuOf(question);
    expect(menu.options.map((o) => o.value).sort()).toEqual(['13', '2']);
    expect(menu.options.find((o) => o.value === '13')?.description).toBe('Bank fountain');

    const stranger = fakeSelect({ customId: menu.custom_id, values: ['13'], userId: OTHER });
    await router.handle(stranger as never);
    expect(sent(stranger.reply).content).toBe('That is somebody else’s screenshot.');
    const author = fakeSelect({ customId: menu.custom_id, values: ['13'], userId: AUTHOR });
    await router.handle(author as never);
    // The question becomes the answer: a private follow-up would point at a deleted question.
    expect(author.deleteReply).not.toHaveBeenCalled();
    expect(author.followUp).not.toHaveBeenCalled();
    const answer = sent(author.editReply);
    expect(answer.content).toMatch(/^Reported the raid at Bank fountain/);
    expect(answer.components).toEqual([]);
    expect(store.active()[0]).toMatchObject({ gymId: 13, createdById: AUTHOR });
    expect(did).toContain('deleted');
  });

  it('asks about a clear gym of another region rather than report it there, naming the region', async () => {
    const { trigger, image, store } = await setup();
    const { message, replies } = posted([
      image('a.png', eggReading('Harbor Lighthouse Mural', 5, CLOCK, 20 * 60)),
    ]);
    await trigger.handle(message);
    expect(store.active()).toEqual([]);
    expect(menuOf(replies[0]).options.find((o) => o.value === '7')?.description).toBe('east');
  });

  it('refuses a screenshot that would sign its author up in a forum they are kept out of', async () => {
    // The Bridge (gym 4) lies in West and East.
    const { trigger, image, store, gateway, service } = await setup({ alsoInEast: [4] });
    const bridge = () => eggReading('Veterans Memorial Bridge', 5, CLOCK, 20 * 60);
    // Another member reports it from East: its raid stands in East's forum.
    await trigger.handle(
      posted([image('a.png', bridge())], { authorId: OTHER, channelId: EAST_CHANNEL }).message,
    );
    await service.flush();
    expect(store.active()[0]).toMatchObject({ gymId: 4, regionId: 2 });
    gateway.barred.set(EAST_FORUM, new Set([AUTHOR]));
    // West, which the author may see, would take a new raid; but the report would join East's.
    const refused = posted([image('b.png', bridge())]);
    await trigger.handle(refused.message);
    expect(refused.replies.map((r) => r.content)).toEqual([REPORT_BARRED]);
    expect(store.active()).toHaveLength(1);
    expect(store.active()[0]?.attendees[AUTHOR]).toBeUndefined();
    expect(refused.did).not.toContain('deleted');
    // So is one whose new raid would go to a forum the author is kept out of.
    gateway.barred.set(WEST_FORUM, new Set([AUTHOR]));
    const own = posted([image('c.png', egg())]);
    await trigger.handle(own.message);
    expect(own.replies.map((r) => r.content)).toEqual([REPORT_BARRED]);
    expect(store.active()).toHaveLength(1);
  });

  it('refuses a gym chosen in the question whose forum its author is kept out of', async () => {
    const twin = testGym(13, 'Old Stone Fountain', 40.061, -80.061);
    const { trigger, image, router, store, gateway } = await setup({ gyms: [twin] });
    const { message, replies, did } = posted([image('a.png', egg())]);
    await trigger.handle(message);
    gateway.barred.set(WEST_FORUM, new Set([AUTHOR]));
    const pick = fakeSelect({
      customId: menuOf(replies[0]).custom_id,
      values: ['13'],
      userId: AUTHOR,
    });
    await router.handle(pick as never);
    expect(sent(pick.editReply)).toMatchObject({ content: REPORT_BARRED, components: [] });
    expect(store.active()).toEqual([]);
    expect(did).not.toContain('deleted');
  });

  it('says to try again, and logs it, when Discord cannot say who may see the forum', async () => {
    const twin = testGym(13, 'Old Stone Fountain', 40.061, -80.061);
    const { trigger, image, router, store, gateway, entries } = await setup({ gyms: [twin] });
    gateway.failing.set('memberAccess', new Error('Discord is away'));
    const unasked = posted([image('a.png', eggReading('Starbucks', 1, CLOCK, 10 * 60))]);
    await trigger.handle(unasked.message);
    const UNKNOWN =
      /^Discord cannot be reached just now, so nothing was reported\. Try again in a moment\.$/;
    expect(unasked.replies.map((r) => r.content)).toEqual([expect.stringMatching(UNKNOWN)]);
    expect(unasked.did).not.toContain('deleted');
    const asked = posted([image('b.png', egg())]);
    await trigger.handle(asked.message);
    const pick = fakeSelect({
      customId: menuOf(asked.replies[0]).custom_id,
      values: ['13'],
      userId: AUTHOR,
    });
    await router.handle(pick as never);
    // The question stays, its menu with it, to be answered again once Discord is back.
    const again = sent(pick.editReply);
    expect(again.content).toMatch(
      /\nDiscord cannot be reached just now, so nothing was reported\. Pick the gym again in a moment\.$/,
    );
    expect(again).not.toHaveProperty('components');
    expect(store.active()).toEqual([]);
    const logged = entries.filter(
      (e) => (e.err as { message?: string } | undefined)?.message === 'Discord is away',
    );
    expect(logged).toHaveLength(2);
    gateway.failing.delete('memberAccess');
    const retry = fakeSelect({
      customId: menuOf(asked.replies[0]).custom_id,
      values: ['13'],
      userId: AUTHOR,
    });
    await router.handle(retry as never);
    expect(sent(retry.editReply).content).toMatch(/^Reported the raid at Old Stone Fountain/);
    expect(store.active()).toHaveLength(1);
  });

  it('says privately that Discord was away when the question was deleted meanwhile', async () => {
    const twin = testGym(13, 'Old Stone Fountain', 40.061, -80.061);
    const { trigger, image, router, store, gateway } = await setup({ gyms: [twin] });
    const { message, replies } = posted([image('a.png', egg())]);
    await trigger.handle(message);
    gateway.failing.set('memberAccess', new Error('Discord is away'));
    const pick = fakeSelect({
      customId: menuOf(replies[0]).custom_id,
      values: ['13'],
      userId: AUTHOR,
    });
    // Somebody deleted the question while Discord was asked: it cannot be edited.
    pick.editReply.mockRejectedValue(new Error('Unknown Message'));
    await router.handle(pick as never);
    expect(sent(pick.followUp)).toEqual({
      content:
        'Discord cannot be reached just now, so nothing was reported. Try again in a moment.',
      flags: MessageFlags.Ephemeral,
    });
    // Nothing of the question that went is kept: another pick is only acknowledged.
    gateway.failing.delete('memberAccess');
    const late = fakeSelect({
      customId: menuOf(replies[0]).custom_id,
      values: ['13'],
      userId: AUTHOR,
    });
    await router.handle(late as never);
    expect(late.editReply).not.toHaveBeenCalled();
    expect(store.active()).toEqual([]);
  });

  it('cancels the question, which goes at once', async () => {
    const twin = testGym(13, 'Old Stone Fountain', 40.061, -80.061);
    const { trigger, image, router, store } = await setup({ gyms: [twin] });
    const { message, replies } = posted([image('a.png', egg())]);
    await trigger.handle(message);
    const cancel = replies[0]?.components?.[1]?.components[0] as { custom_id: string };
    const pressed = fakeButton({ customId: cancel.custom_id, userId: AUTHOR });
    await router.handle(pressed as never);
    expect(pressed.deleteReply).toHaveBeenCalledTimes(1);
    expect(store.active()).toEqual([]);
  });

  it('lets a message go once only, and answers a second pick of a gym without failing', async () => {
    const twin = testGym(13, 'Old Stone Fountain', 40.061, -80.061);
    const { trigger, image, router, store } = await setup({ gyms: [twin] });
    const { message, replies, did } = posted([image('a.png', egg())]);
    await trigger.handle(message);
    const menu = menuOf(replies[0]);
    const first = fakeSelect({ customId: menu.custom_id, values: ['13'], userId: AUTHOR });
    await router.handle(first as never);
    // A second press of the same question, as it can arrive before the first is answered.
    const second = fakeSelect({ customId: menu.custom_id, values: ['2'], userId: AUTHOR });
    await router.handle(second as never);
    expect(store.active()).toHaveLength(1);
    expect(did.filter((d) => d === 'deleted')).toHaveLength(1);
    // The question already says what came of the first: a later press only acknowledges.
    expect(second.deferUpdate).toHaveBeenCalledTimes(1);
    expect(second.update).not.toHaveBeenCalled();
    expect(second.editReply).not.toHaveBeenCalled();
    const cancel = replies[0]?.components?.[1]?.components[0] as { custom_id: string };
    const late = fakeButton({ customId: cancel.custom_id, userId: AUTHOR });
    await router.handle(late as never);
    expect(late.update).not.toHaveBeenCalled();
    expect(late.deleteReply).not.toHaveBeenCalled();
  });

  it('keeps an answer for a while from when it was given, not from when it was asked', async () => {
    const twin = testGym(13, 'Old Stone Fountain', 40.061, -80.061);
    const { trigger, image, router } = await setup({
      gyms: [twin],
      questionMs: 1_500,
      replyMs: 1_500,
    });
    // The replies' timers by the clock of the test, not of a machine that may be busy.
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'], now: PARTY_NOW });
    const { message, replies, did } = posted([image('a.png', egg())]);
    await trigger.handle(message);
    vi.advanceTimersByTime(1_000);
    const pick = fakeSelect({
      customId: menuOf(replies[0]).custom_id,
      values: ['13'],
      userId: AUTHOR,
    });
    await router.handle(pick as never);
    // Past the end of the question's own time: the answer is still there.
    vi.advanceTimersByTime(800);
    expect(did).not.toContain('reply deleted');
    vi.advanceTimersByTime(800);
    expect(did).toContain('reply deleted');
  });

  /** The check of the forum held until `release`, as when Discord is slow to answer it. */
  function holdAccess(gateway: Awaited<ReturnType<typeof setup>>['gateway']) {
    const ask = gateway.memberAccess.bind(gateway);
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const begun = new Tally('checks of the forum');
    gateway.memberAccess = async (forum, member) => {
      begun.add();
      await held;
      return ask(forum, member);
    };
    return { release, begun };
  }

  it('keeps the question from going while the gym picked in its last moments is reported', async () => {
    const twin = testGym(13, 'Old Stone Fountain', 40.061, -80.061);
    const { trigger, image, router, store, gateway } = await setup({
      gyms: [twin],
      questionMs: 1_500,
      replyMs: 1_500,
    });
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'], now: PARTY_NOW });
    const { message, replies, did } = posted([image('a.png', egg())]);
    await trigger.handle(message);
    vi.advanceTimersByTime(1_400);
    const access = holdAccess(gateway);
    const pick = fakeSelect({
      customId: menuOf(replies[0]).custom_id,
      values: ['13'],
      userId: AUTHOR,
    });
    const handled = router.handle(pick as never);
    await access.begun.reached(1);
    // The question's own time ends while the raid is reported: the question stays.
    vi.advanceTimersByTime(200);
    expect(did).not.toContain('reply deleted');
    access.release();
    await handled;
    expect(store.active()).toHaveLength(1);
    expect(sent(pick.editReply).content).toMatch(/^Reported the raid at Old Stone Fountain/);
  });

  it('asks nothing again when the question went while Discord was asked', async () => {
    const twin = testGym(13, 'Old Stone Fountain', 40.061, -80.061);
    const { trigger, image, router, store, gateway } = await setup({
      gyms: [twin],
      questionMs: 1_500,
      replyMs: 1_500,
    });
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'], now: PARTY_NOW });
    const { message, replies, did } = posted([image('a.png', egg())]);
    await trigger.handle(message);
    gateway.failing.set('memberAccess', new Error('Discord is away'));
    const access = holdAccess(gateway);
    const pick = fakeSelect({
      customId: menuOf(replies[0]).custom_id,
      values: ['13'],
      userId: AUTHOR,
    });
    const handled = router.handle(pick as never);
    await access.begun.reached(1);
    // The answer's time ends while Discord is asked: the question is gone.
    vi.advanceTimersByTime(1_600);
    expect(did).toContain('reply deleted');
    access.release();
    await handled;
    expect(store.active()).toEqual([]);
    // Nothing brings back the question that went: another pick of it is only acknowledged.
    const late = fakeSelect({
      customId: menuOf(replies[0]).custom_id,
      values: ['13'],
      userId: AUTHOR,
    });
    await router.handle(late as never);
    expect(late.deferUpdate).toHaveBeenCalled();
    expect(late.editReply).not.toHaveBeenCalled();
    expect(store.active()).toEqual([]);
  });

  it('tells the author privately when the question is gone before it can say the answer', async () => {
    const twin = testGym(13, 'Old Stone Fountain', 40.061, -80.061);
    const { trigger, image, router, store } = await setup({ gyms: [twin] });
    const { message, replies } = posted([image('a.png', egg())]);
    await trigger.handle(message);
    const pick = fakeSelect({
      customId: menuOf(replies[0]).custom_id,
      values: ['13'],
      userId: AUTHOR,
    });
    pick.editReply.mockRejectedValueOnce(new Error('Unknown Message'));
    await router.handle(pick as never);
    expect(store.active()).toHaveLength(1);
    const told = sent(pick.followUp);
    expect(told.content).toMatch(/^Reported the raid at Old Stone Fountain/);
    expect(told.flags).toBe(MessageFlags.Ephemeral);
  });

  it('forgets a question when it goes unanswered', async () => {
    const twin = testGym(13, 'Old Stone Fountain', 40.061, -80.061);
    const { trigger, image, router, store } = await setup({ gyms: [twin], questionMs: 10 });
    // The question's timer by the clock of the test.
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'], now: PARTY_NOW });
    const { message, replies, did } = posted([image('a.png', egg())]);
    await trigger.handle(message);
    vi.advanceTimersByTime(10);
    expect(did).toContain('reply deleted');
    const late = fakeSelect({
      customId: menuOf(replies[0]).custom_id,
      values: ['2'],
      userId: AUTHOR,
    });
    await router.handle(late as never);
    expect(sent(late.update).content).toMatch(/^That question has expired/);
    expect(store.active()).toEqual([]);
  });

  it('stops at a reader that cannot read, says so once, and uses no more of the throttle', async () => {
    const { trigger, image, reader } = await setup();
    const { message, replies } = posted([
      image('busy.png', { kind: 'busy' }),
      image('a.png', egg()),
      image('b.png', egg()),
    ]);
    await trigger.handle(message);
    expect(reader.reads).toBe(1);
    expect(replies.map((r) => r.content)).toEqual([
      'Too many screenshots are waiting to be read just now. Try again shortly.',
    ]);
    // Nineteen uses are left of the twenty.
    const cats = (prefix: string) =>
      Array.from({ length: 10 }, (_, i) => image(`${prefix}${i}.png`, readingOf({})));
    await trigger.handle(posted(cats('c')).message);
    const last = posted(cats('d'));
    await trigger.handle(last.message);
    expect(reader.reads).toBe(20);
    expect(last.replies.at(-1)?.content).toMatch(
      /You have sent many screenshots just now, so I did not read one of them\. Try again in 15 minutes\.$/,
    );
  });

  it('reads no further image and sends nothing once closed', async () => {
    const { trigger, image, reader } = await setup();
    const { message, replies, did } = posted([
      image('a.png', readingOf({})),
      image('b.png', readingOf({})),
    ]);
    const handled = trigger.handle(message);
    await reader.readsBegun.reached(1);
    await trigger.close();
    await handled;
    expect(reader.reads).toBe(1);
    expect(replies).toEqual([]);
    // Nothing is done to the message after the close either.
    expect(did).toEqual([`react ${READING}`]);
  });

  it('leaves alone what is not for it: no mention, a bot, a thread, no region, no picture', async () => {
    const { trigger, image, store } = await setup();
    for (const more of [
      { mentionsBot: false },
      { authorBot: true },
      { inThread: true },
      { channelId: '100000000000000099' },
      { guildId: null },
    ]) {
      const { message, did } = posted([image('a.png', egg())], more);
      await trigger.handle(message);
      expect(did).toEqual([]);
    }
    const { message, did } = posted([
      {
        url: 'https://cdn.discordapp.com/x/notes.txt',
        name: 'notes.txt',
        contentType: 'text/plain',
        size: 3,
      },
    ]);
    await trigger.handle(message);
    expect(did).toEqual([]);
    expect(store.active()).toEqual([]);
  });

  it('is silent where screenshots are not read', async () => {
    const { trigger, image, store } = await setup({ enabled: false });
    const { message, did } = posted([image('a.png', egg())]);
    await trigger.handle(message);
    expect(did).toEqual([]);
    expect(store.active()).toEqual([]);
  });

  it('reads passively only with the setting, answers only what exists, keeps no refused picture', async () => {
    const { trigger, image, store, files } = await setup({ passive: true });
    const raid = posted([image('a.png', egg())], { mentionsBot: false });
    await trigger.handle(raid.message);
    expect(store.active()).toHaveLength(1);
    // A message of nothing but raid screenshots goes once they are raids, as the legacy bot did.
    expect(raid.did).toEqual([`react ${READING}`, `unreact ${READING}`, 'deleted']);
    // A raid that exists is said in a reply that goes after a while, the message all the same.
    const again = posted([image('b.png', egg())], { mentionsBot: false, authorId: OTHER });
    await trigger.handle(again.message);
    // Its message is gone: the reply names and pings its author, and nobody else.
    expect(again.replies).toEqual([
      {
        content: expect.stringMatching(
          new RegExp(`^<@${OTHER}> There is already a raid at Old Stone Fountain: <#\\d+>\\.`),
        ) as unknown,
        ping: OTHER,
      },
    ]);
    expect(again.did.slice(0, 4)).toEqual([
      `react ${READING}`,
      `unreact ${READING}`,
      'reply',
      'deleted',
    ]);
    // One that says something too is kept and marked (Matt, 2026-10-14).
    const worded = posted([image('c.png', egg())], {
      mentionsBot: false,
      bare: false,
      authorId: OTHER,
    });
    await trigger.handle(worded.message);
    expect(worded.did.slice(0, 4)).toEqual([
      `react ${READING}`,
      `unreact ${READING}`,
      'reply',
      `react ${DONE}`,
    ]);
    const cat = posted([image('cat.png', readingOf({ gym: 'Old Stone Fountain' }))], {
      mentionsBot: false,
    });
    const kept = files('held').length;
    await trigger.handle(cat.message);
    expect(cat.did).toEqual([`react ${READING}`, `unreact ${READING}`]);
    expect(files('held')).toHaveLength(kept);
  });

  describe('read passively, a clear gym of another region (Matt, 2026-10-22)', () => {
    const lighthouse = () => eggReading('Harbor Lighthouse Mural', 5, CLOCK, 20 * 60);
    /** The Yes and No buttons of a reply. */
    const buttonsOf = (reply: ReplyPayload | undefined) =>
      (reply?.components?.[0]?.components ?? []) as { custom_id: string; label: string }[];
    const press = (reply: ReplyPayload | undefined, label: string, userId = AUTHOR) => {
      const button = buttonsOf(reply).find((b) => b.label === label);
      return fakeButton({ customId: button?.custom_id ?? 'missing', userId });
    };

    it('asks its author, pinging them, whether to report it there, and Yes reports it', async () => {
      const { trigger, image, store, router } = await setup({ passive: true });
      const { message, replies, did } = posted([image('a.png', lighthouse())], {
        mentionsBot: false,
      });
      await trigger.handle(message);
      expect(store.active()).toEqual([]);
      expect(replies).toHaveLength(1);
      expect(replies[0]?.content).toBe(
        `<@${AUTHOR}> Harbor Lighthouse Mural is in <#${EAST_CHANNEL}>. Report it there?`,
      );
      expect(replies[0]?.ping).toBe(AUTHOR);
      expect(buttonsOf(replies[0]).map((b) => b.label)).toEqual(['Yes', 'No']);
      expect(did).not.toContain('deleted');

      const stranger = press(replies[0], 'Yes', OTHER);
      await router.handle(stranger as never);
      expect(sent(stranger.reply).content).toBe('That is somebody else’s screenshot.');
      expect(store.active()).toEqual([]);

      const yes = press(replies[0], 'Yes');
      await router.handle(yes as never);
      const answer = sent(yes.editReply);
      expect(answer.content).toMatch(/^Reported the raid at Harbor Lighthouse Mural: <#\d+>\.$/);
      expect(answer.components).toEqual([]);
      expect(store.active()[0]).toMatchObject({ gymId: 7, regionId: 2, createdById: AUTHOR });
      expect(did).toContain('deleted');
    });

    it('says nothing when that region has no forum to report it in', async () => {
      const { trigger, image, store, regions } = await setup({ passive: true });
      regions.rows = regions.rows.map((row) =>
        row.channelId === EAST_CHANNEL ? { ...row, forumChannelId: null } : row,
      );
      const { message, replies, did } = posted([image('a.png', lighthouse())], {
        mentionsBot: false,
      });
      await trigger.handle(message);
      expect(store.active()).toEqual([]);
      expect(replies).toEqual([]);
      expect(did).not.toContain('deleted');
    });

    it('makes nothing when its author answers No, and the question goes', async () => {
      const { trigger, image, store, router } = await setup({ passive: true });
      const { message, replies, did } = posted([image('a.png', lighthouse())], {
        mentionsBot: false,
      });
      await trigger.handle(message);
      const no = press(replies[0], 'No');
      await router.handle(no as never);
      expect(no.deleteReply).toHaveBeenCalledTimes(1);
      expect(store.active()).toEqual([]);
      expect(did).not.toContain('deleted');
    });

    it('makes nothing when nobody answers, and the question goes at its time', async () => {
      const { trigger, image, store, router } = await setup({ passive: true, questionMs: 10 });
      vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'], now: PARTY_NOW });
      const { message, replies, did } = posted([image('a.png', lighthouse())], {
        mentionsBot: false,
      });
      await trigger.handle(message);
      vi.advanceTimersByTime(10);
      expect(did).toContain('reply deleted');
      const late = press(replies[0], 'Yes');
      await router.handle(late as never);
      expect(sent(late.update).content).toMatch(/^That question has expired/);
      expect(store.active()).toEqual([]);
    });

    it('joins a raid already there unasked, as one of this region', async () => {
      const { trigger, image, store, service } = await setup({ passive: true });
      await trigger.handle(
        posted([image('a.png', lighthouse())], { authorId: OTHER, channelId: EAST_CHANNEL })
          .message,
      );
      await service.flush();
      const { message, replies, did } = posted([image('b.png', lighthouse())], {
        mentionsBot: false,
      });
      await trigger.handle(message);
      expect(store.active()).toHaveLength(1);
      expect(store.active()[0]?.attendees[AUTHOR]).toBeDefined();
      expect(replies).toEqual([
        {
          content: expect.stringMatching(
            new RegExp(
              `^<@${AUTHOR}> There is already a raid at Harbor Lighthouse Mural: <#\\d+>\\. You have been signed up for it\\.$`,
            ),
          ) as unknown,
          ping: AUTHOR,
        },
      ]);
      expect(did).toContain('deleted');
    });

    it('refuses Yes when its author is kept out of that region’s forum', async () => {
      const { trigger, image, store, router, gateway } = await setup({ passive: true });
      const { message, replies, did } = posted([image('a.png', lighthouse())], {
        mentionsBot: false,
      });
      await trigger.handle(message);
      gateway.barred.set(EAST_FORUM, new Set([AUTHOR]));
      const yes = press(replies[0], 'Yes');
      await router.handle(yes as never);
      expect(sent(yes.editReply)).toMatchObject({ content: REPORT_BARRED, components: [] });
      expect(store.active()).toEqual([]);
      expect(did).not.toContain('deleted');
    });

    it('does not count an image whose Yes the bot may not post in the forum', async () => {
      const { trigger, image, router, gateway } = await setup({ passive: true });
      gateway.refusePosts.set(EAST_FORUM, ['Manage Posts']);
      const source = image('a.png', lighthouse());
      for (let n = 0; n < 21; n++) {
        const { message, replies } = posted([source], { mentionsBot: false });
        await trigger.handle(message);
        // The twenty-first is read too: none of the earlier ones counted.
        expect(replies[0]?.content).toMatch(/Report it there\?$/);
        const yes = press(replies[0], 'Yes');
        await router.handle(yes as never);
        expect(sent(yes.editReply).content).toMatch(/^I am not allowed to make posts in /);
      }
      await trigger.close();
    });
  });

  it('reads every image of a message as a report of its own, one after the other', async () => {
    const twin = testGym(13, 'Starbucks', 40.021, -80.081);
    const { trigger, image, store, reader } = await setup({ gyms: [twin] });
    const { message, did, replies } = posted([
      image('a.png', egg()),
      image('b.png', eggReading('Starbucks', 1, CLOCK, 10 * 60)),
    ]);
    await trigger.handle(message);
    expect(reader.reads).toBe(2);
    expect(store.active()).toHaveLength(1);
    expect(replies.map((r) => r.content)).toEqual([expect.stringMatching(/Which gym is it\?/)]);
    // Not every image made a raid: the message stays.
    expect(did).not.toContain('deleted');
  });

  it('does not count a screenshot whose raid the bot may not post in the forum', async () => {
    const { trigger, image, reader, gateway, store } = await setup();
    gateway.refusePosts.set(WEST_FORUM, ['Manage Posts']);
    const source = image('egg.png', egg());
    for (let n = 0; n < 21; n++) {
      const { message, replies } = posted([source]);
      await trigger.handle(message);
      expect(replies.at(-1)?.content).toMatch(/^I am not allowed to make posts in /);
    }
    expect(reader.reads).toBe(21);
    gateway.refusePosts.delete(WEST_FORUM);
    await trigger.handle(posted([source]).message);
    expect(store.active()).toHaveLength(1);
    await trigger.close();
  });

  it('does not count a screenshot whose raid’s post was lost while it was made', async () => {
    const { trigger, image, reader, gateway, store } = await setup();
    gateway.losePosts = true;
    const source = image('egg.png', egg());
    for (let n = 0; n < 21; n++) {
      const { message, replies } = posted([source]);
      await trigger.handle(message);
      expect(replies.at(-1)?.content).toContain(NO_POST_MADE);
    }
    expect(reader.reads).toBe(21);
    gateway.losePosts = false;
    await trigger.handle(posted([source]).message);
    expect(store.active()).toHaveLength(1);
    await trigger.close();
  });

  it('does not count a screenshot answered by its gym question whose raid the bot may not post', async () => {
    const twin = testGym(13, 'Old Stone Fountain', 40.061, -80.061);
    const { trigger, image, router, gateway } = await setup({ gyms: [twin] });
    gateway.refusePosts.set(WEST_FORUM, ['Manage Posts']);
    const unclear = image('a.png', egg());
    for (let n = 0; n < 21; n++) {
      const { message, replies } = posted([unclear]);
      await trigger.handle(message);
      // The twenty-first is read too: none of the earlier ones counted.
      expect(replies[0]?.content).toMatch(/Which gym is it\?/);
      const picked = fakeSelect({
        customId: menuOf(replies[0]).custom_id,
        values: ['13'],
        userId: AUTHOR,
      });
      await router.handle(picked as never);
      expect(sent(picked.editReply).content).toMatch(/^I am not allowed to make posts in /);
    }
    await trigger.close();
  });

  describe('a split screenshot (plan 7P)', () => {
    const fountain = () => eggReading('Maple Leaf Mosaic', 3, CLOCK, 15 * 60);

    it('reports each pane’s raid, one image read once, and lets the message go', async () => {
      const { trigger, image, store, reader } = await setup();
      const { message, did } = posted([image('split.png', splitOutcome([egg(), fountain()]))]);
      await trigger.handle(message);
      expect(reader.reads).toBe(1);
      expect(
        store
          .active()
          .map((party) => party.gymId)
          .sort(),
      ).toEqual([2, 6]);
      expect(did).toContain('deleted');
    });

    it('keeps the message while one pane’s question waits, and counts panes in its reply', async () => {
      const twin = testGym(13, 'Starbucks', 40.021, -80.081);
      const { trigger, image, store, router } = await setup({ gyms: [twin] });
      const unclear = eggReading('Starbucks', 1, CLOCK, 10 * 60);
      const cat = readingOf({ gym: 'Old Stone Fountain' });
      const { message, did, replies } = posted([
        image('split.png', splitOutcome([egg(), unclear])),
        image('cat.png', cat),
      ]);
      await trigger.handle(message);
      expect(store.active()).toHaveLength(1);
      const [question, reply] = replies;
      expect(question?.content).toMatch(/Which gym is it\?/);
      expect(reply?.content).toBe(
        '1 of 3: This does not look like the screen of a raid, so I made nothing of it.',
      );
      const picked = fakeSelect({
        customId: menuOf(question).custom_id,
        values: ['5'],
        userId: AUTHOR,
      });
      await router.handle(picked as never);
      expect(store.active()).toHaveLength(2);
      // The cat made nothing: the message stays, marked as every report it could make was made.
      expect(did).not.toContain('deleted');
    });

    it('refuses two screens it could not tell apart, and gives the use back', async () => {
      const { trigger, image, reader } = await setup();
      const mixed = image('mixed.png', { kind: 'read', reading: egg(), twoScreens: true });
      for (let n = 0; n < 21; n++) {
        const { message, replies } = posted([mixed]);
        await trigger.handle(message);
        expect(replies.at(-1)?.content).toBe(TWO_SCREENS);
      }
      expect(reader.reads).toBe(21);
      await trigger.close();
    });

    it('reads a second pane only with a use of its own, and says when none is left', async () => {
      const { trigger, image, store } = await setup();
      const cat = image('cat.png', readingOf({ gym: 'Old Stone Fountain' }));
      for (let i = 0; i < 19; i++) await trigger.handle(posted([cat]).message);
      const late = posted([image('split.png', splitOutcome([egg(), fountain()]))]);
      await trigger.handle(late.message);
      expect(store.active().map((party) => party.gymId)).toEqual([2]);
      expect(late.replies.at(-1)?.content).toBe(
        'You have sent many screenshots just now, so I did not read the other screen of one of them. Try again in 15 minutes.',
      );
      // A screen was left unread: the message stays, unmarked, under the reply that says so.
      expect(late.did).not.toContain('deleted');
      expect(late.did).not.toContain(`react ${DONE}`);
      await trigger.close();
    });

    it('gives back the second pane’s use when its raid is refused for none of the member’s doing', async () => {
      const { trigger, image, gateway, reader } = await setup();
      gateway.refusePosts.set(WEST_FORUM, ['Manage Posts']);
      const split = image('split.png', splitOutcome([egg(), fountain()]));
      // Two uses an image: eleven would pass the twenty if the uses were not given back.
      for (let n = 0; n < 11; n++) {
        const { message, replies } = posted([split]);
        await trigger.handle(message);
        expect(replies.at(-1)?.content).not.toMatch(/many screenshots/);
      }
      expect(reader.reads).toBe(11);
      await trigger.close();
    });
  });

  it('holds a member to twenty screenshots a quarter of an hour, an image a use', async () => {
    const { trigger, image, reader } = await setup();
    const source = image('cat.png', readingOf({ gym: 'Old Stone Fountain' }));
    for (let i = 0; i < 6; i++) await trigger.handle(posted([source, source, source]).message);
    expect(reader.reads).toBe(18);
    const late = posted([source, source, source, source]);
    await trigger.handle(late.message);
    expect(reader.reads).toBe(20);
    expect(late.replies.at(-1)?.content).toMatch(
      /You have sent many screenshots just now, so I did not read 2 of them\. Try again in 15 minutes\.$/,
    );
    await trigger.close();
  });
});
