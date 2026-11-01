import { healthCheck, healthFiles, healthLine } from './health.js';

// The health check of the Docker stack (compose.yaml): reads the bot's heartbeat, says what it
// found in one line (its kind first, which the watchdog reads), and exits 0 when the bot is
// healthy, 1 when not.
const verdict = healthCheck(healthFiles().status, Date.now());
process.stdout.write(`${healthLine(verdict)}\n`);
process.exitCode = verdict.healthy ? 0 : 1;
