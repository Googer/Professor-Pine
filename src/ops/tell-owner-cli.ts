import { loggerFromEnv } from '../log.js';
import { MemoryStamps, ownerAlertsFrom } from './owner-alerts.js';
import { tellOwner } from './tell-owner.js';

// Tells the owner a line of plain text by a DM on Discord, through its REST API with the bot's
// token (the bot need not run, and may):
//   node dist/ops/tell-owner-cli.js <text>     (`./pine tell-owner <text>`)
// For scripts on the host (the upload of the backups off it). Reads DISCORD_TOKEN and OWNER_ID
// from the environment and prints neither. Exits 0 when the owner was told, 1 when not, 2 when
// there was nothing to tell.
// At info whatever LOG_LEVEL says: when the DM fails, its warning with Discord's answer is what the
// command's own last line points to.
const log = loggerFromEnv({ ...process.env, LOG_LEVEL: 'info' });
// One message per run: nothing to hold back between runs (the caller tells once per run).
const alerts = ownerAlertsFrom(process.env, log, new MemoryStamps());
process.exitCode = await tellOwner(process.argv.slice(2), alerts, {
  say: (line) => process.stdout.write(`${line}\n`),
  warn: (line) => process.stderr.write(`${line}\n`),
});
