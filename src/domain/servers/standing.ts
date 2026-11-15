/**
 * What a server's values say of who may see the map and whether its moderators can be reached
 * (plan 19A-1, `servers.md`; review F1, F2), and whether visitors who are not logged in see the
 * map at all (plan 19C-4): pure, over the few values they read, so that the domain
 * (`reportRefusal`), the services, the panel and the web ask the same rule.
 */

/** The settings the fill could not find whose name is kept (`ServerValues.unmatched`). */
export type UnmatchedKey = 'roles.mapMember' | 'channels.moderation';

/** What these rules read of a server's values (`ServerValues`). */
export interface ServerStanding {
  channels: { moderation?: string };
  roles: { mapMember?: string };
  unmatched?: readonly UnmatchedKey[];
}

/**
 * What `mapMemberRole` gives where the file named a member role the fill could not find: no
 * member has it, so the map counts administrators only, as it did when the name matched no role.
 */
export const ADMINISTRATORS_ONLY = 'administrators-only';

/**
 * The map's member role as the map applies it (plan 19A-1, review F1): its id; undefined where
 * none is set (every member counts); `ADMINISTRATORS_ONLY` where the file named one the fill
 * could not find, until staff choose one.
 */
export function mapMemberRole(
  values: Pick<ServerStanding, 'roles' | 'unmatched'>,
): string | undefined {
  if (values.roles.mapMember !== undefined) return values.roles.mapMember;
  return values.unmatched?.includes('roles.mapMember') === true ? ADMINISTRATORS_ONLY : undefined;
}

/**
 * Whether a server's web map is open to visitors who are not logged in (plan 19C-4; spec "The
 * web"): what its staff set (`publicMap`), else the instance's default: closed on an open
 * instance (`servers: "open"`), open on one that lists its servers or none, so that its public
 * view stays. A closed one answers such a visitor as a server Pine is not in.
 */
export function publicMapOn(values: { publicMap?: boolean }, instance: { open: boolean }): boolean {
  return values.publicMap ?? !instance.open;
}

/**
 * Whether a server has a moderators' channel (plan 19A-1, review F2): meetup safety and reports
 * are on. Also where the file named one the fill could not find: on, but unreachable (meetups
 * that need approval are refused, reports are not sent) until staff choose one.
 */
export function moderatorsNamed(values: Pick<ServerStanding, 'channels' | 'unmatched'>): boolean {
  return (
    values.channels.moderation !== undefined ||
    values.unmatched?.includes('channels.moderation') === true
  );
}
