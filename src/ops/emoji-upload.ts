import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { DiscordAPIError, HTTPError, Routes, type APIApplicationEmoji } from 'discord.js';
import sharp from 'sharp';
import {
  CONTROL_ICON_NAMES,
  LEAGUE_ICON_NAMES,
  TEAM_ICON_NAMES,
  TYPE_ICON_NAMES,
  WEATHER_ICON_NAMES,
} from '../domain/pogo/game-icons.js';

/*
 * The game's icons for types, weather and teams, and legacy Pine's icons of a post's controls, as
 * emoji of the bot's application
 * (`./pine emoji-upload`, `npm run emoji:upload`; `emoji-upload-cli.ts`). Only the names the
 * application lacks are made; nothing is renamed, replaced or deleted. A dry run says what it
 * would upload; `apply` uploads.
 */

/**
 * Where the game's icons for the bot's emoji come from: PokeMiners' copy of the game's assets,
 * at a fixed commit, so that a later change there cannot change what is uploaded.
 */
export const POGO_ASSETS =
  'https://raw.githubusercontent.com/PokeMiners/pogo_assets/c2a686eb08ace6e890d8fe3d2134c76988db87b5/Images/';

/** An emoji is uploaded as a PNG of this many pixels a side, the icon fitted in. */
export const EMOJI_PIXELS = 128;
/** Discord takes an emoji of at most 256 KiB. */
export const MAX_EMOJI_BYTES = 256 * 1024;
/** An icon of the game is a few KiB; anything over this is no icon. */
export const MAX_ICON_BYTES = 2 * 1024 * 1024;

/**
 * Legacy Pine's reaction icons (`CONTROL_ICON_NAMES`), copied from the legacy bot's
 * `assets/images/reactions/` (plan 8D-G): the folder `pictures/emoji/` of the checkout, beside
 * `src/` and `dist/` alike (and in the image), one `<name>.png` each.
 */
export const EMOJI_FOLDER = fileURLToPath(new URL('../../pictures/emoji/', import.meta.url));

/**
 * One emoji to make: its name and the icon it is made from, the address of the game's icon or
 * a file the bot carries.
 */
export type IconSource = { name: string; url: string } | { name: string; file: string };

type WeatherIconName = (typeof WEATHER_ICON_NAMES)[number];
type TeamIconName = (typeof TEAM_ICON_NAMES)[number];

/** The small weather icons; partly cloudy is the day's. */
const WEATHER_FILES: Readonly<Record<WeatherIconName, string>> = {
  sunny: 'Weather/weatherIcon_small_sunny.png',
  clear: 'Weather/weatherIcon_small_clear.png',
  rain: 'Weather/weatherIcon_small_rain.png',
  partlycloudy: 'Weather/weatherIcon_small_partlycloudy_day.png',
  cloudy: 'Weather/weatherIcon_small_cloudy.png',
  windy: 'Weather/weatherIcon_small_windy.png',
  snow: 'Weather/weatherIcon_small_snow.png',
  fog: 'Weather/weatherIcon_small_fog.png',
};

/** The leagues' icons of Go Battle League. */
const LEAGUE_FILES: Readonly<Record<(typeof LEAGUE_ICON_NAMES)[number], string>> = {
  leaguelittle: 'Combat/GBL_littlecup.png',
  leaguegreat: 'Combat/pogo_great_league.png',
  leagueultra: 'Combat/pogo_ultra_league.png',
  leaguemaster: 'Combat/pogo_master_league.png',
};

const TEAM_FILES: Readonly<Record<TeamIconName, string>> = {
  instinct: 'Pokestops and Gyms/team_yellow.png',
  mystic: 'Pokestops and Gyms/team_blue.png',
  valor: 'Pokestops and Gyms/team_red.png',
  teamless: 'Pokestops and Gyms/TeamLess.png',
};

/** A path of the assets as an address (its spaces encoded). */
function assetUrl(path: string): string {
  return POGO_ASSETS + path.split('/').map(encodeURIComponent).join('/');
}

/** Every emoji the bot looks for, with the icon it is made from. */
export function iconSources(): IconSource[] {
  return [
    ...TYPE_ICON_NAMES.map((type) => ({
      name: type,
      url: assetUrl(`Types/POKEMON_TYPE_${type.toUpperCase()}.png`),
    })),
    ...WEATHER_ICON_NAMES.map((name) => ({ name, url: assetUrl(WEATHER_FILES[name]) })),
    ...TEAM_ICON_NAMES.map((name) => ({ name, url: assetUrl(TEAM_FILES[name]) })),
    ...LEAGUE_ICON_NAMES.map((name) => ({ name, url: assetUrl(LEAGUE_FILES[name]) })),
    ...CONTROL_ICON_NAMES.map((name) => ({ name, file: `${EMOJI_FOLDER}${name}.png` })),
  ];
}

/**
 * Why an icon could not be made or uploaded, in a line the script may print: what Discord
 * answered by its status and code (never the request, which holds the picture and may hold
 * more), or the message of a failure of the script's own.
 */
export function failureReason(err: unknown): string {
  if (err instanceof DiscordAPIError) {
    return `Discord answered ${String(err.status)} (code ${String(err.code)})`;
  }
  if (err instanceof HTTPError) return `Discord answered ${String(err.status)}`;
  return err instanceof Error ? err.message : 'an unknown failure';
}

/** The emoji of `sources` the application does not have yet (by name; nothing is replaced). */
export function missingIcons(
  sources: readonly IconSource[],
  existing: Iterable<string>,
): IconSource[] {
  const have = new Set(existing);
  return sources.filter((source) => !have.has(source.name));
}

/** The part of discord.js's `REST` the upload needs. */
export interface EmojiRest {
  get(route: `/${string}`): Promise<unknown>;
  post(route: `/${string}`, options: { body: unknown }): Promise<unknown>;
}

/** The emoji names of the application, as Discord lists them. */
export async function applicationEmojiNames(
  rest: Pick<EmojiRest, 'get'>,
  appId: string,
): Promise<string[]> {
  const listed = (await rest.get(Routes.applicationEmojis(appId))) as {
    items: APIApplicationEmoji[];
  };
  return listed.items.flatMap((emoji) => (emoji.name ? [emoji.name] : []));
}

/** The icon's bytes: downloaded, or read from the bot's own file. */
async function iconBytes(source: IconSource): Promise<Buffer> {
  if ('file' in source) {
    try {
      return await readFile(source.file);
    } catch {
      throw new Error(`${source.name}: the icon's file could not be read`);
    }
  }
  const response = await fetch(source.url, { signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`${source.name}: the icon answered ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

/**
 * The icon, downloaded or read, and fitted into a square PNG with a transparent margin (scaled
 * up or down to `EMOJI_PIXELS`: legacy Pine's icons are 43 to 130 pixels).
 */
export async function emojiImage(source: IconSource): Promise<Buffer> {
  const bytes = await iconBytes(source);
  if (bytes.length > MAX_ICON_BYTES) throw new Error(`${source.name}: the icon is too large`);
  const image = await sharp(bytes)
    .resize(EMOJI_PIXELS, EMOJI_PIXELS, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();
  if (image.length > MAX_EMOJI_BYTES) throw new Error(`${source.name}: the emoji is too large`);
  return image;
}

export interface EmojiUploadOptions {
  rest: EmojiRest;
  appId: string;
  /** Upload; without it, only say what would be uploaded. */
  apply: boolean;
  /** The PNG of an icon (`emojiImage`). */
  image: (source: IconSource) => Promise<Buffer>;
  /** A line of the report. */
  say: (line: string) => void;
  /** A line about a failure. */
  warn: (line: string) => void;
}

/**
 * Makes the emoji the application lacks, one after the other; an icon that fails is said in one
 * line and the others go on. Resolves to the exit status: 1 when the emoji could not be listed
 * or anything failed. Never says the token or the application's id.
 */
export async function uploadEmoji(options: EmojiUploadOptions): Promise<number> {
  const { rest, appId, apply, image, say, warn } = options;
  let existing: string[];
  try {
    existing = await applicationEmojiNames(rest, appId);
  } catch (err) {
    warn(`Could not list the emoji of the application: ${failureReason(err)}`);
    return 1;
  }
  const missing = missingIcons(iconSources(), existing);
  say(
    `The application has ${existing.length} emoji; ${missing.length} of the game's icons are missing.`,
  );
  let done = 0;
  let failed = 0;
  for (const source of missing) {
    try {
      const picture = await image(source);
      if (!apply) {
        say(`would upload ${source.name} (${picture.length} bytes)`);
      } else {
        await rest.post(Routes.applicationEmojis(appId), {
          body: { name: source.name, image: `data:image/png;base64,${picture.toString('base64')}` },
        });
        say(`uploaded ${source.name}`);
      }
      done++;
    } catch (err) {
      failed++;
      warn(`${source.name} failed: ${failureReason(err)}`);
    }
  }
  say(`${apply ? 'Uploaded' : 'Would upload'} ${done} of ${missing.length}; ${failed} failed.`);
  if (!apply && done > 0) say('Run again with --apply to upload them.');
  return failed > 0 ? 1 : 0;
}
