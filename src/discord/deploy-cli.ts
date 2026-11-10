import { REST, Routes } from 'discord.js';
import { commands, messageCommands } from '../commands/index.js';
import { loadConfig } from '../config/index.js';
import { dbConfigFrom } from '../db/db-config.js';
import { createDb } from '../db/kysely.js';
import { CutoverRepository } from '../db/repositories/cutover-repository.js';
import { servedSettings } from '../services/rehearsal.js';
import { enabledCommands, enabledMessageCommands } from './command.js';
import {
  buildCommandPayload,
  deployPlan,
  deployServers,
  parseDeployArgs,
  sendDeploy,
} from './deploy.js';

// Registers the slash commands with Discord (`./pine deploy-commands`, `npm run deploy-commands`):
//   --global | --guild <id>        everywhere, or in one server (refused in rehearsal mode)
//   --rehearsal                    rehearsal mode: in the servers of the database the bot is in
//                                  (the admin restricts who sees them under Integrations)
//   --clear-guild                  the commands of those servers taken away
// A registration that fails is said and the others go on; the exit status is then 1.
// The settings the bot runs by (without the web pages in rehearsal mode), so that the commands
// registered are the ones it answers.
const loaded = loadConfig(process.env);
const config = { ...loaded, settings: servedSettings(loaded.settings) };
const { env } = config;
const target = parseDeployArgs(process.argv.slice(2));
const rest = new REST().setToken(env.DISCORD_TOKEN);
const say = (line: string) => process.stdout.write(`${line}\n`);

/**
 * The servers of the database (`Guild`) that the bot is in, read only where the target needs
 * them; said before anything is sent, with those the bot is not in.
 */
async function servers(): Promise<string[]> {
  if (target.scope !== 'rehearsal' && target.scope !== 'clear') return [];
  const db = createDb<unknown>(dbConfigFrom(env));
  let inDatabase: string[];
  try {
    inDatabase = await new CutoverRepository(db).servers();
  } finally {
    await db.destroy();
  }
  const joined = (await rest.get(Routes.userGuilds())) as { id: string; name: string }[];
  const { servers: found, absent } = deployServers(inDatabase, joined);
  for (const id of found) {
    say(`Server ${id} (${joined.find((one) => one.id === id)?.name ?? '?'}): the bot is in it.`);
  }
  for (const id of absent)
    say(`Server ${id}: in the database, but the bot is not in it: left out.`);
  return found;
}

const plan = deployPlan(target, {
  appId: env.DISCORD_APP_ID,
  body: buildCommandPayload(
    enabledCommands(commands, config),
    enabledMessageCommands(messageCommands, config),
  ),
  rehearsal: config.settings.rehearsal !== undefined,
  servers: await servers(),
});
if (!plan.ok) {
  process.stderr.write(`${plan.refusal}\n`);
  process.exit(1);
}
process.exitCode = await sendDeploy(rest, plan.requests, say);
