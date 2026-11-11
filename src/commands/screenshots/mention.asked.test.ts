import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeSelect, sent } from '../../../test/support/fake-interactions.js';
import { EAST_CHANNEL, testGym, WEST_CHANNEL } from '../../../test/support/gyms.js';
import { asRaid, at, PARTY_NOW } from '../../../test/support/parties.js';
import { partyServiceWith } from '../../../test/support/party-service.js';
import { AUTHOR, OTHER, posted } from '../../../test/support/posted-message.js';
import { gymsFixture } from '../../../test/support/providers.js';
import { screenshotsWith } from '../../../test/support/screenshot-service.js';
import { eggReading, readingOf, splitOutcome } from '../../../test/support/screenshots.js';
import { createTestContext } from '../../../test/support/test-context.js';
import type { Gym } from '../../db/repositories/gym-repository.js';
import type { Region } from '../../db/repositories/region-repository.js';
import { InteractionRouter } from '../../discord/router.js';
import { listTierDoubt, type ListTierObservation } from '../../domain/ocr/list-tier-doubt.js';
import { raidBossCp } from '../../domain/pogo/cp.js';
import { bossStamina } from '../../domain/pogo/raid-tier.js';
import type { ScreenReading } from '../../ocr/screen-reader.js';
import type { OcrOutcome } from '../../services/ocr-service.js';
import type { ScreenshotServiceOptions } from '../../services/screenshot-service.js';
import { catalogueFixture } from '../../../test/support/game-data.js';
import { Rehearsal } from '../../services/rehearsal.js';
import { screenshotControls } from './feedback.js';
import {
  DONE,
  READING,
  ScreenshotTrigger,
  type AskedMessage,
  type ReplyPayload,
  type ShotAsker,
} from './mention.js';

/*
 * A message read because a member asked for it ("Read screenshot" in its Apps menu, plan 7M):
 * `ScreenshotTrigger.readFor`, the mention's own flow with the member who asked standing where
 * the message's author stands.
 */

const CLOCK = { hour: 13, minute: 59 };
const MINUTE = 60_000;
/** A third member. */
const THIRD = '700000000000000003';
/** A post of a forum, and the region's board among them. */
const POST = '850000000000000001';

async function setup(
  options: {
    gyms?: Gym[];
    enabled?: boolean;
    rehearsal?: Rehearsal;
    board?: boolean;
    watch?: ScreenshotServiceOptions['tierWatch'];
  } = {},
) {
  const gyms = gymsFixture(options.gyms ?? []);
  const made = await partyServiceWith([], { gyms });
  const shots = screenshotsWith(createTestContext({ gyms }).ctx, undefined, options.watch);
  const { ctx: base } = createTestContext({
    gyms,
    partyService: made.service,
    parties: made.store,
    regions: made.regions,
    screenshots: shots.screenshots,
  });
  const ocr = { ...base.config.settings.ocr, passive: false, enabled: options.enabled ?? true };
  const ctx = {
    ...base,
    config: { ...base.config, settings: { ...base.config.settings, ocr } },
    features: { ocrPassive: false, autoAssignRole: false },
    ...(options.rehearsal ? { rehearsal: options.rehearsal } : {}),
  };
  const taken: string[] = [];
  const west = made.regions.byChannel(WEST_CHANNEL) as Region;
  const trigger = new ScreenshotTrigger({
    ctx,
    replyMs: 20,
    questionMs: 60_000,
    ...(options.board
      ? {
          board: {
            regionOfBoard: (channelId: string) => (channelId === POST ? west : undefined),
            take: (_region: Region, message: { id: string }) => {
              taken.push(message.id);
              return Promise.resolve('deleted' as const);
            },
          },
        }
      : {}),
  });
  const router = new InteractionRouter(ctx, [], [screenshotControls]);
  const image = (name: string, reading: ScreenReading | OcrOutcome) =>
    shots.screenshot(name, reading);
  return { ...shots, ...made, ctx, trigger, router, image, taken };
}

/** The message as `readFor` takes it: without what only a posted message has. */
const asked = (message: ReturnType<typeof posted>['message']): AskedMessage => message;
/** The member who asks: the other member, Sol of Mystic, unless a test says who. */
const asker = (more: Partial<ShotAsker> = {}): ShotAsker => ({
  id: OTHER,
  member: { name: 'Sol', team: 'mystic' },
  startBy: PARTY_NOW + 13 * MINUTE,
  ...more,
});
/** The author asking for their own message. */
const self = (): ShotAsker => asker({ id: AUTHOR, member: { name: 'Rhea', team: 'instinct' } });

const egg = () => eggReading('Old Stone Fountain', 5, CLOCK, 20 * 60);
const cat = () => readingOf({ gym: 'Old Stone Fountain' });
const menuOf = (reply: ReplyPayload | undefined) =>
  reply?.components?.[0]?.components[0] as { custom_id: string; options: { value: string }[] };

describe('a message’s screenshots read because a member asked (plan 7M)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'], now: PARTY_NOW });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('makes the raid a mention makes, and says so in its reply as well', async () => {
    const byMention = await setup();
    const mention = posted([byMention.image('a.png', egg())]);
    await byMention.trigger.handle(mention.message);
    const byAsking = await setup();
    const own = posted([byAsking.image('a.png', egg())], { mentionsBot: false });
    expect(await byAsking.trigger.readFor(asked(own.message), self())).toBeUndefined();
    const [made] = byAsking.store.active();
    const [mentioned] = byMention.store.active();
    const raidOf = (party: typeof made) => {
      const { gymId, createdById, hatchTime, endTime, attendees, raid } = asRaid(party);
      return { gymId, createdById, hatchTime, endTime, attendees, tier: raid.tier };
    };
    expect(raidOf(made)).toEqual(raidOf(mentioned));
    expect(made).toMatchObject({ gymId: 2, createdById: AUTHOR });
    // The member's own message that says nothing goes, as a mention alone does.
    expect(own.did).toEqual([`react ${READING}`, `unreact ${READING}`, 'reply', 'deleted']);
    // The mention is answered by the raid's line in the channel; who asked is told too.
    expect(mention.replies).toEqual([]);
    expect(own.replies).toEqual([
      { content: `Reported the raid at Old Stone Fountain: <#${made?.forumPostId ?? ''}>.` },
    ]);
  });

  it('reports as the member who asked, not as the author, whose message stays and pings nobody', async () => {
    const { trigger, image, store, screenshots } = await setup();
    const { message, did, replies } = posted([image('a.png', egg())], { mentionsBot: false });
    await trigger.readFor(asked(message), asker());
    const [party] = store.active();
    expect(party).toMatchObject({ gymId: 2, createdById: OTHER });
    expect(Object.keys(party?.attendees ?? {})).toEqual([OTHER]);
    expect(Object.values(party?.attendees ?? {})).toMatchObject([{ name: 'Sol', team: 'mystic' }]);
    // Somebody else's message is never deleted: it is marked as one whose screenshots are raids.
    expect(did).toEqual([`react ${READING}`, `unreact ${READING}`, 'reply', `react ${DONE}`]);
    expect(replies.map((reply) => reply.ping)).toEqual([undefined]);
    // The kept record names who asked as its sender, and the time the message was posted.
    const shotId = asRaid(party).raid.screenshot?.id;
    if (!shotId) throw new Error('no screenshot kept');
    expect(await screenshots.get(shotId)).toMatchObject({
      record: { senderId: OTHER, use: 'mention', uploadedAt: PARTY_NOW },
    });
  });

  it('asks who asked which gym: the author’s pick is refused as any stranger’s', async () => {
    const twin = testGym(13, 'Old Stone Fountain', 40.061, -80.061, { nickname: 'Bank fountain' });
    const { trigger, image, store, router } = await setup({ gyms: [twin] });
    const { message, replies, did } = posted([image('a.png', egg())], { mentionsBot: false });
    await trigger.readFor(asked(message), asker());
    expect(store.active()).toEqual([]);
    const [question] = replies;
    expect(question?.content).toMatch(/Which gym is it\? I read "Old Stone Fountain"\.$/);
    expect(question?.ping).toBeUndefined();
    const menu = menuOf(question);
    const author = fakeSelect({ customId: menu.custom_id, values: ['13'], userId: AUTHOR });
    await router.handle(author as never);
    expect(sent(author.reply).content).toBe('That is somebody else’s screenshot.');
    expect(store.active()).toEqual([]);
    const theirs = fakeSelect({ customId: menu.custom_id, values: ['13'], userId: OTHER });
    await router.handle(theirs as never);
    expect(sent(theirs.editReply).content).toMatch(/^Reported the raid at Bank fountain/);
    expect(store.active()[0]).toMatchObject({ gymId: 13, createdById: OTHER });
    expect(did).not.toContain('deleted');
    expect(did).toContain(`react ${DONE}`);
  });

  it('counts in the window of the member’s mentions: the 21st screenshot of either is refused', async () => {
    const { trigger, image, reader } = await setup();
    const cats = (prefix: string) =>
      Array.from({ length: 10 }, (_, i) => image(`${prefix}${String(i)}.png`, cat()));
    // Ten with a mention, ten asked for, by the same member.
    await trigger.handle(posted(cats('a'), { authorId: OTHER }).message);
    await trigger.readFor(asked(posted(cats('b'), { mentionsBot: false }).message), asker());
    expect(reader.reads).toBe(20);
    const refused = posted([image('c.png', cat())], { mentionsBot: false });
    await trigger.readFor(asked(refused.message), asker());
    expect(reader.reads).toBe(20);
    // Worded for who had them read (review F6).
    expect(refused.replies.map((reply) => reply.content)).toEqual([
      'You have had many screenshots read just now, so I did not read them. Try again in 15 minutes.',
    ]);
    // So is a mention of theirs, in the mention's words; the author's own window is untouched.
    const mention = posted([image('d.png', cat())], { authorId: OTHER });
    await trigger.handle(mention.message);
    expect(reader.reads).toBe(20);
    expect(mention.replies.map((reply) => reply.content)).toEqual([
      'You have sent many screenshots just now, so I did not read them. Try again in 15 minutes.',
    ]);
    await trigger.readFor(asked(posted([image('e.png', cat())]).message), self());
    expect(reader.reads).toBe(21);
    await trigger.close();
  });

  // Review F2: a message posted without a mention was posted for the channel, may be hours old
  // and have replies; it goes only once its screenshots all made or joined raids.
  it('says what it refuses in the reply, and keeps the message, the member’s own too', async () => {
    const { trigger, image } = await setup();
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'], now: PARTY_NOW });
    const own = posted([image('a.png', cat())], { mentionsBot: false });
    await trigger.readFor(asked(own.message), self());
    expect(own.replies.map((reply) => reply.content)).toEqual([
      'This does not look like the screen of a raid, so I made nothing of it.',
    ]);
    const theirs = posted([image('b.png', cat())], { mentionsBot: false });
    await trigger.readFor(asked(theirs.message), asker());
    vi.advanceTimersByTime(60 * MINUTE);
    expect(own.did).not.toContain('deleted');
    // Another member's picture is theirs to keep, whoever has it read.
    expect(theirs.did).not.toContain('deleted');
    // So is a message of the member's own that says something.
    const worded = posted([image('c.png', cat())], { mentionsBot: false, bare: false });
    await trigger.readFor(asked(worded.message), self());
    vi.advanceTimersByTime(60 * MINUTE);
    expect(worded.did).not.toContain('deleted');
    await trigger.close();
  });

  it('says a split’s other screen was not read for the member’s window, as had read (review F6)', async () => {
    const { trigger, image } = await setup();
    const one = image('cat.png', cat());
    for (let i = 0; i < 19; i++) await trigger.readFor(asked(posted([one]).message), asker());
    const mosaic = eggReading('Maple Leaf Mosaic', 3, CLOCK, 15 * 60);
    const split = posted([image('split.png', splitOutcome([egg(), mosaic]))], {
      mentionsBot: false,
    });
    await trigger.readFor(asked(split.message), asker());
    // Under the line of the raid its first screen made.
    expect(split.replies.at(-1)?.content.split('\n')).toEqual([
      expect.stringMatching(/^Reported the raid at Old Stone Fountain/),
      'You have had many screenshots read just now, so I did not read the other screen of one ' +
        'of them. Try again in 15 minutes.',
    ]);
    await trigger.close();
  });

  it('keeps the member’s own message whose screenshot it could not read for their window (review F2)', async () => {
    const { trigger, image } = await setup();
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'], now: PARTY_NOW });
    // Twenty of the member's screenshots with mentions, ten a message.
    for (const prefix of ['a', 'b']) {
      const cats = Array.from({ length: 10 }, (_, i) => image(`${prefix}${String(i)}.png`, cat()));
      await trigger.handle(posted(cats, { bare: false }).message);
    }
    const own = posted([image('b.png', egg())], { mentionsBot: false });
    await trigger.readFor(asked(own.message), self());
    expect(own.replies.map((reply) => reply.content)).toEqual([
      'You have had many screenshots read just now, so I did not read them. Try again in 15 minutes.',
    ]);
    // The reply says to try again later: the message is still there to try it on.
    vi.advanceTimersByTime(60 * MINUTE);
    expect(own.did).not.toContain('deleted');
    await trigger.close();
  });

  it('counts a picture read for several members once against the boss list, by who posted it (review F1)', async () => {
    const seen: ListTierObservation[] = [];
    const { trigger, image } = await setup({
      watch: {
        observe: ({ memberId, place, at: when }, sighting) => {
          seen.push({ memberId, place, at: when, ...sighting });
        },
      },
    });
    // A hatched raid whose CP and name at one head's tier are Starmie's, listed at T3.
    const starmie = catalogueFixture().byKey('starmie');
    if (!starmie) throw new Error('starmie');
    const misread = () =>
      readingOf(
        {
          gym: 'Old Stone Fountain',
          clock: CLOCK,
          countdown: 30 * 60,
          countdownPlace: 'right',
          cp: raidBossCp(starmie.stats, bossStamina({ level: 'T1', shadow: false })),
          bossName: 'Starmie',
        },
        { heads: 1 },
      );
    // One message's picture, read for its author and for two other members.
    const { message } = posted([image('a.png', misread())], { mentionsBot: false });
    for (const who of [self(), asker(), asker({ id: THIRD })]) {
      expect(await trigger.readFor(asked(message), who)).toBeUndefined();
    }
    expect(seen).toHaveLength(3);
    expect(listTierDoubt(seen, Date.now())).toEqual([]);
    // Three members' own pictures of it still tell the moderators.
    for (const [i, authorId] of [OTHER, THIRD].entries()) {
      await trigger.handle(posted([image(`b${String(i)}.png`, misread())], { authorId }).message);
    }
    expect(listTierDoubt(seen, Date.now())).toMatchObject([{ bossKey: 'starmie', count: 3 }]);
    await trigger.close();
  });

  describe('a message posted a while ago', () => {
    it('dates the screenshot by the message and decides now: an egg hatched since is a raid', async () => {
      const { trigger, image, store } = await setup();
      // Posted at 13:30 with ten minutes to go: hatched at 13:39, twenty minutes ago.
      const { message } = posted(
        [image('a.png', eggReading('Old Stone Fountain', 5, { hour: 13, minute: 29 }, 10 * 60))],
        { mentionsBot: false, createdAt: at('2026-10-13T13:30') },
      );
      await trigger.readFor(asked(message), asker());
      expect(store.active()[0]).toMatchObject({
        gymId: 2,
        hatchTime: at('2026-10-13T13:39'),
        endTime: at('2026-10-13T14:24'),
        // Seen as an egg, reported as the raid it is by now.
        raid: { reportedHatched: true },
      });
    });

    it('refuses a raid that has ended since', async () => {
      const { trigger, image, store } = await setup();
      const old = () => eggReading('Old Stone Fountain', 5, { hour: 11, minute: 59 }, 10 * 60);
      const { message, replies } = posted([image('a.png', old())], {
        mentionsBot: false,
        createdAt: at('2026-10-13T12:00'),
      });
      await trigger.readFor(asked(message), asker());
      expect(store.active()).toEqual([]);
      expect(replies.map((reply) => reply.content)).toEqual([
        'By its countdown this raid has already ended.',
      ]);
    });

    it('gives a screenshot up as busy when its turn comes too late to answer who asked', async () => {
      const { trigger, image, reader, store } = await setup();
      reader.lateAfter = PARTY_NOW + 14 * MINUTE;
      const { message, replies } = posted([image('a.png', egg())], { mentionsBot: false });
      await trigger.readFor(asked(message), asker());
      expect(store.active()).toEqual([]);
      expect(replies.map((reply) => reply.content)).toEqual([
        'Too many screenshots are waiting to be read just now. Try again shortly.',
      ]);
    });
  });

  describe('what it does not read, and why', () => {
    it('a message without a picture, in a post, in the region’s board, in a channel of no region', async () => {
      const { trigger, image, store, taken, reader } = await setup({ board: true });
      const file = {
        url: 'https://cdn.discordapp.com/x/notes.txt',
        name: 'notes.txt',
        contentType: 'text/plain',
        size: 3,
      };
      const cases: [Parameters<typeof posted>[0], Parameters<typeof posted>[1], string][] = [
        [[file], {}, 'no-picture'],
        [[], {}, 'no-picture'],
        [[image('a.png', egg())], { inThread: true, channelId: '850000000000000002' }, 'post'],
        // The board's pictures are taken as they are posted: none is read later.
        [[image('b.png', egg())], { inThread: true, channelId: POST }, 'post'],
        [[image('c.png', egg())], { channelId: '100000000000000099' }, 'no-region'],
      ];
      for (const [attachments, more, why] of cases) {
        const { message, did, replies } = posted(attachments, { mentionsBot: false, ...more });
        expect(await trigger.readFor(asked(message), asker())).toBe(why);
        expect(did).toEqual([]);
        expect(replies).toEqual([]);
      }
      expect(taken).toEqual([]);
      expect(reader.reads).toBe(0);
      expect(store.active()).toEqual([]);
      // In another region's channel it is read as that region's.
      const east = posted([image('d.png', eggReading('Harbor Lighthouse Mural', 5, CLOCK, 600))], {
        mentionsBot: false,
        channelId: EAST_CHANNEL,
      });
      expect(await trigger.readFor(asked(east.message), asker())).toBeUndefined();
      expect(store.active()[0]).toMatchObject({ gymId: 7, createdById: OTHER });
    });

    it('during a rehearsal, where screenshots are not read, and once it closes', async () => {
      const rehearsal = new Rehearsal({ allowlist: [OTHER], regions: ['west'], staffRoles: [] });
      const rehearsing = await setup({ rehearsal });
      const one = posted([rehearsing.image('a.png', egg())], { mentionsBot: false });
      expect(await rehearsing.trigger.readFor(asked(one.message), asker())).toBe('rehearsal');
      const off = await setup({ enabled: false });
      const two = posted([off.image('a.png', egg())], { mentionsBot: false });
      expect(await off.trigger.readFor(asked(two.message), asker())).toBe('off');
      const closing = await setup();
      await closing.trigger.close();
      const three = posted([closing.image('a.png', egg())], { mentionsBot: false });
      expect(await closing.trigger.readFor(asked(three.message), asker())).toBe('closing');
      for (const { did } of [one, two, three]) expect(did).toEqual([]);
    });

    it('a message it is reading already, for whoever asks meanwhile', async () => {
      const { trigger, image, reader, store } = await setup();
      const { message, replies } = posted([image('a.png', egg())], { mentionsBot: false });
      const first = trigger.readFor(asked(message), asker());
      await reader.readsBegun.reached(1);
      expect(await trigger.readFor(asked(message), self())).toBe('being-read');
      expect(await first).toBeUndefined();
      expect(reader.reads).toBe(1);
      expect(store.active()).toHaveLength(1);
      expect(replies).toHaveLength(1);
      // Read, it can be asked for again: the raid there is joined, as from any screenshot of it.
      const again = posted([image('a.png', egg())], { mentionsBot: false });
      expect(await trigger.readFor(asked(again.message), self())).toBeUndefined();
      expect(again.replies[0]?.content).toMatch(
        /^There is already a raid at Old Stone Fountain: <#\d+>\. You have been signed up for it\.$/,
      );
    });

    it('nor a message a mention of the bot is being read from just now', async () => {
      const { trigger, image, reader } = await setup();
      const { message } = posted([image('a.png', egg())]);
      const mentioned = trigger.handle(message);
      await reader.readsBegun.reached(1);
      expect(await trigger.readFor(asked(message), asker())).toBe('being-read');
      await mentioned;
      expect(reader.reads).toBe(1);
    });
  });
});
