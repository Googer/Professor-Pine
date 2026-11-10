import { applyAutoStatus, noteMember } from '../domain/party/attendance.js';
import {
  blocksNewMax,
  sameSpot,
  screenshotAtBattle,
  setMaxBoss,
  setMaxEnd,
  type MaxShot,
} from '../domain/party/max.js';
import {
  isMax,
  refused,
  type GroupId,
  type MaxParty,
  type PartyProblem,
  type RaidBossRef,
  type Refusal,
} from '../domain/party/party.js';
import type { PartyStatus } from '../domain/party/status.js';
import type { MaxTier } from '../domain/pogo/max-tier.js';
import type { Logger } from '../log.js';
import { doer } from '../render/activity.js';
import { timestamp } from '../render/text.js';
import type { Member } from './attendance-service.js';
import { byMember, storedChange } from './party-change.js';
import type { PartyNotifier } from './notify-service.js';
import type { PartyLines } from './party-lines.js';
import type { PartyStore } from './party-store.js';

/**
 * What came of a change to a max battle. `gone`: there is no such active max battle. `refused`:
 * it stays as it was; for `spot-taken`, `other` is the battle that holds the spot. `ok`: the
 * battle as it is stored now; `changed` is false when it already was so.
 */
export type MaxChangeOutcome =
  | { kind: 'gone' }
  | { kind: 'refused'; reason: PartyProblem; other?: MaxParty }
  | { kind: 'ok'; party: MaxParty; changed: boolean };

/**
 * What came of a screenshot of the battle at its spot (`fromScreenshot`, plan 8X-S). `gone`: no
 * such active battle, or its end came meanwhile and the spot is free (report it anew). `joined`:
 * the same boss; `joined` whether the member was signed up, `endMoved` whether its end moved
 * later, `confirmed` whether a clean read of the end it has confirmed its time (the screenshot
 * then the post's, as for a moved end). `changed`: its boss, tier and end are the screenshot's. `refused`: another boss
 * (`max-other-boss`) or the other kind (`max-kind-change`); `party` is the battle there.
 */
export type MaxShotOutcome =
  | { kind: 'gone' }
  | { kind: 'joined'; party: MaxParty; joined: boolean; endMoved: boolean; confirmed: boolean }
  | { kind: 'changed'; party: MaxParty }
  | { kind: 'refused'; reason: PartyProblem; party: MaxParty };

export interface MaxChangeServiceOptions {
  store: PartyStore;
  /** Told after every stored change. */
  posts: { changed(partyId: string): void };
  lines: Pick<PartyLines, 'say'>;
  /** Told of every stored change of a max battle, with the member who made it. */
  notify?: Pick<PartyNotifier, 'maxChanged'>;
  /**
   * How many trainers one group of a battle holds (`lobbySize` of the settings): a member a
   * screenshot signs up is put in a group as Join puts them.
   */
  lobbySize: (party: MaxParty) => number | undefined;
  log: Logger;
  now?: () => number;
}

type MaxRefusal = Refusal & { other?: MaxParty };

/** `<member> did`, or only what happened for a reporter who asked not to be named (`doer`). */
function said(party: MaxParty, member: Member, did: string, happened: string): string {
  const who = doer(party, member);
  return who === undefined ? happened : `${who} ${did}`;
}

/** What the post is told of the meeting times a new end cancelled (`setMaxEnd`'s `removed`). */
function cancelledLines(party: MaxParty, removed: readonly string[]): string[] {
  return removed.map(
    (id) =>
      `The meeting time${party.groups.length > 1 ? ` of group ${id as GroupId}` : ''} ` +
      'no longer fits the battle and is canceled.',
  );
}

/**
 * What members change about a max battle itself (plan 8X-3): its end (`/end`) and its boss
 * (`/boss`, a rotation within an event; design 3.1). Each decides inside the store, has the post
 * shown anew and says in the post who changed what, in a line that pings nobody; the caller tells
 * the member privately. An end moved later is decided under the spot's lock (`withSpotLock`), so
 * a battle that blocks the spot again never shares it with another (`spot-taken`).
 */
export class MaxChangeService {
  private readonly now: () => number;

  constructor(private readonly options: MaxChangeServiceOptions) {
    this.now = options.now ?? (() => Date.now());
  }

  /**
   * When the battle ends; the caller has checked the time (within the day, never past the last
   * battle time: `typedMaxTime`). A meeting time after it is cancelled, said in the post. The
   * end it has already only confirms a screenshot's guessed time: said as confirmed (review A7).
   */
  async setEnd(partyId: string, member: Member, time: number): Promise<MaxChangeOutcome> {
    const { store } = this.options;
    const before = store.get(partyId);
    if (!before || !isMax(before)) return { kind: 'gone' };
    let removed: string[] = [];
    let confirmed = false;
    return store.withSpotLock(before.max.spot, () =>
      this.apply(
        partyId,
        member,
        (party, now) => {
          const set = setMaxEnd(party, time, now);
          removed = set.removed;
          confirmed = set.party.endTime === party.endTime;
          if (set.party === party) return { ok: true, party };
          const other = this.inTheWay(party, set.party, now);
          return other ? { ...refused('spot-taken'), other } : { ok: true, party: set.party };
        },
        (party) => [
          ...(party.endTime === null
            ? []
            : [
                (confirmed
                  ? said(party, member, 'confirmed the end time', 'The end time was confirmed')
                  : said(party, member, 'set the end time', 'The end time was set')) +
                  `: ${timestamp(party.endTime)}.`,
              ]),
          ...cancelledLines(party, removed),
        ],
      ),
    );
  }

  /**
   * The boss of the battle, and its tier with it (`setMaxBoss`: never between Dynamax and
   * Gigantamax, `max-kind-change`); `label` is how the line names it (`Dynamax Sneasel (1★)`),
   * already made plain by the caller.
   */
  setBoss(
    partyId: string,
    member: Member,
    change: { boss: RaidBossRef; tier: MaxTier; label: string },
  ): Promise<MaxChangeOutcome> {
    return this.apply(
      partyId,
      member,
      (party, now) => {
        const set = setMaxBoss(party, change.boss, change.tier, now);
        return set.ok ? { ok: true, party: set.party } : set;
      },
      (party) => [
        `${said(party, member, 'set the boss', 'The boss was set')}: **${change.label}**.`,
      ],
    );
  }

  /**
   * A screenshot of the battle at its spot (plan 8X-S; design 6, Matt's answers of 2026-10-22),
   * decided inside the store by `screenshotAtBattle`: the same boss signs the member up by their
   * automatic status (`autoStatus`, in a group of the lobby size), its end moved later on a clean
   * read; another boss of the kind on a newer sure screenshot changes boss, tier and end, said in
   * the post as "Boss changed to <label> from a screenshot by <member>" (`doer`), and told to the
   * notifier as `/boss` is; anything else is refused, the battle named. A battle whose end came
   * meanwhile is `gone`: its spot is free. No spot's lock: the battle holds the spot until its
   * end, and a change is refused once that has come. `mayJoin` is the caller's, before.
   */
  async fromScreenshot(
    partyId: string,
    member: Member,
    shot: MaxShot & { label: string },
    autoStatus: PartyStatus,
  ): Promise<MaxShotOutcome> {
    let over = false;
    let step: ReturnType<typeof screenshotAtBattle> | undefined;
    let joined = false;
    const outcome = await this.apply(
      partyId,
      member,
      (party, now) => {
        if (!blocksNewMax(party, now)) {
          over = true;
          return { ok: true, party };
        }
        step = screenshotAtBattle(party, shot, now);
        if (!step.ok) return step;
        const applied = applyAutoStatus(
          step.party,
          member.id,
          autoStatus,
          this.options.lobbySize(step.party),
          now,
        );
        joined = applied.joined;
        return { ok: true, party: applied.party };
      },
      (party) => {
        if (!step?.ok) return [];
        if (step.did === 'change') {
          const who = doer(party, member);
          const by = who === undefined ? '' : ` by ${who}`;
          return [
            `Boss changed to **${shot.label}** from a screenshot${by}, until ` +
              `${timestamp(party.endTime ?? shot.end)}.`,
            ...cancelledLines(party, step.removed),
          ];
        }
        return step.endMoved && party.endTime !== null
          ? [
              said(
                party,
                member,
                'set the end time from a screenshot',
                'The end time was set from a screenshot',
              ) + `: ${timestamp(party.endTime)}.`,
            ]
          : [];
      },
    );
    if (outcome.kind === 'gone' || over) return { kind: 'gone' };
    if (outcome.kind === 'refused') {
      const there = this.options.store.get(partyId);
      if (!there || !isMax(there)) return { kind: 'gone' };
      return { kind: 'refused', reason: outcome.reason, party: there };
    }
    if (step?.ok && step.did === 'change') return { kind: 'changed', party: outcome.party };
    return {
      kind: 'joined',
      party: outcome.party,
      joined,
      endMoved: step?.ok === true && step.did === 'join' && step.endMoved,
      confirmed: step?.ok === true && step.did === 'join' && step.confirmed,
    };
  }

  /** Runs one change of a max battle inside the store, and tells of it when it was written. */
  private async apply(
    partyId: string,
    member: Member,
    change: (party: MaxParty, now: number) => { ok: true; party: MaxParty } | MaxRefusal,
    lines: (party: MaxParty) => string[],
  ): Promise<MaxChangeOutcome> {
    const { store, posts, notify } = this.options;
    const seen: { before?: MaxParty } = {};
    const result = await storedChange<MaxParty, unknown, MaxRefusal>(
      store,
      partyId,
      isMax,
      (party) => {
        seen.before = party;
        const changed = change(party, this.now());
        if (!changed.ok || changed.party === party) return changed;
        return { ...changed, party: noteMember(changed.party, member.id, member) };
      },
      byMember(member),
    );
    if (result.kind === 'gone') return { kind: 'gone' };
    if (result.kind === 'refused') {
      const { reason, other } = result.refusal;
      return { kind: 'refused', reason, ...(other ? { other } : {}) };
    }
    if (result.written) {
      posts.changed(partyId);
      // Every change of a max battle by a member ends here: the notifier sees what it is about.
      if (seen.before) notify?.maxChanged(seen.before, result.party, member.id);
      const postId = result.party.forumPostId;
      if (postId !== null)
        for (const line of lines(result.party)) this.options.lines.say(postId, line);
    }
    return { kind: 'ok', party: result.party, changed: result.written };
  }

  /**
   * The other max battle a changed one would share its spot with, both blocking it: an end moved
   * later on a battle whose end had come, while another was reported there since; of its server
   * only (`PartyStore.maxAt`).
   */
  private inTheWay(before: MaxParty, after: MaxParty, now: number): MaxParty | undefined {
    if (!blocksNewMax(after, now) || blocksNewMax(before, now)) return undefined;
    return this.options.store
      .active()
      .filter(isMax)
      .find(
        (other) =>
          other.id !== after.id &&
          other.guildId === after.guildId &&
          sameSpot(other.max.spot, after.max.spot) &&
          blocksNewMax(other, now),
      );
  }
}
