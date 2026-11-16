import {
  chmodSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  hostScene,
  installedHere,
  runHostScript,
  shPath,
  type HostScene,
} from '../../test/support/host-scripts.js';

// scripts/host/offsite-upload.sh, run whole on a host of its own: rclone, age and the checkout's
// ./pine are fakes on the PATH (test/support/host-scripts.ts). The dumps are named as
// docker/backup.sh names them: the nightly (and `./pine backup`) pine-backup-YYYYMMDD.sql.gz, a
// tagged one pine-backup-YYYYMMDD-HHMMSS-<tag>.sql.gz.

const RECIPIENT = 'age1qyqszqgpqyqszqgpqyqszqgpqyqszqgpqyqszqgpqyqszqgpqyqs3290gq';
const HOUR = 3_600_000;
const FAILED = "The upload of Pine's backups off this host failed: ";
const MORE = ' Its log on the host says more.';

/** A scene with its settings written, and dumps of these ages in hours. */
function sceneWith(
  dumps: Record<string, number>,
  settings: Record<string, string> = {},
  options: { without?: readonly string[] } = {},
) {
  const scene = hostScene(options);
  const config = path.join(scene.home, '.config', 'pine-offsite');
  mkdirSync(config, { recursive: true });
  const lines = {
    remote: 'pine-offsite:pine-backups',
    recipient: RECIPIENT,
    backups: shPath(scene.backups),
    ...settings,
  };
  writeFileSync(
    path.join(config, 'config'),
    Object.entries(lines)
      .map(([key, value]) => `${key}=${value}`)
      .join('\n') + '\n',
  );
  for (const [name, hours] of Object.entries(dumps)) {
    const file = path.join(scene.backups, name);
    writeFileSync(file, `dump ${name}\n`);
    const at = new Date(Date.now() - hours * HOUR);
    utimesSync(file, at, at);
  }
  return scene;
}

const told = (scene: HostScene): string[] =>
  existsSync(scene.told)
    ? readFileSync(scene.told, 'utf8')
        .split(/\r?\n/)
        .filter((line) => line !== '')
    : [];

/**
 * What the fake ./pine was asked to tell, run by run, one argument each; the host's name (that of
 * the machine running the test) as "this host".
 */
const tellings = (scene: HostScene): string[] =>
  told(scene).map((line) => {
    const [command, text, ...rest] = line.split('|');
    expect(command).toBe('tell-owner');
    expect(rest).toEqual(['']);
    return (text ?? '').replace(
      /^(The upload of Pine's backups off )\S+ failed/,
      '$1this host failed',
    );
  });

/** The encrypted copies a run left in the home: none, whatever happened. */
const leftOver = (scene: HostScene) =>
  readdirSync(scene.home).filter((name) => name.startsWith('.pine-offsite'));

describe('scripts/host/offsite-upload.sh', () => {
  it('uploads each dump of the last two days the bucket lacks, encrypted for the key, a line each', (context) => {
    const scene = sceneWith({
      'pine-backup-20261116.sql.gz': 5,
      'pine-backup-20261115.sql.gz': 29,
      'pine-backup-20261115-120000-before-update.sql.gz': 20,
      'pine-backup-20261113.sql.gz': 77,
      'notes.txt': 1,
    });
    writeFileSync(path.join(scene.bucket, 'pine-backup-20261115.sql.gz.age'), 'kept');
    const run = runHostScript(scene, 'offsite-upload.sh');
    if (!run) return context.skip('no sh here');

    expect(run.stderr).toBe('');
    expect(run.status).toBe(0);
    expect(readdirSync(scene.bucket).sort()).toEqual([
      'pine-backup-20261115-120000-before-update.sql.gz.age',
      'pine-backup-20261115.sql.gz.age',
      'pine-backup-20261116.sql.gz.age',
    ]);
    expect(readFileSync(path.join(scene.bucket, 'pine-backup-20261116.sql.gz.age'), 'utf8')).toBe(
      `age for ${RECIPIENT}\ndump pine-backup-20261116.sql.gz\n`,
    );
    // The one already there is left as it is.
    expect(readFileSync(path.join(scene.bucket, 'pine-backup-20261115.sql.gz.age'), 'utf8')).toBe(
      'kept',
    );
    const lines = run.stdout.split(/\r?\n/).filter((line) => line !== '');
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatch(
      /^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d uploaded pine-backup-20261115-120000-before-update\.sql\.gz\.age$/,
    );
    expect(lines[1]).toMatch(/ uploaded pine-backup-20261116\.sql\.gz\.age$/);
    expect(told(scene)).toEqual([]);
    expect(leftOver(scene)).toEqual([]);
  });

  it('says that there is nothing new when the bucket has every recent dump, and tells nobody', (context) => {
    const scene = sceneWith({ 'pine-backup-20261116.sql.gz': 5 });
    writeFileSync(path.join(scene.bucket, 'pine-backup-20261116.sql.gz.age'), 'kept');
    const run = runHostScript(scene, 'offsite-upload.sh');
    if (!run) return context.skip('no sh here');

    expect(run.status).toBe(0);
    expect(run.stdout).toMatch(/ nothing new: the bucket has every dump of the last two days\n$/);
    expect(told(scene)).toEqual([]);
  });

  it('goes on past a failed upload, then tells the owner once which failed, and fails', (context) => {
    const scene = sceneWith({
      'pine-backup-20261116.sql.gz': 5,
      'pine-backup-20261115.sql.gz': 29,
      'pine-backup-20261115-120000-before-update.sql.gz': 20,
    });
    const run = runHostScript(scene, 'offsite-upload.sh', {
      FAKE_RCLONE_FAIL: 'copyto:pine-backup-20261115.sql.gz.age',
      FAKE_AGE_FAIL: 'pine-backup-20261116.sql.gz',
    });
    if (!run) return context.skip('no sh here');

    expect(run.status).toBe(1);
    expect(readdirSync(scene.bucket)).toEqual([
      'pine-backup-20261115-120000-before-update.sql.gz.age',
    ]);
    expect(run.stderr).toContain('FAILED pine-backup-20261115.sql.gz.age');
    expect(run.stderr).toContain('FAILED pine-backup-20261116.sql.gz.age');
    expect(tellings(scene)).toEqual([
      `${FAILED}2 of 3 dumps were not uploaded (pine-backup-20261115.sql.gz, pine-backup-20261116.sql.gz).${MORE}`,
    ]);
    expect(leftOver(scene)).toEqual([]);
  });

  it('tells the owner when the bucket cannot be listed, and uploads nothing', (context) => {
    const scene = sceneWith({ 'pine-backup-20261116.sql.gz': 5 });
    const run = runHostScript(scene, 'offsite-upload.sh', { FAKE_RCLONE_FAIL: 'lsf' });
    if (!run) return context.skip('no sh here');

    expect(run.status).toBe(1);
    expect(readdirSync(scene.bucket)).toEqual([]);
    expect(run.stderr).toContain('the bucket pine-offsite:pine-backups could not be listed');
    expect(tellings(scene)).toEqual([
      `${FAILED}the bucket pine-offsite:pine-backups could not be listed.${MORE}`,
    ]);
  });

  // A dump made before an update or a restore is no nightly backup: it does not hide that the
  // nightly ones stopped.
  it('tells the owner when no nightly dump is newer than 26 hours, after uploading what there is', (context) => {
    const scene = sceneWith({
      'pine-backup-20261115.sql.gz': 30,
      'pine-backup-20261116-120000-before-update.sql.gz': 2,
    });
    const run = runHostScript(scene, 'offsite-upload.sh');
    if (!run) return context.skip('no sh here');

    expect(run.status).toBe(1);
    expect(readdirSync(scene.bucket).sort()).toEqual([
      'pine-backup-20261115.sql.gz.age',
      'pine-backup-20261116-120000-before-update.sql.gz.age',
    ]);
    expect(tellings(scene)).toEqual([
      `${FAILED}no nightly backup in ${shPath(scene.backups)} is newer than 26 hours (has the nightly backup stopped? './pine status' says).${MORE}`,
    ]);
  });

  it('tells the owner of every problem in one message', (context) => {
    const scene = sceneWith({ 'pine-backup-20261115.sql.gz': 30 });
    const run = runHostScript(scene, 'offsite-upload.sh', {
      FAKE_RCLONE_FAIL: 'copyto:pine-backup-20261115.sql.gz.age',
    });
    if (!run) return context.skip('no sh here');

    expect(run.status).toBe(1);
    expect(tellings(scene)).toEqual([
      `${FAILED}no nightly backup in ${shPath(scene.backups)} is newer than 26 hours (has the nightly backup stopped? './pine status' says); 1 of 1 dumps were not uploaded (pine-backup-20261115.sql.gz).${MORE}`,
    ]);
  });

  it('tells the owner when its settings lack what it needs, through the checkout it is in', (context) => {
    const scene = sceneWith({ 'pine-backup-20261116.sql.gz': 5 }, { recipient: '' });
    const run = runHostScript(scene, 'offsite-upload.sh');
    if (!run) return context.skip('no sh here');

    expect(run.status).toBe(1);
    expect(readdirSync(scene.bucket)).toEqual([]);
    // The home as the shell has it (Git Bash's own form of a Windows path).
    const [text, ...more] = tellings(scene);
    expect(more).toEqual([]);
    expect(text).toMatch(
      /^The upload of Pine's backups off this host failed: its settings \(\/.*\/home\/\.config\/pine-offsite\/config\) name no recipient \(the age public key\)\. Its log on the host says more\.$/,
    );
  });

  it('tells the owner when its settings file is missing', (context) => {
    const scene = sceneWith({ 'pine-backup-20261116.sql.gz': 5 });
    rmSync(path.join(scene.home, '.config', 'pine-offsite', 'config'));
    const run = runHostScript(scene, 'offsite-upload.sh');
    if (!run) return context.skip('no sh here');

    expect(run.status).toBe(1);
    expect(readdirSync(scene.bucket)).toEqual([]);
    expect(tellings(scene)[0]).toMatch(
      /failed: its settings \(\/.*\/home\/\.config\/pine-offsite\/config\) are missing: scripts\/host\/offsite-setup\.sh writes them\. /,
    );
  });

  it('tells the owner when a tool it needs is not installed', (context) => {
    if (installedHere('age')) return context.skip('this machine has an age of its own');
    const scene = sceneWith({ 'pine-backup-20261116.sql.gz': 5 }, {}, { without: ['age'] });
    const run = runHostScript(scene, 'offsite-upload.sh');
    if (!run) return context.skip('no sh here');

    expect(run.status).toBe(1);
    expect(readdirSync(scene.bucket)).toEqual([]);
    expect(tellings(scene)).toEqual([`${FAILED}age is not installed.${MORE}`]);
  });

  it('tells the owner when the backup folder is missing', (context) => {
    const scene = sceneWith({}, { backups: shPath(path.join(hostScene().root, 'gone')) });
    const run = runHostScript(scene, 'offsite-upload.sh');
    if (!run) return context.skip('no sh here');

    expect(run.status).toBe(1);
    expect(tellings(scene)[0]).toMatch(
      /^The upload of Pine's backups off this host failed: the backup folder .+\/gone is not there\. /,
    );
  });

  it('tells the owner when the backup folder cannot be read', (context) => {
    const scene = sceneWith({ 'pine-backup-20261116.sql.gz': 5 });
    const run = runHostScript(scene, 'offsite-upload.sh', {}, '', ['find']);
    if (!run) return context.skip('no sh here');

    expect(run.status).toBe(1);
    expect(readdirSync(scene.bucket)).toEqual([]);
    expect(tellings(scene)).toEqual([
      `${FAILED}the backup folder ${shPath(scene.backups)} could not be read.${MORE}`,
    ]);
  });

  it('tells the owner when no temporary file can be made in the home', (context) => {
    const scene = sceneWith({ 'pine-backup-20261116.sql.gz': 5 });
    const run = runHostScript(scene, 'offsite-upload.sh', {}, '', ['mktemp']);
    if (!run) return context.skip('no sh here');

    expect(run.status).toBe(1);
    expect(readdirSync(scene.bucket)).toEqual([]);
    expect(tellings(scene)[0]).toMatch(
      /failed: no temporary file could be made in \/.*\/home \(is the disk full\?\)\. /,
    );
  });

  // The real thing, where the machine keeps modes (Linux and macOS: the hosts).
  it.skipIf(process.platform === 'win32' || process.getuid?.() === 0)(
    'tells the owner when the home cannot be written',
    (context) => {
      const scene = sceneWith({ 'pine-backup-20261116.sql.gz': 5 });
      chmodSync(scene.home, 0o500);
      try {
        const run = runHostScript(scene, 'offsite-upload.sh');
        if (!run) return context.skip('no sh here');

        expect(run.status).toBe(1);
        expect(readdirSync(scene.bucket)).toEqual([]);
        expect(tellings(scene)[0]).toContain('failed: no temporary file could be made in ');
      } finally {
        chmodSync(scene.home, 0o700);
      }
    },
  );

  it('uploads from a backup folder with a blank in its path', (context) => {
    const scene = hostScene();
    const folder = path.join(scene.root, 'my backups');
    mkdirSync(folder);
    writeFileSync(path.join(folder, 'pine-backup-20261116.sql.gz'), 'dump\n');
    mkdirSync(path.join(scene.home, '.config', 'pine-offsite'), { recursive: true });
    writeFileSync(
      path.join(scene.home, '.config', 'pine-offsite', 'config'),
      `remote=pine-offsite:pine-backups\nrecipient=${RECIPIENT}\nbackups=${shPath(folder)}\n`,
    );
    const run = runHostScript(scene, 'offsite-upload.sh');
    if (!run) return context.skip('no sh here');

    expect(run.stderr).toBe('');
    expect(run.status).toBe(0);
    expect(readdirSync(scene.bucket)).toEqual(['pine-backup-20261116.sql.gz.age']);
  });

  it('reads a folder of its settings that starts with ~/ in the home', (context) => {
    const scene = sceneWith({}, { backups: '~/elsewhere' });
    const run = runHostScript(scene, 'offsite-upload.sh');
    if (!run) return context.skip('no sh here');

    expect(tellings(scene)[0]).toMatch(/the backup folder \/.*\/home\/elsewhere is not there\. /);
  });

  // ./pine tell-owner's own lines say why a DM failed (Discord's answer is on its standard output).
  it('leaves what ./pine said in its log when the owner could not be told, and fails', (context) => {
    const scene = sceneWith({ 'pine-backup-20261116.sql.gz': 5 });
    const run = runHostScript(scene, 'offsite-upload.sh', {
      FAKE_RCLONE_FAIL: 'lsf',
      FAKE_PINE_FAIL: 'yes',
    });
    if (!run) return context.skip('no sh here');

    expect(run.status).toBe(1);
    expect(run.stdout).toContain('"msg":"could not alert the owner"');
    expect(run.stdout).toContain('getaddrinfo ENOTFOUND discord.com');
    expect(run.stderr).toContain("The owner could not be told: the log line 'could not alert");
    expect(run.stderr).toContain('the owner could not be told (./pine tell-owner in ');
  });
});
