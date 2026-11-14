import { isBotManagement, mayManageServer } from '../discord/guards.js';
import type { RegionStaff } from '../services/region-admin-service.js';

/**
 * Who may edit a server's regions on the web pages (spec 2.5, plan 8M-2): what `/region`
 * admits, decided per request from the member as Discord has them now, never from the session.
 */

/** What is needed of a member, fetched fresh from Discord (`fetchGuildMember(…, true)`). */
export interface StaffFacts {
  /** The names of their roles in the server. */
  roleNames: readonly string[];
  /** Manage Server on the server (also as its owner or an administrator). */
  manageGuild: boolean;
  /** Manage Channels on the server: creating channels and deleting forums take it. */
  manageChannels: boolean;
}

/**
 * Whether somebody may edit a server's regions: `staff` with whose regions they touch; not
 * `staff`, or not a member at all; the server has no row yet; or Discord could not be asked
 * (nothing is written then, on roles nobody could check).
 */
export type StaffAnswer =
  | { kind: 'staff'; staff: RegionStaff }
  | { kind: 'not-staff' }
  | { kind: 'not-member' }
  | { kind: 'unknown-server' }
  | { kind: 'unreachable' };

/** Asks Discord who somebody is in a server, fresh, and decides (`regionStaffAnswer`). */
export interface RegionStaffSource {
  check(guildId: string, userId: string): Promise<StaffAnswer>;
}

/**
 * Whether a member may edit a server's regions by their roles and permissions: the same check as
 * the guard of `/region edit` and `/region import` (`requireServerAdmin`, plan 19C-2:
 * `mayManageServer`, the server's owner, who may manage it, its staff by role, the bot's owner),
 * and the permission Discord asks of whoever is offered `/region` by default (Manage Server, its
 * `default_member_permissions`): on the web nobody but the bot checks, so it checks both, which
 * come to Manage Server (Discord says it of the server's owner and administrators too). One rule
 * for the decision (`regionStaffAnswer`, on the member fetched fresh), the map's hint (`/api/me`'s
 * `mayEditRegions`, plan 8M-10) and the editor of a server in setup (`guildRoutes`), the last two
 * on the member as the directory keeps them; a Manage Server the facts do not say is none.
 */
export function mayEditRegions(
  facts: { roleNames: readonly string[]; manageGuild?: boolean },
  userId: string,
  ownerId: string,
): boolean {
  const manageGuild = facts.manageGuild === true;
  return (
    manageGuild &&
    mayManageServer({ roleNames: facts.roleNames, manageGuild, guildOwner: false }, userId, ownerId)
  );
}

/**
 * The decision, from what Discord says of the member (`mayEditRegions`). Whether they may create
 * channels is their own Manage Channels on the server, as `regionStaff` reads it for the command;
 * whether they may remove a region is whether `/region remove` lets them (`isBotManagement`, plan
 * 19C-2: staff by role, the bot's owner), the save refusing a removal to anybody else.
 */
export function regionStaffAnswer(
  member: StaffFacts | undefined,
  userId: string,
  ownerId: string,
  server: string,
  guildRow: number | undefined,
): StaffAnswer {
  if (!member) return { kind: 'not-member' };
  if (!mayEditRegions(member, userId, ownerId)) return { kind: 'not-staff' };
  if (guildRow === undefined) return { kind: 'unknown-server' };
  return {
    kind: 'staff',
    staff: {
      staffId: userId,
      guildId: guildRow,
      server,
      mayManageChannels: member.manageChannels,
      mayRemoveRegions: isBotManagement(member.roleNames, userId, ownerId),
    },
  };
}
