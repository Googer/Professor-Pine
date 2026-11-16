import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ScriptRun } from '../../test/support/backup-script.js';
import { hostScene, runHostScript, type HostScene } from '../../test/support/host-scripts.js';

// scripts/host/offsite-setup.sh, run whole on a host of its own with its answers on standard
// input (no terminal, so nothing to keep from echoing): rclone is a fake on the PATH.

const ACCOUNT = '0123456789abcdef0123456789abcdef';
const KEY_ID = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';
const SECRET = '9f8e7d6c5b4a39281706f5e4d3c2b1a09f8e7d6c5b4a39281706f5e4d3c2b1a0';
const RECIPIENT = 'age1qyqszqgpqyqszqgpqyqszqgpqyqszqgpqyqszqgpqyqszqgpqyqs3290gq';

type Answer = 'account' | 'bucket' | 'key' | 'secret' | 'recipient' | 'folder';

const answers = (overrides: Partial<Record<Answer, string>> = {}) =>
  [
    overrides.account ?? ACCOUNT,
    overrides.bucket ?? 'pine-backups',
    overrides.key ?? KEY_ID,
    overrides.secret ?? SECRET,
    overrides.recipient ?? RECIPIENT,
    overrides.folder ?? '',
    '',
  ].join('\n');

const rcloneConf = (scene: HostScene) => path.join(scene.home, '.config', 'rclone', 'rclone.conf');
const settings = (scene: HostScene) => path.join(scene.home, '.config', 'pine-offsite', 'config');

/** Neither the secret nor the key id (nor what was typed in their place) is ever shown. */
function showsNoSecret(run: ScriptRun, typed: readonly string[] = []) {
  for (const secret of [SECRET, KEY_ID, ...typed]) {
    expect(run.stdout).not.toContain(secret);
    expect(run.stderr).not.toContain(secret);
  }
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('scripts/host/offsite-setup.sh', () => {
  it('writes rclone’s remote pine-offsite for R2 and the upload’s settings, then checks the bucket', (context) => {
    const scene = hostScene();
    const run = runHostScript(scene, 'offsite-setup.sh', {}, answers());
    if (!run) return context.skip('no sh here');

    expect(run.stderr).toBe('');
    expect(run.status).toBe(0);
    expect(readFileSync(rcloneConf(scene), 'utf8')).toBe(
      [
        '[pine-offsite]',
        'type = s3',
        'provider = Cloudflare',
        `access_key_id = ${KEY_ID}`,
        `secret_access_key = ${SECRET}`,
        `endpoint = https://${ACCOUNT}.r2.cloudflarestorage.com`,
        'acl = private',
        'no_check_bucket = true',
        'no_head = true',
        '',
      ].join('\n'),
    );
    const lines = readFileSync(settings(scene), 'utf8').split('\n');
    expect(lines).toContain('remote=pine-offsite:pine-backups');
    expect(lines).toContain(`recipient=${RECIPIENT}`);
    expect(lines.find((line) => line.startsWith('backups='))).toMatch(/\/home\/pine-backups$/);
    expect(lines.find((line) => line.startsWith('checkout='))).toMatch(/\/checkout$/);
    expect(readFileSync(scene.calls, 'utf8')).toContain('rclone lsf pine-offsite:pine-backups');
    expect(run.stdout).toContain('Saved, and the bucket answers.');
    showsNoSecret(run);
  });

  it('replaces a remote pine-offsite written before, and keeps the other remotes', (context) => {
    const scene = hostScene();
    mkdirSync(path.dirname(rcloneConf(scene)), { recursive: true });
    writeFileSync(
      rcloneConf(scene),
      [
        '[nas]',
        'type = sftp',
        'host = nas.local',
        '',
        '[pine-offsite]',
        'type = s3',
        'access_key_id = old',
        '',
        '[other]',
        'type = local',
        '',
      ].join('\n'),
    );
    const run = runHostScript(scene, 'offsite-setup.sh', {}, answers({ folder: '/srv/backups' }));
    if (!run) return context.skip('no sh here');

    expect(run.status).toBe(0);
    const conf = readFileSync(rcloneConf(scene), 'utf8');
    expect(conf).not.toContain('access_key_id = old');
    expect(conf.match(/^\[pine-offsite\]$/gm)).toHaveLength(1);
    expect(conf).toContain('[nas]\ntype = sftp\nhost = nas.local\n');
    expect(conf).toContain('[other]\ntype = local\n');
    expect(conf).toContain(`access_key_id = ${KEY_ID}`);
    expect(readFileSync(settings(scene), 'utf8').split('\n')).toContain('backups=/srv/backups');
    showsNoSecret(run);
  });

  // A developer's RCLONE_CONFIG (their own remotes) never reaches the script under test.
  it('writes into the scene’s home whatever RCLONE_CONFIG the test runner has', (context) => {
    const own = path.join(mkdtempSync(path.join(tmpdir(), 'pine-own-rclone-')), 'rclone.conf');
    writeFileSync(own, '[mine]\ntype = local\n');
    vi.stubEnv('RCLONE_CONFIG', own);
    const scene = hostScene();
    const run = runHostScript(scene, 'offsite-setup.sh', {}, answers());
    if (!run) return context.skip('no sh here');

    expect(run.status).toBe(0);
    expect(readFileSync(own, 'utf8')).toBe('[mine]\ntype = local\n');
    expect(readFileSync(rcloneConf(scene), 'utf8')).toContain('[pine-offsite]');
  });

  it('refuses an answer that is not what Cloudflare or age gives, and writes nothing', (context) => {
    const cases: [Partial<Record<Answer, string>>, string][] = [
      [{ account: 'not-an-account' }, 'The account id is 32 letters and digits'],
      [
        { bucket: 'Pine Backups' },
        'A bucket name is 3 to 63 lowercase letters, digits and hyphens',
      ],
      [
        { key: 'a1b2c3d4e5f6$718293a4b5c6d7e8f90' },
        'The Access Key ID and the Secret Access Key are letters and digits',
      ],
      [
        { secret: '9f8e7d6c5b4a3928 1706f5e4d3c2b1a0' },
        'The Access Key ID and the Secret Access Key are letters and digits',
      ],
      [
        { recipient: 'AGE-SECRET-KEY-1QYQSZQGPQYQSZQGPQYQSZQGPQYQSZQGPQYQSZQGPQYQSZQGPQYQS' },
        "The public key starts with age1: the line 'Public key: age1...' that age-keygen prints, never the private key",
      ],
    ];
    for (const [wrong, said] of cases) {
      const scene = hostScene();
      const run = runHostScript(scene, 'offsite-setup.sh', {}, answers(wrong));
      if (!run) return context.skip('no sh here');

      expect(run.status).toBe(1);
      expect(run.stderr).toContain(said);
      expect(run.stderr).toContain('Nothing was written.');
      expect(existsSync(rcloneConf(scene))).toBe(false);
      expect(existsSync(settings(scene))).toBe(false);
      // What was typed for a secret, right or wrong, is not shown back either.
      showsNoSecret(
        run,
        [wrong.key, wrong.secret, wrong.recipient].filter((typed) => typed !== undefined),
      );
    }
  });

  it('says what to check when the bucket does not answer, and fails', (context) => {
    const scene = hostScene();
    const run = runHostScript(scene, 'offsite-setup.sh', { FAKE_RCLONE_FAIL: 'lsf' }, answers());
    if (!run) return context.skip('no sh here');

    expect(run.status).toBe(1);
    expect(run.stderr).toContain(
      'Saved, but the bucket pine-backups did not answer: check the account id, and that the token has Object Read & Write on pine-backups, then run this again.',
    );
    showsNoSecret(run);
  });
});
