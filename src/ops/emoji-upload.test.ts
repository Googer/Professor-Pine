import { DiscordAPIError, HTTPError } from 'discord.js';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { CONTROL_ICON_NAMES, GAME_ICON_NAMES } from '../domain/pogo/game-icons.js';
import {
  EMOJI_FOLDER,
  EMOJI_PIXELS,
  emojiImage,
  failureReason,
  MAX_EMOJI_BYTES,
  iconSources,
  missingIcons,
  POGO_ASSETS,
  uploadEmoji,
  type EmojiRest,
  type IconSource,
} from './emoji-upload.js';

const APP = '400000000000000777';

/**
 * Discord's REST API as the upload uses it: the application's emoji listed, one made per POST.
 * Refuses another application, a second emoji of a name, and an image that is no PNG data URL.
 */
class FakeEmojiRest implements EmojiRest {
  readonly posted: string[] = [];
  listFails: Error | undefined;

  constructor(private readonly names: string[]) {}

  get(route: `/${string}`): Promise<unknown> {
    if (route !== `/applications/${APP}/emojis`) return Promise.reject(new Error('404'));
    if (this.listFails) return Promise.reject(this.listFails);
    return Promise.resolve({ items: this.names.map((name, i) => ({ id: String(i), name })) });
  }

  post(route: `/${string}`, options: { body: unknown }): Promise<unknown> {
    if (route !== `/applications/${APP}/emojis`) return Promise.reject(new Error('404'));
    const { name, image } = options.body as { name: string; image: string };
    if (this.names.includes(name)) return Promise.reject(new Error('name taken'));
    if (!image.startsWith('data:image/png;base64,')) return Promise.reject(new Error('no PNG'));
    this.names.push(name);
    this.posted.push(name);
    return Promise.resolve({ id: name, name });
  }
}

/** Everything the upload says, and a picture for every icon unless it is named to fail. */
function uploadWith(rest: FakeEmojiRest, apply: boolean, failing: readonly string[] = []) {
  const said: string[] = [];
  const warned: string[] = [];
  const made: string[] = [];
  const run = uploadEmoji({
    rest,
    appId: APP,
    apply,
    image: (source: IconSource) => {
      made.push(source.name);
      return failing.includes(source.name)
        ? Promise.reject(new Error(`${source.name}: the icon answered 404`))
        : Promise.resolve(Buffer.from('png'));
    },
    say: (line) => said.push(line),
    warn: (line) => warned.push(line),
  });
  return { run, said, warned, made };
}

describe('uploadEmoji', () => {
  const all = GAME_ICON_NAMES.length;

  it('makes the missing icons on a dry run and uploads none of them', async () => {
    const rest = new FakeEmojiRest(['rock', 'valor']);
    const { run, said, made } = uploadWith(rest, false);
    expect(await run).toBe(0);
    expect(rest.posted).toEqual([]);
    expect(made).toHaveLength(all - 2);
    expect(said[0]).toBe(
      `The application has 2 emoji; ${all - 2} of the game's icons are missing.`,
    );
    expect(said).toContain('would upload bug (3 bytes)');
    expect(said.at(-2)).toBe(`Would upload ${all - 2} of ${all - 2}; 0 failed.`);
    expect(said.at(-1)).toBe('Run again with --apply to upload them.');
  });

  it('uploads only what the application lacks with --apply', async () => {
    const rest = new FakeEmojiRest(['rock']);
    const { run, said } = uploadWith(rest, true);
    expect(await run).toBe(0);
    expect(rest.posted).toHaveLength(all - 1);
    expect(rest.posted).not.toContain('rock');
    expect(said.at(-1)).toBe(`Uploaded ${all - 1} of ${all - 1}; 0 failed.`);
  });

  it('goes on past an icon that fails, says it, and ends with a failure', async () => {
    const rest = new FakeEmojiRest([]);
    const { run, said, warned } = uploadWith(rest, true, ['fog']);
    expect(await run).toBe(1);
    expect(warned).toEqual(['fog failed: fog: the icon answered 404']);
    expect(rest.posted).toHaveLength(all - 1);
    expect(said.at(-1)).toBe(`Uploaded ${all - 1} of ${all}; 1 failed.`);
  });

  it('stops when the emoji cannot be listed, having made and uploaded nothing', async () => {
    const rest = new FakeEmojiRest([]);
    rest.listFails = new HTTPError(503, 'Service Unavailable', 'GET', '/x', {});
    const { run, warned, made } = uploadWith(rest, true);
    expect(await run).toBe(1);
    expect(warned).toEqual(['Could not list the emoji of the application: Discord answered 503']);
    expect(made).toEqual([]);
    expect(rest.posted).toEqual([]);
  });

  it('says so when nothing is missing', async () => {
    const rest = new FakeEmojiRest([...GAME_ICON_NAMES]);
    const { run, said } = uploadWith(rest, false);
    expect(await run).toBe(0);
    expect(said).toEqual([
      `The application has ${all} emoji; 0 of the game's icons are missing.`,
      'Would upload 0 of 0; 0 failed.',
    ]);
  });
});

describe('iconSources', () => {
  it('has an icon for every emoji the bot looks for, once: the pinned assets or its own files', () => {
    const sources = iconSources();
    expect(sources.map((source) => source.name)).toEqual(GAME_ICON_NAMES);
    expect(new Set(sources.map((source) => source.name)).size).toBe(sources.length);
    for (const source of sources) {
      const controls: readonly string[] = CONTROL_ICON_NAMES;
      if (controls.includes(source.name)) {
        expect(source).toEqual({ name: source.name, file: `${EMOJI_FOLDER}${source.name}.png` });
      } else {
        expect('url' in source && source.url.startsWith(POGO_ASSETS)).toBe(true);
      }
      // Discord's rule for an emoji's name.
      expect(source.name).toMatch(/^[a-z0-9_]{2,32}$/);
    }
    expect(POGO_ASSETS).toMatch(/\/[0-9a-f]{40}\/Images\/$/);
  });

  it("has legacy Pine's reaction icons and the game's Select Time icon for a post's controls", () => {
    expect(CONTROL_ICON_NAMES).toEqual([
      'pinejoin',
      'pinehere',
      'pinedone',
      'pineremote',
      'pineleave',
      'pinemeet',
      // Pine's own train C3b (plan 8M-11A), for "Going on now" and the new-train DMs.
      'pinetrain',
    ]);
  });

  it('takes the type, weather and team icons from their files, spaces encoded', () => {
    const url = (name: string) => {
      const source = iconSources().find((one) => one.name === name);
      return source && 'url' in source ? source.url : undefined;
    };
    expect(url('rock')).toBe(`${POGO_ASSETS}Types/POKEMON_TYPE_ROCK.png`);
    expect(url('partlycloudy')).toBe(
      `${POGO_ASSETS}Weather/weatherIcon_small_partlycloudy_day.png`,
    );
    expect(url('sunny')).toBe(`${POGO_ASSETS}Weather/weatherIcon_small_sunny.png`);
    expect(url('instinct')).toBe(`${POGO_ASSETS}Pokestops%20and%20Gyms/team_yellow.png`);
    expect(url('teamless')).toBe(`${POGO_ASSETS}Pokestops%20and%20Gyms/TeamLess.png`);
    // The leagues of Go Battle League, for /rank's buttons and heading (2026-10-23).
    expect(url('leaguelittle')).toBe(`${POGO_ASSETS}Combat/GBL_littlecup.png`);
    expect(url('leaguegreat')).toBe(`${POGO_ASSETS}Combat/pogo_great_league.png`);
    expect(url('leagueultra')).toBe(`${POGO_ASSETS}Combat/pogo_ultra_league.png`);
    expect(url('leaguemaster')).toBe(`${POGO_ASSETS}Combat/pogo_master_league.png`);
  });
});

describe('emojiImage', () => {
  it("fits each of the bot's own icons (43 to 130 pixels) into a square PNG Discord takes", async () => {
    for (const name of CONTROL_ICON_NAMES) {
      const image = await emojiImage({ name, file: `${EMOJI_FOLDER}${name}.png` });
      expect(image.length).toBeLessThanOrEqual(MAX_EMOJI_BYTES);
      const meta = await sharp(image).metadata();
      expect([meta.format, meta.width, meta.height, meta.hasAlpha]).toEqual([
        'png',
        EMOJI_PIXELS,
        EMOJI_PIXELS,
        true,
      ]);
    }
  });

  it('says which icon could not be read', async () => {
    await expect(
      emojiImage({ name: 'pinegone', file: `${EMOJI_FOLDER}pinegone.png` }),
    ).rejects.toThrow(/^pinegone: /);
  });
});

describe('missingIcons', () => {
  it('leaves out what the application has, and replaces nothing', () => {
    const missing = missingIcons(iconSources(), ['rock', 'valor', 'something-else']);
    expect(missing.map((source) => source.name)).not.toContain('rock');
    expect(missing.map((source) => source.name)).not.toContain('valor');
    expect(missing).toHaveLength(GAME_ICON_NAMES.length - 2);
  });
});

describe('failureReason', () => {
  it('says what Discord answered by its status and code, never what was sent', () => {
    const refused = new DiscordAPIError(
      { code: 50035, message: 'Invalid Form Body' },
      50035,
      400,
      'POST',
      '/applications/1/emojis',
      { body: { image: 'data:image/png;base64,AAAA' } },
    );
    expect(failureReason(refused)).toBe('Discord answered 400 (code 50035)');
    expect(failureReason(new HTTPError(503, 'Service Unavailable', 'GET', '/x', {}))).toBe(
      'Discord answered 503',
    );
  });

  it('gives the message of anything else, and a word for what is no error', () => {
    expect(failureReason(new Error('rock: the icon answered 404'))).toBe(
      'rock: the icon answered 404',
    );
    expect(failureReason('nonsense')).toBe('an unknown failure');
  });
});
