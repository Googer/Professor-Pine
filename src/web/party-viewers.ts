import { BoundedMap } from '../bounded-map.js';
import type { MemberDirectory, MemberStanding } from '../discord/member-directory.js';
import type { MemberAccess } from '../discord/party-gateway.js';
import { MembersClosingError } from './paced-members.js';
import type { Logger } from '../log.js';

/** How long what Discord said of a member and a forum is used before it is asked again. */
export const BARRED_FRESH_MS = 60_000;
/**
 * How long after Discord last said somebody is a member of a server (or what they may see of a
 * forum) that is still believed, read-only, while Discord cannot be asked.
 */
export const MEMBER_SEEN_MS = 30 * 60_000;
/** How many answers are kept of each kind (oldest out). */
const KEPT = 10_000;

/**
 * Who is asking for a server's parties on the live map (spec 2.5): not a member (nothing to
 * see); a member, with the forums somebody keeps them out of (their parties are not listed) and
 * whether the map is read-only (Discord could not be asked: what it said last is used); or
 * `unconfirmed`, Discord could not be asked and has not said lately that they are a member.
 * A member's `standing` is what the directory said of their roles (undefined while read-only):
 * whether they are staff, who may change any raid (plan 8M-4).
 */
export type PartyViewer =
  | { kind: 'not-member' }
  | { kind: 'unconfirmed' }
  | {
      kind: 'member';
      readOnly: boolean;
      barred: Set<string>;
      /**
       * The forums they cannot see on Discord by their roles, though nobody keeps them out
       * (`hidden`; plan 8M-8B, review W-7): their parties are shown, but not theirs to report.
       */
      hidden: Set<string>;
      standing: MemberStanding | undefined;
    };

/** Whether somebody is a member (`PartyViewers.membership`), before the forums are asked. */
export type Membership =
  | { kind: 'not-member' }
  | { kind: 'unconfirmed' }
  | { kind: 'member'; readOnly: boolean; standing: MemberStanding | undefined };

export interface PartyViewersOptions {
  /** Whether somebody is a member of a server (kept a minute by the directory). */
  members: Pick<MemberDirectory, 'find'>;
  /** The same for a page's own asks, paced (`PacedMembers`); `members` unless given. */
  asks?: Pick<MemberDirectory, 'find'>;
  /** How a member stands to a forum (`PartyGateway.memberAccess`). */
  forums: { memberAccess(forumId: string, memberId: string): Promise<MemberAccess | undefined> };
  log: Logger;
  now: () => number;
}

/**
 * Decides per request who sees which parties on the map, from what Discord says, never from the
 * session (spec 2.5): a member of the server sees every active party of it except those in a
 * forum they are barred from (`memberAccess` says `barred`: an overwrite somebody set to keep
 * them out). What Discord said of a member and a forum is used for a minute
 * (`BARRED_FRESH_MS`), so that a page that asks many times a minute does not have every forum
 * looked at each time. While Discord cannot be asked, a member Discord said lately
 * (`MEMBER_SEEN_MS`) is a member still, read-only, with what it said last of each forum; a forum
 * it said nothing of lately is hidden, and anybody else is `unconfirmed`. Once Discord failed
 * in a request, nothing more is asked of it in that request (one warning in the log).
 */
export class PartyViewers {
  /** `<guild>:<user>`: when Discord last said they are a member. */
  private readonly seen = new BoundedMap<string, number>(KEPT);
  /** `<forum>:<user>`: what Discord said last, and when. */
  private readonly forums = new BoundedMap<
    string,
    { barred: boolean; hidden: boolean; at: number }
  >(KEPT);

  constructor(private readonly options: PartyViewersOptions) {}

  /**
   * Whether somebody is a member of the server, before anything of it is read (the directory's
   * answer, kept a minute): a member Discord said lately is one still, read-only, while it cannot
   * be asked; anybody else then is `unconfirmed`.
   */
  membership(guildId: string, userId: string): Promise<Membership> {
    return this.memberBy(this.options.members, guildId, userId);
  }

  /**
   * `membership` for what a page asks unprompted, its lists, its posts and its stream: a fresh fetch
   * of Discord waits its turn in the paced queue (`asks`, review D2). A press never comes this way.
   */
  askedMembership(guildId: string, userId: string): Promise<Membership> {
    return this.memberBy(this.options.asks ?? this.options.members, guildId, userId);
  }

  private async memberBy(
    members: Pick<MemberDirectory, 'find'>,
    guildId: string,
    userId: string,
  ): Promise<Membership> {
    const { log, now } = this.options;
    const key = `${guildId}:${userId}`;
    try {
      const member = await members.find(guildId, userId);
      if (member === undefined) {
        this.seen.delete(key);
        return { kind: 'not-member' };
      }
      this.seen.set(key, now());
      return { kind: 'member', readOnly: false, standing: member.standing };
    } catch (err) {
      // The web server is closing: nobody's failure, and whoever asks is told so.
      if (err instanceof MembersClosingError) return { kind: 'unconfirmed' };
      log.warn(
        { err, guild: guildId, user: userId },
        'could not ask whether somebody on the web pages is a member',
      );
      const at = this.seen.get(key);
      if (at === undefined || now() - at >= MEMBER_SEEN_MS) return { kind: 'unconfirmed' };
      return { kind: 'member', readOnly: true, standing: undefined };
    }
  }

  /**
   * Who is asking, with the forums of `forumIds` they are kept out of; `asked`: what
   * `membership` said earlier in this request, so that a route can refuse somebody before it
   * reads what decides the forums (Discord is not asked again).
   */
  async viewer(
    guildId: string,
    userId: string,
    forumIds: Iterable<string>,
    asked?: Membership,
  ): Promise<PartyViewer> {
    const member = asked ?? (await this.membership(guildId, userId));
    if (member.kind !== 'member') return member;
    let { readOnly } = member;
    const barred = new Set<string>();
    const hidden = new Set<string>();
    for (const forumId of new Set(forumIds)) {
      // Once Discord failed in this request it is not asked again in it (one warning).
      const answer = await this.barredFrom(forumId, userId, readOnly);
      if (answer.unreachable) readOnly = true;
      if (answer.barred) barred.add(forumId);
      else if (answer.hidden) hidden.add(forumId);
    }
    return { kind: 'member', readOnly, barred, hidden, standing: member.standing };
  }

  /**
   * Whether the member is kept out of the forum: asked of Discord at most once a minute; when it
   * cannot be asked, what it said within `MEMBER_SEEN_MS`, or else barred (hidden, to be safe).
   * `unreachable`: Discord failed earlier in this request, so it is not asked again.
   */
  private async barredFrom(
    forumId: string,
    userId: string,
    unreachable: boolean,
  ): Promise<{ barred: boolean; hidden: boolean; unreachable: boolean }> {
    const { forums, log, now } = this.options;
    const key = `${forumId}:${userId}`;
    const kept = this.forums.get(key);
    if (kept && now() - kept.at < BARRED_FRESH_MS)
      return { barred: kept.barred, hidden: kept.hidden, unreachable: false };
    const lately = kept !== undefined && now() - kept.at < MEMBER_SEEN_MS;
    // Not asked: what Discord said lately, or barred (hidden, to be safe).
    const guessed = { barred: lately ? kept.barred : true, hidden: lately && kept.hidden };
    if (unreachable) return { ...guessed, unreachable: true };
    try {
      const access = await forums.memberAccess(forumId, userId);
      const barred = access === 'barred';
      const hidden = access === 'hidden';
      this.forums.set(key, { barred, hidden, at: now() });
      return { barred, hidden, unreachable: false };
    } catch (err) {
      log.warn(
        { err, forum: forumId, user: userId },
        'could not ask whether a member on the web pages is kept out of a forum',
      );
      return { ...guessed, unreachable: true };
    }
  }
}
