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

// The env file holds the bot's token and the database's passwords: for its owner alone.
describe('the env file of ./pine', () => {
  const WARNING = /pine: .+stack\.env can be read by other accounts of this machine/;

  // Which files others may read is the machine's to say (`find -perm`): here it is told what to
  // answer, so that the warning's own rules are tested on every machine.
  it('is warned of, with the command that mends it, when others may read it', (context) => {
    const file = envFile(['DB_SCHEMA=pine']);
    const run = runPineScript(
      [
        'uname() { echo Linux; }',
        'find() { printf "%s\\n" "$1"; }',
        'warn_env_mode 2>&1',
        'echo "status: $?"',
      ].join('\n'),
      { PINE_ENV_FILE: file },
    );
    if (!run) return context.skip('no sh here');

    expect(run.stdout).toMatch(WARNING);
    expect(run.stdout).toContain(
      "it holds the bot's token and the database's passwords. Make it yours alone: chmod 600 ",
    );
    // A warning: the command goes on.
    expect(run.stdout).toContain('status: 0');
  });

  it('is not warned of when it is its owner’s alone, nor in Git Bash, whose modes say nothing', (context) => {
    const file = envFile(['DB_SCHEMA=pine']);
    const run = runPineScript(
      [
        'uname() { echo Linux; }',
        'find() { :; }',
        'warn_env_mode 2>&1; echo "alone: $?"',
        // Windows keeps no such modes: every file there looks readable by all, and chmod mends nothing.
        'find() { printf "%s\\n" "$1"; }',
        'uname() { echo MINGW64_NT-10.0-26300; }',
        'warn_env_mode 2>&1; echo "git bash: $?"',
      ].join('\n'),
      { PINE_ENV_FILE: file },
    );
    if (!run) return context.skip('no sh here');

    expect(run.stdout).not.toMatch(WARNING);
    expect(run.stdout).toContain('alone: 0');
    expect(run.stdout).toContain('git bash: 0');
  });

  // The real modes, where the machine keeps them (Linux and macOS: the hosts).
  it.skipIf(process.platform === 'win32')(
    'is read by its real mode: 644 is warned of, 600 is not',
    (context) => {
      const file = envFile(['DB_SCHEMA=pine']);
      const run = runPineScript(
        [
          'chmod 644 "$PINE_ENV_FILE"; warn_env_mode 2>&1; echo "after 644"',
          'chmod 640 "$PINE_ENV_FILE"; warn_env_mode 2>&1; echo "after 640"',
          'chmod 600 "$PINE_ENV_FILE"; warn_env_mode 2>&1; echo "after 600"',
        ].join('\n'),
        { PINE_ENV_FILE: file },
      );
      if (!run) return context.skip('no sh here');

      const [open, group, alone] = run.stdout.split(/after 6\d\d\r?\n/);
      expect(open).toMatch(WARNING);
      expect(group).toMatch(WARNING);
      expect(alone).toBe('');
    },
  );
});

// compose.yaml binds BACKUP_DIR (blank: ./backups) into the backup service with the long syntax,
// whose missing source Docker Engine refuses (Docker Desktop and OrbStack make it): the whole
// stack would not start.
describe('the backup folder of ./pine', () => {
  /** make_backup_dir in a scratch folder (as the checkout), with this env file. */
  function makeIn(lines: readonly string[], before = '') {
    const dir = folder();
    return {
      dir,
      run: runPineScript(
        [
          'cd "$1"',
          before,
          'make_backup_dir 2>&1',
          'echo "status: $?"',
          'if [ -d backups ]; then echo "made: backups"; fi',
          'if [ -d share ]; then echo "made: share"; fi',
        ].join('\n'),
        { PINE_ENV_FILE: envFile(lines) },
        [dir],
      ),
    };
  }

  it('is made as ./backups when BACKUP_DIR is blank and it is missing', (context) => {
    const { run } = makeIn(['DB_SCHEMA=pine', 'BACKUP_DIR=']);
    if (!run) return context.skip('no sh here');

    expect(run.stdout).toContain('made: backups');
    expect(run.stdout).not.toContain('pine:');
    expect(run.stdout).toContain('status: 0');
  });

  it('is left as it is when BACKUP_DIR is blank and ./backups is there', (context) => {
    const { run } = makeIn(['BACKUP_DIR='], 'mkdir backups && echo kept >backups/.pine-backups');
    if (!run) return context.skip('no sh here');

    expect(run.stdout).toContain('made: backups');
    expect(run.stdout).not.toContain('pine:');
    expect(run.stdout).toContain('status: 0');
  });

  // The folder of real backups is the operator's (a share mounted there, with its .pine-backups
  // file made by hand): never made here, where a share that is not mounted would pass for it.
  it('is not made when BACKUP_DIR names a folder that is missing: the operator is told', (context) => {
    const { run } = makeIn(['BACKUP_DIR=./share']);
    if (!run) return context.skip('no sh here');

    expect(run.stdout).not.toContain('made:');
    expect(run.stdout).toMatch(
      /pine: BACKUP_DIR in .+stack\.env names \.\/share, which does not exist: mount the backup share there, or make the folder with its \.pine-backups file \(operations\.md, "Backups"\); Docker Engine starts no part of the stack without it\./,
    );
    // A warning: the command goes on (down, logs, status need no backup folder).
    expect(run.stdout).toContain('status: 0');
  });
});

// The bot runs as the image's user node (uid 1000) and reads pine-settings.json through a
// read-only bind mount. On Docker Engine a file of mode 600 owned by another uid is unreadable to
// it (the bot crash-loops with "not valid JSON: EACCES"); on Docker Desktop and OrbStack the same
// file reads fine, so the host's modes only hint and the bot's own image, user and mount decide.
describe('the settings file of ./pine', () => {
  /**
   * check_settings_readable against a faked find (the host's hint) and a faked Docker: `images`
   * is what `config --images` lists ('' none), `here` whether they are built, `verdict` what the
   * run in the bot's container says (`fail` when Docker refuses the run).
   */
  function checkWith(options: {
    hinted: boolean;
    here?: boolean;
    verdict?: 'readable' | 'unreadable' | 'fail';
  }) {
    const { hinted, here = true, verdict = 'readable' } = options;
    return runPineScript(
      [
        `find() { ${hinted ? 'printf "%s\\n" "$1"' : ':'}; }`,
        'docker() {',
        '  case "$*" in',
        '    *"config --images pine") echo professor-pine:pine ;;',
        `    "image inspect"*) ${here ? ':' : 'return 1'} ;;`,
        `    *"run --rm"*) echo "ran in the bot's container" >>"$RAN"; ${verdict === 'fail' ? 'return 125' : `echo ${verdict}`} ;;`,
        '  esac',
        '}',
        // A refusal ends the subshell alone (the script runs under set -e).
        'status=0',
        '(check_settings_readable) 2>&1 || status=$?',
        'cat "$RAN" 2>/dev/null || true',
        'echo "status: $status"',
      ].join('\n'),
      {
        PINE_ENV_FILE: envFile(['DB_SCHEMA=pine']),
        PINE_SETTINGS: './pine-settings.json',
        RAN: path.join(folder(), 'ran'),
      },
    );
  }

  const REFUSAL =
    /pine: the bot \(user node in its container\) cannot read \.\/pine-settings\.json: let others read it \(chmod 644 \.\/pine-settings\.json; it holds no secrets, those are in .+stack\.env\)\. Nothing was started\./;
  const NOT_CHECKED =
    "pine: the bot (user node in its container) may not be able to read ./pine-settings.json; if it cannot, its log says 'not valid JSON: EACCES' (./pine logs pine): chmod 644 ./pine-settings.json mends it.";

  it('refuses to start the bot when the bot’s own container cannot read it', (context) => {
    const run = checkWith({ hinted: true, verdict: 'unreadable' });
    if (!run) return context.skip('no sh here');

    expect(run.stdout).toMatch(REFUSAL);
    expect(run.stdout).toContain('status: 1');
  });

  // Docker Desktop and OrbStack: a 600 file reads fine in the container.
  it('passes a file the host’s modes hint at when the bot’s container reads it', (context) => {
    const run = checkWith({ hinted: true, verdict: 'readable' });
    if (!run) return context.skip('no sh here');

    expect(run.stdout).toContain("ran in the bot's container");
    expect(run.stdout).not.toContain('pine:');
    expect(run.stdout).toContain('status: 0');
  });

  it('asks no container of a file that others or uid 1000 may read', (context) => {
    const run = checkWith({ hinted: false, verdict: 'unreadable' });
    if (!run) return context.skip('no sh here');

    expect(run.stdout).not.toContain("ran in the bot's container");
    expect(run.stdout).not.toContain('pine:');
    expect(run.stdout).toContain('status: 0');
  });

  // A check never builds or pulls an image; nor does a refused run stop the command.
  it('only warns where it cannot check: no image yet, or Docker refused the run', (context) => {
    for (const run of [
      checkWith({ hinted: true, here: false, verdict: 'unreadable' }),
      checkWith({ hinted: true, verdict: 'fail' }),
    ]) {
      if (!run) return context.skip('no sh here');

      expect(run.stdout).toContain(NOT_CHECKED);
      expect(run.stdout).toContain('status: 0');
    }
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
  // Spellings of a dump written by hand: a tab, a statement over lines.
  'by-hand-tab': 'CREATE\tTRIGGER gym_audit BEFORE INSERT ON Gym FOR EACH ROW SET @changed = 1;',
  'by-hand-indented': '\tcreate procedure sweep() delete from Gym;',
  'by-hand-create-alone':
    'CREATE\nTRIGGER gym_audit BEFORE INSERT ON Gym FOR EACH ROW SET @changed = 1;',
  'by-hand-name-below':
    'CREATE TRIGGER\ngym_audit BEFORE INSERT ON Gym FOR EACH ROW SET @changed = 1;',
};

// A restore runs the dump's SQL as MySQL's root. Pine's database has no trigger, routine or
// event, and the bot's account could have put one there, so a dump that holds one is not loaded.
describe('the dump check of ./pine restore', () => {
  it('passes a dump of tables and rows, whatever the rows say, plain or gzipped', (context) => {
    const dir = folder();
    const plain = path.join(dir, 'pine-backup-20261110.sql');
    const zipped = path.join(dir, 'pine-backup-20261110.sql.gz');
    // Copied through Windows: every line ends with a carriage return.
    const crlf = path.join(dir, 'pine-backup-20261110-crlf.sql');
    writeFileSync(plain, dumpText());
    writeFileSync(zipped, gzipSync(dumpText()));
    writeFileSync(crlf, dumpText().replaceAll('\n', '\r\n'));
    const run = runPineScript(
      ['for dump in "$@"; do', '  (check_dump "$dump") 2>&1 && echo "passed"', 'done', 'true'].join(
        '\n',
      ),
      {},
      [plain, zipped, crlf],
    );
    if (!run) return context.skip('no sh here');

    expect(run.stdout).not.toContain('pine:');
    expect(run.stdout.split(/\r?\n/).filter((line) => line === 'passed')).toHaveLength(3);
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

// After a pull without './pine up' (a build that failed, a pull by hand), `backup`, `migrate` and
// `restore` make `mysql` anew on the network `db`, while the bot's container from before is
// still on the default network alone: the bot has lost its database until './pine up'.
describe('the database started by ./pine', () => {
  /** start_database against a Docker faked as a shell function: the bot's and MySQL's networks. */
  function startWith(botNetworks: string | undefined) {
    return runPineScript(
      [
        'docker() {',
        '  case "$*" in',
        `    *"ps --quiet --status running pine") ${botNetworks === undefined ? ':' : 'echo bot-1'} ;;`,
        '    *"ps --quiet mysql") echo mysql-1 ;;',
        '    inspect*bot-1) printf "%s\\n" "$BOT_NETWORKS" ;;',
        '    inspect*mysql-1) echo "pine_db " ;;',
        '  esac',
        '}',
        'start_database 2>&1',
        'echo "status: $?"',
      ].join('\n'),
      { BOT_NETWORKS: botNetworks ?? '' },
    );
  }

  const DUE = /The bot runs apart from the database's network .*'\.\/pine up' starts it anew/;

  it('says that ./pine up is due when the running bot is not on the database’s network', (context) => {
    const run = startWith('pine_default ');
    if (!run) return context.skip('no sh here');

    expect(run.stdout).toMatch(DUE);
    // Said, never a refusal: the command goes on.
    expect(run.stdout).toContain('status: 0');
  });

  it('says nothing of a bot that shares its network, or of a bot that is not running', (context) => {
    for (const networks of ['pine_db pine_default ', undefined]) {
      const run = startWith(networks);
      if (!run) return context.skip('no sh here');

      expect(run.stdout).not.toMatch(DUE);
      expect(run.stdout).toContain('status: 0');
    }
  });
});
