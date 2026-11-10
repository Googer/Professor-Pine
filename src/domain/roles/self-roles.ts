import { matchNamed } from '../search/word-match.js';

/**
 * Self-assigned roles (plan 4C): the roles a server lets its members give themselves, as rows
 * of the legacy table `Role` with their aliases, sorted into groups. Everything here is pure:
 * what a row means against the roles the server has at this moment, whether a role may be
 * handed out, and what a member's request changes.
 */

/** A role of a Discord server, as far as handing it out asks about it. */
export interface ServerRole {
  id: string;
  name: string;
  /** Its place in the server's order of roles; a higher number stands above. */
  position: number;
  /** The role every member has (`@everyone`). */
  everyone: boolean;
  /** Managed by an integration: a bot's own role, the booster role, a linked role. */
  managed: boolean;
  /**
   * The permissions of moderation and administration it grants beyond what every member has
   * anyway (`@everyone`), by the names Discord shows; empty for a harmless role. Which
   * permissions those are is `MODERATION_PERMISSIONS` (`src/discord/role-permissions.ts`).
   */
  moderation: readonly string[];
  /**
   * The permissions of that kind which the role itself does not grant, but which the settings
   * of some channel allow it (an overwrite for the role), by the names Discord shows there.
   */
  channelModeration: readonly string[];
  /**
   * Its name makes whoever holds it staff of this bot (`isStaffRoleName` in
   * `src/discord/guards.ts`: the bot knows its staff by the names of their roles).
   */
  staffName: boolean;
}

/**
 * Whether holding a role makes a member more than a member: it grants a permission of
 * moderation, in the server or in a channel, or its name makes its holder staff of this bot.
 */
function grantsModeration(role: ServerRole): boolean {
  return role.moderation.length > 0 || role.channelModeration.length > 0 || role.staffName;
}

/** What the bot itself can do with roles in a server. */
export interface BotStanding {
  /** Whether it has the permission Manage Roles. */
  mayManageRoles: boolean;
  /** The position of its highest role: it can only hand out roles below that. */
  highestPosition: number;
}

/** The roles of a server and the bot's standing among them, at one moment. */
export interface ServerRoles {
  roles: readonly ServerRole[];
  bot: BotStanding;
  /** The user who owns the server, whom its order of roles does not bind. */
  ownerId: string;
}

/** A member of staff who offers a role, as far as the server's order of roles asks. */
export interface StaffStanding {
  id: string;
  /** The ids of the roles they hold. */
  held: readonly string[];
  /** Whether they have the permission Manage Roles (an administrator has). */
  mayManageRoles: boolean;
}

/**
 * Why a member of staff may not offer a role: they lack Manage Roles (`no-manage-roles`), or
 * the role is not below their own highest role (`not-below`).
 */
export type OfferProblem = 'no-manage-roles' | 'not-below';

/** A row of `Role` with its aliases. */
export interface SelfRoleRow {
  id: number;
  /** `roleName`: the Discord role's name as the row last knew it (the legacy bot finds it by this). */
  name: string;
  description: string | null;
  /** The Discord role's id; null for a row of the legacy bot that was not resolved yet. */
  roleId: string | null;
  /** The group it is sorted into; null is "Other". */
  groupId: number | null;
  /** In lower case, as the legacy bot stored them. */
  aliases: readonly string[];
}

/** A group of a server's roles: regions, teams. */
export interface SelfRoleGroup {
  id: number;
  name: string;
  /** Its place in the order, 1 first. */
  position: number;
  /** Only one of its roles may be held (teams). */
  pickOne: boolean;
}

/**
 * Why a row cannot be handed out at present:
 * - `gone`: its Discord role no longer exists (or, for a legacy row, no role has its name);
 * - `ambiguous`: a legacy row whose name several roles of the server have;
 * - `duplicate`: a legacy row whose name leads to a role another row already stands for;
 * - `everyone`, `managed`, `moderation`: the role is one that is never handed out (`moderation`
 *   is all of `grantsModeration`: a permission of the server or of a channel, or a staff name);
 * - `above-bot`: the role stands at or above the bot's highest role;
 * - `no-manage-roles`: the bot lacks Manage Roles and can hand out nothing.
 */
export type RoleProblem =
  | 'gone'
  | 'ambiguous'
  | 'duplicate'
  | 'everyone'
  | 'managed'
  | 'moderation'
  | 'above-bot'
  | 'no-manage-roles';

/** The problems that lie in the role itself: such a role is refused when staff add it. */
export type IntrinsicProblem = 'everyone' | 'managed' | 'moderation' | 'above-bot';

const collator = new Intl.Collator('en', { sensitivity: 'base' });

/**
 * Whether two names are the same name: case and accents do not count, as in the database
 * (collation `utf8mb4_0900_ai_ci`, which the unique key on `roleName` uses) and as the legacy
 * bot looked roles up.
 */
export function sameName(a: string, b: string): boolean {
  return collator.compare(a.trim(), b.trim()) === 0;
}

/** What `byRoleName` sorts: a group, a row, or a roster entry (which has its row). */
interface Named {
  name: string;
  id?: number;
  row?: { id: number };
}

/**
 * Names in the order lists and menus show them: without case and accents, a number inside a
 * name by its value ("Region 2" before "Region 10"), then by the exact spelling, and two of
 * exactly one name by the id of their row, so that the order is the same every time.
 */
export function byRoleName(a: Named, b: Named): number {
  return (
    a.name.localeCompare(b.name, 'en', { sensitivity: 'base', numeric: true }) ||
    (a.name < b.name ? -1 : a.name > b.name ? 1 : 0) ||
    (a.row?.id ?? a.id ?? 0) - (b.row?.id ?? b.id ?? 0)
  );
}

/**
 * Why a role of the server may not be handed out; undefined when it may. This is the security
 * rule of self-assignment: it is asked when staff add a role and again every time a role is
 * given, because a role that was harmless when it was added can be given a permission later.
 * What lies in the role itself comes before what lies in the bot.
 */
export function roleProblem(
  role: ServerRole,
  bot: BotStanding,
): IntrinsicProblem | 'no-manage-roles' | undefined {
  if (role.everyone) return 'everyone';
  if (role.managed) return 'managed';
  if (grantsModeration(role)) return 'moderation';
  // At the same position Discord decides by the roles' ids; that is refused too.
  if (role.position >= bot.highestPosition) return 'above-bot';
  if (!bot.mayManageRoles) return 'no-manage-roles';
  return undefined;
}

/**
 * Why a member of staff may not make a role self-assignable; undefined when they may. Whoever
 * offers a role hands it to everybody who asks, themself included: so only the server's owner,
 * or somebody who could give that role by hand (Manage Roles, and the role below their own
 * highest), may offer it. Otherwise the list would be a way around the server's order of roles.
 */
export function offerProblem(
  role: ServerRole,
  server: ServerRoles,
  staff: StaffStanding,
): OfferProblem | undefined {
  if (staff.id === server.ownerId) return undefined;
  if (!staff.mayManageRoles) return 'no-manage-roles';
  const highest = Math.max(
    0,
    ...server.roles
      .filter((other) => !other.everyone && staff.held.includes(other.id))
      .map((other) => other.position),
  );
  return role.position >= highest ? 'not-below' : undefined;
}

/** A row with the Discord role it stands for at this moment. */
export interface RosterEntry {
  row: SelfRoleRow;
  /**
   * The Discord role; undefined for a row that leads to none (`gone`, `ambiguous`,
   * `duplicate`). Only a role that stands here can ever be given or taken away.
   */
  role: ServerRole | undefined;
  /** The role's name as Discord has it now; the row's own for a row without a role. */
  name: string;
  group: SelfRoleGroup | undefined;
  problem: RoleProblem | undefined;
}

/** Everything a server offers, resolved against its roles. */
export interface Roster {
  /** In their order. */
  groups: readonly SelfRoleGroup[];
  /** Every row, by name; those with a `problem` are offered to nobody. */
  entries: readonly RosterEntry[];
  bot: BotStanding;
}

/** What resolving found that the rows should remember. */
export interface RosterWrites {
  /** Legacy rows that were found by name: they get the role's id, which counts from then on. */
  links: { rowId: number; roleId: string }[];
  /** Rows whose Discord role was renamed: `roleName` follows, so the legacy bot keeps finding it. */
  renames: { rowId: number; name: string }[];
}

/** The longest `roleName` the table holds. A Discord role's name may be twice as long. */
export const ROLE_NAME_LENGTH = 50;
export const DESCRIPTION_LENGTH = 150;
export const ALIAS_LENGTH = 50;
export const MAX_ALIASES = 10;
export const GROUP_NAME_LENGTH = 50;
export const MAX_GROUPS = 25;

/** Groups in their order: by position, then by name. */
export function orderedGroups(groups: readonly SelfRoleGroup[]): SelfRoleGroup[] {
  return [...groups].sort((a, b) => a.position - b.position || byRoleName(a, b) || a.id - b.id);
}

/**
 * Resolves a server's rows against the roles it has now.
 *
 * A row with an id stands for the role with that id, whatever either is called; when the role
 * was renamed the row's name is to follow, unless another row has that name already or the name
 * is longer than the column. A row without an id (made by the legacy bot) is looked up by its
 * name among the server's roles. A role that a row with an id stands for is out of the question
 * for it: of the others of that name exactly one is linked and several are `ambiguous` (nothing
 * is guessed about which was meant); no role of that name at all is `gone`, and `duplicate` is
 * for a name that only roles have which other rows stand for already.
 */
export function buildRoster(
  rows: readonly SelfRoleRow[],
  groups: readonly SelfRoleGroup[],
  server: ServerRoles,
): { roster: Roster; writes: RosterWrites } {
  const byId = new Map(server.roles.map((role) => [role.id, role]));
  const groupById = new Map(groups.map((group) => [group.id, group]));
  /** The roles rows with an id stand for. */
  const taken = new Set(rows.flatMap((row) => (row.roleId === null ? [] : [row.roleId])));
  /** The roles legacy rows were linked to on the way. */
  const linked = new Set<string>();
  const writes: RosterWrites = { links: [], renames: [] };
  /** The names rows will have once the renames are written, to keep them unique. */
  const names = new Map(rows.map((row) => [row.id, row.name]));
  const nameTaken = (name: string, except: number): boolean =>
    [...names].some(([id, other]) => id !== except && sameName(other, name));

  const entries = rows.map((row): RosterEntry => {
    const group = row.groupId === null ? undefined : groupById.get(row.groupId);
    const without = (problem: RoleProblem): RosterEntry => ({
      row,
      role: undefined,
      name: row.name,
      group,
      problem,
    });
    let role: ServerRole | undefined;
    if (row.roleId !== null) {
      role = byId.get(row.roleId);
      if (!role) return without('gone');
    } else {
      const named = server.roles.filter(
        (other) => !other.everyone && sameName(other.name, row.name),
      );
      if (named.length === 0 || row.name.trim() === '') return without('gone');
      const free = named.filter((other) => !taken.has(other.id));
      const [only] = free;
      if (only === undefined) return without('duplicate');
      if (free.length > 1) return without('ambiguous');
      if (linked.has(only.id)) return without('duplicate');
      linked.add(only.id);
      writes.links.push({ rowId: row.id, roleId: only.id });
      role = only;
    }
    if (
      role.name !== row.name &&
      role.name.length <= ROLE_NAME_LENGTH &&
      !nameTaken(role.name, row.id)
    ) {
      names.set(row.id, role.name);
      writes.renames.push({ rowId: row.id, name: role.name });
    }
    return { row, role, name: role.name, group, problem: roleProblem(role, server.bot) };
  });
  return {
    roster: {
      groups: orderedGroups(groups),
      entries: entries.sort(byRoleName),
      bot: server.bot,
    },
    writes,
  };
}

/**
 * The entry a text names outright: a role's name first, then an alias; of several, one that
 * leads to a role before one that does not. Case and accents do not count.
 *
 * Names come before aliases on purpose, which has a price: a role renamed on Discord to what is
 * another row's alias shadows that alias (staff are refused such a name when they add a role,
 * but nothing stops a rename on Discord). The alias's own role is still found by its name.
 */
export function findEntry(entries: readonly RosterEntry[], text: string): RosterEntry | undefined {
  const typed = text.trim();
  if (typed === '') return undefined;
  const first = (matches: readonly RosterEntry[]): RosterEntry | undefined =>
    matches.find((entry) => entry.role !== undefined) ?? matches[0];
  return (
    first(entries.filter((entry) => sameName(entry.name, typed))) ??
    first(entries.filter((entry) => entry.row.aliases.some((alias) => sameName(alias, typed))))
  );
}

/**
 * The entries with a role whose roles are called so at present. More than one when roles were
 * renamed alike on Discord (a row's own name cannot follow then, but what members see is the
 * role's): a typed name says nothing about which of them is meant, and nothing is guessed.
 */
export function entriesCalled(entries: readonly RosterEntry[], text: string): RosterEntry[] {
  const typed = text.trim();
  if (typed === '') return [];
  return entries.filter((entry) => entry.role !== undefined && sameName(entry.name, typed));
}

/** The entries a text that names none of them outright may have meant, best first. */
export function suggestEntries(
  entries: readonly RosterEntry[],
  text: string,
  limit = 5,
): RosterEntry[] {
  return matchNamed(
    entries.map((entry) => ({ value: entry, names: [entry.name, ...entry.row.aliases] })),
    text,
  ).slice(0, limit);
}

/** Whether a role can be taken away: it leads to a role, and the bot can change it. */
export function takeable(entry: RosterEntry): boolean {
  // A role that was given a moderation permission since may no longer be handed out, but a
  // member who has it may still give it back.
  return (
    entry.role !== undefined && (entry.problem === undefined || entry.problem === 'moderation')
  );
}

/**
 * Whether a role may be taken away without the member having asked for exactly that (the other
 * role of a pick-one group, when a new one is given): not one that has become a role of
 * moderation or of staff since it was put on the list. Whoever holds such a role by now was
 * probably meant to, so it goes only when they give it back themself.
 */
export function displaceable(entry: RosterEntry): boolean {
  return takeable(entry) && entry.problem !== 'moderation';
}

/** What a member asks for: roles to get and roles to lose, by the ids of the Discord roles. */
export interface ChangeRequest {
  give: readonly string[];
  take: readonly string[];
}

/**
 * Why something that was asked for was not done: a `RoleProblem` of the role, `not-offered`
 * (no row of the server leads to that role any more), `pick-one` (several roles of a group of
 * which only one may be held were asked for at once) or `stuck` (a role of a pick-one group
 * while the member holds another of it that the bot cannot take away, or will not take away
 * unasked: `displaceable`).
 */
type SkipReason = RoleProblem | 'not-offered' | 'pick-one' | 'stuck';

export interface Skipped {
  roleId: string;
  /** Undefined for `not-offered`. */
  entry: RosterEntry | undefined;
  reason: SkipReason;
  /** For `stuck`: the role of the group the member holds that the bot cannot take away. */
  blocker?: RosterEntry;
}

/** What comes of a request. */
export interface PlannedChange {
  add: RosterEntry[];
  /** Everything that is taken away, `displaced` included. */
  remove: RosterEntry[];
  /** Taken away without being asked for: the other roles of a pick-one group a role was given of. */
  displaced: RosterEntry[];
  /** Asked for and held already. */
  already: RosterEntry[];
  /** Asked to be taken away and not held. */
  lacking: RosterEntry[];
  skipped: Skipped[];
}

/**
 * What a request changes for a member who holds the roles `held`.
 *
 * A role is given only when the roster has an entry for it without a problem, and taken away
 * only when the roster has an entry for it that the bot can change: an id that no row of the
 * server leads to never gets into `add` or `remove`, whatever was asked. A role of a group of
 * which only one may be held takes the member's other roles of that group away with it, unless
 * one of them is not to be taken away unasked (`displaceable`): then the new role is not given.
 */
export function planChange(
  roster: Roster,
  held: ReadonlySet<string>,
  request: ChangeRequest,
): PlannedChange {
  const byRole = new Map(
    roster.entries.flatMap((entry) => (entry.role ? [[entry.role.id, entry] as const] : [])),
  );
  const plan: PlannedChange = {
    add: [],
    remove: [],
    displaced: [],
    already: [],
    lacking: [],
    skipped: [],
  };
  const give = [...new Set(request.give)];
  const take = [...new Set(request.take)].filter((id) => !give.includes(id));

  /** How many roles of each pick-one group were asked for at once. */
  const asked = new Map<number, number>();
  for (const id of give) {
    const group = byRole.get(id)?.group;
    if (group?.pickOne) asked.set(group.id, (asked.get(group.id) ?? 0) + 1);
  }

  for (const id of give) {
    const entry = byRole.get(id);
    if (!entry) {
      plan.skipped.push({ roleId: id, entry: undefined, reason: 'not-offered' });
    } else if (held.has(id)) {
      plan.already.push(entry);
    } else if (entry.problem !== undefined) {
      plan.skipped.push({ roleId: id, entry, reason: entry.problem });
    } else if (entry.group?.pickOne && (asked.get(entry.group.id) ?? 0) > 1) {
      plan.skipped.push({ roleId: id, entry, reason: 'pick-one' });
    } else if (entry.group?.pickOne) {
      const groupId = entry.group.id;
      const others = roster.entries.filter(
        (other) =>
          other !== entry &&
          other.group?.id === groupId &&
          other.role !== undefined &&
          held.has(other.role.id),
      );
      const blocker = others.find((other) => !displaceable(other));
      if (blocker === undefined) {
        plan.add.push(entry);
        plan.displaced.push(...others);
        plan.remove.push(...others);
      } else {
        plan.skipped.push({ roleId: id, entry, reason: 'stuck', blocker });
      }
    } else {
      plan.add.push(entry);
    }
  }

  for (const id of take) {
    const entry = byRole.get(id);
    if (!entry) {
      plan.skipped.push({ roleId: id, entry: undefined, reason: 'not-offered' });
    } else if (!held.has(id)) {
      plan.lacking.push(entry);
    } else if (plan.remove.includes(entry)) {
      // Displaced already.
    } else if (!takeable(entry)) {
      plan.skipped.push({ roleId: id, entry, reason: entry.problem ?? 'gone' });
    } else {
      plan.remove.push(entry);
    }
  }
  return plan;
}
