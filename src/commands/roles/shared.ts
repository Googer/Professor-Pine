import type { ServerValues } from '../../config/server-settings.js';
import type { Guard, LocatedInteraction } from '../../discord/command.js';
import { UserError } from '../../discord/errors.js';
import { plain, truncate } from '../../render/text.js';
import type { RoleMember } from '../../services/self-role-service.js';

/** What staff are told to set where a server's members give themselves no roles (plan 19A-1). */
export const ROLES_NOT_SET_UP = 'Staff turn on self-assigned roles in /admin settings.';

/**
 * Whether a server's members give themselves roles (its `features.roles`, plan 19A-1): `/iam`,
 * `/iamnot` and `/admin self-roles` are set up only there (`CommandHandler.setUpIn`).
 */
export const rolesSetUp = (values: ServerValues): string | undefined =>
  values.features.roles ? undefined : ROLES_NOT_SET_UP;

/** A role in a sentence: its name in bold, never a mention (nothing here may ping). */
export function roleText(name: string): string {
  const shown = plain(name).replace(/\\+$/, '');
  return `**${shown === '' ? '(no name)' : shown}**`;
}

/** Text somebody typed, quoted in an answer. */
export function typedText(text: string): string {
  return `"${plain(truncate(text.trim(), 80))}"`;
}

/** "A", "A and B", "A, B and C"; with another word for "and": "A, B or C". */
export function listed(items: readonly string[], and = 'and'): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} ${and} ${items.at(-1) ?? ''}`;
}

/** What a member or staff is told while the bot does not know the server's roles. */
export const ROLES_UNAVAILABLE =
  'I cannot see the roles of this server at the moment. Try again in a minute.';

/**
 * For what gives or takes a role: a member who has not passed the server's membership screening
 * yet (they have not accepted its rules; `GuildMember.pending`) is refused. A role given to
 * them would let them into the server past the very step that is to come first.
 */
export const requireJoined: Guard = (interaction) => {
  if (interaction.inCachedGuild() && interaction.member.pending) {
    throw new UserError('Finish joining this server first: accept its rules, then try again.');
  }
};

/** What a member is told whose earlier changes of roles are still running or waiting. */
export const STILL_WORKING = 'I am still working on your earlier changes. Try again in a moment.';

/**
 * The member of an interaction as self-assigned roles need them: who they are and the roles the
 * interaction shows them with, by id, without the role every member has (whose id is the
 * server's), and when the interaction was made: that is the moment the roles are of. The bot
 * keeps no member list, so this is all it knows of a member's roles. Undefined outside a server
 * the bot is in.
 */
export function roleMember(interaction: LocatedInteraction): RoleMember | undefined {
  if (!interaction.inCachedGuild()) return undefined;
  const everyone = interaction.guildId;
  return {
    id: interaction.user.id,
    held: [...interaction.member.roles.cache.keys()].filter((id) => id !== everyone),
    seenAt: interaction.createdTimestamp,
  };
}

/** As `roleMember`, for a handler behind `requireGuild`; refused like the guard refuses. */
export function actingRoleMember(interaction: LocatedInteraction): RoleMember {
  const member = roleMember(interaction);
  if (!member) throw new UserError('This only works in a server.');
  return member;
}
