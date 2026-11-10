import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
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

/** A dump as mysqldump writes one of Pine's database, with `statements` before its last line. */
function dumpText(statements: readonly string[] = []): string {
  const lines = [
    '-- MySQL dump 10.13  Distrib 9.7.0, for Linux (aarch64)',
    '/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;',
    'DROP TABLE IF EXISTS `EventPost`;',
    // Names and values that hold the words of a stored program, in a table's definition.
    'CREATE TABLE `EventPost` (',
    '  `id` int NOT NULL AUTO_INCREMENT,',
    '  `createdAt` bigint NOT NULL,',
    "  `kind` enum('create','event','trigger') NOT NULL,",
    '  `function` varchar(64) DEFAULT NULL,',
    '  PRIMARY KEY (`id`)',
    ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;',
    'LOCK TABLES `EventPost` WRITE;',
    // What a member wrote is a row, not a statement, whatever it says.
    'INSERT INTO `EventPost` VALUES ' +
      "(1,1700000000000,'create','CREATE DEFINER=`root`@`%` TRIGGER t; DEFINER=x')," +
      "(2,1700000000001,'event','CREATE EVENT e ON SCHEDULE EVERY 1 DAY');",
    'UNLOCK TABLES;',
    '--',
    "-- Dumping events for database 'pine'",
    '--',
    '--',
    "-- Dumping routines for database 'pine'",
    '--',
    ...statements,
    '-- Dump completed on 2026-11-10  3:30:07',
  ];
  return `${lines.join('\n')}\n`;
}

/** The statements with which mysqldump writes a stored program, and a view's definer. */
const STORED_PROGRAMS: Record<string, string> = {
  trigger:
    '/*!50003 CREATE*/ /*!50017 DEFINER=`pine`@`%`*/ /*!50003 TRIGGER `gym_audit` AFTER UPDATE ' +
    'ON `Gym` FOR EACH ROW set @changed = 1 */;;',
  'trigger-no-definer':
    '/*!50003 CREATE*/ /*!50003 TRIGGER `gym_audit` AFTER UPDATE ON `Gym` FOR EACH ROW set @changed = 1 */;;',
  procedure: 'CREATE DEFINER=`pine`@`%` PROCEDURE `sweep`()',
  'procedure-no-definer': 'CREATE PROCEDURE `sweep`()',
  function: 'CREATE FUNCTION `answer`() RETURNS int',
  event:
    '/*!50106 CREATE*/ /*!50117 DEFINER=`pine`@`%`*/ /*!50106 EVENT `nightly` ON SCHEDULE ' +
    'EVERY 1 DAY DO delete from Gym */ ;;',
  'event-no-definer':
    '/*!50106 CREATE*/ /*!50106 EVENT `nightly` ON SCHEDULE EVERY 1 DAY DO delete from Gym */ ;;',
  view: '/*!50013 DEFINER=`pine`@`%` SQL SECURITY DEFINER */',
  'by-hand': 'create trigger gym_audit before insert on Gym for each row set @changed = 1;',
};

// A restore runs the dump's SQL as MySQL's root. Pine's database has no trigger, routine or
// event, and the bot's account could have put one there, so a dump that holds one is not loaded.
describe('the dump check of ./pine restore', () => {
  it('passes a dump of tables and rows, whatever the rows say, plain or gzipped', (context) => {
    const dir = folder();
    const plain = path.join(dir, 'pine-backup-20261110.sql');
    const zipped = path.join(dir, 'pine-backup-20261110.sql.gz');
    writeFileSync(plain, dumpText());
    writeFileSync(zipped, gzipSync(dumpText()));
    const run = runPineScript(
      ['for dump in "$@"; do', '  (check_dump "$dump") 2>&1 && echo "passed"', 'done', 'true'].join(
        '\n',
      ),
      {},
      [plain, zipped],
    );
    if (!run) return context.skip('no sh here');

    expect(run.stdout).not.toContain('pine:');
    expect(run.stdout.split(/\r?\n/).filter((line) => line === 'passed')).toHaveLength(2);
  });

  it('refuses a dump that holds a trigger, a routine, an event or a definer, and says how to load it all the same', (context) => {
    const dir = folder();
    const dumps = Object.entries(STORED_PROGRAMS).map(([name, statement], index) => {
      // Every other one gzipped: both are read.
      const file = path.join(dir, index % 2 === 0 ? `${name}.sql` : `${name}.sql.gz`);
      const text = dumpText(['DELIMITER ;;', statement, 'DELIMITER ;']);
      writeFileSync(file, index % 2 === 0 ? text : gzipSync(text));
      return file;
    });
    const run = runPineScript(
      [
        'for dump in "$@"; do',
        '  (check_dump "$dump") 2>&1 && echo "passed: $dump"',
        'done',
        'true',
      ].join('\n'),
      {},
      dumps,
    );
    if (!run) return context.skip('no sh here');

    expect(run.stdout).not.toContain('passed:');
    const refusals = run.stdout.split(/\r?\n/).filter((line) => line.startsWith('pine: '));
    expect(refusals).toHaveLength(dumps.length);
    for (const refusal of refusals) {
      expect(refusal).toMatch(
        /holds a stored program \(a trigger, a routine or an event\) or a definer, which no dump of Professor Pine's database has: /,
      );
      expect(refusal).toMatch(/'\.\/pine restore <dump> --allow-programs' loads it as it is\.$/);
    }
    // The statement found is shown, so that the operator can judge it.
    expect(refusals[0]).toContain('trigger `gym_audit` after update');
  });

  it('loads such a dump when the operator allows its stored programs', (context) => {
    const dir = folder();
    const dump = path.join(dir, 'with-trigger.sql');
    writeFileSync(dump, dumpText([STORED_PROGRAMS.trigger ?? '']));
    const run = runPineScript('(check_dump "$1" yes) 2>&1 && echo "passed"\ntrue', {}, [dump]);
    if (!run) return context.skip('no sh here');

    expect(run.stdout).toContain('passed');
    expect(run.stdout).not.toContain('pine:');
  });

  it('still refuses a dump that was cut off', (context) => {
    const dir = folder();
    const dump = path.join(dir, 'cut.sql');
    writeFileSync(dump, dumpText().replace(/-- Dump completed.*\n$/, ''));
    const run = runPineScript('(check_dump "$1") 2>&1 && echo "passed"\ntrue', {}, [dump]);
    if (!run) return context.skip('no sh here');

    expect(run.stdout).toContain("does not end with mysqldump's '-- Dump completed' line");
    expect(run.stdout).not.toContain('passed');
  });
});
