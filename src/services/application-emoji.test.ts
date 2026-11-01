import { describe, expect, it } from 'vitest';
import { createTestLogger } from '../../test/support/test-logger.js';
import { ApplicationEmoji, emojiFinder, REFUSED_REREAD_GAP_MS } from './application-emoji.js';

describe('ApplicationEmoji', () => {
  it('knows nothing before the first read, and the emoji of the application after it', async () => {
    const { log } = createTestLogger();
    const emoji = new ApplicationEmoji(
      { list: () => Promise.resolve(new Map([['rock', '<:rock:1>']])) },
      log,
    );
    expect(emoji.get('rock')).toBeUndefined();
    await emoji.refresh();
    expect(emoji.get('rock')).toBe('<:rock:1>');
    expect(emoji.get('ice')).toBeUndefined();
  });

  it('knows which ids are its emoji, animated too, as the last read found them (plan 8M-8A)', async () => {
    const { log } = createTestLogger();
    let list = new Map([
      ['rock', '<:rock:111111111111111111>'],
      ['spin', '<a:spin:222222222222222222>'],
    ]);
    const emoji = new ApplicationEmoji({ list: () => Promise.resolve(list) }, log);
    expect(emoji.hasId('111111111111111111')).toBe(false);
    await emoji.refresh();
    expect(emoji.hasId('111111111111111111')).toBe(true);
    expect(emoji.hasId('222222222222222222')).toBe(true);
    expect(emoji.hasId('333333333333333333')).toBe(false);
    expect(emoji.hasId('rock')).toBe(false);
    list = new Map([['ice', '<:ice:333333333333333333>']]);
    await emoji.refresh();
    expect(emoji.hasId('111111111111111111')).toBe(false);
    expect(emoji.hasId('333333333333333333')).toBe(true);
  });

  it('says at debug how many emoji a read found (plan 8X-H)', async () => {
    const { log, entries } = createTestLogger();
    const emoji = new ApplicationEmoji(
      {
        list: () =>
          Promise.resolve(
            new Map([
              ['rock', '<:rock:1>'],
              ['ice', '<:ice:2>'],
            ]),
          ),
      },
      log,
    );
    await emoji.refresh();
    expect(entries).toEqual([
      expect.objectContaining({ level: 20, msg: 'read the emoji of the application', emoji: 2 }),
    ]);
  });

  it('keeps the last good list when a read fails, and says so', async () => {
    const { log, entries } = createTestLogger();
    let fail = false;
    const emoji = new ApplicationEmoji(
      {
        list: () =>
          fail
            ? Promise.reject(new Error('down'))
            : Promise.resolve(new Map([['ice', '<:ice:2>']])),
      },
      log,
    );
    await emoji.refresh();
    fail = true;
    await emoji.refresh();
    expect(emoji.get('ice')).toBe('<:ice:2>');
    expect(entries.at(-1)).toMatchObject({
      level: 40,
      msg: 'could not read the emoji of the application; keeping the last list',
    });
  });

  it('tells its listener when the list it knows changes: the first read, and a read that differs', async () => {
    const { log } = createTestLogger();
    let found = new Map([['rock', '<:rock:1>']]);
    let fail = false;
    const emoji = new ApplicationEmoji(
      { list: () => (fail ? Promise.reject(new Error('down')) : Promise.resolve(found)) },
      log,
    );
    let told = 0;
    emoji.onChange(() => {
      told++;
    });
    await emoji.refresh();
    expect(told).toBe(1);
    // The same emoji again (another map with the same entries): nothing to show anew.
    found = new Map([['rock', '<:rock:1>']]);
    await emoji.refresh();
    expect(told).toBe(1);
    fail = true;
    await emoji.refresh();
    expect(told).toBe(1);
    fail = false;
    found = new Map([
      ['rock', '<:rock:1>'],
      ['ice', '<:ice:2>'],
    ]);
    await emoji.refresh();
    expect(told).toBe(2);
    found = new Map([
      ['rock', '<:rock:9>'],
      ['ice', '<:ice:2>'],
    ]);
    await emoji.refresh();
    expect(told).toBe(3);
  });

  it('tells its listener after the first good read, also one that finds nothing or follows a failed one (review 8A-4)', async () => {
    const { log } = createTestLogger();
    let fail = true;
    const emoji = new ApplicationEmoji(
      {
        list: () => (fail ? Promise.reject(new Error('away')) : Promise.resolve(new Map())),
      },
      log,
    );
    let told = 0;
    emoji.onChange(() => {
      told++;
    });
    await emoji.refresh();
    expect(told).toBe(0);
    fail = false;
    await emoji.refresh();
    expect(told).toBe(1);
    // Nothing changed since: nobody is told again.
    await emoji.refresh();
    expect(told).toBe(1);
  });

  it('shares a read that is under way', async () => {
    const { log } = createTestLogger();
    let reads = 0;
    const emoji = new ApplicationEmoji(
      {
        list: () => {
          reads++;
          return Promise.resolve(new Map());
        },
      },
      log,
    );
    await Promise.all([emoji.refresh(), emoji.refresh()]);
    expect(reads).toBe(1);
    await emoji.refresh();
    expect(reads).toBe(2);
  });
});

describe('ApplicationEmoji: when Discord refuses one of its emoji', () => {
  /** An application whose list the test changes, over a clock the test moves. */
  function application() {
    const { log, entries } = createTestLogger();
    const clock = { now: 1_000_000 };
    const found = new Map([
      ['pinejoin', '<:pinejoin:1>'],
      ['pinehere', '<:pinehere:2>'],
    ]);
    let reads = 0;
    const emoji = new ApplicationEmoji(
      {
        list: () => {
          reads++;
          return Promise.resolve(new Map(found));
        },
      },
      log,
      () => clock.now,
    );
    let told = 0;
    emoji.onChange(() => {
      told++;
    });
    return { emoji, clock, found, entries, reads: () => reads, told: () => told };
  }

  it('reads the emoji anew at once, and tells its listener what changed', async () => {
    const app = application();
    await app.emoji.refresh();
    expect(app.told()).toBe(1);
    // Deleted from the application while the bot runs.
    app.found.delete('pinejoin');
    app.emoji.refused();
    await app.emoji.refresh();
    expect(app.reads()).toBe(2);
    expect(app.emoji.get('pinejoin')).toBeUndefined();
    expect(app.emoji.get('pinehere')).toBe('<:pinehere:2>');
    expect(app.told()).toBe(2);
    expect(app.entries.map((entry) => entry.msg)).toContain(
      'Discord refused an emoji of the application; reading them anew',
    );
  });

  it('reads them anew at most once a minute, however often Discord refuses one', async () => {
    const app = application();
    await app.emoji.refresh();
    app.emoji.refused();
    await app.emoji.refresh();
    expect(app.reads()).toBe(2);
    app.clock.now += REFUSED_REREAD_GAP_MS - 1;
    app.emoji.refused();
    app.emoji.refused();
    expect(app.reads()).toBe(2);
    app.clock.now += 1;
    app.emoji.refused();
    expect(app.reads()).toBe(3);
    const said = app.entries.filter(
      (entry) => entry.msg === 'Discord refused an emoji of the application; reading them anew',
    );
    expect(said).toHaveLength(2);
  });
});

describe('emojiFinder', () => {
  it('finds the application’s first, then the server’s, and none in a DM', () => {
    const app = new Map([['rock', '<:rock:1>']]);
    const servers = {
      inServer: (guildId: string, name: string) => (guildId === 'g1' ? `<:${name}:2>` : undefined),
    };
    const finder = emojiFinder(app, servers);
    expect(finder.find('rock', 'g1')).toBe('<:rock:1>');
    expect(finder.find('dark', 'g1')).toBe('<:dark:2>');
    expect(finder.find('dark', null)).toBeUndefined();
    expect(finder.find('dark', 'g2')).toBeUndefined();
  });
});
