import { SlashCommandBuilder, type AutocompleteInteraction } from 'discord.js';
import type { AppContext } from '../../app-context.js';
import { isSnowflake } from '../../db/snowflake.js';
import type { SimpleCommand } from '../../discord/command.js';
import { UserError } from '../../discord/errors.js';
import { guildIdOf, requireGuild } from '../../discord/guards.js';
import { MEMBER_WRITE_THROTTLE } from '../../discord/throttle.js';
import {
  entriesCalled,
  findEntry,
  suggestEntries,
  type Roster,
  type RosterEntry,
} from '../../domain/roles/self-roles.js';
import { plain, truncate } from '../../render/text.js';
import type { RoleChangeOutcome } from '../../services/self-role-service.js';
import { beginningFirst, CHOICE_NAME, MAX_CHOICES, type Choice } from '../choices.js';
import {
  actingRoleMember,
  requireJoined,
  roleMember,
  ROLES_UNAVAILABLE,
  rolesEnabled,
  roleText,
  STILL_WORKING,
  typedText,
} from './shared.js';
import { showRoleMenus } from './menus.js';
import { calledAlike, failureSentences, memberProblem, namesOf } from './words.js';
import { answer } from '../../discord/late-reply.js';

/**
 * The value of a role picked from the list of the `role` option: the id of the Discord role
 * after `id:`. Anything else that is sent was typed, and is read as a name or an alias in full.
 */
const ROLE_CHOICE = 'id:';
const choiceValue = (entry: RosterEntry): string => `${ROLE_CHOICE}${entry.role?.id ?? ''}`;

/** The id of the role a picked choice names; undefined for text that is none. */
function pickedRoleId(typed: string): string | undefined {
  const text = typed.trim();
  if (!text.startsWith(ROLE_CHOICE)) return undefined;
  const id = text.slice(ROLE_CHOICE.length);
  return isSnowflake(id) ? id : undefined;
}

/**
 * The entry a `role` option means: the one picked from the list, or the one the text names
 * outright. A typed name that several listed roles have at present is refused.
 */
function meantEntry(roster: Roster, typed: string): RosterEntry | undefined {
  const picked = pickedRoleId(typed);
  if (picked !== undefined) return roster.entries.find((entry) => entry.role?.id === picked);
  const alike = entriesCalled(roster.entries, typed);
  if (alike.length > 1) throw new UserError(calledAlike(alike));
  return findEntry(roster.entries, typed);
}

/** The choices for a `role` option: these entries by what was typed, in names and aliases. */
function roleChoices(entries: readonly RosterEntry[], typed: string): Choice[] {
  const text = typed.trim().toLowerCase();
  const words = text.split(/\s+/).filter(Boolean);
  return entries
    .filter((entry) => {
      const names = [entry.name, ...entry.row.aliases].join('\n').toLowerCase();
      return words.every((word) => names.includes(word));
    })
    .map((entry) => ({ entry, name: entry.name }))
    .sort(beginningFirst(text))
    .slice(0, MAX_CHOICES)
    .map(({ entry }) => ({
      name: truncate(
        entry.row.description === null ? entry.name : `${entry.name} · ${entry.row.description}`,
        CHOICE_NAME,
      ),
      value: choiceValue(entry),
    }));
}

/** The roster and the member of an autocomplete; undefined where there is nothing to offer. */
async function offered(interaction: AutocompleteInteraction, ctx: AppContext) {
  const member = roleMember(interaction);
  if (!member || interaction.guildId === null) return undefined;
  // An autocomplete has no time to wait for what resolving the rows found to be written.
  const roster = await ctx.selfRoles.roster(interaction.guildId, 'aside');
  if (!roster) return undefined;
  return { roster, held: new Set(ctx.selfRoles.heldNow(interaction.guildId, member)) };
}

/**
 * A change of one role that was begun; refused with the sentence otherwise. Undefined for a
 * change that was dropped because the interaction ran out while it waited its turn: nothing can
 * be said through that interaction any more, so the handler says nothing.
 */
function carried(
  outcome: RoleChangeOutcome,
): Extract<RoleChangeOutcome, { kind: 'done' | 'partial' }> | undefined {
  if (outcome.kind === 'unavailable') throw new UserError(ROLES_UNAVAILABLE);
  if (outcome.kind !== 'refused') return outcome;
  if (outcome.reason === 'busy') throw new UserError(STILL_WORKING);
  return undefined;
}

/**
 * `/iam` (spec 4.2; the legacy `!iam`): a member gives themself one of the roles the server
 * offers, or without `role` gets the menus of all of them (`menus.ts`). Private, and tied to no
 * channel (spec 3.2).
 */
export const iam: SimpleCommand = {
  data: new SlashCommandBuilder()
    .setName('iam')
    .setDescription('Pick the roles this server offers its members, or give yourself one')
    .addStringOption((option) =>
      option
        .setName('role')
        .setDescription('One role: type part of its name and pick from the list')
        .setMaxLength(100)
        .setAutocomplete(true),
    ),
  help: {
    category: 'roles',
    details:
      'The roles this server lets its members take themselves: your region, your team and the ' +
      'like.\n\nWithout `role` you get menus, one per group of roles, with your own roles ticked: ' +
      'tick and untick, and a menu takes effect when you close it. With `role` you get that ' +
      'one role: pick it from the list that appears while you type.\n\nOf some groups of roles ' +
      '(teams) you can hold only one: taking another one gives the first back. `/iamnot` ' +
      'takes a role away again.',
    examples: ['/iam', '/iam role:Mystic'],
  },
  enabled: rolesEnabled,
  guards: [requireGuild, requireJoined],
  defer: 'late',
  throttle: MEMBER_WRITE_THROTTLE,

  async execute(interaction, ctx) {
    const guildId = guildIdOf(interaction);
    const member = actingRoleMember(interaction);
    const typed = interaction.options.getString('role');
    if (typed === null || typed.trim() === '') {
      await showRoleMenus(interaction, ctx);
      return;
    }
    const roster = await ctx.selfRoles.roster(guildId);
    if (!roster) throw new UserError(ROLES_UNAVAILABLE);
    const entry = meantEntry(roster, typed);
    if (!entry) {
      const near = suggestEntries(
        roster.entries.filter((other) => other.problem === undefined),
        typed,
      );
      throw new UserError(
        `No self-assignable role is called ${typedText(typed)}.` +
          (near.length === 0 ? '' : ` Did you mean ${namesOf(near, 'or')}?`) +
          ' Pick the role from the list that appears while you type.',
      );
    }
    const name = roleText(entry.name);
    if (!entry.role) {
      throw new UserError(memberProblem(name, { reason: entry.problem ?? 'gone', entry }));
    }
    const outcome = carried(
      await ctx.selfRoles.change(guildId, member, { give: [entry.role.id], take: [] }),
    );
    if (!outcome) return;
    const { plan, given, taken } = outcome;
    const [skipped] = plan.skipped;
    if (skipped) throw new UserError(memberProblem(name, skipped));
    // What was really done is said first; what Discord stopped, after it.
    const sentences: string[] = [];
    if (given.length > 0) sentences.push(`You have ${name} now.`);
    else if (outcome.kind === 'done') sentences.push(`You have ${name} already.`);
    if (taken.length > 0) {
      sentences.push(
        `I took ${namesOf(taken)} away: only one role of the group ` +
          `${plain(entry.group?.name ?? '')} can be held at a time.`,
      );
    }
    if (outcome.kind === 'partial') sentences.push(...failureSentences(outcome));
    await answer(interaction, { content: sentences.join(' ') });
  },

  async autocomplete(interaction, ctx) {
    const found = await offered(interaction, ctx);
    await interaction.respond(
      found
        ? roleChoices(
            found.roster.entries.filter((entry) => entry.problem === undefined),
            interaction.options.getFocused(),
          )
        : [],
    );
  },
};

/** `/iamnot` (spec 4.2; the legacy `!iamnot`): a member gives one of those roles back. */
export const iamnot: SimpleCommand = {
  data: new SlashCommandBuilder()
    .setName('iamnot')
    .setDescription('Give back a role you gave yourself')
    .addStringOption((option) =>
      option
        .setName('role')
        .setDescription('One of your roles: pick from the list')
        .setRequired(true)
        .setMaxLength(100)
        .setAutocomplete(true),
    ),
  help: {
    category: 'roles',
    details:
      'Takes away one of the roles this server lets its members take themselves. The list that ' +
      'appears while you type shows those you have. Roles that are not self-assignable are ' +
      'not on it.',
    examples: ['/iamnot role:North'],
  },
  enabled: rolesEnabled,
  guards: [requireGuild, requireJoined],
  defer: 'late',
  throttle: MEMBER_WRITE_THROTTLE,

  async execute(interaction, ctx) {
    const guildId = guildIdOf(interaction);
    const member = actingRoleMember(interaction);
    const typed = interaction.options.getString('role', true);
    const roster = await ctx.selfRoles.roster(guildId);
    if (!roster) throw new UserError(ROLES_UNAVAILABLE);
    const entry = meantEntry(roster, typed);
    if (!entry) {
      throw new UserError(
        `No self-assignable role is called ${typedText(typed)}. Pick one of your roles from the ` +
          'list that appears while you type.',
      );
    }
    const name = roleText(entry.name);
    if (!entry.role) {
      // Nobody holds a role that does not exist.
      await answer(interaction, { content: `You do not have ${name}.` });
      return;
    }
    const outcome = carried(
      await ctx.selfRoles.change(guildId, member, { give: [], take: [entry.role.id] }),
    );
    if (!outcome) return;
    const [skipped] = outcome.plan.skipped;
    if (skipped) throw new UserError(memberProblem(name, skipped));
    await answer(interaction, {
      content:
        outcome.kind === 'partial'
          ? failureSentences(outcome).join(' ')
          : outcome.taken.length === 0
            ? `You do not have ${name}.`
            : `You no longer have ${name}.`,
    });
  },

  async autocomplete(interaction, ctx) {
    const found = await offered(interaction, ctx);
    await interaction.respond(
      found
        ? roleChoices(
            found.roster.entries.filter(
              (entry) => entry.role !== undefined && found.held.has(entry.role.id),
            ),
            interaction.options.getFocused(),
          )
        : [],
    );
  },
};
