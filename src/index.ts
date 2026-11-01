import { startApp } from './app.js';
import { loggerFromEnv } from './log.js';
import { CrashRecord, restartText } from './ops/crash-record.js';
import { HEALTH_DIR, healthFiles } from './ops/health.js';
import { afterFailedStart, Lifecycle, loginBackoffMs, waitBeforeLogin } from './ops/lifecycle.js';
import { FileStamps, firstLine, ownerAlertsFrom } from './ops/owner-alerts.js';
import { REHEARSAL_ALERT } from './services/rehearsal.js';

// The owner's alerts and the crash marker work before the config is read and after it failed:
// they need only the token and OWNER_ID, and log through a logger of their own.
const opsLog = loggerFromEnv(process.env);
const alerts = ownerAlertsFrom(process.env, opsLog, new FileStamps(healthFiles().alerts));
const crashes = new CrashRecord({ dir: HEALTH_DIR });
// Two bots with one token answer every interaction twice, each from its own parties in memory.
const other = crashes.runningElsewhere();
if (other) {
  opsLog.fatal(
    { runningPid: other.pid, startedAt: new Date(other.startedAt).toISOString() },
    'another Pine is running from this folder: not starting (stop it first)',
  );
  process.exit(1);
}
const crashed = crashes.started();

/** Keeps why this run ends for the next start, and tells the owner (a few seconds at most). */
async function ending(what: string, err: unknown): Promise<void> {
  const line = firstLine(err);
  crashes.failed(line);
  await alerts?.send('fatal', `Professor Pine ${what}: ${line}`);
}

// Signals and unhandled errors from here on, before the start: a stop asked for during the start
// ends it after the step under way (the migrations are never cut off), cleanly; an error nothing
// caught during the start ends it with an alert.
const lifecycle = new Lifecycle({
  events: process,
  log: opsLog,
  ending,
  exit: (code) => process.exit(code),
  stopped: () => crashes.stopped(),
});

let app: Awaited<ReturnType<typeof startApp>>;
try {
  app = await startApp(process.env, {
    // Through the lifecycle: a signal during this shutdown starts no second one.
    onFatal: (shutdown, reason) => lifecycle.fatal(shutdown, reason),
    stopRequested: () => lifecycle.stopRequested(),
    // A bot that keeps crashing waits before it logs in again (half a minute a restart).
    beforeLogin: () =>
      waitBeforeLogin(
        loginBackoffMs(crashed?.restartsInWindow ?? 0),
        lifecycle.whenStopRequested(),
        opsLog,
      ),
  });
} catch (err) {
  await afterFailedStart(err, {
    crashes,
    log: opsLog,
    ending,
    write: (text) => process.stderr.write(text),
    exit: (code) => process.exit(code),
  });
  // process.exit has ended the process; this satisfies the compiler.
  throw err;
}

// A stop asked for during the login, which no checkpoint divides, happens now.
lifecycle.started(app);
if (!lifecycle.stopRequested() && crashed) void alerts?.send('restart', restartText(crashed));
// So that a rehearsal is never left on by accident.
if (!lifecycle.stopRequested() && app.rehearsal) {
  void alerts?.send('rehearsal', REHEARSAL_ALERT);
}
