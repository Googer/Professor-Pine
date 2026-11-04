import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { z } from 'zod';
import { CATEGORY_LABELS } from '../commands/categories.js';
import { settingsObject, settingsSchema, withoutRetiredSettings } from '../config/settings.js';

/*
 * The settings converter (`./pine convert-settings`, `npm run settings:convert`): a legacy
 * installation's `data/settings.json` and `data/private-settings.json` become the new bot's
 * settings (`pine-settings.json`) and the lines of its `.env` (`env-from-legacy.txt`, never `.env`
 * itself). Every value the new bot reads keeps its legacy value, renamed keys are mapped, the new
 * keys take the new defaults (the repository's `data/settings.json`), and what the new bot never
 * reads is dropped and named. Secrets are written to the fragment only, never printed.
 */

/** The file of the new settings, as `./pine` expects it beside `compose.yaml`. */
export const SETTINGS_FILE = 'pine-settings.json';
/** The `.env` lines made of the private settings: the operator copies them into `.env`. */
export const ENV_FRAGMENT = 'env-from-legacy.txt';

type Json = Record<string, unknown>;

function isObject(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Keys the new bot reads under another name: `[legacy path, new path]`. */
const RENAMED: readonly (readonly [string, string])[] = [
  ['channels.ex-gym-raids', 'channels.elite-gym-raids'],
];

/** The legacy private settings and the variable each became, in the order of `.env.example`. */
const PRIVATE_TO_ENV: readonly (readonly [string, string])[] = [
  ['discordBotToken', 'DISCORD_TOKEN'],
  ['owner', 'OWNER_ID'],
  ['db.host', 'DB_HOST'],
  ['db.port', 'DB_PORT'],
  ['db.user', 'DB_USER'],
  ['db.password', 'DB_PASSWORD'],
  ['db.schema', 'DB_SCHEMA'],
  ['pokemonUrlBase', 'POKEMON_IMAGE_BASE'],
  ['googleApiKey', 'GOOGLE_API_KEY'],
  // The legacy bot signed in to GitHub as a user with a password; GitHub takes only a token,
  // which is what the password field held, and the new bot sends the token alone.
  ['githubPassword', 'GITHUB_TOKEN'],
  ['githubRepo', 'GITHUB_REPO'],
];

/** Private settings that are carried, but not into `.env`. */
const PRIVATE_TO_SETTINGS = ['regionMapLink'] as const;

/** Why a private setting is dropped, where there is more to say than that nothing reads it. */
const PRIVATE_DROPPED_WHY: Readonly<Record<string, string>> = {
  discordNotifyToken: 'the second bot for notifications is not built',
  githubUser: 'GitHub takes the token alone',
};

/** Variables the stack needs that the bot cannot make of anything (they can be left blank). */
const REQUIRED_ENV = ['DISCORD_TOKEN', 'OWNER_ID', 'DB_USER', 'DB_PASSWORD', 'DB_SCHEMA'];

export interface EnvValue {
  name: string;
  /** The value, '' when the legacy file has none (or one the operator must give by hand). */
  value: string;
}

export interface ByHand {
  name: string;
  why: string;
  /**
   * What the fragment writes for it meanwhile: blank, which fails loudly where it is needed, or a
   * safe default (a blank BACKUP_DIR would switch the backups off).
   */
  value?: string;
}

export type Conversion =
  | {
      ok: true;
      /** The new settings file. */
      settings: Json;
      /** Settings (paths) whose legacy value differs from the new default. */
      kept: string[];
      renamed: { from: string; to: string }[];
      /** What the new bot never reads: paths, `helpGroups: <value>`, `private: <key>`. */
      dropped: string[];
      /** Top-level settings the legacy file lacks, which take the new defaults. */
      defaulted: string[];
      /**
       * Feature flags the legacy file lacks: off for the legacy bot (it read them as undefined),
       * so off here, whatever the new default.
       */
      offByAbsence: string[];
      /** The variables of `.env` made of the private settings; empty without them. */
      env: EnvValue[];
      /** What the operator adds to `.env` by hand, and why. */
      byHand: ByHand[];
      /** Sentences about what was dropped from the private settings. */
      notes: string[];
    }
  | { ok: false; error: string };

function getPath(object: Json, dotted: string): unknown {
  let value: unknown = object;
  for (const key of dotted.split('.')) {
    if (!isObject(value) || !Object.hasOwn(value, key)) return undefined;
    value = value[key];
  }
  return value;
}

/** The legacy settings with the renamed keys under their new names (where the new is free). */
function renamedLegacy(legacy: Json, renamed: Conversion & { ok: true }): Json {
  const copy = structuredClone(legacy);
  for (const [from, to] of RENAMED) {
    const fromKeys = from.split('.');
    const toKeys = to.split('.');
    const fromParent = getPath(copy, fromKeys.slice(0, -1).join('.'));
    const toParent = getPath(copy, toKeys.slice(0, -1).join('.'));
    const fromKey = fromKeys.at(-1) ?? '';
    const toKey = toKeys.at(-1) ?? '';
    // Under both names, the new one wins and the legacy one is dropped as unread (by `merge`).
    if (
      !isObject(fromParent) ||
      !isObject(toParent) ||
      !Object.hasOwn(fromParent, fromKey) ||
      Object.hasOwn(toParent, toKey)
    ) {
      continue;
    }
    toParent[toKey] = fromParent[fromKey];
    delete fromParent[fromKey];
    renamed.renamed.push({ from, to });
  }
  return copy;
}

/** Copies what the new bot reads of `legacy` onto `target` (a copy of the defaults). */
function merge(
  target: Json,
  legacy: Json,
  defaults: Json,
  prefix: string,
  into: Conversion & { ok: true },
) {
  const topLevel: readonly string[] = Object.keys(settingsObject.shape);
  for (const [key, value] of Object.entries(legacy)) {
    const at = prefix === '' ? key : `${prefix}.${key}`;
    const known = Object.hasOwn(defaults, key) || (prefix === '' && topLevel.includes(key));
    if (!known) {
      into.dropped.push(at);
      continue;
    }
    const fallback = defaults[key];
    const current = target[key];
    if (isObject(value) && isObject(fallback) && isObject(current)) {
      merge(current, value, fallback, at, into);
      continue;
    }
    let kept = value;
    if (at === 'helpGroups' && Array.isArray(value)) {
      // Groups of commands the new bot has; a legacy one it does not (`silph`) is dropped.
      const groups: readonly string[] = Object.keys(CATEGORY_LABELS);
      kept = value.filter((group) => typeof group !== 'string' || groups.includes(group));
      for (const group of value) {
        if (typeof group === 'string' && !groups.includes(group)) {
          into.dropped.push(`helpGroups: ${group}`);
        }
      }
    }
    target[key] = kept;
    if (!isDeepStrictEqual(kept, fallback)) into.kept.push(at);
  }
}

/** A private setting as the text of a variable: '' for none. */
/**
 * A private setting as the text of a variable: '' for none or only spaces; otherwise as written
 * (a secret is never trimmed). A number only where `numbers` allows it (the database's port): a
 * snowflake written as a number has lost its last digits (undefined: refused).
 */
function textOf(value: unknown, numbers = false): string | undefined {
  if (typeof value === 'string') return value.trim() === '' ? '' : value;
  if (typeof value === 'number' && Number.isFinite(value)) {
    return numbers ? String(value) : undefined;
  }
  return '';
}

function convertPrivate(secrets: Json, into: Conversion & { ok: true }): void {
  const used = new Set([
    ...PRIVATE_TO_ENV.map(([key]) => key.split('.')[0] ?? key),
    ...PRIVATE_TO_SETTINGS,
  ]);
  for (const key of Object.keys(secrets)) {
    if (used.has(key)) continue;
    into.dropped.push(`private: ${key}`);
    const why = PRIVATE_DROPPED_WHY[key];
    into.notes.push(why === undefined ? `${key}: the new bot never reads it` : `${key}: ${why}`);
  }
  into.byHand.push({
    name: 'DISCORD_APP_ID',
    why: "the application's id (Developer Portal, General Information); the legacy bot had none",
  });
  for (const [key, name] of PRIVATE_TO_ENV) {
    const read = textOf(getPath(secrets, key), name === 'DB_PORT');
    let value = read ?? '';
    if (read === undefined) {
      into.byHand.push({
        name,
        why: 'the legacy file has it as a number, which loses the last digits of an id: copy it by hand',
      });
    } else if (name === 'DB_USER' && value === 'root') {
      value = '';
      into.byHand.push({
        name,
        why: "the legacy bot used root, which the stack cannot create as the bot's user: choose another name",
      });
    } else if (value !== '' && !/^[^'\n\r]*$/u.test(value)) {
      value = '';
      into.byHand.push({
        name,
        why: 'its value holds a quote or a line break: copy it from the legacy file by hand',
      });
    } else if (value === '' && REQUIRED_ENV.includes(name)) {
      into.byHand.push({
        name,
        why: 'the legacy private settings have none, and the bot needs it',
      });
    }
    into.env.push({ name, value });
  }
  const github = into.env.filter((one) => one.name.startsWith('GITHUB_') && one.value !== '');
  if (github.length === 1) {
    const missing = github[0]?.name === 'GITHUB_TOKEN' ? 'GITHUB_REPO' : 'GITHUB_TOKEN';
    into.byHand.push({ name: missing, why: 'GITHUB_TOKEN and GITHUB_REPO go together' });
  }
  into.byHand.push(
    { name: 'DB_ROOT_PASSWORD', why: "the password of MySQL's root user in the stack, new" },
    {
      name: 'BACKUP_DIR',
      why: 'the folder of the nightly backups (with its .pine-backups file; .env.example says more): ./backups until you name the share; blank switches the backups off',
      value: './backups',
    },
  );
  // The web pages' values (DISCORD_CLIENT_SECRET, GOOGLE_MAPS_BROWSER_KEY and the tunnel's
  // CLOUDFLARE_TUNNEL_TOKEN) are not asked for: the legacy bot had no web pages, they are optional,
  // and .env.example has them blank with docs/web-setup.md.
}

/**
 * The new settings and `.env` values of a legacy installation (pure). `defaults` is the new
 * bot's default settings file, whose values the settings the legacy file lacks take. Refused,
 * with the loader's own words, when the result would not load.
 */
export function convertSettings(legacy: unknown, secrets: unknown, defaults: unknown): Conversion {
  if (!isObject(legacy))
    return { ok: false, error: 'The legacy settings.json is not a JSON object.' };
  if (!isObject(defaults))
    return { ok: false, error: 'The default settings are not a JSON object.' };
  if (secrets !== undefined && !isObject(secrets)) {
    return { ok: false, error: 'The legacy private-settings.json is not a JSON object.' };
  }
  const settings = structuredClone(defaults);
  const into: Conversion & { ok: true } = {
    ok: true,
    settings,
    kept: [],
    renamed: [],
    dropped: [],
    defaulted: Object.keys(defaults).filter((key) => !Object.hasOwn(legacy, key)),
    offByAbsence: [],
    env: [],
    byHand: [],
    notes: [],
  };
  merge(settings, renamedLegacy(legacy, into), defaults, '', into);
  // A flag the legacy file lacks was off for the legacy bot: it stays off.
  const features = settings.features;
  if (isObject(legacy.features) && isObject(features)) {
    for (const flag of Object.keys(features)) {
      if (Object.hasOwn(legacy.features, flag) || features[flag] !== true) continue;
      features[flag] = false;
      into.offByAbsence.push(`features.${flag}`);
    }
  }
  if (secrets !== undefined) {
    for (const key of PRIVATE_TO_SETTINGS) {
      const value = textOf(secrets[key])?.trim() ?? '';
      if (value === '') continue;
      settings[key] = value;
      into.kept.push(key);
    }
    convertPrivate(secrets, into);
  }
  const checked = settingsSchema.safeParse(withoutRetiredSettings(settings));
  if (!checked.success) {
    return {
      ok: false,
      error: `The converted settings would not load:\n${z.prettifyError(checked.error)}`,
    };
  }
  return into;
}

/**
 * A line of `.env`: the value bare where it is plain, in single quotes otherwise (Compose and
 * Node's `--env-file` read it as written, `$` included). A value with a quote or a line break is
 * never written (`convertSettings` leaves it to the operator).
 */
export function envLine(name: string, value: string): string {
  return /^[\w./:@+,=-]*$/u.test(value) ? `${name}=${value}` : `${name}='${value}'`;
}

/** The fragment of `.env`: what to do with it, the values, and what to add by hand. */
function fragmentText(env: readonly EnvValue[], byHand: readonly ByHand[]): string {
  const lines = [
    '# Made by convert-settings from a legacy private-settings.json. It holds the secrets of the',
    '# installation: keep it to yourself, and delete it once its lines are in .env.',
    '# Copy .env.example to .env, put these lines in place of the ones there, and fill in what is',
    '# blank (each says why below).',
    '',
    ...env.map((one) => envLine(one.name, one.value)),
    '',
    '# To add by hand (a variable above that is blank is filled in there):',
    ...byHand.flatMap((one) => [
      `# ${one.name}: ${one.why}`,
      ...(env.some((value) => value.name === one.name) ? [] : [envLine(one.name, one.value ?? '')]),
    ]),
  ];
  return `${lines.join('\n')}\n`;
}

function readJson(file: string): { ok: true; value: unknown } | { ok: false; error: string } {
  try {
    // A byte order mark (Windows' editors) is taken off, as require() did for the legacy bot.
    const text = readFileSync(file, 'utf8');
    return { ok: true, value: JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text) };
  } catch (err) {
    return { ok: false, error: `${file} cannot be read as JSON: ${(err as Error).message}` };
  }
}

/**
 * Writes the files whole or not at all: each to a temporary file beside it first (the secret one
 * owner-only from its creation), then renamed into place, the secret one first, so that settings
 * are never left behind without their fragment. Undefined when done; else why not, with no file
 * changed and the temporary ones removed.
 */
function writeAll(
  files: readonly { file: string; text: string; secret: boolean }[],
): { error: string; written: string[] } | undefined {
  const temps: string[] = [];
  const written: string[] = [];
  try {
    for (const { file, text, secret } of files) {
      const temp = `${file}.${process.pid}.tmp`;
      writeFileSync(temp, text, secret ? { mode: 0o600, flag: 'wx' } : { flag: 'wx' });
      temps.push(temp);
    }
    for (let i = files.length - 1; i >= 0; i--) {
      const file = files[i]?.file ?? '';
      renameSync(temps[i] ?? '', file);
      temps[i] = '';
      written.push(file);
    }
    return undefined;
  } catch (err) {
    for (const temp of temps) if (temp !== '') rmSync(temp, { force: true });
    return { error: (err as Error).message, written };
  }
}

export interface ConvertInstallationOptions {
  /** The legacy `data` folder: `settings.json`, and `private-settings.json` if there is one. */
  legacyDir: string;
  /** Where the two files are written. */
  outDir: string;
  /** Write over files that exist. */
  force: boolean;
  /** The new bot's default settings. */
  defaultsPath: string;
  say: (line: string) => void;
}

/**
 * Reads a legacy installation and writes `pine-settings.json` and `env-from-legacy.txt` (owner
 * only) into `outDir`; neither when either exists already, unless `force` (and an older fragment
 * is removed where there are no private settings: it is not of this installation). Says what it did by
 * the names of the settings and variables, never a secret's value. Resolves to the exit status:
 * 0 written, 1 refused.
 */
export function convertInstallation(options: ConvertInstallationOptions): number {
  const { legacyDir, outDir, force, defaultsPath, say } = options;
  const legacyFile = path.join(legacyDir, 'settings.json');
  const privateFile = path.join(legacyDir, 'private-settings.json');
  if (!existsSync(legacyFile)) {
    say(`There is no settings.json in ${legacyDir}: name the legacy bot's data folder.`);
    return 1;
  }
  const legacy = readJson(legacyFile);
  if (!legacy.ok) {
    say(legacy.error);
    return 1;
  }
  const hasPrivate = existsSync(privateFile);
  const secrets = hasPrivate ? readJson(privateFile) : undefined;
  if (secrets && !secrets.ok) {
    // The parser's message may quote the file: only its name is said.
    say(`${privateFile} cannot be read as JSON.`);
    return 1;
  }
  const defaults = readJson(defaultsPath);
  if (!defaults.ok) {
    say(defaults.error);
    return 1;
  }
  const converted = convertSettings(legacy.value, secrets?.value, defaults.value);
  if (!converted.ok) {
    say(converted.error);
    return 1;
  }
  const settingsOut = path.join(outDir, SETTINGS_FILE);
  const envOut = path.join(outDir, ENV_FRAGMENT);
  // The fragment too without private settings: an older one would be taken for this conversion's.
  const there = [settingsOut, envOut].filter((file) => existsSync(file));
  if (there.length > 0 && !force) {
    say(`${there.join(' and ')} already exists: nothing was written. --force writes over it.`);
    return 1;
  }
  const files = [
    { file: settingsOut, text: `${JSON.stringify(converted.settings, null, 2)}\n`, secret: false },
    ...(hasPrivate
      ? [{ file: envOut, text: fragmentText(converted.env, converted.byHand), secret: true }]
      : []),
  ];
  const failure = writeAll(files);
  if (failure !== undefined) {
    const notWritten = files
      .map(({ file }) => file)
      .filter((file) => !failure.written.includes(file));
    say(
      failure.written.length === 0
        ? `The files could not be written (${failure.error}): nothing was written.`
        : `The files could not all be written (${failure.error}): ${failure.written.join(' and ')} was written, ${notWritten.join(' and ')} was not.`,
    );
    return 1;
  }
  if (!hasPrivate && existsSync(envOut)) {
    try {
      rmSync(envOut);
      say(`Removed the older ${envOut}: it was not of this installation, which has no secrets.`);
    } catch (err) {
      say(`The older ${envOut} could not be removed (${(err as Error).message}): delete it.`);
      return 1;
    }
  }
  say(`Wrote ${settingsOut}: the settings, checked by the bot's own loader.`);
  const list = (items: readonly string[]) => (items.length === 0 ? 'none' : items.join(', '));
  say(`Kept from the legacy file (they differ from the new defaults): ${list(converted.kept)}`);
  for (const rename of converted.renamed) say(`Renamed: ${rename.from} -> ${rename.to}`);
  say(
    `Dropped (the new bot never reads them): ${list(converted.dropped.filter((one) => !one.startsWith('private: ')))}`,
  );
  say(
    `New settings at their defaults (check them, the timezone above all): ${list(converted.defaulted)}`,
  );
  if (converted.offByAbsence.length > 0) {
    say(
      `Off, because the legacy file lacks them (the legacy bot had them off): ${list(converted.offByAbsence)}`,
    );
  }
  if (!hasPrivate) {
    say(`There is no private-settings.json in ${legacyDir}: no .env lines were written.`);
    return 0;
  }
  say(`Wrote ${envOut} (for its owner only: it holds the secrets). Put its lines into .env:`);
  for (const one of converted.env) say(`  ${one.name}: ${one.value === '' ? 'empty' : 'set'}`);
  if (converted.notes.length > 0) {
    say(`Dropped from the private settings: ${converted.notes.join('; ')}`);
  }
  say('Add by hand to .env:');
  for (const one of converted.byHand) say(`  ${one.name}: ${one.why}`);
  return 0;
}
