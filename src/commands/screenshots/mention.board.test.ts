import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FAKE_GUILD_ID } from '../../../test/support/fake-interactions.js';
import {
  EAST_CHANNEL,
  OTHER_GUILD_ID,
  testGym,
  WEST_CHANNEL,
  WEST_FORUM,
} from '../../../test/support/gyms.js';
import { maxReportingWith, MAX_THURSDAY } from '../../../test/support/max-reporting.js';
import { PARTY_NOW, TEST_SPOT } from '../../../test/support/parties.js';
import { partyServiceWith } from '../../../test/support/party-service.js';
import { AUTHOR, OTHER, posted } from '../../../test/support/posted-message.js';
import { gymsFixture } from '../../../test/support/providers.js';
import { kyuremBossesFixture } from '../../../test/support/raid-bosses.js';
import { screenshotsWith } from '../../../test/support/screenshot-service.js';
import {
  eggReading,
  kyuremReading,
  maxReading,
  readingOf,
  splitOutcome,
} from '../../../test/support/screenshots.js';
import { Tally } from '../../../test/support/tally.js';
import { TWO_SCREENS } from '../../render/screenshot-reading.js';
import { createTestContext } from '../../../test/support/test-context.js';
import { keptRow } from '../../../test/support/wayspot-cases.js';
import type { RecordingDms } from '../../../test/support/dms.js';
import type { AppContext } from '../../app-context.js';
import type { Gym } from '../../db/repositories/gym-repository.js';
import type { Region } from '../../db/repositories/region-repository.js';
import type { BoardMessage } from '../../discord/party-gateway.js';
import { isRaid } from '../../domain/party/party.js';
import type { TakeOutcome } from '../../services/board-keeper.js';
import { MAX_SCREENSHOT_BYTES } from '../../services/ocr-service.js';
import { boardDmText, MAX_BOARD_MESSAGE_BYTES, ScreenshotTrigger } from './mention.js';

/*
 * Screenshots posted in the region's board (plan 8R-9F, design item 4 with B1, B2, B11 and R1):
 * every picture downloaded, the message taken out of the board, then read as a message of the
 * region's channel, and answered by DM only: nothing in the board.
 */

/** The board post (a thread) of the west region in these tests. */
const BOARD = '850000000000000001';
const CLOCK = { hour: 13, minute: 59 };
const egg = () => eggReading('Old Stone Fountain', 5, CLOCK, 20 * 60);

/** What the board's keeper was asked to take, with what was downloaded and read by then. */
interface Taken {
  region: number;
  message: BoardMessage;
  tell: boolean;
  downloads: number;
  reads: number;
}

/** The board of the west region, handed to the trigger, which records what it takes. */
function boardOf(
  west: Region,
  shots: Pick<ReturnType<typeof screenshotsWith>, 'attachments' | 'reader'>,
): {
  taken: Taken[];
  /** What the keeper answers (review F1): deleted unless a test says kept or failed. */
  outcome: { is: TakeOutcome };
  board: ConstructorParameters<typeof ScreenshotTrigger>[0]['board'];
} {
  const taken: Taken[] = [];
  const outcome: { is: TakeOutcome } = { is: 'deleted' };
  return {
    taken,
    outcome,
    board: {
      regionOfBoard: (channelId) => (channelId === BOARD ? west : undefined),
      take: (region, message, tell) => {
        taken.push({
          region: region.id,
          message,
          tell,
          downloads: shots.attachments.asked.length,
          reads: shots.reader.reads,
        });
        return Promise.resolve(outcome.is);
      },
    },
  };
}

async function setup(
  options: { gyms?: Gym[]; passive?: boolean; raidBosses?: AppContext['raidBosses'] } = {},
) {
  const gyms = gymsFixture(options.gyms ?? []);
  const bosses = options.raidBosses ? { raidBosses: options.raidBosses } : {};
  const made = await partyServiceWith([], { gyms });
  const shots = screenshotsWith(createTestContext({ gyms, ...bosses }).ctx);
  const { ctx: base } = createTestContext({
    gyms,
    ...bosses,
    partyService: made.service,
    parties: made.store,
    regions: made.regions,
    screenshots: shots.screenshots,
  });
  const passive = options.passive ?? false;
  const ctx: AppContext = {
    ...base,
    config: {
      ...base.config,
      settings: {
        ...base.config.settings,
        ocr: { ...base.config.settings.ocr, passive, enabled: true },
      },
    },
    features: { ocrPassive: passive, autoAssignRole: false },
  };
  const west = made.regions.byChannel(WEST_CHANNEL)!;
  const { taken, board, outcome } = boardOf(west, shots);
  const trigger = new ScreenshotTrigger({ ctx, board });
  const dms = ctx.dms as RecordingDms;
  const said = () => dms.to(AUTHOR).map((message) => message.content);
  return { ...shots, ...made, ctx, trigger, taken, outcome, dms, said };
}

describe('screenshots posted in the region’s board (plan 8R-9F)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'], now: PARTY_NOW });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('downloads every picture, takes the message out of the board, then reads them, and answers by DM (B2, R1)', async () => {
    const made = await setup();
    const cat = readingOf({ gym: 'Old Stone Fountain' });
    const { message, did, replies } = posted(
      [made.screenshot('a.png', egg()), made.screenshot('b.png', cat)],
      { channelId: BOARD, inThread: true },
    );
    await expect(made.trigger.handle(message)).resolves.toBe(true);
    // Downloaded both, read none, when it was taken; as a member's, untold by the keeper.
    expect(made.taken).toEqual([
      {
        region: 1,
        message: {
          id: message.id,
          authorId: AUTHOR,
          by: 'member',
          system: false,
          createdAt: message.createdAt,
        },
        tell: false,
        downloads: 2,
        reads: 0,
      },
    ]);
    // Read as a message of the region's channel: the raid is West's, its reporter the author.
    expect(made.store.active()[0]).toMatchObject({ gymId: 2, regionId: 1, createdById: AUTHOR });
    // Nothing in the board: no reaction, no reply, no delete of its own (B11).
    expect(did).toEqual([]);
    expect(replies).toEqual([]);
    expect(made.said()).toEqual([
      `From your screenshots in <#${BOARD}> (the board keeps only my lists, so I took your ` +
        'message out of it):\n' +
        `- 1: Reported the raid at Old Stone Fountain: <#${made.store.active()[0]?.forumPostId ?? ''}>.\n` +
        '- 2: This does not look like the screen of a raid, so I made nothing of it.',
    ]);
  });

  it('says the message was left where a moderator wrote it, and nothing of the board where the delete failed (review F1)', async () => {
    const made = await setup();
    made.outcome.is = 'kept';
    await made.trigger.handle(
      posted([made.screenshot('a.png', egg())], { channelId: BOARD, inThread: true }).message,
    );
    expect(made.said()[0]).toMatch(
      new RegExp(
        `^From your screenshot in <#${BOARD}> \\(I left your message in the board\\):\\n- `,
      ),
    );
    made.outcome.is = 'failed';
    await made.trigger.handle(
      posted([made.screenshot('b.png', egg())], { channelId: BOARD, inThread: true }).message,
    );
    expect(made.said()[1]).toMatch(new RegExp(`^From your screenshot in <#${BOARD}>:\\n- `));
  });

  it('downloads every picture at once before the message goes (review F3)', async () => {
    const made = await setup();
    let onTheirWay = 0;
    let most = 0;
    const download = made.attachments.download.bind(made.attachments);
    made.attachments.download = async (url, limits) => {
      onTheirWay++;
      most = Math.max(most, onTheirWay);
      try {
        return await download(url, limits);
      } finally {
        onTheirWay--;
      }
    };
    const pictures = Array.from({ length: 4 }, (_, n) =>
      made.screenshot(`${String(n)}.png`, readingOf({ gym: 'Old Stone Fountain' })),
    );
    await made.trigger.handle(posted(pictures, { channelId: BOARD, inThread: true }).message);
    expect(most).toBe(4);
    expect(made.taken[0]?.downloads).toBe(4);
  });

  it('points to /raid screenshot: where it is not sure of the gym, and asks nothing in the board', async () => {
    const twin = testGym(13, 'Old Stone Fountain', 40.061, -80.061);
    const made = await setup({ gyms: [twin] });
    const { message, replies } = posted([made.screenshot('a.png', egg())], {
      channelId: BOARD,
      inThread: true,
    });
    await made.trigger.handle(message);
    expect(made.store.active()).toEqual([]);
    expect(replies).toEqual([]);
    expect(made.said()[0]).toContain(
      'I could not tell which gym this is: report it with `/raid screenshot:`, which asks you ' +
        'privately.',
    );
    // A clear gym of another region: pointed there too, nothing reported.
    const lighthouse = posted(
      [made.screenshot('b.png', eggReading('Harbor Lighthouse Mural', 5, CLOCK, 20 * 60))],
      { channelId: BOARD, inThread: true },
    );
    await made.trigger.handle(lighthouse.message);
    expect(made.store.active()).toEqual([]);
    expect(made.said()[1]).toContain(
      `Harbor Lighthouse Mural is in <#${EAST_CHANNEL}>: report it with \`/raid screenshot:\`, ` +
        'which asks you whether to report it there.',
    );
  });

  it('asks nothing in the board of a raid whose CP fits several bosses (2026-11-15)', async () => {
    const made = await setup({ raidBosses: kyuremBossesFixture() });
    const { message, replies } = posted(
      [made.screenshot('a.png', kyuremReading('Old Stone Fountain', CLOCK))],
      { channelId: BOARD, inThread: true },
    );
    await expect(made.trigger.handle(message)).resolves.toBe(true);
    const [party] = made.store.active();
    expect(party && isRaid(party) ? party.raid.boss : 'no raid').toBeNull();
    expect(replies).toEqual([]);
    expect(made.said()).toHaveLength(1);
    expect(made.said()[0]).not.toContain('Which boss');
  });

  it('says it could not tell the tier where the gym is clear, by the doubts as in the channel (review W4)', async () => {
    const made = await setup();
    const untiered = readingOf(
      { gym: 'Old Stone Fountain', clock: CLOCK, countdown: 20 * 60, countdownPlace: 'centre' },
      { heads: 2 },
    );
    const { message, replies } = posted([made.screenshot('a.png', untiered)], {
      channelId: BOARD,
      inThread: true,
    });
    await made.trigger.handle(message);
    expect(made.store.active()).toEqual([]);
    expect(replies).toEqual([]);
    expect(made.said()[0]).toContain(
      'I could not tell the tier of this raid: report it with `/raid screenshot:` and choose ' +
        'the boss or the egg in `boss:`.',
    );
    expect(made.said()[0]).not.toContain('which gym');
    // Read passively, the same.
    const passive = await setup({ passive: true });
    await passive.trigger.handle(
      posted([passive.screenshot('a.png', untiered)], {
        channelId: BOARD,
        inThread: true,
        mentionsBot: false,
      }).message,
    );
    expect(passive.said()[0]).toContain('I could not tell the tier of this raid');
  });

  it('joins a raid that exists and names a picture it could not download (B2)', async () => {
    const made = await setup();
    await made.trigger.handle(
      posted([made.screenshot('a.png', egg())], {
        channelId: BOARD,
        inThread: true,
        authorId: OTHER,
      }).message,
    );
    await made.service.flush();
    const lost = made.screenshot('lost.png', egg());
    made.attachments.files.delete(lost.url);
    const { message } = posted([made.screenshot('b.png', egg()), lost], {
      channelId: BOARD,
      inThread: true,
    });
    await made.trigger.handle(message);
    expect(made.store.active()).toHaveLength(1);
    expect(made.store.active()[0]?.attendees[AUTHOR]).toBeDefined();
    const [dm] = made.said();
    expect(dm).toMatch(/- 1: There is already a raid at Old Stone Fountain: <#\d+>\./);
    expect(dm).toContain(
      '- 2: I could not download that screenshot from Discord. Try again in a moment.',
    );
  });

  it('reads a board’s picture passively where passive reading is on, and leaves the rest to the keeper', async () => {
    const off = await setup();
    const quiet = posted([off.screenshot('a.png', egg())], {
      channelId: BOARD,
      inThread: true,
      mentionsBot: false,
    });
    // Not taken: the keeper deletes it as any member's message.
    await expect(off.trigger.handle(quiet.message)).resolves.toBe(false);
    expect(off.taken).toEqual([]);
    const on = await setup({ passive: true });
    const read = posted([on.screenshot('a.png', egg())], {
      channelId: BOARD,
      inThread: true,
      mentionsBot: false,
    });
    await expect(on.trigger.handle(read.message)).resolves.toBe(true);
    expect(on.store.active()).toHaveLength(1);
    // No picture at all, or another post than a board: not the trigger's.
    const text = posted([], { channelId: BOARD, inThread: true });
    await expect(on.trigger.handle(text.message)).resolves.toBe(false);
    const elsewhere = posted([on.screenshot('c.png', egg())], {
      channelId: '850000000000000009',
      inThread: true,
    });
    await expect(on.trigger.handle(elsewhere.message)).resolves.toBe(false);
  });
});

describe('what a board message’s pictures may cost (plan 8Z-2)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'], now: PARTY_NOW });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const BUSY = 'Too many screenshots are waiting to be read just now. Try again shortly.';
  const inBoard = (pictures: Parameters<typeof posted>[0]) =>
    posted(pictures, { channelId: BOARD, inThread: true }).message;
  const cat = () => readingOf({ gym: 'Old Stone Fountain' });

  it('downloads nothing while the reader is full, and says so of every picture', async () => {
    const made = await setup();
    made.reader.isFull = true;
    const pictures = [made.screenshot('a.png', egg()), made.screenshot('b.png', egg())];
    await expect(made.trigger.handle(inBoard(pictures))).resolves.toBe(true);
    expect(made.attachments.asked).toEqual([]);
    expect(made.reader.reads).toBe(0);
    // The message leaves the board all the same: the board keeps only the lists.
    expect(made.taken).toHaveLength(1);
    expect(made.said()).toEqual([
      `From your screenshots in <#${BOARD}> (the board keeps only my lists, so I took your ` +
        `message out of it):\n- 1: ${BUSY}\n- 2: ${BUSY}`,
    ]);
    // One use of the twenty is taken, as a mention's first picture takes one: nineteen are left.
    made.reader.isFull = false;
    const cats = (prefix: string) =>
      Array.from({ length: 10 }, (_, n) => made.screenshot(`${prefix}${String(n)}.png`, cat()));
    await made.trigger.handle(inBoard(cats('c')));
    await made.trigger.handle(inBoard(cats('d')));
    expect(made.reader.reads).toBe(19);
    expect(made.said().at(-1)).toMatch(
      /\n- 10: You have sent many screenshots just now, so I did not read this one\. Try again in 15 minutes\.$/,
    );
  });

  it('downloads ten pictures that are as large together as a message’s may be', async () => {
    const made = await setup();
    const each = MAX_BOARD_MESSAGE_BYTES / 10;
    const pictures = Array.from({ length: 10 }, (_, n) => ({
      ...made.screenshot(`${String(n)}.png`, cat()),
      size: each,
    }));
    await made.trigger.handle(inBoard(pictures));
    expect(made.attachments.asked).toHaveLength(10);
    expect(made.reader.reads).toBe(10);
    expect(made.said()[0]).not.toContain('together');
  });

  it('leaves out the pictures that would take a message over it, by the sizes Discord gives, and takes no use for them', async () => {
    const made = await setup();
    const each = MAX_BOARD_MESSAGE_BYTES / 10;
    // The fourth is a byte too large for the ten to fit: the tenth no longer does.
    const pictures = Array.from({ length: 10 }, (_, n) => ({
      ...made.screenshot(`${String(n)}.png`, cat()),
      size: n === 3 ? each + 1 : each,
    }));
    await made.trigger.handle(inBoard(pictures));
    expect(made.attachments.asked.map((one) => one.url)).toEqual(
      pictures.slice(0, 9).map((picture) => picture.url),
    );
    expect(made.reader.reads).toBe(9);
    const lines = (made.said()[0] ?? '').split('\n');
    expect(lines).toHaveLength(11);
    expect(lines[10]).toBe(
      '- 10: The screenshots of one message may be 100 MB together, so I did not read this ' +
        'one. Post it again by itself.',
    );
    // Nine uses were taken: eleven more pictures are read, the twelfth is not.
    const more = (prefix: string, count: number) =>
      Array.from({ length: count }, (_, n) => made.screenshot(`${prefix}${String(n)}.png`, cat()));
    await made.trigger.handle(inBoard(more('c', 10)));
    await made.trigger.handle(inBoard(more('d', 2)));
    expect(made.reader.reads).toBe(20);
    expect(made.said().at(-1)).toMatch(/\n- 2: You have sent many screenshots just now/);
  });

  it('counts no picture that is too large by itself: it is not downloaded', async () => {
    const made = await setup();
    const pictures = [
      { ...made.screenshot('huge.png', cat()), size: MAX_SCREENSHOT_BYTES + 1 },
      ...fullMessage(made, 'a', cat),
    ];
    await made.trigger.handle(inBoard(pictures));
    expect(made.attachments.asked.map((one) => one.url)).toEqual(
      pictures.slice(1).map((picture) => picture.url),
    );
    expect(made.said()[0]).toContain('- 1: That file is too large to be a screenshot.');
    expect(made.said()[0]).not.toContain('together');
  });

  /**
   * The downloads of the messages started from now on held until `release()` (those of
   * `free`, a message's pictures, go on); `begun` counts those held, so that a test knows the
   * messages it started hold their bytes.
   */
  function holdDownloads(made: Awaited<ReturnType<typeof setup>>, free: string[] = []) {
    const begun = new Tally('the downloads held');
    let release = (): void => undefined;
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });
    const download = made.attachments.download.bind(made.attachments);
    made.attachments.download = async (url, limits) => {
      if (!free.includes(url)) {
        begun.add();
        await released;
      }
      return download(url, limits);
    };
    return { begun, release: () => release() };
  }

  /** Messages of four members, each as large as a message's pictures may be together. */
  const MEMBERS = [
    '700000000000000011',
    '700000000000000012',
    '700000000000000013',
    '700000000000000014',
  ];
  const byMember = (
    made: Awaited<ReturnType<typeof setup>>,
    prefix: string,
    authorId: string,
    reading: () => ReturnType<typeof cat> = cat,
    guildId = FAKE_GUILD_ID,
  ) =>
    posted(fullMessage(made, prefix, reading), {
      channelId: BOARD,
      inThread: true,
      authorId,
      guildId,
    }).message;
  /** A member's message in a server of pictures of these sizes, as Discord gives them. */
  const ofSizes = (
    made: Awaited<ReturnType<typeof setup>>,
    prefix: string,
    sizes: readonly number[],
    authorId: string,
    guildId = FAKE_GUILD_ID,
  ) =>
    posted(
      sizes.map((size, n) => ({ ...made.screenshot(`${prefix}${String(n)}.png`, cat()), size })),
      { channelId: BOARD, inThread: true, authorId, guildId },
    ).message;
  /** Two of the largest screenshots: less than what a server may hold beside another's message. */
  const TWO_SHOTS = [MAX_SCREENSHOT_BYTES, MAX_SCREENSHOT_BYTES];
  const THIRD_GUILD_ID = '412345678901234577';
  const FOURTH_GUILD_ID = '412345678901234588';
  /** A trigger over the test's that knows two more servers (the `Guild` rows 3 and 4). */
  const withFourServers = (made: Awaited<ReturnType<typeof setup>>) => {
    const idFor = made.ctx.guilds.idFor.bind(made.ctx.guilds);
    const rows = new Map([
      [THIRD_GUILD_ID, 3],
      [FOURTH_GUILD_ID, 4],
    ]);
    const ctx: AppContext = {
      ...made.ctx,
      guilds: {
        ...made.ctx.guilds,
        idFor: (snowflake: string) => {
          const row = rows.get(snowflake);
          return row === undefined ? idFor(snowflake) : Promise.resolve(row);
        },
      },
    };
    return new ScreenshotTrigger({
      ctx,
      board: boardOf(made.regions.byChannel(WEST_CHANNEL)!, made).board,
    });
  };
  const dmsTo = (made: Awaited<ReturnType<typeof setup>>, member: string) =>
    made.dms.to(member).map((message) => message.content);

  it('holds the bytes of the board’s messages up to their total: one that would pass it gets the busy words and downloads nothing', async () => {
    const made = await setup();
    const trigger = withFourServers(made);
    const [one, two, three, four] = MEMBERS as [string, string, string, string];
    // The fourth's downloads are not held: were it downloaded, the test would see it.
    const fourth = ofSizes(made, 'd', [MAX_SCREENSHOT_BYTES], four, FOURTH_GUILD_ID);
    const held = holdDownloads(
      made,
      fourth.attachments.map((picture) => picture.url),
    );
    // A full message, two shots beside it, one more beside those: 196 MB of 200.
    const first = trigger.handle(byMember(made, 'a', one));
    await held.begun.reached(4);
    const second = trigger.handle(ofSizes(made, 'b', TWO_SHOTS, two, OTHER_GUILD_ID));
    await held.begun.reached(6);
    const third = trigger.handle(ofSizes(made, 'c', [MAX_SCREENSHOT_BYTES], three, THIRD_GUILD_ID));
    await held.begun.reached(7);
    await expect(trigger.handle(fourth)).resolves.toBe(true);
    // Nothing of the fourth was downloaded (the first three's are still held).
    expect(made.attachments.asked).toEqual([]);
    expect(dmsTo(made, four)).toEqual([expect.stringContaining(BUSY)]);
    held.release();
    await Promise.all([first, second, third]);
    expect(made.attachments.asked).toHaveLength(7);
    expect(made.reader.reads).toBe(7);
    // Given back once read: the next message is downloaded again.
    await trigger.handle(ofSizes(made, 'e', [MAX_SCREENSHOT_BYTES], four, FOURTH_GUILD_ID));
    expect(made.attachments.asked).toHaveLength(8);
  });

  it('holds one full message of a server at a time: its second gets the busy words, another server’s is downloaded (plan 19B-5)', async () => {
    const made = await setup();
    const [one, two, three] = MEMBERS as [string, string, string];
    // The second's downloads are not held: were it downloaded, the test would see it.
    const second = byMember(made, 'b', two);
    const held = holdDownloads(
      made,
      second.attachments.map((picture) => picture.url),
    );
    const first = made.trigger.handle(byMember(made, 'a', one));
    await held.begun.reached(4);
    await expect(made.trigger.handle(second)).resolves.toBe(true);
    expect(made.attachments.asked).toEqual([]);
    expect(dmsTo(made, two)).toEqual([
      `From your screenshots in <#${BOARD}> (the board keeps only my lists, so I took your ` +
        `message out of it):\n- 1: ${BUSY}\n- 2: ${BUSY}\n- 3: ${BUSY}\n- 4: ${BUSY}`,
    ]);
    // The other server's message still has room beside the first.
    const away = made.trigger.handle(ofSizes(made, 'c', TWO_SHOTS, three, OTHER_GUILD_ID));
    await held.begun.reached(6);
    held.release();
    await Promise.all([first, away]);
    expect(made.attachments.asked).toHaveLength(6);
  });

  it('leaves room beside two servers for a third: the second may hold less than a full message (final review R1-6)', async () => {
    const made = await setup();
    const trigger = withFourServers(made);
    const [one, two, three] = MEMBERS as [string, string, string];
    // The second server's full message is refused; the third's one picture is not held.
    const second = byMember(made, 'b', two, cat, OTHER_GUILD_ID);
    const third = ofSizes(made, 'c', [MAX_SCREENSHOT_BYTES], three, THIRD_GUILD_ID);
    const held = holdDownloads(made, [
      ...second.attachments.map((picture) => picture.url),
      ...third.attachments.map((picture) => picture.url),
    ]);
    const first = trigger.handle(byMember(made, 'a', one));
    await held.begun.reached(4);
    await expect(trigger.handle(second)).resolves.toBe(true);
    expect(made.attachments.asked).toEqual([]);
    expect(dmsTo(made, two)).toEqual([
      `From your screenshots in <#${BOARD}> (the board keeps only my lists, so I took your ` +
        `message out of it):\n- 1: ${BUSY}\n- 2: ${BUSY}\n- 3: ${BUSY}\n- 4: ${BUSY}`,
    ]);
    await trigger.handle(third);
    expect(made.attachments.asked.map((one) => one.url)).toEqual(
      third.attachments.map((picture) => picture.url),
    );
    held.release();
    await first;
  });

  it('gives the bytes back after downloads that failed and after a reader that threw', async () => {
    const made = await setup();
    const [one, two, three] = MEMBERS as [string, string, string];
    /**
     * A full message and two shots beside it, of two servers, are downloaded at once: nothing
     * else holds any bytes.
     */
    const twoAtOnce = async (prefix: string) => {
      const held = holdDownloads(made);
      const full = made.trigger.handle(byMember(made, `${prefix}a`, two));
      await held.begun.reached(4);
      const beside = made.trigger.handle(
        ofSizes(made, `${prefix}b`, TWO_SHOTS, three, OTHER_GUILD_ID),
      );
      await held.begun.reached(6);
      held.release();
      await Promise.all([full, beside]);
    };
    made.attachments.failing = true;
    await made.trigger.handle(byMember(made, 'a', one));
    expect(dmsTo(made, one)[0]).toContain('I could not download that screenshot from Discord.');
    made.attachments.failing = false;
    await twoAtOnce('b');
    const read = vi.spyOn(made.reader, 'read').mockRejectedValueOnce(new Error('the reader broke'));
    await expect(made.trigger.handle(byMember(made, 'c', one))).resolves.toBe(false);
    read.mockRestore();
    await twoAtOnce('d');
  });
});

/**
 * The pictures of a message as large together as a message's may be (`MAX_BOARD_MESSAGE_BYTES`),
 * by the sizes Discord gives: three of the most a screenshot may have, and the rest.
 */
function fullMessage(
  made: Awaited<ReturnType<typeof setup>>,
  prefix: string,
  reading: () => ReturnType<typeof readingOf>,
) {
  const sizes = [
    MAX_SCREENSHOT_BYTES,
    MAX_SCREENSHOT_BYTES,
    MAX_SCREENSHOT_BYTES,
    MAX_BOARD_MESSAGE_BYTES - 3 * MAX_SCREENSHOT_BYTES,
  ];
  return sizes.map((size, n) => ({
    ...made.screenshot(`${prefix}${String(n)}.png`, reading()),
    size,
  }));
}

describe('boardDmText (review F6)', () => {
  it('keeps whole lines within a DM and counts those that do not fit', () => {
    const lines = Array.from(
      { length: 10 },
      (_, n) => `- ${String(n + 1)}: ${'x'.repeat(300)} <#${String(800000000000000000 + n)}>`,
    );
    const text = boardDmText('From your screenshots:', lines);
    expect(text.length).toBeLessThanOrEqual(2_000);
    const kept = text.split('\n');
    expect(kept[0]).toBe('From your screenshots:');
    expect(kept.slice(1, -1)).toEqual(lines.slice(0, kept.length - 2));
    expect(kept.at(-1)).toBe(`…and ${String(lines.length - (kept.length - 2))} more`);
    // Every line fits: all of them, nothing counted.
    expect(boardDmText('Head:', ['- a', '- b'])).toBe('Head:\n- a\n- b');
  });
});

describe('a max battle’s screenshot posted in the region’s board (plan 8R-9F)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'], now: MAX_THURSDAY });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('points to /max screenshot: where the Power Spot is not clear, and reports a clear one', async () => {
    const pond = keptRow(2, {
      id: 'c0ffee00c0ffee00c0ffee00c0ffee01.16',
      kind: 'powerspot',
      title: 'Gazebo of the Pond',
      lat: TEST_SPOT.lat + 0.0001,
      lon: TEST_SPOT.lon,
    });
    const made = await maxReportingWith({ moderation: null }, [pond]);
    const shots = screenshotsWith(made.ctx);
    const ctx: AppContext = {
      ...made.ctx,
      screenshots: shots.screenshots,
      config: {
        ...made.ctx.config,
        settings: {
          ...made.ctx.config.settings,
          ocr: { ...made.ctx.config.settings.ocr, enabled: true },
        },
      },
    };
    const west = made.ctx.regions.byChannel(WEST_CHANNEL)!;
    const trigger = new ScreenshotTrigger({ ctx, board: boardOf(west, shots).board });
    const dms = ctx.dms as RecordingDms;
    const unsure = posted([shots.screenshot('a.png', maxReading('GAZEBO OF THE P'))], {
      channelId: BOARD,
      inThread: true,
    });
    await trigger.handle(unsure.message);
    expect(made.store.active()).toEqual([]);
    expect(unsure.replies).toEqual([]);
    expect(dms.to(AUTHOR)[0]?.content).toContain(
      'I could not tell which Power Spot this is: report it with `/max screenshot:`, which asks ' +
        'you privately.',
    );
    const clear = posted([shots.screenshot('b.png', maxReading())], {
      channelId: BOARD,
      inThread: true,
    });
    await trigger.handle(clear.message);
    await made.service.flush();
    expect(made.store.active()).toHaveLength(1);
    expect(dms.to(AUTHOR)[1]?.content).toMatch(/Reported|max battle/);
  });

  describe('a split screenshot in the board (plan 7P)', () => {
    const fountain = () => eggReading('Maple Leaf Mosaic', 3, CLOCK, 15 * 60);
    const inBoard = { channelId: BOARD, inThread: true };

    it('reports each pane as a screenshot of its own, a DM line each named by its place', async () => {
      const made = await setup();
      const split = made.screenshot('split.png', splitOutcome([egg(), fountain()]));
      await made.trigger.handle(posted([split], inBoard).message);
      expect(made.reader.reads).toBe(1);
      expect(
        made.store
          .active()
          .map((party) => party.gymId)
          .sort(),
      ).toEqual([2, 6]);
      const [dm] = made.said();
      expect(dm?.split('\n').slice(1)).toEqual([
        expect.stringMatching(/^- Top: Reported the raid at Old Stone Fountain: <#\d+>\.$/),
        expect.stringMatching(/^- Bottom: Reported the raid at Maple Leaf Mosaic: <#\d+>\.$/),
      ]);
    });

    it('refuses two screens it could not tell apart, reporting nothing, and gives the use back', async () => {
      const made = await setup();
      const mixed = made.screenshot('mixed.png', {
        kind: 'read',
        reading: egg(),
        twoScreens: true,
      });
      for (let n = 0; n < 21; n++) {
        await made.trigger.handle(posted([mixed], inBoard).message);
        expect(made.said().at(-1)?.split('\n')[1]).toBe(`- ${TWO_SCREENS}`);
      }
      expect(made.reader.reads).toBe(21);
      expect(made.store.active()).toEqual([]);
    });

    it('reads a second pane only with a use of its own, and says when none is left', async () => {
      const made = await setup();
      const cat = made.screenshot('cat.png', readingOf({ gym: 'Old Stone Fountain' }));
      for (let i = 0; i < 19; i++) await made.trigger.handle(posted([cat], inBoard).message);
      const split = made.screenshot('split.png', splitOutcome([egg(), fountain()]));
      await made.trigger.handle(posted([split], inBoard).message);
      expect(made.store.active().map((party) => party.gymId)).toEqual([2]);
      expect(made.said().at(-1)?.split('\n').slice(1)).toEqual([
        expect.stringMatching(/^- Top: Reported the raid at Old Stone Fountain/),
        '- Bottom: You have sent many screenshots just now, so I did not read this screen. Try again in 15 minutes.',
      ]);
    });

    it('gives the second pane’s use back when its raid is refused for none of the member’s doing', async () => {
      const made = await setup();
      made.gateway.refusePosts.set(WEST_FORUM, ['Manage Posts']);
      const split = made.screenshot('split.png', splitOutcome([egg(), fountain()]));
      // Two uses a picture: eleven would pass the twenty if the uses were not given back.
      for (let n = 0; n < 11; n++) {
        await made.trigger.handle(posted([split], inBoard).message);
        expect(made.said().at(-1)).not.toMatch(/many screenshots/);
      }
      expect(made.reader.reads).toBe(11);
    });
  });
});
