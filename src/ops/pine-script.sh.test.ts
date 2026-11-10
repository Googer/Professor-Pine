import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { runPineScript } from '../../test/support/pine-script.js';

// ./pine, sourced as a library: the checks that read files and need no Docker.

const folder = () => mkdtempSync(path.join(tmpdir(), 'pine-script-'));

/** An env file with these lines, for `PINE_ENV_FILE`. */
function envFile(lines: readonly string[]): string {
  const file = path.join(folder(), 'stack.env');
  writeFileSync(file, `${lines.join('\n')}\n`);
  return file;
}

describe('the DB_SCHEMA of ./pine', () => {
  // The name goes bare onto the mysql client's command line when a dump is loaded.
  it('is refused when it is more than letters, digits, _ and inner hyphens', (context) => {
    const names = ['-pine', 'pine-', '--all-databases', 'pine db', 'pi`ne', 'pine;drop', 'p.d'];
    const run = runPineScript(
      [
        'for name in "$@"; do',
        '  printf "DB_SCHEMA=%s\\n" "$name" >"$PINE_ENV_FILE"',
        '  (check_schema_name) 2>&1 && echo "passed: $name"',
        'done',
        'true',
      ].join('\n'),
      { PINE_ENV_FILE: envFile([]), DB_SCHEMA: '' },
      names,
    );
    if (!run) return context.skip('no sh here');

    expect(run.stdout).not.toContain('passed:');
    for (const name of names) {
      expect(run.stdout).toContain(
        `must be letters, digits, _ and - (a hyphen neither first nor last), not '${name}'`,
      );
    }
    expect(run.stdout).toContain('pine: DB_SCHEMA in ');
  });

  it('passes as the guides write it: quoted, with a comment after it, or left to Compose', (context) => {
    const lines = [
      'DB_SCHEMA=pine',
      'DB_SCHEMA=pine-dev_2',
      "DB_SCHEMA='pine'",
      'DB_SCHEMA="pine"',
      'DB_SCHEMA=pine   # the database',
      'DB_SCHEMA="pine" # the database',
      'DB_SCHEMA=pine\r',
      // Not in the file: Compose says that it must be set, in its own words.
      'DB_USER=pine',
    ];
    const run = runPineScript(
      [
        'for line in "$@"; do',
        '  printf "%s\\n" "$line" >"$PINE_ENV_FILE"',
        '  (check_schema_name) 2>&1 && echo "passed"',
        'done',
        'true',
      ].join('\n'),
      { PINE_ENV_FILE: envFile([]), DB_SCHEMA: '' },
      lines,
    );
    if (!run) return context.skip('no sh here');

    expect(run.stdout.split(/\r?\n/).filter((line) => line !== '')).toEqual(
      lines.map(() => 'passed'),
    );
  });

  // Compose takes a variable of the shell before the env file's.
  it('is the shell’s value before the env file’s', (context) => {
    const run = runPineScript('(check_schema_name) 2>&1 && echo "passed"\ntrue', {
      PINE_ENV_FILE: envFile(['DB_SCHEMA=pine']),
      DB_SCHEMA: 'pine;drop',
    });
    if (!run) return context.skip('no sh here');

    expect(run.stdout).toContain("pine: DB_SCHEMA in the shell's environment must be");
    expect(run.stdout).toContain("not 'pine;drop'");
    expect(run.stdout).not.toContain('passed');
  });
});
