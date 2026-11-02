import { PermissionFlagsBits, type Client } from 'discord.js';
import { BoundedMap } from '../bounded-map.js';
import type { ActingAnswer } from '../web/party-routes.js';
import { fetchGuildMember, memberStanding } from './member-directory.js';
import { guildMemberInfo } from './member-info.js';

/** How long the answer of a forced fetch of a member serves the map's next writes (plan 8Z). */
export const ACTING_SHARED_MS = 2_000;

/** The members whose last answer is kept for that while. */
const ANSWERS_KEPT = 5_000;

/**
 * Who presses a button of a party on the live map (plan 8M-3), as a button of the post would
 * carry them (`actingMember`: their name in the server and their team), with their roles and
 * whether they are an administrator (for the map's member role), fetched fresh from
 * Discord (`fetchGuildMember(…, true)`): a member who left a moment ago, or whose roles changed,
 * is seen as they are now. The fetch is shared per member of a server (plan 8Z): one in flight,
 * its answer reused for `ACTING_SHARED_MS` from when it came; a failure is not kept. Only the
 * map's writes come this way: `admitMember` and the other fetches stay fresh each time.
 * `not-member` for somebody who is not in the server;
 * `timed-out` for a member Discord has timed out and `pending` for one who has not finished the
 * server's membership screening, neither of whom may act there now, unless an administrator;
 * rejects when Discord cannot be asked (nothing is written then).
 */
export class DiscordWebMembers {
  private readonly asking = new Map<string, Promise<ActingAnswer>>();
  private readonly answers = new BoundedMap<string, { at: number; answer: ActingAnswer }>(
    ANSWERS_KEPT,
  );

  constructor(
    private readonly client: Client,
    private readonly now: () => number = () => Date.now(),
  ) {}

  acting(guildId: string, userId: string): Promise<ActingAnswer> {
    const key = `${guildId}:${userId}`;
    const kept = this.answers.get(key);
    if (kept && this.now() - kept.at < ACTING_SHARED_MS) return Promise.resolve(kept.answer);
    const asked = this.asking.get(key);
    if (asked) return asked;
    const asking = this.fetched(guildId, userId)
      .then((answer) => {
        this.answers.set(key, { at: this.now(), answer });
        return answer;
      })
      .finally(() => {
        this.asking.delete(key);
      });
    this.asking.set(key, asking);
    return asking;
  }

  private async fetched(guildId: string, userId: string): Promise<ActingAnswer> {
    const guild = this.client.guilds.cache.get(guildId);
    if (!guild) return { kind: 'not-member' };
    const member = await fetchGuildMember(guild, userId, true);
    if (!member) return { kind: 'not-member' };
    if (!member.permissions.has(PermissionFlagsBits.Administrator)) {
      if (member.isCommunicationDisabled()) return { kind: 'timed-out' };
      if (member.pending === true) return { kind: 'pending' };
    }
    return {
      kind: 'member',
      member: { id: member.id, ...guildMemberInfo(member) },
      standing: memberStanding(member),
    };
  }
}
