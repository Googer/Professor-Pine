import { describe, expect, it } from 'vitest';
import { TEST_ENV } from '../../test/support/test-env.js';
import { loadEnv } from './env.js';
import { ConfigError } from './errors.js';

describe('loadEnv', () => {
  it('applies defaults to a minimal environment', () => {
    const env = loadEnv(TEST_ENV);
    expect(env.DB_PORT).toBe(3306);
    expect(env.DB_PASSWORD).toBe('');
    expect(env.LOG_LEVEL).toBe('info');
    expect(env.NODE_ENV).toBe('production');
    expect(env.SETTINGS_PATH).toBe('data/settings.json');
  });

  it('treats blank optional values as unset', () => {
    const env = loadEnv({
      ...TEST_ENV,
      GOOGLE_API_KEY: '',
      GITHUB_TOKEN: '',
      GITHUB_REPO: '',
      DB_PORT: '',
    });
    expect(env.GOOGLE_API_KEY).toBeUndefined();
    expect(env.GITHUB_TOKEN).toBeUndefined();
    expect(env.DB_PORT).toBe(3306);
  });

  it('starts without POKEMON_IMAGE_BASE, which nothing reads any more', () => {
    const { POKEMON_IMAGE_BASE: _omit, ...rest } = TEST_ENV;
    expect(loadEnv(rest).POKEMON_IMAGE_BASE).toBeUndefined();
    expect(loadEnv({ ...TEST_ENV, POKEMON_IMAGE_BASE: '' }).POKEMON_IMAGE_BASE).toBeUndefined();
  });

  it('falls back to the defaults for blank LOG_LEVEL and NODE_ENV', () => {
    const env = loadEnv({ ...TEST_ENV, LOG_LEVEL: '', NODE_ENV: '  ' });
    expect(env.LOG_LEVEL).toBe('info');
    expect(env.NODE_ENV).toBe('production');
  });

  it('names a missing required variable', () => {
    const { DISCORD_TOKEN: _omit, ...rest } = TEST_ENV;
    expect(() => loadEnv(rest)).toThrow(ConfigError);
    expect(() => loadEnv(rest)).toThrow(/DISCORD_TOKEN/);
  });

  // The name goes into SQL text and onto mysqldump's command line in the stack's scripts.
  it('takes a DB_SCHEMA of letters, digits, _ and inner hyphens', () => {
    for (const name of ['pine', 'Pine_2', 'pine-dev', 'p', '_pine', 'my-pine--db_2']) {
      expect(loadEnv({ ...TEST_ENV, DB_SCHEMA: name }).DB_SCHEMA).toBe(name);
    }
  });

  it.each([
    '-pine',
    'pine-',
    '--all-databases',
    'pine db',
    'pi`ne',
    "pine'",
    'pine;drop',
    'pine.dev',
    'piñe',
    'pine\n',
  ])('refuses the DB_SCHEMA %j, and says what a name may be', (name) => {
    expect(() => loadEnv({ ...TEST_ENV, DB_SCHEMA: name })).toThrow(
      /letters, digits, _ and -[^]*DB_SCHEMA/,
    );
  });

  it('rejects a non-snowflake OWNER_ID', () => {
    expect(() => loadEnv({ ...TEST_ENV, OWNER_ID: 'matt' })).toThrow(/OWNER_ID/);
  });

  it('reads the secrets of the web pages, blank as unset', () => {
    const none = loadEnv(TEST_ENV);
    expect(none.DISCORD_CLIENT_SECRET).toBeUndefined();
    expect(none.GOOGLE_MAPS_BROWSER_KEY).toBeUndefined();
    const blank = loadEnv({ ...TEST_ENV, DISCORD_CLIENT_SECRET: ' ', GOOGLE_MAPS_BROWSER_KEY: '' });
    expect(blank.DISCORD_CLIENT_SECRET).toBeUndefined();
    expect(blank.GOOGLE_MAPS_BROWSER_KEY).toBeUndefined();
    const set = loadEnv({
      ...TEST_ENV,
      DISCORD_CLIENT_SECRET: 'client-secret',
      GOOGLE_MAPS_BROWSER_KEY: 'browser-key',
    });
    expect(set.DISCORD_CLIENT_SECRET).toBe('client-secret');
    expect(set.GOOGLE_MAPS_BROWSER_KEY).toBe('browser-key');
  });

  it('requires GITHUB_TOKEN and GITHUB_REPO together', () => {
    expect(() => loadEnv({ ...TEST_ENV, GITHUB_TOKEN: 'ghp_x' })).toThrow(/GITHUB_REPO/);
    const env = loadEnv({ ...TEST_ENV, GITHUB_TOKEN: 'ghp_x', GITHUB_REPO: 'Googer/PgP-Data' });
    expect(env.GITHUB_REPO).toBe('Googer/PgP-Data');
  });
});
