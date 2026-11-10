/**
 * The export of the legacy role authorization (`npm run role-auth:export`): which legacy
 * command needed which roles in which server, and the slash command of the new bot each one
 * became, so that staff can set the same up as Discord's own command permissions (Server
 * Settings, Integrations, Professor Pine) at the cutover (spec 9.1). Pure: the database is read
 * by `RoleAuthorizationRepository`, and Discord is never asked.
 */
import type { LegacyCommandRoles } from '../db/repositories/role-authorization-repository.js';

/**
 * What a legacy command became:
 * - `slash`: these commands of the new bot (top-level names: Discord sets permissions per
 *   command, not per subcommand), every other name or short form of one with it (`/hmm` with
 *   `/interested`): Discord sets each by itself;
 * - `dropped`: the new bot has nothing that does it.
 */
export type NewCommand =
  { kind: 'slash'; commands: readonly string[]; note?: string } | { kind: 'dropped'; note: string };

const slash = (...commands: string[]): NewCommand => ({ kind: 'slash', commands });
const dropped = (note: string): NewCommand => ({ kind: 'dropped', note });

const ROLE_AUTH_GONE = "role authorization is replaced by Discord's command permissions";
const COMMANDO = 'a built-in command of the old command framework';

/**
 * Every command name of the legacy bot (the `name` of each command under `commands/`, read
 * from the legacy code on 2026-10-14, and the built-in commands of discord.js-commando it
 * registered), and what it became; from the command mapping of the spec (4.2), as the commands
 * were built. The legacy bot keyed role authorization by the name, never by an alias, so no
 * alias is listed (`wild` is an alias of `spawn`, `import-regions` of `import`).
 */
export const LEGACY_COMMANDS: Readonly<Record<string, NewCommand>> = {
  // In a party.
  join: slash('/join', '/coming'),
  maybe: slash('/interested', '/hmm'),
  here: slash('/here'),
  'not-here': slash('/not-here'),
  leave: slash('/leave'),
  done: slash('/done'),
  local: slash('/local'),
  remote: slash('/remote'),
  meet: slash('/meet'),
  'cancel-meet': slash('/cancel-meet'),
  group: slash('/group'),
  new: slash('/group'),
  label: slash('/group'),
  status: slash('/status'),
  where: slash('/where'),
  shout: slash('/shout'),
  delete: slash('/delete'),
  // Raids.
  raid: slash('/raid'),
  hatch: slash('/hatch'),
  left: slash('/end'),
  duration: slash('/duration'),
  boss: slash('/boss'),
  gym: slash('/location'),
  moveset: slash('/moveset'),
  // Trains and meetups.
  train: slash('/train'),
  name: slash('/name'),
  route: slash('/route'),
  'route-add': slash('/route'),
  'route-clear': slash('/route'),
  'route-edit': slash('/route'),
  'route-remove': slash('/route'),
  'save-route': slash('/route'),
  'use-route': slash('/route'),
  conductor: slash('/conductor'),
  'not-conductor': slash('/conductor'),
  next: slash('/next'),
  previous: slash('/previous'),
  skip: slash('/skip'),
  'train-finished': slash('/finish'),
  meetup: slash('/meetup'),
  info: slash('/info'),
  // Members.
  auto: slash('/settings'),
  privacy: slash('/settings'),
  mentions: slash('/settings'),
  'mentions-groups': slash('/settings'),
  'mentions-shouts': slash('/settings'),
  'mentions-train-stops': slash('/settings'),
  'boss-set-notification': slash('/settings'),
  'new-train-notification': slash('/settings'),
  want: slash('/want'),
  unwant: slash('/unwant'),
  wants: slash('/wants'),
  'unwant-all': slash('/unwant-all'),
  target: slash('/target'),
  untarget: slash('/untarget'),
  targets: slash('/targets'),
  'untarget-all': slash('/untarget-all'),
  'register-friend-code': slash('/friend-code'),
  'friend-code': slash('/friend-code'),
  'register-nickname': slash('/nickname'),
  'find-nickname': slash('/nickname'),
  spawn: slash('/wild'),
  iam: slash('/iam'),
  iamnot: slash('/iamnot'),
  help: slash('/help'),
  bounds: slash('/bounds'),
  // Utilities (Phase 6).
  request: slash('/request'),
  rank: slash('/rank', '/little', '/great', '/ultra', '/master'),
  counters: slash('/counters'),
  'boss-tier': slash('/boss-tier'),
  find: slash('/find-region'),
  maps: slash('/maps'),
  // Staff.
  asar: slash('/admin'),
  rsar: slash('/admin'),
  lsar: slash('/admin'),
  aar: dropped('the role every new member is given is not built'),
  'raid-boss': slash('/admin'),
  'raid-bosses': slash('/admin'),
  'auto-set': slash('/admin'),
  'mark-shiny': slash('/admin'),
  'mark-not-shiny': slash('/admin'),
  'add-pokemon-nickname': slash('/admin'),
  'populate-raid-bosses': dropped('the boss list comes from the feed'),
  rare: dropped('/want and /wild take any Pokémon'),
  'view-member-settings': slash('/admin'),
  'save-party': slash('/admin'),
  'clear-image-cache': slash('/admin'),
  'create-gym': slash('/gym'),
  'edit-gym': slash('/gym'),
  'delete-gym': slash('/gym'),
  'find-gym': slash('/find-gym'),
  'gym-detail': slash('/gym'),
  geocode: slash('/gym'),
  'gym-places': slash('/gym'),
  'export-tsvs': slash('/gym'),
  'gym-queue': dropped('there is no queue to show'),
  'import-gyms': dropped('gyms are added one by one with /gym add'),
  import: slash('/region'),
  setbounds: slash('/region'),
  'require-role': dropped(ROLE_AUTH_GONE),
  'add-role': dropped(ROLE_AUTH_GONE),
  'remove-role': dropped(ROLE_AUTH_GONE),
  'show-role-authorization': dropped(ROLE_AUTH_GONE),
  'show-role-authorizations': dropped(ROLE_AUTH_GONE),
  'silph-card': dropped('The Silph Road closed'),
  'register-silph': dropped('The Silph Road closed'),
  howmany: dropped('not carried over'),
  // discord.js-commando's own (help, prefix and eval were not registered).
  groups: dropped(COMMANDO),
  enable: dropped(COMMANDO),
  disable: dropped(COMMANDO),
  load: dropped(COMMANDO),
  unload: dropped(COMMANDO),
  reload: dropped(COMMANDO),
  ping: dropped(COMMANDO),
  'unknown-command': dropped(COMMANDO),
};

/** What became of a legacy command; undefined for a name this table does not know. */
export function newCommandOf(legacy: string): NewCommand | undefined {
  const name = legacy.trim().toLowerCase();
  return Object.hasOwn(LEGACY_COMMANDS, name) ? LEGACY_COMMANDS[name] : undefined;
}

/**
 * A warning about one command's settings:
 * - `staff-only`: a role is required and none is listed, so only staff could use it;
 * - `no-effect`: roles are listed but none is required, so they did nothing;
 * - `unknown-command`: the table above does not know the name.
 */
export type Warning = 'staff-only' | 'no-effect' | 'unknown-command';

export interface ExportedCommand {
  command: string;
  required: boolean;
  roleIds: string[];
  /** Undefined for a name the mapping does not know. */
  becomes: NewCommand | undefined;
  warnings: Warning[];
}

export interface ExportedServer {
  /** The server's snowflake. */
  guild: string;
  commands: ExportedCommand[];
}

/**
 * The export by server: every command whose `roleRequired` is set, and every command with roles
 * listed (those roles have no effect without it, which is said). A command for which neither is
 * the case is left out.
 */
export function roleAuthExport(rows: readonly LegacyCommandRoles[]): ExportedServer[] {
  const servers: ExportedServer[] = [];
  for (const row of rows) {
    const required = row.roleRequired === true;
    if (!required && row.roleIds.length === 0) continue;
    const becomes = newCommandOf(row.command);
    const warnings: Warning[] = [];
    if (required && row.roleIds.length === 0) warnings.push('staff-only');
    if (!required && row.roleIds.length > 0) warnings.push('no-effect');
    if (!becomes) warnings.push('unknown-command');
    let server = servers.find((one) => one.guild === row.guild);
    if (!server) {
      server = { guild: row.guild, commands: [] };
      servers.push(server);
    }
    server.commands.push({
      command: row.command,
      required,
      roleIds: [...row.roleIds],
      becomes,
      warnings,
    });
  }
  return servers;
}

export const ROLE_NAMES_NOTE =
  'Roles are given by their ids: this export does not ask Discord for their names. With ' +
  'Developer Mode on, Server Settings > Roles > (a role) > Copy Role ID shows which is which.';

const PERMISSIONS_NOTE =
  'Set these up under Server Settings > Integrations > Professor Pine: Discord sets permissions ' +
  'per command (/settings as a whole, not one of its subcommands). Admins, moderators and bot ' +
  'developers could always use every command, as members with Manage Server can there.';

const WARNING_TEXT: Readonly<Record<Warning, string>> = {
  'staff-only': 'required with no role listed: only staff could use it',
  'no-effect': 'roles are listed but none is required: they had no effect',
  'unknown-command': 'a command this export does not know',
};

function becomesText(becomes: NewCommand | undefined): string {
  if (!becomes) return 'no mapping';
  switch (becomes.kind) {
    case 'slash':
      return becomes.commands.join(', ');
    case 'dropped':
      return `dropped: ${becomes.note}`;
  }
}

/** The export as plain text, one block per server. */
export function exportText(servers: readonly ExportedServer[]): string {
  const lines = ['Legacy role authorization, per server', ROLE_NAMES_NOTE, PERMISSIONS_NOTE, ''];
  if (servers.length === 0) {
    lines.push('No server requires a role for any command, and no command has roles listed.');
  }
  for (const server of servers) {
    lines.push(`Server ${server.guild}`);
    for (const one of server.commands) {
      const roles = one.roleIds.length === 0 ? 'no roles' : `roles ${one.roleIds.join(', ')}`;
      const required = one.required ? 'required' : 'not required';
      lines.push(`  ${one.command}: ${required}, ${roles} -> ${becomesText(one.becomes)}`);
      for (const warning of one.warnings) lines.push(`    warning: ${WARNING_TEXT[warning]}`);
    }
    lines.push('');
  }
  return `${lines.join('\n').trimEnd()}\n`;
}

/** The export as JSON, for a script of the operator's own. */
export function exportJson(servers: readonly ExportedServer[]): string {
  return `${JSON.stringify({ note: ROLE_NAMES_NOTE, servers }, null, 2)}\n`;
}
