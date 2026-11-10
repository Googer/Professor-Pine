import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * `/settings` has no subcommands since plan 8S-5 (one panel): nothing the bot says, and no
 * comment of its code, names one it had (`/settings history`, `/settings leaderboard`, …). The
 * migrations stay as they were written, a record of their time.
 */

const SRC = import.meta.dirname;

/** A subcommand `/settings` had before plan 8S-5, named after the command. */
const FORMER =
  /\/settings (?:show|mentions(?:-groups|-shouts|-train-stops)?|boss-set|new-train|history|leaderboard|auto-status|privacy|pokebattler-id)\b/u;

const sources = readdirSync(SRC, { recursive: true, withFileTypes: true })
  .filter((entry) => entry.isFile())
  .map((entry) => path.relative(SRC, path.join(entry.parentPath, entry.name)).replace(/\\/gu, '/'))
  .filter(
    (file) =>
      file.endsWith('.ts') && !file.endsWith('.test.ts') && !file.startsWith('db/migrations/'),
  );

describe('the words of /settings (plan 8S-5)', () => {
  it('reads every source file of the bot', () => {
    expect(sources.length).toBeGreaterThan(300);
    expect(sources).toContain('commands/settings/settings.ts');
  });

  it('names no subcommand /settings had, anywhere in the bot', () => {
    const named = sources.flatMap((file) =>
      readFileSync(path.join(SRC, file), 'utf8')
        .split('\n')
        .flatMap((line, index) => (FORMER.test(line) ? [`${file}:${String(index + 1)}`] : [])),
    );
    expect(named).toEqual([]);
  });
});
