import type { Config } from '../../config/index.js';
import type { Guard, LocatedInteraction } from '../../discord/command.js';
import { UserError } from '../../discord/errors.js';
import { plain, truncate } from '../../render/text.js';
import type { RoleMember } from '../../services/self-role-service.js';

/** Whether this installation has self-assigned roles at all (`settings.features.roles`). */
export const rolesEnabled = (config: Config): boolean => config.settings.features.roles;

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
