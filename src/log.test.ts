import { describe, expect, it } from 'vitest';
import { createLogger, loggerFromEnv, REDACT_PATHS } from './log.js';

describe('createLogger', () => {
  it('uses the requested level', () => {
    expect(createLogger({ level: 'warn', pretty: false }).level).toBe('warn');
  });
});

describe('loggerFromEnv', () => {
  it('takes LOG_LEVEL as it is, and info for a level pino does not know', () => {
    expect(loggerFromEnv({ LOG_LEVEL: 'debug' }).level).toBe('debug');
    expect(loggerFromEnv({ LOG_LEVEL: 'loud' }).level).toBe('info');
    expect(loggerFromEnv({}).level).toBe('info');
  });
});

describe('secret redaction', () => {
  function capture() {
    const entries: Array<Record<string, unknown>> = [];
    const log = createLogger(
      { level: 'info', pretty: false },
      { write: (line: string) => entries.push(JSON.parse(line) as Record<string, unknown>) },
    );
    return { log, entries };
  }

  it('redacts secrets logged through the app context shape', () => {
    const { log, entries } = capture();
    log.info(
      { config: { env: { DISCORD_TOKEN: 'abc.def', DB_PASSWORD: 'hunter2', DB_HOST: 'db1' } } },
      'ctx',
    );
    expect(entries[0]?.config).toEqual({
      env: { DISCORD_TOKEN: '[redacted]', DB_PASSWORD: '[redacted]', DB_HOST: 'db1' },
    });
  });

  it('redacts secrets logged as a bare env object or one level down', () => {
    const { log, entries } = capture();
    log.info({ env: { GITHUB_TOKEN: 'ghp_x', GOOGLE_API_KEY: 'AIza' } }, 'env');
    log.info({ DISCORD_TOKEN: 'abc.def' }, 'top');
    log.info({ anything: { DB_PASSWORD: 'hunter2' } }, 'nested');
    expect(entries[0]?.env).toEqual({ GITHUB_TOKEN: '[redacted]', GOOGLE_API_KEY: '[redacted]' });
    expect(entries[1]?.DISCORD_TOKEN).toBe('[redacted]');
    expect(entries[2]?.anything).toEqual({ DB_PASSWORD: '[redacted]' });
  });

  it('redacts secrets logged through the ctx.config.env shape', () => {
    const { log, entries } = capture();
    log.info(
      {
        ctx: {
          config: { env: { DISCORD_TOKEN: 'abc.def', DB_PASSWORD: 'hunter2', DB_HOST: 'db1' } },
        },
      },
      'ctx',
    );
    expect(entries[0]?.ctx).toEqual({
      config: { env: { DISCORD_TOKEN: '[redacted]', DB_PASSWORD: '[redacted]', DB_HOST: 'db1' } },
    });
  });

  it('redacts a password or token copied into a config object under another key', () => {
    const { log, entries } = capture();
    log.info({ db: { host: 'db1', port: 5432, password: 'hunter2' } }, 'db');
    log.info({ password: 'hunter2' }, 'bare password');
    log.info({ token: 'abc.def' }, 'bare token');
    log.info({ login: { token: 'abc.def' } }, 'nested token');
    expect(entries[0]?.db).toEqual({ host: 'db1', port: 5432, password: '[redacted]' });
    expect(entries[1]?.password).toBe('[redacted]');
    expect(entries[2]?.token).toBe('[redacted]');
    expect(entries[3]?.login).toEqual({ token: '[redacted]' });
  });

  it('keeps the address and body of a failed Discord request out of a logged error', () => {
    const { log, entries } = capture();
    const request = {
      url: 'https://discord.com/api/v10/webhooks/1/interaction-token-abc/messages/@original',
      requestBody: { files: [{ name: 'map.png', data: '<image bytes>' }] },
    };
    const err = Object.assign(new Error('Unknown Webhook'), request, { status: 404 });
    log.error({ err }, 'followUp failed');
    log.error(
      { err: new Error('outer', { cause: Object.assign(new Error('inner'), request) }) },
      'wrapped',
    );
    const text = JSON.stringify(entries);
    expect(text).not.toContain('interaction-token-abc');
    expect(text).not.toContain('image bytes');
    expect(entries[0]?.err).toMatchObject({ message: 'Unknown Webhook', status: 404 });
    expect(entries[1]?.err).toMatchObject({ message: 'outer: inner' });
  });

  it('keeps the statement of a failed query out of a logged error, also of its causes', () => {
    const { log, entries } = capture();
    const query = { sql: "select * from `ScriptAccess` where `key` = 'secret-key-abc'" };
    log.error({ err: Object.assign(new Error('Connection lost'), query) }, 'query failed');
    const inner = Object.assign(new Error('inner'), query);
    log.error({ err: new Error('outer', { cause: inner }) }, 'wrapped');
    log.error(
      { err: new Error('outer', { cause: new Error('middle', { cause: inner }) }) },
      'wrapped twice',
    );
    expect(JSON.stringify(entries)).not.toContain('secret-key-abc');
    expect(entries[0]?.err).toMatchObject({ message: 'Connection lost', sql: '[redacted]' });
  });

  it('covers every secret environment variable under every prefix', () => {
    for (const key of [
      'DISCORD_TOKEN',
      'DISCORD_CLIENT_SECRET',
      'DB_PASSWORD',
      'DB_ROOT_PASSWORD',
      'GITHUB_TOKEN',
      'GOOGLE_API_KEY',
      'CLOUDFLARE_TUNNEL_TOKEN',
    ]) {
      for (const prefix of ['', 'env.', 'config.env.', 'ctx.config.env.', '*.']) {
        expect(REDACT_PATHS).toContain(`${prefix}${key}`);
      }
    }
  });
});
