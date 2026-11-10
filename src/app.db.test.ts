import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { startDatabase, type TestDatabase } from '../test/support/mysql.js';
import { TEST_ENV } from '../test/support/test-env.js';
import { TEST_SETTINGS_PATH } from '../test/support/test-settings.js';
import { startApp } from './app.js';
import { migrations } from './db/migrations/index.js';
import { healthFiles } from './ops/health.js';
import { StartStopped } from './ops/start-stop.js';

let database: TestDatabase | undefined;

afterEach(async () => {
  vi.useRealTimers();
  await database?.stop();
  database = undefined;
});

describe('startApp asked to stop during the start', () => {
  it('finishes the migrations, then stops: the heartbeat ends and the pool is closed', async () => {
    database = await startDatabase({ legacySchema: true });
    const healthDir = path.join(mkdtempSync(path.join(tmpdir(), 'pine-app-')), 'health');
    // The heartbeat's own interval is the one timer this part of the start sets up.
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });

    const starting = startApp(
      {
        ...TEST_ENV,
        DB_HOST: database.config.host,
        DB_PORT: String(database.config.port),
        DB_USER: database.config.user,
        DB_PASSWORD: database.config.password,
        DB_SCHEMA: database.config.database,
        SETTINGS_PATH: TEST_SETTINGS_PATH,
        LOG_LEVEL: 'silent',
      },
      // Asked from the very start: the migrations still run to their end.
      { stopRequested: () => true, healthDir },
    );

    await expect(starting).rejects.toBeInstanceOf(StartStopped);
    const [applied] = await database.query<{ count: number | string }>(
      'select count(*) as count from kysely_migration',
    );
    expect(Number(applied?.count)).toBe(Object.keys(migrations).length);
    expect(existsSync(healthFiles(healthDir).status)).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    // No connection of the bot's pool is left: only this test's own.
    const [others] = await database.query<{ count: number | string }>(
      `select count(*) as count from performance_schema.processlist
       where user = ? and id <> connection_id()`,
      [database.config.user],
    );
    expect(Number(others?.count)).toBe(0);
  });
});
