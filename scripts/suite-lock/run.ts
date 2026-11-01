import { spawn } from 'node:child_process';
import os from 'node:os';
import { lockDir, processAlive, release, tryTake } from './lock.js';

/**
 * `tsx scripts/suite-lock/run.ts <npm script>`: runs `npm run <npm script>` once no other
 * suite of this machine holds the lock (`lock.ts`), and gives the lock back when it ends.
 * A suite started inside a locked one (`check` runs `test:unit`) passes straight through.
 */
const HELD = 'PINE_SUITE_LOCK_HELD';
const WAIT_MS = 5_000;

const script = process.argv[2];
if (script === undefined) {
  process.stderr.write('Usage: tsx scripts/suite-lock/run.ts <npm script> [args…]\n');
  process.exit(2);
}
const args = process.argv.slice(3);

function run(): Promise<number> {
  return new Promise((resolve) => {
    const npmArgs = ['run', script as string, ...(args.length > 0 ? ['--', ...args] : [])];
    // npm itself, through the node running this (npm_execpath when npm started us): no shell,
    // so the arguments are passed as they are (on Windows npm is a .cmd, which needs a shell).
    const npmCli = process.env.npm_execpath;
    const child =
      npmCli !== undefined && npmCli !== ''
        ? spawn(process.execPath, [npmCli, ...npmArgs], {
            stdio: 'inherit',
            env: { ...process.env, [HELD]: '1' },
          })
        : spawn('npm', npmArgs, {
            stdio: 'inherit',
            shell: process.platform === 'win32',
            env: { ...process.env, [HELD]: '1' },
          });
    child.on('exit', (code) => resolve(code ?? 1));
  });
}

if (process.env[HELD] === '1') {
  process.exit(await run());
}

const dir = lockDir(os.tmpdir());
const me = { pid: process.pid, cwd: process.cwd(), command: script, since: Date.now() };
let told = false;
for (;;) {
  const result = tryTake(dir, me, processAlive);
  if (result.taken) break;
  if (!told) {
    const owner = result.owner;
    process.stderr.write(
      owner === undefined
        ? 'Waiting for another test suite to start or end…\n'
        : `Waiting for the test suite "${owner.command}" in ${owner.cwd} (pid ${owner.pid}) to end…\n`,
    );
    told = true;
  }
  await new Promise((resolve) => setTimeout(resolve, WAIT_MS));
}

const giveBack = (): void => release(dir, process.pid);
process.on('exit', giveBack);
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) {
  process.on(signal, () => {
    giveBack();
    process.exit(130);
  });
}
process.exit(await run());
