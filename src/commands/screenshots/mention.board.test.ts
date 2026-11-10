import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EAST_CHANNEL, testGym, WEST_CHANNEL, WEST_FORUM } from '../../../test/support/gyms.js';
import { maxReportingWith, MAX_THURSDAY } from '../../../test/support/max-reporting.js';
import { PARTY_NOW, TEST_SPOT } from '../../../test/support/parties.js';
import { partyServiceWith } from '../../../test/support/party-service.js';
import { AUTHOR, OTHER, posted } from '../../../test/support/posted-message.js';
import { gymsFixture } from '../../../test/support/providers.js';
import { screenshotsWith } from '../../../test/support/screenshot-service.js';
import {
  eggReading,
  maxReading,
  readingOf,
  splitOutcome,
} from '../../../test/support/screenshots.js';
import { TWO_SCREENS } from '../../render/screenshot-reading.js';
import { createTestContext } from '../../../test/support/test-context.js';
import { keptRow } from '../../../test/support/wayspot-cases.js';
import type { RecordingDms } from '../../../test/support/dms.js';
import type { AppContext } from '../../app-context.js';
import type { Gym } from '../../db/repositories/gym-repository.js';
import type { Region } from '../../db/repositories/region-repository.js';
import type { BoardMessage } from '../../discord/party-gateway.js';
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
  shots: ReturnType<typeof screenshotsWith>,
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

async function setup(options: { gyms?: Gym[]; passive?: boolean } = {}) {
  const gyms = gymsFixture(options.gyms ?? []);
  const made = await partyServiceWith([], { gyms });
  const shots = screenshotsWith(createTestContext({ gyms }).ctx);
  const { ctx: base } = createTestContext({
    gyms,
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
      '- 10: The screenshots of one message may be 64 MB together, so I did not read this ' +
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
      { ...made.screenshot('a.png', cat()), size: MAX_SCREENSHOT_BYTES },
      { ...made.screenshot('b.png', cat()), size: MAX_BOARD_MESSAGE_BYTES - MAX_SCREENSHOT_BYTES },
    ];
    await made.trigger.handle(inBoard(pictures));
    expect(made.attachments.asked.map((one) => one.url)).toEqual([
      pictures[1]?.url,
      pictures[2]?.url,
    ]);
    expect(made.said()[0]).toContain('- 1: That file is too large to be a screenshot.');
    expect(made.said()[0]).not.toContain('together');
  });
});

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
