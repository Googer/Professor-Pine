import {
  mkdtempSync,
  readFileSync,
  statSync,
  writeFileSync,
  mkdirSync,
  copyFileSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadEnv } from '../config/env.js';
import { loadSettings } from '../config/settings.js';
import {
  convertInstallation,
  convertSettings,
  ENV_FRAGMENT,
  SETTINGS_FILE,
} from './convert-settings.js';

/**
 * A legacy installation shaped like Pittsburgh's (2026-10-16): the legacy defaults of
 * `legacy` with production's differences (`channels.unown`, `features.remoteRaidChannel`),
 * and private settings whose every secret is made up.
 */
const LEGACY = 'test/fixtures/legacy-install';
/** The new bot's own defaults, which the settings the legacy file lacks take. */
const DEFAULTS = 'data/settings.json';

const read = (file: string): unknown => JSON.parse(readFileSync(file, 'utf8'));
const legacySettings = () => read(path.join(LEGACY, 'settings.json'));
const legacyPrivate = () => read(path.join(LEGACY, 'private-settings.json'));

/** The folders the tests made, removed after each. */
const made: string[] = [];
afterEach(() => {
  for (const root of made.splice(0)) rmSync(root, { recursive: true, force: true });
});

/** A fresh folder with the legacy files in it, and one to write to. */
function folders(withPrivate = true) {
  const root = mkdtempSync(path.join(tmpdir(), 'pine-convert-'));
  made.push(root);
  const legacy = path.join(root, 'data');
  const out = path.join(root, 'out');
  mkdirSync(legacy);
  mkdirSync(out);
  copyFileSync(path.join(LEGACY, 'settings.json'), path.join(legacy, 'settings.json'));
  if (withPrivate) {
    copyFileSync(
      path.join(LEGACY, 'private-settings.json'),
      path.join(legacy, 'private-settings.json'),
    );
  }
  return { legacy, out };
}

function run(options: { legacy: string; out: string; force?: boolean }) {
  const lines: string[] = [];
  const status = convertInstallation({
    legacyDir: options.legacy,
    outDir: options.out,
    force: options.force ?? false,
    defaultsPath: DEFAULTS,
    say: (line) => lines.push(line),
  });
  return { status, lines, text: lines.join('\n') };
}

/** The `.env` fragment as the variables it sets. */
function fragmentValues(file: string): Record<string, string> {
  const values: Record<string, string> = {};
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const match = /^([A-Z_]+)=(.*)$/.exec(line);
    if (!match?.[1]) continue;
    const raw = match[2] ?? '';
    values[match[1]] = raw.startsWith("'") && raw.endsWith("'") ? raw.slice(1, -1) : raw;
  }
  return values;
}

describe('convertSettings', () => {
  it('keeps what the new bot reads, maps the renamed keys and fills in the new ones', () => {
    const converted = convertSettings(legacySettings(), legacyPrivate(), read(DEFAULTS));
    if (!converted.ok) throw new Error(converted.error);
    const { settings } = converted;
    const channels = settings.channels as Record<string, string>;
    expect(channels.unown).toBe('wild-unown-sightings');
    expect(channels['elite-gym-raids']).toBe('potential-ex-gym-raids');
    expect(channels).not.toHaveProperty('ex-gym-raids');
    expect((settings.features as Record<string, boolean>).remoteRaidChannel).toBe(false);
    expect(settings.regionMapLink).toBe('https://maps.example.test/legacy-regions');
    // New settings the legacy file never had come from the new defaults.
    expect(settings.timezone).toBe('America/New_York');
    expect(settings.raidBosses).toEqual((read(DEFAULTS) as Record<string, unknown>).raidBosses);
    expect(converted.renamed).toEqual([
      { from: 'channels.ex-gym-raids', to: 'channels.elite-gym-raids' },
    ]);
    expect(converted.kept).toEqual(
      expect.arrayContaining([
        'channels.unown',
        'channels.elite-gym-raids',
        'features.remoteRaidChannel',
        'regionMapLink',
      ]),
    );
    expect(converted.defaulted).toEqual(
      expect.arrayContaining([
        'timezone',
        'ocr',
        'gameData',
        'raidBosses',
        'raidEvents',
        'wayspotTool',
      ]),
    );
  });

  it('drops what the new bot never reads, and lists it', () => {
    const converted = convertSettings(legacySettings(), legacyPrivate(), read(DEFAULTS));
    if (!converted.ok) throw new Error(converted.error);
    expect(converted.dropped).toEqual([
      'exclusiveRaidIncubateDuration',
      'exclusiveRaidHatchedDuration',
      'commandPrefix',
      'reactionCommands',
      'groupReactions',
      'features.reactionCommands',
      'helpGroups: silph',
      'private: discordNotifyToken',
      'private: githubUser',
    ]);
    expect(converted.settings).not.toHaveProperty('commandPrefix');
    expect(converted.settings.helpGroups).not.toContain('silph');
    expect(converted.settings.features).not.toHaveProperty('reactionCommands');
  });

  it('maps every private setting to its variable, and lists what is added by hand', () => {
    const converted = convertSettings(legacySettings(), legacyPrivate(), read(DEFAULTS));
    if (!converted.ok) throw new Error(converted.error);
    expect(Object.fromEntries(converted.env.map((one) => [one.name, one.value]))).toEqual({
      DISCORD_TOKEN: 'MADE-UP.TOKEN.for-tests-only',
      OWNER_ID: '412345678901234567',
      POKEMON_IMAGE_BASE: 'https://images.example.test/pokemon/',
      GOOGLE_API_KEY: 'made-up-google-key',
      GITHUB_TOKEN: 'made-up-github-token',
      GITHUB_REPO: 'example-owner/example-repo',
      DB_HOST: 'localhost',
      DB_PORT: '3306',
      DB_USER: 'pine',
      DB_PASSWORD: 'made-up pa$$word',
      DB_SCHEMA: 'pine',
    });
    expect(converted.byHand.map((one) => one.name)).toEqual([
      'DISCORD_APP_ID',
      'DB_ROOT_PASSWORD',
      'BACKUP_DIR',
    ]);
    expect(converted.dropped).toEqual(
      expect.arrayContaining(['private: discordNotifyToken', 'private: githubUser']),
    );
  });

  it('asks for no picture address when the legacy file has none: nothing reads it', () => {
    const secrets = legacyPrivate() as Record<string, unknown>;
    delete secrets.pokemonUrlBase;
    const converted = convertSettings(legacySettings(), secrets, read(DEFAULTS));
    if (!converted.ok) throw new Error(converted.error);
    expect(converted.byHand.map((one) => one.name)).not.toContain('POKEMON_IMAGE_BASE');
  });

  it('asks for another database user than root, which the stack cannot create', () => {
    const secrets = legacyPrivate() as { db: Record<string, string> };
    secrets.db.user = 'root';
    const converted = convertSettings(legacySettings(), secrets, read(DEFAULTS));
    if (!converted.ok) throw new Error(converted.error);
    expect(converted.env.find((one) => one.name === 'DB_USER')?.value).toBe('');
    expect(converted.byHand.find((one) => one.name === 'DB_USER')?.why).toMatch(/root/);
  });

  it('turns off a feature the legacy file lacks, as the legacy bot had it, and says so', () => {
    const legacy = legacySettings() as { features: Record<string, boolean> };
    delete legacy.features.notifications;
    const converted = convertSettings(legacy, legacyPrivate(), read(DEFAULTS));
    if (!converted.ok) throw new Error(converted.error);
    expect((converted.settings.features as Record<string, boolean>).notifications).toBe(false);
    expect(converted.offByAbsence).toEqual(['features.notifications']);
  });

  it('keeps a secret as written, and refuses a snowflake written as a number', () => {
    const secrets = legacyPrivate() as Record<string, unknown> & { db: Record<string, string> };
    secrets.owner = JSON.parse('412345678901234567') as number; // as the legacy file had it, unquoted
    secrets.db.password = '  spaced out  ';
    const converted = convertSettings(legacySettings(), secrets, read(DEFAULTS));
    if (!converted.ok) throw new Error(converted.error);
    const value = (name: string) => converted.env.find((one) => one.name === name)?.value;
    expect(value('OWNER_ID')).toBe('');
    expect(converted.byHand.find((one) => one.name === 'OWNER_ID')?.why).toMatch(/number/);
    expect(value('DB_PASSWORD')).toBe('  spaced out  ');
  });

  it('refuses a legacy file whose values the new bot would not take', () => {
    const broken = legacySettings() as Record<string, unknown>;
    broken.standardRaidHatchedDuration = 'forty-five';
    const converted = convertSettings(broken, legacyPrivate(), read(DEFAULTS));
    expect(converted.ok).toBe(false);
    if (converted.ok) return;
    expect(converted.error).toMatch(/standardRaidHatchedDuration/);
  });
});

describe('convertInstallation', () => {
  it('writes settings the bot loads and a fragment with the secrets, and prints none', () => {
    const { legacy, out } = folders();
    const { status, text } = run({ legacy, out });
    expect(status).toBe(0);
    const settings = loadSettings(path.join(out, SETTINGS_FILE));
    expect(settings.channels.unown).toBe('wild-unown-sightings');
    expect(settings.channels['elite-gym-raids']).toBe('potential-ex-gym-raids');
    expect(settings.features.remoteRaidChannel).toBe(false);

    const values = fragmentValues(path.join(out, ENV_FRAGMENT));
    expect(values.DISCORD_TOKEN).toBe('MADE-UP.TOKEN.for-tests-only');
    expect(values.DB_PASSWORD).toBe('made-up pa$$word');
    expect(values.DISCORD_APP_ID).toBe('');
    // Never blank: a blank BACKUP_DIR would switch the backups off.
    expect(values.BACKUP_DIR).toBe('./backups');
    // With the values added by hand the environment is complete.
    expect(() =>
      loadEnv({ ...values, DISCORD_APP_ID: '400000000000000777', SETTINGS_PATH: 'x' }),
    ).not.toThrow();
    if (process.platform !== 'win32') {
      expect(statSync(path.join(out, ENV_FRAGMENT)).mode & 0o777).toBe(0o600);
    }

    for (const secret of [
      'MADE-UP',
      'made-up-google-key',
      'made-up-github-token',
      'pa$$word',
      '412345678901234567',
    ]) {
      expect(text).not.toContain(secret);
    }
    expect(text).toContain('DISCORD_TOKEN: set');
    expect(text).toContain('Dropped (the new bot never reads them): exclusiveRaidIncubateDuration');
    expect(text).toContain('Add by hand to .env:\n  DISCORD_APP_ID: ');
  });

  it('says a private setting that is empty as empty', () => {
    const { legacy, out } = folders();
    const secrets = legacyPrivate() as Record<string, unknown>;
    secrets.googleApiKey = '';
    writeFileSync(path.join(legacy, 'private-settings.json'), JSON.stringify(secrets));
    const { status, text } = run({ legacy, out });
    expect(status).toBe(0);
    expect(text).toContain('GOOGLE_API_KEY: empty');
  });

  it('refuses to write over either file without --force, and writes nothing then', () => {
    const { legacy, out } = folders();
    writeFileSync(path.join(out, ENV_FRAGMENT), 'mine\n');
    const refused = run({ legacy, out });
    expect(refused.status).toBe(1);
    expect(refused.text).toMatch(/already exists/);
    expect(readFileSync(path.join(out, ENV_FRAGMENT), 'utf8')).toBe('mine\n');
    expect(() => statSync(path.join(out, SETTINGS_FILE))).toThrow();

    const forced = run({ legacy, out, force: true });
    expect(forced.status).toBe(0);
    expect(fragmentValues(path.join(out, ENV_FRAGMENT)).DB_SCHEMA).toBe('pine');
  });

  it('writes the settings alone where the private settings are missing', () => {
    const { legacy, out } = folders(false);
    const { status, text } = run({ legacy, out });
    expect(status).toBe(0);
    expect(loadSettings(path.join(out, SETTINGS_FILE)).timezone).toBe('America/New_York');
    expect(() => statSync(path.join(out, ENV_FRAGMENT))).toThrow();
    expect(text).toMatch(/no private-settings\.json/);
  });

  it('reads a legacy file that starts with a byte order mark, as the legacy bot did', () => {
    const { legacy, out } = folders();
    const file = path.join(legacy, 'settings.json');
    writeFileSync(file, `${String.fromCharCode(0xfeff)}${readFileSync(file, 'utf8')}`);
    expect(run({ legacy, out }).status).toBe(0);
  });

  it('writes nothing when one of the files cannot be written, not even the other', () => {
    const { legacy, out } = folders();
    // A folder where the fragment goes: it cannot be written over.
    mkdirSync(path.join(out, ENV_FRAGMENT));
    const { status, text } = run({ legacy, out, force: true });
    expect(status).toBe(1);
    expect(text).toMatch(/could not be written/);
    expect(() => statSync(path.join(out, SETTINGS_FILE))).toThrow();
  });

  it('says which file was written when the second cannot be, rather than "nothing"', () => {
    const { legacy, out } = folders();
    // A folder with a file in it where the settings go: the fragment goes first, then this fails.
    mkdirSync(path.join(out, SETTINGS_FILE));
    writeFileSync(path.join(out, SETTINGS_FILE, 'keep'), 'x');
    const { status, text } = run({ legacy, out, force: true });
    expect(status).toBe(1);
    expect(text).not.toMatch(/nothing was written/);
    expect(text).toMatch(/env-from-legacy\.txt was written, .*pine-settings\.json was not\./);
    expect(fragmentValues(path.join(out, ENV_FRAGMENT)).DB_SCHEMA).toBe('pine');
  });

  it('leaves no older fragment beside settings converted without private settings', () => {
    const { legacy, out } = folders(false);
    writeFileSync(path.join(out, ENV_FRAGMENT), 'DB_SCHEMA=elsewhere\n');
    const refused = run({ legacy, out });
    expect(refused.status).toBe(1);
    expect(refused.text).toMatch(/already exists/);
    const forced = run({ legacy, out, force: true });
    expect(forced.status).toBe(0);
    expect(() => statSync(path.join(out, ENV_FRAGMENT))).toThrow();
    expect(forced.text).toMatch(/Removed the older .*env-from-legacy\.txt/);
  });

  it('refuses a folder without a settings.json', () => {
    const { out } = folders();
    const { status, text } = run({ legacy: out, out });
    expect(status).toBe(1);
    expect(text).toMatch(/settings\.json/);
  });
});
