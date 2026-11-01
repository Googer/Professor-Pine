import {
  ALIAS_LENGTH,
  DESCRIPTION_LENGTH,
  GROUP_NAME_LENGTH,
  MAX_ALIASES,
  MAX_GROUPS,
  orderedGroups,
  ROLE_NAME_LENGTH,
  sameName,
  type SelfRoleGroup,
  type SelfRoleRow,
} from './self-roles.js';

/**
 * What staff change about the self-assigned roles of a server, as pure decisions over the rows
 * that exist: the repository and its twin in memory both run these inside their lock, so that
 * names and aliases stay unique whoever writes at the same time.
 */

const tidy = (text: string): string => text.replace(/\s+/g, ' ').trim();

/** The words that mean "no group" where a group is named; no group may be called so. */
const NO_GROUP_WORDS = ['other', 'none'] as const;

export function isNoGroupWord(text: string): boolean {
  return NO_GROUP_WORDS.some((word) => sameName(word, text));
}

type AliasProblem =
  { reason: 'alias-too-long'; alias: string } | { reason: 'too-many-aliases'; count: number };

/**
 * The aliases a comma-separated text names: in lower case (as the legacy bot stored and compared
 * them), each once, without empty ones.
 */
export function parseAliases(
  text: string,
): { ok: true; aliases: string[] } | ({ ok: false } & AliasProblem) {
  const aliases: string[] = [];
  for (const part of text.split(',')) {
    const alias = tidy(part).toLowerCase();
    if (alias === '' || aliases.some((other) => sameName(other, alias))) continue;
    if (alias.length > ALIAS_LENGTH) return { ok: false, reason: 'alias-too-long', alias };
    aliases.push(alias);
  }
  if (aliases.length > MAX_ALIASES) {
    return { ok: false, reason: 'too-many-aliases', count: aliases.length };
  }
  return { ok: true, aliases };
}

/** What staff say about a role they add or change. `undefined` leaves a part as it is. */
export interface RoleInput {
  /** The Discord role, as the server has it now. */
  role: { id: string; name: string };
  /**
   * The ids of all roles the server has now. With them a row of the role's name whose own role
   * is not among them (it was deleted) is taken over; without them no row is known to be so.
   */
  live?: readonly string[] | undefined;
  /** `null` clears it. */
  description?: string | null | undefined;
  /** Replaces the aliases the row has (not merged, as in the legacy bot); empty clears them. */
  aliases?: readonly string[] | undefined;
  /** `null` takes the role out of its group. */
  groupId?: number | null | undefined;
}

/** What a row is to hold. */
interface RoleValues {
  roleId: string;
  name: string;
  description: string | null;
  aliases: string[];
  groupId: number | null;
}

export type RoleSaveProblem =
  | { reason: 'name-too-long' }
  | { reason: 'description-too-long' }
  /** Another row is called so. */
  | { reason: 'name-taken'; other: string }
  /** The role's name is an alias of another row. */
  | { reason: 'name-is-alias'; other: string }
  /** An alias is the name or an alias of another row. */
  | { reason: 'alias-taken'; alias: string; other: string }
  | { reason: 'no-group' };

type RoleSavePlan =
  | {
      ok: true;
      /** The row that is changed; undefined for a new one. */
      rowId: number | undefined;
      values: RoleValues;
    }
  | ({ ok: false } & RoleSaveProblem);

/**
 * What adding a role, or changing one that is there, writes. The row that is there is the one
 * with the role's id, or else a legacy row without an id that has the role's name (staff
 * picking the role says which of several roles of that name was meant), or else a row of that
 * name whose own role the server no longer has (`input.live`: the role was deleted and made
 * anew, and the row keeps its description, aliases and group and gets the new role's id). A
 * role's name and its aliases may not be the name or an alias of another row of the server; an
 * alias that is the role's own name is dropped.
 *
 * A name longer than the column is refused only for a row that is made: a role that is listed
 * and was renamed to such a name since keeps the name its row has, and what is said about it
 * can still be changed.
 */
export function planSaveRole(
  rows: readonly SelfRoleRow[],
  groups: readonly SelfRoleGroup[],
  input: RoleInput,
): RoleSavePlan {
  const { role, live } = input;
  const existing =
    rows.find((row) => row.roleId === role.id) ??
    rows.find((row) => row.roleId === null && sameName(row.name, role.name)) ??
    (live === undefined
      ? undefined
      : rows.find(
          (row) =>
            row.roleId !== null && !live.includes(row.roleId) && sameName(row.name, role.name),
        ));
  let name = role.name;
  if (name.length > ROLE_NAME_LENGTH) {
    if (!existing) return { ok: false, reason: 'name-too-long' };
    name = existing.name;
  }
  const others = rows.filter((row) => row !== existing);

  const named = others.find((row) => sameName(row.name, role.name));
  if (named) return { ok: false, reason: 'name-taken', other: named.name };
  const aliased = others.find((row) => row.aliases.some((alias) => sameName(alias, role.name)));
  if (aliased) return { ok: false, reason: 'name-is-alias', other: aliased.name };

  const aliases =
    input.aliases === undefined
      ? [...(existing?.aliases ?? [])]
      : input.aliases.filter((alias) => !sameName(alias, role.name));
  if (input.aliases !== undefined) {
    for (const alias of aliases) {
      const other = others.find(
        (row) => sameName(row.name, alias) || row.aliases.some((theirs) => sameName(theirs, alias)),
      );
      if (other) return { ok: false, reason: 'alias-taken', alias, other: other.name };
    }
  }

  let description = existing?.description ?? null;
  if (input.description !== undefined) {
    const text = input.description === null ? '' : tidy(input.description);
    if (text.length > DESCRIPTION_LENGTH) return { ok: false, reason: 'description-too-long' };
    description = text === '' ? null : text;
  }

  const groupId = input.groupId === undefined ? (existing?.groupId ?? null) : input.groupId;
  if (input.groupId !== undefined && groupId !== null && !groups.some((g) => g.id === groupId)) {
    return { ok: false, reason: 'no-group' };
  }
  return {
    ok: true,
    rowId: existing?.id,
    values: { roleId: role.id, name, description, aliases, groupId },
  };
}

/** What staff say about a group they make or change. `undefined` leaves a part as it is. */
export interface GroupInput {
  /** The group's name: one that exists is changed, any other is made. */
  name: string;
  /** A new name for a group that exists. */
  newName?: string | undefined;
  pickOne?: boolean | undefined;
  /** Its place in the order, 1 first; beyond the last place is the last place. */
  position?: number | undefined;
}

export type GroupSaveProblem =
  | { reason: 'name-empty' }
  | { reason: 'name-too-long' }
  | { reason: 'reserved-name' }
  | { reason: 'name-taken' }
  /** A new name for a group that does not exist. */
  | { reason: 'no-group' }
  | { reason: 'too-many' };

type GroupSavePlan =
  | {
      ok: true;
      /** The group that is changed; undefined for a new one. */
      id: number | undefined;
      name: string;
      pickOne: boolean;
      /** Every group of the server in the new order, by id; `null` is the new one. */
      order: (number | null)[];
    }
  | ({ ok: false } & GroupSaveProblem);

function groupNameProblem(name: string): GroupSaveProblem | undefined {
  if (name === '') return { reason: 'name-empty' };
  if (name.length > GROUP_NAME_LENGTH) return { reason: 'name-too-long' };
  if (isNoGroupWord(name)) return { reason: 'reserved-name' };
  return undefined;
}

/**
 * What making a group, or changing one, writes. A new group goes to the end unless a place is
 * named; naming a place moves the group there and the others close up, so the places of a
 * server's groups are always 1 to their number.
 */
export function planSaveGroup(groups: readonly SelfRoleGroup[], input: GroupInput): GroupSavePlan {
  const name = tidy(input.name);
  const problem = groupNameProblem(name);
  if (problem) return { ok: false, ...problem };
  const ordered = orderedGroups(groups);
  const existing = ordered.find((group) => sameName(group.name, name));

  let finalName = existing?.name ?? name;
  if (input.newName !== undefined) {
    if (!existing) return { ok: false, reason: 'no-group' };
    finalName = tidy(input.newName);
    const renamed = groupNameProblem(finalName);
    if (renamed) return { ok: false, ...renamed };
    if (ordered.some((group) => group !== existing && sameName(group.name, finalName))) {
      return { ok: false, reason: 'name-taken' };
    }
  }
  if (!existing && ordered.length >= MAX_GROUPS) return { ok: false, reason: 'too-many' };

  const order: (number | null)[] = ordered
    .filter((group) => group !== existing)
    .map((group) => group.id);
  const current = existing ? ordered.indexOf(existing) : order.length;
  const wanted =
    input.position === undefined
      ? current
      : Math.min(Math.max(Math.trunc(input.position), 1), order.length + 1) - 1;
  order.splice(wanted, 0, existing?.id ?? null);
  return {
    ok: true,
    id: existing?.id,
    name: finalName,
    pickOne: input.pickOne ?? existing?.pickOne ?? false,
    order,
  };
}
