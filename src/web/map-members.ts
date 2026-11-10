import type { MemberDirectory, MemberStanding } from '../discord/member-directory.js';

/** A role's name as Pine's role settings compare it: trimmed, whatever its letter case. */
function roleKey(name: string): string {
  return name.trim().toLowerCase();
}

/**
 * Whether a member of a server counts as one on its map (`settings.web.memberRole`): every
 * member while no role is named; otherwise one who has a role of that name, or an
 * administrator. A member whose roles are not known has none.
 */
export function countsOnTheMap(
  standing: MemberStanding | undefined,
  memberRole: string | undefined,
): boolean {
  if (memberRole === undefined) return true;
  if (standing === undefined) return false;
  if (standing.administrator) return true;
  const wanted = roleKey(memberRole);
  return standing.roleNames.some((name) => roleKey(name) === wanted);
}

/**
 * The member directory as the map asks it (`/api/me`, the parties and the first step of a
 * press): a member who does not count on the map (`countsOnTheMap`) is answered as somebody who
 * is not in the server, so that they see what a visitor who is not logged in sees. What the
 * directory keeps (a minute) is what is judged; a press judges the member fetched fresh too.
 */
export function mapMembers(
  directory: Pick<MemberDirectory, 'find'>,
  memberRole: string | undefined,
): Pick<MemberDirectory, 'find'> {
  if (memberRole === undefined) return directory;
  return {
    async find(guildId, userId) {
      const member = await directory.find(guildId, userId);
      return member && countsOnTheMap(member.standing, memberRole) ? member : undefined;
    },
  };
}
