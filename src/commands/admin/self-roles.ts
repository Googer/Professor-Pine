import {
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandSubcommandBuilder,
  type AutocompleteInteraction,
  type ChatInputCommandInteraction,
} from 'discord.js';
import type { AppContext } from '../../app-context.js';
import type { SubcommandPart } from '../../discord/command-group.js';
import { UserError } from '../../discord/errors.js';
import { guildIdOf } from '../../discord/guards.js';
import {
  isNoGroupWord,
  parseAliases,
  type GroupSaveProblem,
  type RoleSaveProblem,
} from '../../domain/roles/self-role-edits.js';
import {
  ALIAS_LENGTH,
  byRoleName,
  DESCRIPTION_LENGTH,
  GROUP_NAME_LENGTH,
  MAX_ALIASES,
  MAX_GROUPS,
  ROLE_NAME_LENGTH,
  sameName,
  type IntrinsicProblem,
  type OfferProblem,
  type RoleProblem,
  type RosterEntry,
  type SelfRoleGroup,
  type SelfRoleRow,
  type ServerRole,
  type StaffStanding,
} from '../../domain/roles/self-roles.js';
import { groupRule } from '../../render/role-menus.js';
import { count, fitMessages, plain, truncate } from '../../render/text.js';
import { beginningFirst, CHOICE_NAME, MAX_CHOICES, type Choice } from '../choices.js';
import { ROLES_UNAVAILABLE, rolesEnabled, roleText, typedText } from '../roles/shared.js';
import { calledAlike, whyModeration, whyNot } from '../roles/words.js';

/** The subcommand group of `/admin` all of this lives under. */
export const SELF_ROLES_GROUP = 'self-roles';
export const SELF_ROLES_DESCRIPTION = 'The roles members can give themselves with /iam';

/** The word that clears a description or the aliases, and takes a role out of its group. */
const NONE = 'none';
const isNone = (text: string): boolean => sameName(text, NONE);

/** The value of the choice for "no group" in the `group` option. */
const NO_GROUP_CHOICE = 'other';

/** The value of a row picked from the list of `remove`: also a row whose Discord role is gone. */
const ROW_CHOICE = /^row:(\d{1,10})$/;

/** The choices of a `group` option: the server's groups by what was typed, in their order. */
async function groupChoices(
  interaction: AutocompleteInteraction,
  ctx: AppContext,
  withNoGroup: boolean,
): Promise<Choice[]> {
  if (interaction.guildId === null) return [];
  const typed = interaction.options.getFocused().trim().toLowerCase();
  const { groups } = await ctx.selfRoles.stored(interaction.guildId);
  const choices = groups
    .filter((group) => group.name.toLowerCase().includes(typed))
    .map((group) => ({
      name: truncate(`${group.name} · ${groupRule(group)}`, CHOICE_NAME),
      value: group.name,
    }));
  if (withNoGroup && 'other (no group)'.includes(typed)) {
    choices.push({ name: 'Other (no group)', value: NO_GROUP_CHOICE });
  }
  return choices.slice(0, MAX_CHOICES);
}

/**
 * The group a text names outright; refused with what to do for any other text (`orMake`: where
 * a group that is missing could be made first).
 */
function namedGroup(
  groups: readonly SelfRoleGroup[],
  typed: string,
  orMake: boolean,
): SelfRoleGroup {
  const group = groups.find((other) => sameName(other.name, typed));
  if (!group) {
    throw new UserError(
      `There is no group ${typedText(typed)}. ` +
        (orMake
          ? 'Pick one from the list, or make it with `/admin self-roles group`.'
          : 'Pick one from the list.'),
    );
  }
  return group;
}

/**
 * The member of staff of an interaction, as the server's order of roles asks about them.
 * Manage Roles is read from the server (`GuildMember.permissions`, which counts the owner and
 * an administrator in), never from `interaction.memberPermissions`: those are the permissions
 * in the channel of the command, where an overwrite can grant "Manage Permissions", and that is
 * the very bit of Manage Roles.
 */
function staffStanding(interaction: ChatInputCommandInteraction): StaffStanding {
  if (!interaction.inCachedGuild()) {
    return { id: interaction.user.id, held: [], mayManageRoles: false };
  }
  return {
    id: interaction.user.id,
    held: [...interaction.member.roles.cache.keys()],
    mayManageRoles: interaction.member.permissions.has(PermissionFlagsBits.ManageRoles),
  };
}

/** Why a member of staff may not offer a role: which of the two things is missing. */
function notYours(problem: OfferProblem, role: ServerRole): string {
  const name = roleText(role.name);
  return problem === 'no-manage-roles'
    ? `You cannot make ${name} self-assignable: that takes the Manage Roles permission, which ` +
        'you do not have on this server. Whoever puts a role on the list gives it to everybody ' +
        'who asks.'
    : `You cannot make ${name} self-assignable: it is not below your own highest role, so you ` +
        'could not give it to anybody yourself. Somebody whose role stands above it, or the ' +
        'owner of the server, has to add it.';
}

/** A row as the answers describe it: its group, aliases and description, each on a line. */
function described(row: SelfRoleRow, groups: readonly SelfRoleGroup[]): string {
  const group = groups.find((other) => other.id === row.groupId);
  return [
    `Group: ${group ? plain(group.name) : 'Other (no group)'}`,
    `Aliases: ${row.aliases.length === 0 ? 'none' : row.aliases.map(plain).join(', ')}`,
    `Description: ${row.description === null ? 'none' : plain(row.description)}`,
  ].join('\n');
}

/** Why a role is never handed out, for the member of staff who tried to add it. */
function unfit(problem: IntrinsicProblem, role: ServerRole): string {
  const name = roleText(role.name);
  switch (problem) {
    case 'everyone':
      return `${name} cannot be self-assigned: every member has it already.`;
    case 'managed':
      return (
        `${name} cannot be self-assigned: it is managed by an integration (a bot role or the ` +
        'booster role), and Discord lets nobody hand such a role out.'
      );
    case 'moderation':
      return (
        `${name} cannot be self-assigned: ${whyModeration(role)}. I never hand out a role that ` +
        (role.moderation.length + role.channelModeration.length > 0
          ? 'grants a permission of moderation or administration.'
          : 'makes its holder staff.')
      );
    case 'above-bot':
      return (
        `${name} cannot be self-assigned: it is not below my highest role, and I can only ` +
        'give roles that are. Move my role above it in the list of roles of this server.'
      );
  }
}

function saveRefusal(problem: RoleSaveProblem, role: string): string {
  const name = roleText(role);
  switch (problem.reason) {
    case 'name-too-long':
      return (
        `${name} cannot be self-assigned: its name is longer than ${String(ROLE_NAME_LENGTH)} ` +
        'characters, which is more than I can keep. Shorten the name of the role.'
      );
    case 'description-too-long':
      return `The description may have ${String(DESCRIPTION_LENGTH)} characters at most.`;
    case 'name-taken':
      return (
        `Another self-assignable role is called ${roleText(problem.other)} already, and ` +
        'members could not tell the two apart. Rename one of the roles.'
      );
    case 'name-is-alias':
      return (
        `"${plain(role)}" is an alias of ${roleText(problem.other)}. Change the aliases of ` +
        'that role first.'
      );
    case 'alias-taken':
      return (
        `The alias "${plain(problem.alias)}" is the name or an alias of ` +
        `${roleText(problem.other)} already. Nothing was changed.`
      );
    case 'no-group':
      return 'That group no longer exists. Nothing was changed.';
  }
}

const add: SubcommandPart = {
  group: SELF_ROLES_GROUP,
  data: new SlashCommandSubcommandBuilder()
    .setName('add')
    .setDescription('Let members give themselves a role, or change what is said about one')
    .addRoleOption((option) => option.setName('role').setDescription('The role').setRequired(true))
    .addStringOption((option) =>
      option
        .setName('description')
        .setDescription('What the role is for, shown beside its name; "none" removes it')
        .setMaxLength(DESCRIPTION_LENGTH),
    )
    .addStringOption((option) =>
      option
        .setName('aliases')
        .setDescription('Other names for it, separated by commas; "none" removes them')
        .setMaxLength(MAX_ALIASES * (ALIAS_LENGTH + 2)),
    )
    .addStringOption((option) =>
      option
        .setName('group')
        .setDescription('The group it is listed under; "other" takes it out of its group')
        .setMaxLength(GROUP_NAME_LENGTH)
        .setAutocomplete(true),
    ),
  help: {
    details:
      'Makes a role of this server one that members can give themselves with `/iam`, or changes ' +
      'the description, the aliases and the group of one that is. An option you leave out stays ' +
      'as it is; aliases you give replace the ones it had.\n\nI never hand out a role that grants a ' +
      'permission of moderation or administration (in the server or through the settings of a ' +
      'channel), a role whose name makes its holder staff of mine (admin, moderator, bot ' +
      'developer), a role an integration manages, or a role that is not below my own.\n\nYou can ' +
      'add a role only if you could give it to somebody yourself: ' +
      'with the Manage Roles permission and a role of your own above it, or as the owner of the ' +
      'server.',
    examples: [
      '/admin self-roles add role:@North description:North of the river aliases:n, northside group:Regions',
      '/admin self-roles add role:@North aliases:none',
    ],
  },
  enabled: rolesEnabled,
  defer: 'ephemeral',

  async execute(interaction, ctx) {
    const guildId = guildIdOf(interaction);
    const roleId = interaction.options.getRole('role', true).id;
    const description = interaction.options.getString('description');
    const typedAliases = interaction.options.getString('aliases');
    const typedGroup = interaction.options.getString('group');

    let aliases: string[] | undefined;
    if (typedAliases !== null) {
      const parsed = parseAliases(isNone(typedAliases) ? '' : typedAliases);
      if (!parsed.ok) {
        throw new UserError(
          parsed.reason === 'alias-too-long'
            ? `The alias ${typedText(parsed.alias)} is longer than ${String(ALIAS_LENGTH)} characters.`
            : `A role can have ${String(MAX_ALIASES)} aliases at most; you gave ${String(parsed.count)}.`,
        );
      }
      aliases = parsed.aliases;
    }
    const { groups } = await ctx.selfRoles.stored(guildId);
    let groupId: number | null | undefined;
    if (typedGroup !== null) {
      groupId = isNoGroupWord(typedGroup) ? null : namedGroup(groups, typedGroup, true).id;
    }

    const outcome = await ctx.selfRoles.addRole(
      guildId,
      {
        roleId,
        ...(description === null ? {} : { description: isNone(description) ? null : description }),
        ...(aliases === undefined ? {} : { aliases }),
        ...(groupId === undefined ? {} : { groupId }),
      },
      staffStanding(interaction),
    );
    if (outcome.kind === 'unavailable') throw new UserError(ROLES_UNAVAILABLE);
    if (outcome.kind === 'no-role') {
      throw new UserError('This server no longer has that role.');
    }
    if (outcome.kind === 'unfit') throw new UserError(unfit(outcome.problem, outcome.role));
    if (outcome.kind === 'not-yours') throw new UserError(notYours(outcome.problem, outcome.role));
    if (outcome.kind === 'refused') throw new UserError(saveRefusal(outcome, outcome.role.name));
    const name = roleText(outcome.role.name);
    const lines = [
      outcome.kind === 'added'
        ? `Members can give themselves ${name} with \`/iam\` now.`
        : `${name} is changed.`,
      described(outcome.row, groups),
    ];
    if (outcome.botLacksManageRoles) {
      lines.push(
        'I lack the Manage Roles permission, so I cannot give any role to anybody until my ' +
          'role has it.',
      );
    }
    await interaction.editReply({ content: lines.join('\n') });
  },

  async autocomplete(interaction, ctx) {
    await interaction.respond(await groupChoices(interaction, ctx, true));
  },
};

/**
 * Every row of a server for `remove`, by the name its role has now (the row's own for a row
 * that leads to no role, with why it does not). The rows are read once: from the roster, or
 * as they are stored while the bot does not know the server's roles. The list of an
 * autocomplete does not wait for what resolving found to be written (`aside`).
 */
async function removable(
  ctx: AppContext,
  guildId: string,
  remember: 'wait' | 'aside',
): Promise<
  {
    row: SelfRoleRow;
    name: string;
    hasRole: boolean;
    /** The server's roles are known and none is this row's: its role no longer exists. */
    roleGone: boolean;
    problem: RoleProblem | undefined;
  }[]
> {
  const roster = await ctx.selfRoles.roster(guildId, remember);
  if (roster) {
    return roster.entries.map((entry) => ({
      row: entry.row,
      name: entry.name,
      hasRole: entry.role !== undefined,
      // Not a row that leads to no role because several are called alike: those exist.
      roleGone: entry.problem === 'gone',
      problem: entry.role === undefined ? entry.problem : undefined,
    }));
  }
  const { rows } = await ctx.selfRoles.stored(guildId);
  return [...rows]
    .sort(byRoleName)
    .map((row) => ({ row, name: row.name, hasRole: false, roleGone: false, problem: undefined }));
}

/** What the list of `remove` says after the name of a row that leads to no role. */
function withoutRole(problem: RoleProblem | undefined): string {
  switch (problem) {
    case 'gone':
      return ' · its role is gone';
    case 'ambiguous':
      return ' · several roles have its name';
    case 'duplicate':
      return ' · another entry has its role';
    default:
      return '';
  }
}

const remove: SubcommandPart = {
  group: SELF_ROLES_GROUP,
  data: new SlashCommandSubcommandBuilder()
    .setName('remove')
    .setDescription('Stop members from giving themselves a role')
    .addStringOption((option) =>
      option
        .setName('role')
        .setDescription('The self-assignable role: pick from the list')
        .setRequired(true)
        .setMaxLength(100)
        .setAutocomplete(true),
    ),
  help: {
    details:
      'Takes a role off the roles members can give themselves, with its aliases. The role itself ' +
      'stays, and so do the members who hold it. The list also has entries whose role no longer ' +
      'exists.',
    examples: ['/admin self-roles remove role:North'],
  },
  enabled: rolesEnabled,
  defer: 'ephemeral',

  async execute(interaction, ctx) {
    const guildId = guildIdOf(interaction);
    const typed = interaction.options.getString('role', true);
    const picked = ROW_CHOICE.exec(typed.trim());
    let rowId = picked ? Number(picked[1]) : undefined;
    // Read before the row goes: whether it still leads to a role decides what is said.
    const named = await removable(ctx, guildId, 'wait');
    if (rowId === undefined) {
      // Typed without picking: the name of a row as it is stored first, then as its role is
      // called now. Two rows of one name are not guessed between, and neither are two roles
      // that are called alike at present.
      const alike = named.filter(({ name, hasRole }) => hasRole && sameName(name, typed));
      if (alike.length > 1) throw new UserError(calledAlike(alike));
      const stored = named.filter(({ row }) => sameName(row.name, typed));
      const meant = stored.length > 0 ? stored : named.filter(({ name }) => sameName(name, typed));
      if (meant.length > 1) {
        throw new UserError(
          `${String(meant.length)} self-assignable roles are called ${typedText(typed)}. Pick ` +
            'the one you mean from the list.',
        );
      }
      rowId = meant[0]?.row.id;
    }
    const removed =
      rowId === undefined ? undefined : await ctx.selfRoles.removeRole(guildId, rowId);
    if (!removed) {
      throw new UserError(
        `No self-assignable role is called ${typedText(typed)}. Pick it from the list; ` +
          '`/admin self-roles list` shows them all.',
      );
    }
    // A role that no longer exists has nobody holding it: nothing is said of keeping it.
    const gone = named.find(({ row }) => row.id === removed.id)?.roleGone === true;
    await interaction.editReply({
      content:
        `${roleText(removed.name)} is no longer self-assignable. ` +
        (gone
          ? 'Its role no longer exists on this server, so nothing else changes.'
          : 'The role itself is untouched, and whoever holds it keeps it.'),
    });
  },

  async autocomplete(interaction, ctx) {
    if (interaction.guildId === null) {
      await interaction.respond([]);
      return;
    }
    const typed = interaction.options.getFocused().trim().toLowerCase();
    const choices = (await removable(ctx, interaction.guildId, 'aside'))
      .map(({ row, name, problem }) => ({ row, name: `${name}${withoutRole(problem)}` }))
      .filter(({ name }) => name.toLowerCase().includes(typed))
      .sort(beginningFirst(typed))
      .slice(0, MAX_CHOICES)
      .map(({ row, name }) => ({
        name: truncate(name === '' ? '(no name)' : name, CHOICE_NAME),
        value: `row:${String(row.id)}`,
      }));
    await interaction.respond(choices);
  },
};

/**
 * One row as a line of the list. That the bot lacks Manage Roles is every role's problem and
 * is said once above the list, not on each line.
 */
function listLine(entry: RosterEntry): string {
  const aliases =
    entry.row.aliases.length === 0 ? '' : ` [${entry.row.aliases.map(plain).join(', ')}]`;
  const description = entry.row.description === null ? '' : `: ${plain(entry.row.description)}`;
  const mark =
    entry.problem === undefined || entry.problem === 'no-manage-roles'
      ? ''
      : `\n  ⚠️ Cannot be given: ${whyNot(entry.problem, entry.role)}.`;
  return `- ${roleText(entry.name)}${aliases}${description}${mark}`;
}

const list: SubcommandPart = {
  group: SELF_ROLES_GROUP,
  data: new SlashCommandSubcommandBuilder()
    .setName('list')
    .setDescription('Show the self-assignable roles with their groups, aliases and problems'),
  help: {
    details:
      'Every role members can give themselves, by group, with its aliases and description. A ' +
      'role I cannot give at present is marked with the reason: its role is gone, it is not ' +
      'below my own, it grants a permission of moderation (or a channel grants it one, or its ' +
      'name makes its holder staff), or I lack Manage Roles.',
    examples: ['/admin self-roles list'],
  },
  enabled: rolesEnabled,
  defer: 'ephemeral',

  async execute(interaction, ctx) {
    const roster = await ctx.selfRoles.roster(guildIdOf(interaction));
    if (!roster) throw new UserError(ROLES_UNAVAILABLE);
    const { entries, groups } = roster;
    if (entries.length === 0 && groups.length === 0) {
      await interaction.editReply({
        content:
          'No role is self-assignable yet. Add one with `/admin self-roles add`, and sort the ' +
          'roles into groups with `/admin self-roles group`.',
      });
      return;
    }
    // The heading counts what members can really be given. That the bot lacks Manage Roles
    // is said once below and marks no line, so it does not count against a role here either.
    const marked = entries.filter(
      (entry) => entry.problem !== undefined && entry.problem !== 'no-manage-roles',
    ).length;
    const lines = [
      `**${count(entries.length - marked, 'self-assignable role')}**` +
        (groups.length === 0 ? '' : ` in ${count(groups.length, 'group')}`) +
        (marked === 0
          ? ''
          : `, and ${String(marked)} more that cannot be given at present (marked ⚠️)`) +
        '. Members pick them with `/iam`.',
    ];
    if (!roster.bot.mayManageRoles) {
      lines.push(
        '⚠️ I lack the Manage Roles permission: I cannot give any role to anybody until my ' +
          'role has it.',
      );
    }
    const section = (heading: string, members: readonly RosterEntry[]): void => {
      lines.push('', heading);
      if (members.length === 0) lines.push('- no roles yet');
      else lines.push(...[...members].sort(byRoleName).map(listLine));
    };
    for (const group of groups) {
      section(
        `**${plain(group.name)}** · position ${String(group.position)} · ${groupRule(group)}`,
        entries.filter((entry) => entry.group?.id === group.id),
      );
    }
    const others = entries.filter((entry) => entry.group === undefined);
    if (others.length > 0 || groups.length === 0) section('**Other** · no group', others);

    const [first = '', ...rest] = fitMessages(lines);
    await interaction.editReply({ content: first });
    for (const content of rest) {
      await interaction.followUp({ content, flags: MessageFlags.Ephemeral });
    }
  },
};

function groupRefusal(problem: GroupSaveProblem, typed: string): string {
  switch (problem.reason) {
    case 'name-empty':
      return 'A group needs a name.';
    case 'name-too-long':
      return `The name of a group may have ${String(GROUP_NAME_LENGTH)} characters at most.`;
    case 'reserved-name':
      return (
        'A group cannot be called "Other" or "None": those words mean the roles that are in ' +
        'no group.'
      );
    case 'name-taken':
      return 'Another group has that name already.';
    case 'no-group':
      return `There is no group ${typedText(typed)} to rename. Leave \`new-name\` out to make it.`;
    case 'too-many':
      return `A server can have ${String(MAX_GROUPS)} groups at most.`;
  }
}

const group: SubcommandPart = {
  group: SELF_ROLES_GROUP,
  data: new SlashCommandSubcommandBuilder()
    .setName('group')
    .setDescription('Make a group of self-assignable roles, or change one')
    .addStringOption((option) =>
      option
        .setName('name')
        .setDescription('The name of the group: a new one, or one from the list to change it')
        .setRequired(true)
        .setMaxLength(GROUP_NAME_LENGTH)
        .setAutocomplete(true),
    )
    .addBooleanOption((option) =>
      option
        .setName('pick-one')
        .setDescription('True: a member can hold only one of its roles (teams)'),
    )
    .addIntegerOption((option) =>
      option
        .setName('position')
        .setDescription('Its position among the groups in the menus of /iam, 1 first')
        .setMinValue(1)
        .setMaxValue(MAX_GROUPS),
    )
    .addStringOption((option) =>
      option
        .setName('new-name')
        .setDescription('A new name for a group that exists')
        .setMaxLength(GROUP_NAME_LENGTH),
    ),
  help: {
    details:
      'Roles are offered to members group by group: one menu per group in `/iam`, in the order ' +
      'of the groups, and the roles without a group last under "Other". With `pick-one` a ' +
      'member can hold only one role of the group: taking another gives the first one back.\n\n' +
      'Put a role into a group with `/admin self-roles add`. An option you leave out stays as ' +
      'it is.',
    examples: [
      '/admin self-roles group name:Regions',
      '/admin self-roles group name:Teams pick-one:True position:1',
    ],
  },
  enabled: rolesEnabled,
  defer: 'ephemeral',

  async execute(interaction, ctx) {
    const typed = interaction.options.getString('name', true);
    const pickOne = interaction.options.getBoolean('pick-one');
    const position = interaction.options.getInteger('position');
    const newName = interaction.options.getString('new-name');
    const saved = await ctx.selfRoles.saveGroup(guildIdOf(interaction), {
      name: typed,
      ...(pickOne === null ? {} : { pickOne }),
      ...(position === null ? {} : { position }),
      ...(newName === null ? {} : { newName }),
    });
    if (saved.kind === 'refused') throw new UserError(groupRefusal(saved, typed));
    const { group: made } = saved;
    const rule = made.pickOne
      ? 'a member can hold only one of its roles'
      : 'a member can hold any number of its roles';
    const name = `**${plain(made.name)}**`;
    await interaction.editReply({
      content:
        saved.kind === 'added'
          ? `Made the group ${name}: position ${String(made.position)}, ${rule}. Put roles ` +
            'into it with the `group` option of `/admin self-roles add`.'
          : `The group ${name} is now: position ${String(made.position)}, ${rule}.`,
    });
  },

  async autocomplete(interaction, ctx) {
    await interaction.respond(await groupChoices(interaction, ctx, false));
  },
};

const ungroup: SubcommandPart = {
  group: SELF_ROLES_GROUP,
  data: new SlashCommandSubcommandBuilder()
    .setName('ungroup')
    .setDescription('Remove a group; its roles stay self-assignable under "Other"')
    .addStringOption((option) =>
      option
        .setName('name')
        .setDescription('The group: pick from the list')
        .setRequired(true)
        .setMaxLength(GROUP_NAME_LENGTH)
        .setAutocomplete(true),
    ),
  help: {
    details:
      'Removes a group. Its roles stay self-assignable and are offered under "Other" until ' +
      'they are put into another group.',
    examples: ['/admin self-roles ungroup name:Hobbies'],
  },
  enabled: rolesEnabled,
  defer: 'ephemeral',

  async execute(interaction, ctx) {
    const guildId = guildIdOf(interaction);
    const typed = interaction.options.getString('name', true);
    const { groups } = await ctx.selfRoles.stored(guildId);
    const removed = await ctx.selfRoles.removeGroup(guildId, namedGroup(groups, typed, false).id);
    if (!removed) throw new UserError('That group was removed already.');
    const moved =
      removed.roles === 0
        ? 'It had no roles.'
        : removed.roles === 1
          ? 'Its role is under "Other" now.'
          : `Its ${String(removed.roles)} roles are under "Other" now.`;
    await interaction.editReply({
      content: `Removed the group **${plain(removed.group.name)}**. ${moved}`,
    });
  },

  async autocomplete(interaction, ctx) {
    await interaction.respond(await groupChoices(interaction, ctx, false));
  },
};

/** The parts of `/admin self-roles` (spec 4.2: asar, rsar, lsar, and the groups of plan 4C). */
export const selfRoleParts: readonly SubcommandPart[] = [add, remove, list, group, ungroup];
