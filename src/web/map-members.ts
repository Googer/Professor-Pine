import { ADMINISTRATORS_ONLY } from '../config/server-settings.js';
import type { MemberDirectory, MemberStanding } from '../discord/member-directory.js';

/**
 * Whether a member of a server counts as one on its map (the map's member role of the server's
 * values, by id, plan 19A-1, as `mapMemberRole` gives it): every member while none is set;
 * otherwise one who has that role, or an administrator; administrators only where the file named
 * a role the server lacks (`ADMINISTRATORS_ONLY`, review F1). A member whose roles are not known
 * has none.
 */
export function countsOnTheMap(
  standing: MemberStanding | undefined,
  memberRole: string | undefined,
): boolean {
  if (memberRole === undefined) return true;
  if (standing === undefined) return false;
  if (standing.administrator) return true;
  return memberRole !== ADMINISTRATORS_ONLY && standing.roleIds.includes(memberRole);
}

/**
 * The member directory as the map asks it (`/api/me`, the parties and the first step of a
 * press): a member who does not count on the map (`countsOnTheMap`) is answered as somebody who
 * is not in the server, so that they see what a visitor who is not logged in sees. What the
 * directory keeps (a minute) is what is judged; a press judges the member fetched fresh too.
 */
export function mapMembers(
  directory: Pick<MemberDirectory, 'find'>,
  memberRoleOf: (guildId: string) => string | undefined,
): Pick<MemberDirectory, 'find'> {
  return {
    async find(guildId, userId) {
      const member = await directory.find(guildId, userId);
      const memberRole = memberRoleOf(guildId);
      if (memberRole === undefined) return member;
      return member && countsOnTheMap(member.standing, memberRole) ? member : undefined;
    },
  };
}
