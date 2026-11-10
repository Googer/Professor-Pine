import type { MemberAccess } from '../discord/party-gateway.js';

/**
 * How a member stands to a forum as Discord says it now (`PartyGateway.memberAccess`, through the
 * party service on Discord and the map's forums on the web): undefined for a forum or a member
 * Discord does not have; rejects while Discord cannot say.
 */
export type MemberAccessAsk = (
  forumId: string,
  memberId: string,
) => Promise<MemberAccess | undefined>;

/**
 * Whether somebody keeps a member out of a forum on purpose (`barred`, the gateway's rule: an
 * overwrite of their own that denies something, or one that denies the view to a role they
 * hold): the one question of every path that would put a member into a forum or have them change
 * a party there (plan 8Z-2; before it `raidChangeBarred`, for a raid's changes alone). The forum
 * is a party's (`party.forumChannelId`: signing up, a control of its post or of a copy of it in
 * another channel, a change on the map), the one a raid would move to (`/location`), or the one
 * a new train or meetup would be posted in. A forum that is only hidden until a member joins
 * something in it (`hidden`) keeps nobody out: `AccessService` lets them in. No forum (null)
 * bars nobody. Rejects while Discord cannot say; the caller refuses then.
 */
export async function forumBarred(
  memberAccess: MemberAccessAsk,
  forumId: string | null,
  memberId: string,
): Promise<boolean> {
  return forumId !== null && (await memberAccess(forumId, memberId)) === 'barred';
}
