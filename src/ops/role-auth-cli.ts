import { ConfigError, type Env } from '../config/index.js';
import { loadEnv } from '../config/env.js';
import { dbConfigFrom } from '../db/db-config.js';
import { createDb } from '../db/kysely.js';
import { RoleAuthorizationRepository } from '../db/repositories/role-authorization-repository.js';
import type { DB } from '../db/types.js';
import { exportJson, exportText, roleAuthExport } from './role-auth.js';

// Prints the legacy role authorization of the configured database for the cutover: per server,
// every legacy command that requires a role or has roles listed, the slash command of the new
// bot it became, and what is odd about it.
//   node dist/ops/role-auth-cli.js [--json]   (`./pine role-auth-export`, `npm run role-auth:export`)
// It only reads (`CommandRoleAuthorization`, `CommandRoles`, `Guild`) and never contacts
// Discord, so roles are given by their ids.
const args = process.argv.slice(2);
const unknown = args.filter((arg) => arg !== '--json');
if (unknown.length > 0) {
  process.stderr.write(
    `Unknown arguments: ${unknown.join(' ')}\nUsage: role-auth-export [--json]\n`,
  );
  process.exit(2);
}

let env: Env;
try {
  env = loadEnv(process.env);
} catch (err) {
  process.stderr.write(`${err instanceof ConfigError ? err.message : String(err)}\n`);
  process.exit(1);
}

const db = createDb<DB>(dbConfigFrom(env));
try {
  const servers = roleAuthExport(await new RoleAuthorizationRepository(db).list());
  process.stdout.write(args.includes('--json') ? exportJson(servers) : exportText(servers));
} catch (err) {
  process.stderr.write(`${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n`);
  process.exitCode = 1;
} finally {
  await db.destroy();
}
