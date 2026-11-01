import {
  DiscordAPIError,
  OverwriteType,
  PermissionFlagsBits,
  RESTJSONErrorCodes,
  type Client,
} from 'discord.js';
import type { ServerRoles } from '../domain/roles/self-roles.js';
import { isStaffRoleName } from './guards.js';
import { addedModeration, channelModeration } from './role-permissions.js';

/**
 * Why Discord would not give or take a role, as far as somebody can mend it and no retry
 * changes it:
 * - `no-permission`: the bot lacks Manage Roles, or the role is managed or not below its own;
 * - `no-role`: the server has no such role (it was deleted a moment ago);
 * - `no-member`: the server has no such member (they left a moment ago);
 * - `two-factor`: the server requires two-factor authentication of its moderators, and the
 *   account that owns the bot's application has none.
 */
export type RoleRefusal = 'no-permission' | 'no-role' | 'no-member' | 'two-factor';

/** What became of giving or taking one role. */
export type RoleWriteOutcome = 'ok' | RoleRefusal;

/**
 * Everything self-assigned roles ask of Discord, so that all above it can be tested without it.
 * A member's roles are only ever changed one role at a time: there is no way to set the whole
 * list, which would put back or strip whatever somebody else changed since the bot last looked.
 */
export interface RoleGateway {
  /**
   * The roles of a server and what the bot can do with roles there, as they are now; undefined
   * for a server the bot does not know (at this moment: its cache may lack one for a while
   * after a reconnect). Nothing is asked of Discord for this.
   */
  server(guildId: string): ServerRoles | undefined;
  /**
   * Gives a member one role; nothing changes for one who has it. `reason` goes into the
   * server's audit log. Throws for any failure `RoleRefusal` does not name.
   */
  giveRole(
    guildId: string,
    memberId: string,
    roleId: string,
    reason: string,
  ): Promise<RoleWriteOutcome>;
  /** Takes one role away from a member; nothing changes for one who lacks it. As `giveRole`. */
  takeRole(
    guildId: string,
    memberId: string,
    roleId: string,
    reason: string,
  ): Promise<RoleWriteOutcome>;
}

/** Discord's answers that somebody can mend, and that no retry changes. */
const REFUSALS: ReadonlyMap<number | string, RoleRefusal> = new Map<number, RoleRefusal>([
  [RESTJSONErrorCodes.MissingPermissions, 'no-permission'],
  [RESTJSONErrorCodes.MissingAccess, 'no-permission'],
  [RESTJSONErrorCodes.UnknownRole, 'no-role'],
  // "Invalid role" (50028) is what Discord answers instead for a role id that is none of the
  // server's when the role is named in the address of a member's role, as it is here.
  [RESTJSONErrorCodes.InvalidRole, 'no-role'],
  [RESTJSONErrorCodes.UnknownMember, 'no-member'],
  [RESTJSONErrorCodes.TwoFactorAuthenticationIsRequired, 'two-factor'],
]);

/**
 * The gateway over a discord.js client: thin, and without unit tests like the party gateway
 * (the staging run is its test). The client is handed over once it exists; before that no
 * server is known.
 *
 * The roles of a server come from the cache, which the Guilds intent keeps current (roles
 * made, changed and deleted arrive as events), and so does the bot's own member, which
 * discord.js always keeps. A role's place is its `rawPosition`, the number Discord itself
 * compares; two roles can share one, and a role level with the bot's highest is treated as
 * above it. A role is judged by the permissions it adds to those of `@everyone`
 * (`addedModeration`), by what the overwrites of the server's channels allow it on top of that
 * (`channelModeration`; the channels and their overwrites are cached under the Guilds intent
 * too, and all of them are gone through once per call, not once per role), and by whether its
 * name makes its holder staff of this bot (`isStaffRoleName`), all read at the moment of asking.
 * A thread has no overwrites of its own. A role is given with `PUT` and taken away with `DELETE`
 * of that one role of the member, which Discord allows without the member being cached or
 * fetched.
 */
export class DiscordRoleGateway implements RoleGateway {
  private current: Client | undefined;

  /** The client to talk through from now on. */
  use(client: Client): void {
    this.current = client;
  }

  server(guildId: string): ServerRoles | undefined {
    const guild = this.current?.guilds.cache.get(guildId);
    const me = guild?.members.me;
    if (!guild || !me) return undefined;
    const everyone = guild.roles.everyone.permissions.bitfield;
    /** What the overwrites of all channels together allow each role. */
    const allowed = new Map<string, bigint>();
    for (const channel of guild.channels.cache.values()) {
      if (channel.isThread()) continue;
      for (const overwrite of channel.permissionOverwrites.cache.values()) {
        if (overwrite.type !== OverwriteType.Role) continue;
        allowed.set(overwrite.id, (allowed.get(overwrite.id) ?? 0n) | overwrite.allow.bitfield);
      }
    }
    return {
      roles: guild.roles.cache.map((role) => ({
        id: role.id,
        name: role.name,
        position: role.rawPosition,
        everyone: role.id === guild.id,
        managed: role.managed,
        moderation: addedModeration(role.permissions.bitfield, everyone),
        channelModeration: channelModeration(
          role.permissions.bitfield,
          allowed.get(role.id) ?? 0n,
          everyone,
        ),
        staffName: isStaffRoleName(role.name),
      })),
      bot: {
        mayManageRoles: me.permissions.has(PermissionFlagsBits.ManageRoles),
        highestPosition: me.roles.highest.rawPosition,
      },
      ownerId: guild.ownerId,
    };
  }

  private async write(
    action: 'addRole' | 'removeRole',
    guildId: string,
    memberId: string,
    roleId: string,
    reason: string,
  ): Promise<RoleWriteOutcome> {
    const guild = this.current?.guilds.cache.get(guildId);
    if (!guild) throw new Error(`The server ${guildId} is not known`);
    if (roleId === guild.id) throw new Error('@everyone is no role to give or take');
    try {
      await guild.members[action]({ user: memberId, role: roleId, reason });
      return 'ok';
    } catch (err) {
      const refusal = err instanceof DiscordAPIError ? REFUSALS.get(err.code) : undefined;
      if (refusal) return refusal;
      throw err;
    }
  }

  giveRole(
    guildId: string,
    memberId: string,
    roleId: string,
    reason: string,
  ): Promise<RoleWriteOutcome> {
    return this.write('addRole', guildId, memberId, roleId, reason);
  }

  takeRole(
    guildId: string,
    memberId: string,
    roleId: string,
    reason: string,
  ): Promise<RoleWriteOutcome> {
    return this.write('removeRole', guildId, memberId, roleId, reason);
  }
}
