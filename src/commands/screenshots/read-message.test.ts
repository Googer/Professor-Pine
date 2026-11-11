import { ApplicationCommandType, MessageFlags, type ChatInputCommandInteraction } from 'discord.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  asV2,
  FAKE_BOT_ID,
  fakeChatInput,
  fakeMessageCommand,
  fakeSelect,
  followUpId,
  sent,
  type FakeInteraction,
  type FakeOptions,
  type FakeTargetMessage,
} from '../../../test/support/fake-interactions.js';
import { EAST_CHANNEL, testGym, WEST_CHANNEL, WEST_FORUM } from '../../../test/support/gyms.js';
import { textDisplays } from '../../../test/support/messages.js';
import { asRaid, at, PARTY_NOW } from '../../../test/support/parties.js';
import { partyServiceWith } from '../../../test/support/party-service.js';
import { AUTHOR, OTHER, posted } from '../../../test/support/posted-message.js';
import { gymsFixture } from '../../../test/support/providers.js';
import { screenshotsWith } from '../../../test/support/screenshot-service.js';
import { eggReading, readingOf } from '../../../test/support/screenshots.js';
import { createTestContext } from '../../../test/support/test-context.js';
import type { Config } from '../../config/index.js';
import type { Gym } from '../../db/repositories/gym-repository.js';
import { enabledMessageCommands } from '../../discord/command.js';
import { buildCommandPayload } from '../../discord/deploy.js';
import { InteractionRouter } from '../../discord/router.js';
import type { Party } from '../../domain/party/party.js';
import type { ScreenshotSource } from '../../services/screenshot-service.js';
import { messageCommands } from '../index.js';
import { help } from '../util/help.js';
import { screenshotControls } from './feedback.js';
import { DONE, READING, ScreenshotTrigger } from './mention.js';
import { READ_SCREENSHOT_NAME, readScreenshotMessage } from './read-message.js';

/*
 * "Read screenshot" in the Apps menu of a message (plan 7M): the message read as a mention of
 * the bot in it is read, for the member who used it, answered privately.
 */

const CLOCK = { hour: 13, minute: 59 };
const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
const NO_PINGS = { parse: [] };

async function setup(options: { gyms?: Gym[] } = {}) {
  const gyms = gymsFixture(options.gyms ?? []);
  const made = await partyServiceWith([], { gyms });
  const shots = screenshotsWith(createTestContext({ gyms }).ctx);
  const { ctx: base, entries } = createTestContext({
    gyms,
    partyService: made.service,
    parties: made.store,
    regions: made.regions,
    screenshots: shots.screenshots,
  });
  const ocr = { ...base.config.settings.ocr, passive: false, enabled: true };
  const inner = {
    ...base,
    config: { ...base.config, settings: { ...base.config.settings, ocr } },
    features: { ocrPassive: false, autoAssignRole: false },
  };
  // One trigger a bot: the mentions' and the command's alike (`src/app.ts`).
  const trigger = new ScreenshotTrigger({ ctx: inner, replyMs: 20, questionMs: 60_000 });
  const ctx = { ...inner, messageShots: trigger };
  const router = new InteractionRouter(ctx, [readScreenshotMessage], [screenshotControls]);
  /**
   * "Read screenshot" used on a message of these pictures, written by the author in the west
   * region's channel: by the other member, Sol of Mystic, unless `by` says who. `did` is what
   * was done to the message.
   */
  const use = async (
    files: ScreenshotSource[],
    more: {
      by?: FakeOptions;
      target?: Partial<FakeTargetMessage>;
      before?: (interaction: FakeInteraction) => void;
    } = {},
  ) => {
    const did: string[] = [];
    const interaction = fakeMessageCommand({
      commandName: READ_SCREENSHOT_NAME,
      userId: OTHER,
      displayName: 'Sol',
      roleNames: ['mystic'],
      channelId: WEST_CHANNEL,
      guildChannelNames: { [EAST_CHANNEL]: 'east', [WEST_CHANNEL]: 'west' },
      ...more.by,
      targetMessage: { id: '800000000000000001', authorId: AUTHOR, files, did, ...more.target },
    });
    more.before?.(interaction);
    await router.handle(interaction as never);
    return { interaction, did };
  };
  /** The author using it on their own message. */
  const own: FakeOptions = { userId: AUTHOR, displayName: 'Rhea', roleNames: ['instinct'] };
  return { ...shots, ...made, ctx, entries, trigger, router, use, own, image: shots.screenshot };
}

const egg = () => eggReading('Old Stone Fountain', 5, CLOCK, 20 * 60);
const cat = () => readingOf({ gym: 'Old Stone Fountain' });
/** What is the same of a raid whoever's bot made it. */
const raidOf = (party: Party | undefined) => {
  const { gymId, createdById, hatchTime, endTime, attendees, raid } = asRaid(party);
  return { gymId, createdById, hatchTime, endTime, attendees, tier: raid.tier };
};
const menuOf = (payload: { components?: readonly unknown[] }) =>
  (payload.components?.[0] as { components: unknown[] } | undefined)?.components[0] as {
    custom_id: string;
    options: { value: string }[];
  };

describe('Read screenshot (the Apps menu of a message, plan 7M)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'], now: PARTY_NOW });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('is a message command, offered only where screenshots are read', () => {
    expect(messageCommands).toContain(readScreenshotMessage);
    const { config } = createTestContext().ctx;
    const withReader = (enabled: boolean): Config => ({
      ...config,
      settings: { ...config.settings, ocr: { ...config.settings.ocr, enabled } },
    });
    expect(enabledMessageCommands(messageCommands, withReader(true))).toContain(
      readScreenshotMessage,
    );
    expect(enabledMessageCommands(messageCommands, withReader(false))).not.toContain(
      readScreenshotMessage,
    );
    const payload = buildCommandPayload([], [readScreenshotMessage]) as {
      name: string;
      type: number;
    }[];
    expect(payload.map((command) => [command.name, command.type])).toEqual([
      ['Read screenshot', ApplicationCommandType.Message],
    ]);
  });

  it('makes of a message what a mention of the bot in it makes: the same raid, the same words', async () => {
    // The author's message with a mention, read as it is posted.
    const byMention = await setup();
    const mention = posted([byMention.image('a.png', egg())]);
    await byMention.trigger.handle(mention.message);
    // The same message without one, read from its Apps menu by its author.
    const byMenu = await setup();
    const used = await byMenu.use([byMenu.image('a.png', egg())], { by: byMenu.own });
    const [made] = byMenu.store.active();
    expect(raidOf(made)).toEqual(raidOf(byMention.store.active()[0]));
    // The message goes as the mention does; the answer is the member's alone.
    expect(used.did).toEqual(mention.did);
    expect(used.did).toEqual([`react ${READING}`, `unreact ${READING}`, 'deleted']);
    expect(sent(used.interaction.deferReply)).toEqual({ flags: MessageFlags.Ephemeral });
    expect(sent(used.interaction.editReply)).toEqual({
      content: `Reported the raid at Old Stone Fountain: <#${made?.forumPostId ?? ''}>.`,
      allowedMentions: NO_PINGS,
    });
    expect(used.interaction.followUp).not.toHaveBeenCalled();

    // A raid that exists, and a picture that is no raid's: the mention's own words.
    await byMention.service.flush();
    await byMenu.service.flush();
    const again = posted([byMention.image('b.png', egg()), byMention.image('c.png', cat())], {
      authorId: OTHER,
    });
    await byMention.trigger.handle(again.message);
    const usedAgain = await byMenu.use([
      byMenu.image('b.png', egg()),
      byMenu.image('c.png', cat()),
    ]);
    const words = (text: string | undefined) => text?.replace(/<#\d+>/g, '<#post>');
    expect(words(sent(usedAgain.interaction.editReply).content)).toBe(
      words(again.replies[0]?.content),
    );
    expect(sent(usedAgain.interaction.editReply).content).toMatch(
      /^There is already a raid at Old Stone Fountain: <#\d+>\. You have been signed up for it\.\n1 of 2: This does not look like the screen of a raid, so I made nothing of it\.$/,
    );
  });

  it('reports for the member who used it: their raid, their question, their record; the author is left alone', async () => {
    const twin = testGym(13, 'Old Stone Fountain', 40.061, -80.061, { nickname: 'Bank fountain' });
    const { use, image, store, router, screenshots } = await setup({ gyms: [twin] });
    const { interaction, did } = await use([image('a.png', egg())]);
    expect(store.active()).toEqual([]);
    // The question is asked privately, in the place of the "thinking…" line.
    const question = sent(interaction.editReply);
    expect(question.content).toMatch(/Which gym is it\? I read "Old Stone Fountain"\.$/);
    expect(question).toMatchObject({ allowedMentions: NO_PINGS });
    const menu = menuOf(question);
    expect(menu.options.map((option) => option.value).sort()).toEqual(['13', '2']);
    // The author cannot answer it, as no stranger can.
    const author = fakeSelect({ customId: menu.custom_id, values: ['13'], userId: AUTHOR });
    await router.handle(author as never);
    expect(sent(author.reply).content).toBe('That is somebody else’s screenshot.');
    expect(store.active()).toEqual([]);
    const pick = fakeSelect({ customId: menu.custom_id, values: ['13'], userId: OTHER });
    await router.handle(pick as never);
    expect(sent(pick.editReply).content).toMatch(/^Reported the raid at Bank fountain/);
    const [party] = store.active();
    expect(party).toMatchObject({ gymId: 13, createdById: OTHER });
    expect(Object.keys(party?.attendees ?? {})).toEqual([OTHER]);
    expect(Object.values(party?.attendees ?? {})).toMatchObject([{ name: 'Sol', team: 'mystic' }]);
    const shotId = asRaid(party).raid.screenshot?.id ?? '';
    expect(await screenshots.get(shotId)).toMatchObject({
      record: { senderId: OTHER, use: 'mention', pickedGymId: 13 },
    });
    // Nothing is said in the channel, and the author's message stays, marked.
    expect(did).toEqual([`react ${READING}`, `unreact ${READING}`, `react ${DONE}`]);
  });

  it('answers in the place of the “thinking…” line first, then in private follow-ups, which go at their time', async () => {
    const twin = testGym(13, 'Old Stone Fountain', 40.061, -80.061);
    const { use, image } = await setup({ gyms: [twin] });
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'], now: PARTY_NOW });
    const { interaction } = await use([image('a.png', egg()), image('b.png', cat())]);
    // The question of the first picture, then the one reply for the message.
    expect(sent(interaction.editReply).content).toMatch(/Which gym is it\?/);
    expect(interaction.editReply).toHaveBeenCalledTimes(1);
    expect(sent(interaction.followUp)).toEqual({
      content: '1 of 2: This does not look like the screen of a raid, so I made nothing of it.',
      allowedMentions: NO_PINGS,
      flags: MessageFlags.Ephemeral,
    });
    expect(interaction.deleteReply).not.toHaveBeenCalled();
    // The reply goes after the setup's 20 ms, the unanswered question after its minute.
    vi.advanceTimersByTime(20);
    expect(interaction.deleteReply.mock.calls).toEqual([[followUpId(0)]]);
    vi.advanceTimersByTime(60_000);
    expect(interaction.deleteReply.mock.calls).toEqual([[followUpId(0)], []]);
  });

  it('counts in the window of the member’s mentions: the 21st screenshot of either is refused', async () => {
    const { use, image, trigger, reader } = await setup();
    const cats = (prefix: string) =>
      Array.from({ length: 10 }, (_, i) => image(`${prefix}${String(i)}.png`, cat()));
    await trigger.handle(posted(cats('a'), { authorId: OTHER }).message);
    await use(cats('b'));
    expect(reader.reads).toBe(20);
    const { interaction, did } = await use([image('c.png', cat())]);
    expect(reader.reads).toBe(20);
    expect(sent(interaction.editReply).content).toBe(
      'You have had many screenshots read just now, so I did not read them. Try again in 15 minutes.',
    );
    expect(did).toEqual([]);
    await trigger.close();
  });

  it('says to use it again on a question of its own that expired (review F6)', async () => {
    const { router } = await setup();
    // Its questions are private; a mention's are replies in the channel.
    const own = fakeSelect({
      customId: 'shot:AAAAAAAAAAAA:gym',
      values: ['2'],
      userId: OTHER,
      ephemeralMessage: true,
    });
    await router.handle(own as never);
    expect(sent(own.update)).toEqual({
      content: 'That question has expired. Use Read screenshot on the message again.',
      components: [],
    });
    const mentions = fakeSelect({
      customId: 'shot:AAAAAAAAAAAA:gym',
      values: ['2'],
      userId: OTHER,
    });
    await router.handle(mentions as never);
    expect(sent(mentions.update).content).toBe(
      'That question has expired. Post the screenshot again.',
    );
  });

  it('dates the screenshots of an older message by the message, and reports what is still on', async () => {
    const { use, image, store } = await setup();
    // Posted at 13:30 with ten minutes to go: hatched at 13:39. The other, an hour older by its
    // clock, hatched at 12:39 and has ended.
    const { interaction } = await use(
      [
        image('a.png', eggReading('Old Stone Fountain', 5, { hour: 13, minute: 29 }, 10 * 60)),
        image('b.png', eggReading('Maple Leaf Mosaic', 1, { hour: 12, minute: 29 }, 10 * 60)),
      ],
      { target: { createdTimestamp: at('2026-10-13T13:30') } },
    );
    expect(store.active()).toHaveLength(1);
    expect(store.active()[0]).toMatchObject({
      gymId: 2,
      hatchTime: at('2026-10-13T13:39'),
      endTime: at('2026-10-13T14:24'),
      raid: { reportedHatched: true },
    });
    expect(sent(interaction.editReply).content).toMatch(
      /^Reported the raid at Old Stone Fountain: <#\d+>\.\n1 of 2: By its countdown this raid has already ended\.$/,
    );
  });

  it('refuses a screenshot without a time read from a message posted a while ago (review F4)', async () => {
    const { use, image, store } = await setup();
    // An egg whose countdown was misread as longer than an egg incubates, which is left out:
    // reported at once it is an egg without a time; half an hour after it was posted that
    // time would be counted from now.
    const untimed = () => eggReading('Old Stone Fountain', 5, { hour: 13, minute: 29 }, 3 * 3600);
    const { interaction } = await use([image('a.png', untimed())], {
      target: { createdTimestamp: at('2026-10-13T13:30') },
    });
    expect(store.active()).toEqual([]);
    expect(sent(interaction.editReply).content).toBe(
      'I cannot tell from this screenshot when the raid hatches or ends, and it was posted a ' +
        'while ago: report it with `/raid` instead.',
    );
    // Posted just now, it is reported as a mention reports it.
    await use([image('b.png', untimed())], { target: { createdTimestamp: PARTY_NOW - MINUTE } });
    expect(store.active()).toHaveLength(1);
  });

  describe('a forward, whose picture is in its snapshot (review F3)', () => {
    it('reads the forwarded screenshot, as of the forwarded message', async () => {
      const { use, image, store } = await setup();
      const { interaction } = await use([], {
        target: { forwards: { files: [image('a.png', egg())] } },
      });
      expect(store.active()[0]).toMatchObject({ gymId: 2, createdById: OTHER });
      expect(sent(interaction.editReply).content).toMatch(
        /^Reported the raid at Old Stone Fountain: <#\d+>\.$/,
      );
    });

    it('dates it by the message forwarded, not by the forward: a day-old egg is over', async () => {
      const { use, image, store } = await setup();
      const { interaction } = await use([], {
        target: {
          forwards: { files: [image('a.png', egg())], createdTimestamp: PARTY_NOW - DAY },
        },
      });
      expect(store.active()).toEqual([]);
      expect(sent(interaction.editReply).content).toBe(
        'By its countdown this raid has already ended.',
      );
    });

    it('says there is no picture in a forward of a message without one', async () => {
      const { use, reader } = await setup();
      const { interaction } = await use([], { target: { forwards: { content: 'Raid at noon?' } } });
      expect(sent(interaction.followUp).content).toBe('That message has no picture I can read.');
      expect(reader.reads).toBe(0);
    });
  });

  it('reads a picture a webhook or another bot posted, for the member who used it', async () => {
    const { use, image, store } = await setup();
    await use([image('a.png', egg())], {
      target: { authorId: '700000000000000050', authorBot: true, webhook: true },
    });
    expect(store.active()[0]).toMatchObject({ gymId: 2, createdById: OTHER });
  });

  it('gives a screenshot up as busy whose turn comes too late for the answer', async () => {
    const { use, image, reader, store } = await setup();
    // Thirteen minutes after the interaction is the latest its turn may come.
    reader.lateAfter = PARTY_NOW + 13 * MINUTE + 1;
    const late = await use([image('a.png', egg())]);
    expect(sent(late.interaction.editReply).content).toBe(
      'Too many screenshots are waiting to be read just now. Try again shortly.',
    );
    expect(store.active()).toEqual([]);
    reader.lateAfter = PARTY_NOW + 13 * MINUTE;
    await use([image('b.png', egg())]);
    expect(store.active()).toHaveLength(1);
  });

  describe('what it refuses, privately, without reading or touching the message', () => {
    /** The refusal a use was answered with: a private follow-up in the place of “thinking…”. */
    const refusal = (interaction: FakeInteraction) => {
      expect(interaction.editReply).not.toHaveBeenCalled();
      const { content, flags } = sent(interaction.followUp);
      expect(flags).toBe(MessageFlags.Ephemeral);
      return content;
    };

    it('a message with no picture', async () => {
      const { use, reader } = await setup();
      const file = {
        url: 'https://cdn.discordapp.com/x/notes.txt',
        name: 'notes.txt',
        contentType: 'text/plain',
        size: 3,
      };
      for (const files of [[], [file]]) {
        const { interaction, did } = await use(files);
        expect(refusal(interaction)).toBe('That message has no picture I can read.');
        expect(did).toEqual([]);
      }
      expect(reader.reads).toBe(0);
    });

    it('the bot’s own messages', async () => {
      const { use, image, reader } = await setup();
      const { interaction, did } = await use([image('a.png', egg())], {
        target: { authorId: FAKE_BOT_ID },
      });
      expect(refusal(interaction)).toBe(
        'That is a message of my own: there is no screenshot for me to read in it.',
      );
      expect(did).toEqual([]);
      expect(reader.reads).toBe(0);
    });

    it('a message where a mention is not read: in a post or thread, in a channel of no region', async () => {
      const { use, image, reader, store } = await setup();
      const post = '850000000000000001';
      const inPost = await use([image('a.png', egg())], {
        by: { channelId: post, thread: { parentId: WEST_FORUM } },
        target: { channelId: post },
      });
      const elsewhere = await use([image('b.png', egg())], {
        by: { channelId: '100000000000000099' },
      });
      for (const { interaction, did } of [inPost, elsewhere]) {
        expect(refusal(interaction)).toBe(
          'I read screenshots only from messages in a region channel.',
        );
        expect(did).toEqual([]);
      }
      expect(reader.reads).toBe(0);
      expect(store.active()).toEqual([]);
    });

    it('a message it is reading already', async () => {
      const { use, image, reader, store } = await setup();
      const files = [image('a.png', egg())];
      const first = use(files);
      await reader.readsBegun.reached(1);
      const second = await use(files, { by: { userId: AUTHOR } });
      expect(refusal(second.interaction)).toBe('I am reading that message already.');
      await first;
      expect(reader.reads).toBe(1);
      expect(store.active()).toHaveLength(1);
    });
  });

  it('says so when its answer could not be sent', async () => {
    const { use, image, store, entries } = await setup();
    const { interaction } = await use([image('a.png', egg())], {
      before: (fake) => fake.editReply.mockRejectedValue(new Error('Unknown Webhook')),
    });
    // The raid stands; the member is told where to look.
    expect(store.active()).toHaveLength(1);
    expect(sent(interaction.followUp)).toEqual({
      content:
        'I could not tell you here what came of it. If a raid or max battle was reported, its ' +
        'line is in the channel.',
      flags: MessageFlags.Ephemeral,
    });
    expect(entries.map((entry) => entry.msg)).toContain(
      'could not answer a message with screenshots',
    );
  });

  it('is explained by `/help` under its name, with the way to the Apps menu', async () => {
    const { ctx } = createTestContext({
      commands: [help],
      messageCommands: [readScreenshotMessage],
    });
    const asked = fakeChatInput({ commandName: 'help', options: { command: 'read screenshot' } });
    await help.execute(asked as unknown as ChatInputCommandInteraction, ctx);
    const [about, usage] = textDisplays(asV2(sent(asked.reply)));
    expect(about).toMatch(
      /^### Read screenshot\nReport the raid or max battle on a screenshot somebody posted/,
    );
    expect(usage).toBe(
      '**Usage**\nIn the Apps menu of a message: a right-click on a computer, a long press on a ' +
        'phone, then **Apps** › **Read screenshot**.',
    );
  });
});
