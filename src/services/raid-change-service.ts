import type { Settings } from '../config/settings.js';
import type { Gym } from '../db/repositories/gym-repository.js';
import type { Region } from '../db/repositories/region-repository.js';
import { noteMember, releaseAsked } from '../domain/party/attendance.js';
import { raidBossTierMoved, type BossTierMove } from '../domain/party/boss-move.js';
import {
  isRaid,
  membersWhere,
  refused,
  type Change,
  type GroupId,
  type PartyProblem,
  type RaidBossRef,
  type RaidParty,
  type Refusal,
} from '../domain/party/party.js';
import {
  certainMoves,
  fitMeetingTimes,
  raidStage,
  raidStandingAt,
  setBoss,
  setEndTime,
  setGym,
  setHatchedDuration,
  setHatchTime,
  setMoveset,
  standsAtGym,
  timeConfirmed,
} from '../domain/party/raid.js';
import { PartyStatus } from '../domain/party/status.js';
import { eggNeedsHatchTime, type RaidTier } from '../domain/pogo/raid-tier.js';
import type { RaidDurationRules } from '../domain/time/raid-durations.js';
import type { Logger } from '../log.js';
import { doer } from '../render/activity.js';
import { bossMovedLine } from '../render/boss-changes.js';
import { clockOrDate, endSentence, plain, timestamp } from '../render/text.js';
import type { Member } from './attendance-service.js';
import type { GameDataProvider } from './game-data-service.js';
import type { PartyNotifier } from './notify-service.js';
import { byMember, storedChange } from './party-change.js';
import type { PartyLines } from './party-lines.js';
import type { PostsRefused } from '../domain/party/post-permissions.js';
import type { RelocateOutcome } from './party-service.js';
import type { PartyStore } from './party-store.js';
import { gymRegionsInGuild, type RegionProvider } from './region-directory.js';

/**
 * What came of a change to a raid. `gone`: there is no such active raid. `refused`: the raid
 * stays as it was; for `gym-taken`, `other` is the raid that holds the gym, for `posts-refused`
 * `refused` what the bot lacks in the other region's forum. `ok`: the raid as it
 * is stored now; `changed` is false when it already was so. `from` is set when the raid moved to
 * another region: the party it was, which has ended; `party` is then a new party with a post of
 * its own.
 */
export type RaidChangeOutcome =
  | { kind: 'gone' }
  | { kind: 'refused'; reason: PartyProblem; other?: RaidParty; refused?: PostsRefused }
  | { kind: 'ok'; party: RaidParty; changed: boolean; from?: RaidParty };

export interface RaidChangeServiceOptions {
  store: PartyStore;
  /**
   * Told after every stored change; also knows the durations in effect and how a raid moves to
   * another region.
   */
  posts: {
    changed(partyId: string): void;
    rules(): RaidDurationRules;
    relocate(
      partyId: string,
      gym: Gym,
      region: Region,
      by?: Member,
      moved?: (party: RaidParty) => Promise<unknown>,
    ): Promise<RelocateOutcome>;
  };
  lines: Pick<PartyLines, 'say'>;
  /** Takes away the completion questions nobody has to answer any more. */
  questions?: { removeQuestions(partyId: string): Promise<void> };
  gyms: { get(id: number): Gym | undefined; regionsOf(gymId: number): string[] };
  regions: Pick<RegionProvider, 'byId' | 'byChannel'>;
  gameData: GameDataProvider;
  /** Told of every stored change of a raid, with the member who made it. */
  notify?: Pick<PartyNotifier, 'raidChanged'>;
  settings: Settings;
  log: Logger;
  now?: () => number;
}

/**
 * Where a move to a gym takes a raid. `local`: the gym lies in the raid's own region (or is the
 * gym the raid is at), and the raid stays the party it is. `region`: it lies in that other
 * region of the same server, whose forum gets the raid. `nowhere`: it lies in no region of the
 * raid's server that has a forum, and the raid cannot move there.
 */
export type GymMove = { kind: 'local' } | { kind: 'region'; region: Region } | { kind: 'nowhere' };

/**
 * The party as it was when setting a time or a length changed none of its times (nor made a time
 * guessed from a screenshot sure).
 */
function unlessSame(before: RaidParty, after: RaidParty): RaidParty {
  return before.hatchTime === after.hatchTime &&
    before.endTime === after.endTime &&
    before.lastPossibleTime === after.lastPossibleTime &&
    before.raid.hatchedDuration === after.raid.hatchedDuration &&
    before.raid.screenshot === after.raid.screenshot &&
    before.deletionTime === after.deletionTime
    ? before
    : after;
}

/** What the post is told about meeting times that a correction of the raid's times touched. */
function meetingLines(fitted: ReturnType<typeof fitMeetingTimes>): string[] {
  const { party, moved, removed } = fitted;
  const whose = (id: GroupId): string => (party.groups.length > 1 ? ` of group ${id}` : '');
  return [
    ...moved.map((id) => {
      const time = party.groups.find((group) => group.id === id)?.startTime ?? 0;
      return `The meeting time${whose(id)} moves with it: ${timestamp(time)}.`;
    }),
    ...removed.map((id) => `The meeting time${whose(id)} no longer fits the raid and is canceled.`),
  ];
}

/** A refusal of a change of a raid: for `gym-taken` with the raid that holds the gym. */
type RaidRefusal = Refusal & { other?: RaidParty };
type Decision = { ok: true; party: RaidParty } | RaidRefusal;

/**
 * The beginning of a line about a change of a raid: who did it and what, or only what
 * happened when it was the reporter who asked not to be named (`doer`).
 */
function said(party: RaidParty, member: Member, did: string, happened: string): string {
  const who = doer(party, member);
  return who === undefined ? happened : `${who} ${did}`;
}

/**
 * What members change about a raid itself: its times, how long it lasts, its boss, the boss's
 * moves and its gym. The commands and the "Set time" form end here. Every method decides inside
 * the store, has the post shown anew and says in the post who changed what, in a line that pings
 * nobody; the caller tells the member privately.
 *
 * A change that would make the raid stand in the way of a new report for a gym (a later end,
 * another kind of raid, another gym) is made under that gym's lock and refused with `gym-taken`
 * when another raid already does (spec 5.2).
 */
export class RaidChangeService {
  private readonly now: () => number;

  constructor(private readonly options: RaidChangeServiceOptions) {
    this.now = options.now ?? (() => Date.now());
  }

  /** A time as a line names it: the clock time, with the date when it is far off. */
  private when(time: number): string {
    return clockOrDate(time, this.now());
  }

  /**
   * When the egg hatches (or hatched); the end follows. The caller has checked the time. A time
   * guessed from a screenshot is then no guess (also for the end); a hatch time that stays only
   * confirms it, and the post says so.
   */
  setHatchTime(partyId: string, member: Member, time: number): Promise<RaidChangeOutcome> {
    let confirmed = false;
    return this.apply(
      partyId,
      member,
      (party, rules, now) => {
        const set = setHatchTime(timeConfirmed(party), time, rules, now);
        confirmed = set.hatchTime === party.hatchTime;
        return { ok: true, party: unlessSame(party, set) };
      },
      (party) =>
        party.hatchTime === null
          ? undefined
          : (confirmed
              ? said(party, member, 'confirmed the hatch time', 'The hatch time was confirmed')
              : said(party, member, 'set the hatch time', 'The hatch time was set')) +
            `: ${this.when(party.hatchTime)}.`,
    );
  }

  /**
   * When the raid ends; the hatch time follows. The caller has checked the time. An end that
   * stays only confirms a time guessed from a screenshot, and the post says so.
   */
  setEndTime(partyId: string, member: Member, time: number): Promise<RaidChangeOutcome> {
    let confirmed = false;
    return this.apply(
      partyId,
      member,
      (party, rules, now) => {
        const set = setEndTime(timeConfirmed(party), time, rules, now);
        confirmed = set.endTime === party.endTime;
        return { ok: true, party: unlessSame(party, set) };
      },
      (party) =>
        party.endTime === null
          ? undefined
          : (confirmed
              ? said(party, member, 'confirmed the end time', 'The end time was confirmed')
              : said(party, member, 'set the end time', 'The end time was set')) +
            `: ${this.when(party.endTime)}.`,
    );
  }

  /** How long this raid lasts once hatched, for a raid that differs from the rule. */
  setDuration(partyId: string, member: Member, minutes: number): Promise<RaidChangeOutcome> {
    const { maxRaidHatchedDuration } = this.options.settings;
    return this.apply(
      partyId,
      member,
      (party, rules, now) => {
        // The length is no time: a time guessed from a screenshot stays a guess.
        const set = setHatchedDuration(party, minutes, maxRaidHatchedDuration, rules, now);
        return set.ok ? { ...set, party: unlessSame(party, set.party) } : set;
      },
      (party) =>
        said(party, member, 'set the length of this raid', 'The length of this raid was set') +
        ` to ${minutes} minutes.`,
    );
  }

  /**
   * The boss, or the tier of an egg (`boss` null); `label` is how the line names it (`Yveltal
   * (T5)`, `T3 egg`), already made plain by the caller (`reportedBoss`). A boss with only one fast or one charged move has it set (`certainMoves`).
   * Refused with `elite-egg-time` when it would make an Elite egg without its hatch time, whatever
   * the raid was (plan 8F-1, 8E-1): an Elite tier without a hatch time while `raidStage` says
   * egg, with or without a boss (naming one does not hatch an egg: Matt, 2026-10-29), so a raid
   * reported hatched may still become an Elite raid without a time (review BR-2).
   */
  setBoss(
    partyId: string,
    member: Member,
    change: { tier: RaidTier; boss: RaidBossRef | null; label: string },
  ): Promise<RaidChangeOutcome> {
    const entry =
      change.boss && 'key' in change.boss
        ? this.options.gameData.catalogue.byKey(change.boss.key)
        : undefined;
    return this.apply(
      partyId,
      member,
      (party, rules, now) => {
        const next = setBoss(
          party,
          { tier: change.tier, boss: change.boss, ...certainMoves(entry) },
          rules,
          now,
        ).party;
        const timelessElite =
          eggNeedsHatchTime(next.raid.tier) &&
          next.hatchTime === null &&
          raidStage(next, now) === 'egg';
        return next !== party && timelessElite
          ? refused('elite-egg-time')
          : { ok: true, party: next };
      },
      (party) =>
        change.boss === null
          ? `${said(party, member, 'changed this', 'This was changed')} to: ${change.label}.`
          : `${said(party, member, 'set the boss', 'The boss was set')}: **${change.label}**.`,
    );
  }

  /**
   * Staff moved the raid's boss to another tier by an add (plan 8X-J, review J1): the raid is
   * changed by `bossTierMoved` under the rules of every raid change (the gym's lock, another raid
   * in the way refused as `gym-taken`, meeting times fitted, an egg again releasing the asked),
   * its post told "Staff moved **Starmie** to T1." and no notifier. `changed` is false for a raid
   * the move does not concern.
   */
  moveBossTier(partyId: string, move: BossTierMove, name: string): Promise<RaidChangeOutcome> {
    return this.apply(
      partyId,
      undefined,
      (party, rules, now) => ({ ok: true, party: raidBossTierMoved(party, move, rules, now) }),
      () => bossMovedLine(name, move.to),
    );
  }

  /**
   * One or both moves of the boss, as move ids. Refused with `not-a-move` when the boss the raid
   * has by then (somebody may have changed it meanwhile) does not have them.
   */
  setMoveset(
    partyId: string,
    member: Member,
    moves: { fastMove?: string; chargedMove?: string },
  ): Promise<RaidChangeOutcome> {
    const { catalogue } = this.options.gameData;
    const name = (id: string | undefined): string =>
      plain((id && catalogue.move(id)?.name) || '????');
    const [what, which] =
      moves.fastMove !== undefined && moves.chargedMove !== undefined
        ? ['the moves', `${name(moves.fastMove)} / ${name(moves.chargedMove)}`]
        : moves.fastMove !== undefined
          ? ['the fast move', name(moves.fastMove)]
          : ['the charged move', name(moves.chargedMove)];
    const passive = `T${what.slice(1)} ${what.endsWith('s') ? 'were' : 'was'} set`;
    return this.apply(
      partyId,
      member,
      (party) => {
        const { boss } = party.raid;
        if (boss === null) return refused('no-boss');
        const entry = 'key' in boss ? catalogue.byKey(boss.key) : undefined;
        const has = (list: readonly string[] | undefined, move: string | undefined): boolean =>
          move === undefined || (list ?? []).includes(move);
        if (
          !has(entry?.fastMoves, moves.fastMove) ||
          !has(entry?.chargedMoves, moves.chargedMove)
        ) {
          return refused('not-a-move');
        }
        const set = setMoveset(party, moves);
        const same =
          set.ok &&
          set.party.raid.fastMove === party.raid.fastMove &&
          set.party.raid.chargedMove === party.raid.chargedMove;
        return same ? { ok: true, party } : set;
      },
      (party) => `${said(party, member, `set ${what}`, passive)}: ${which}.`,
    );
  }

  /**
   * Moves the raid to another gym. To a gym of its own region it stays the party it is. A gym
   * of another region of the same server makes it a new party with a post in that region's forum
   * (`PartyService.relocate`; `from` in the outcome), and the new post says who moved it from
   * where. A gym that lies in no region of this server that has a forum is refused
   * (`other-region`), and so is one that was deleted from the gym list meanwhile (`gym-gone`).
   *
   * `moved` is for the answer to an interaction in the raid's post when the raid moves to
   * another region: it is called with the raid in its new place before the old post is closed
   * (see `PartyService.relocate`), and not at all otherwise.
   */
  async setGym(
    partyId: string,
    member: Member,
    gymId: number,
    moved?: (party: RaidParty) => Promise<unknown>,
  ): Promise<RaidChangeOutcome> {
    const { gyms, regions, store, posts, lines } = this.options;
    const before = store.get(partyId);
    if (!before || !isRaid(before)) return { kind: 'gone' };
    // Deleted from the gym list since the member picked it.
    const gym = gyms.get(gymId);
    if (!gym) return { kind: 'refused', reason: 'gym-gone' };
    const move = this.gymMove(before, gym);
    if (move.kind === 'local') return this.setGymInRegion(partyId, member, gym);
    if (move.kind === 'nowhere') return { kind: 'refused', reason: 'other-region' };
    const outcome = await posts.relocate(partyId, gym, move.region, member, moved);
    switch (outcome.kind) {
      case 'gone':
        return { kind: 'gone' };
      case 'taken':
        return { kind: 'refused', reason: 'gym-taken', other: outcome.other };
      case 'no-forum':
        return { kind: 'refused', reason: 'other-region' };
      case 'no-post':
        return outcome.refused === undefined
          ? { kind: 'refused', reason: 'post-not-made' }
          : { kind: 'refused', reason: 'posts-refused', refused: outcome.refused };
      case 'gym-gone':
        return { kind: 'refused', reason: 'gym-gone' };
      case 'moved': {
        const { party, from } = outcome;
        const old = from.gymId === null ? undefined : gyms.get(from.gymId);
        const oldRegion = from.regionId === null ? undefined : regions.byId(from.regionId);
        if (party.forumPostId !== null) {
          lines.say(
            party.forumPostId,
            said(party, member, 'moved this raid here', 'This raid was moved here') +
              (old ? ` from **${plain(old.nickname || old.name)}**` : '') +
              (oldRegion ? ` in <#${oldRegion.channelId}>` : '') +
              '.',
          );
        }
        return { kind: 'ok', party, changed: true, from };
      }
    }
  }

  /**
   * Where a move to this gym would take the raid (see `GymMove`): what `setGym` goes by, and
   * what a command asks to know whether to ask first. Only regions of the raid's own server
   * count, also when the raid's own region is gone.
   */
  gymMove(party: RaidParty, gym: Gym): GymMove {
    const { gyms, regions } = this.options;
    if (party.gymId === gym.id) return { kind: 'local' };
    const lying = gymRegionsInGuild(gyms, regions, gym.id, party.guildId);
    if (lying.some((region) => region.id === party.regionId)) return { kind: 'local' };
    const region = lying.find((candidate) => candidate.forumChannelId !== null);
    return region ? { kind: 'region', region } : { kind: 'nowhere' };
  }

  /** The move to a gym of the raid's own region. */
  private setGymInRegion(partyId: string, member: Member, gym: Gym): Promise<RaidChangeOutcome> {
    const { gyms, regions } = this.options;
    const gymId = gym.id;
    return this.apply(
      partyId,
      member,
      (party) => {
        if (party.gymId === gymId) return { ok: true, party };
        // Asked here, under the gym's lock: the deletion of a gym holds it until the gym is gone.
        if (!gyms.get(gymId)) return refused('gym-gone');
        const region = party.regionId === null ? undefined : regions.byId(party.regionId);
        if (!region || !gyms.regionsOf(gymId).includes(region.channelId)) {
          return refused('other-region');
        }
        return { ok: true, party: setGym(party, gymId, region.id).party };
      },
      (party) =>
        endSentence(
          said(party, member, 'moved this raid', 'This raid was moved') +
            ` to **${plain(gym.nickname || gym.name)}**`,
        ),
      gymId,
    );
  }

  /**
   * Runs one change. The gyms the raid is at and may move to are locked for it, in one order,
   * so that the check for another raid there and the write are one step. A party that is no
   * raid is `gone`: there is no such raid.
   */
  private async apply(
    partyId: string,
    member: Member | undefined,
    change: (party: RaidParty, rules: RaidDurationRules, now: number) => Change<RaidParty>,
    line: (party: RaidParty) => string | undefined,
    targetGym?: number,
  ): Promise<RaidChangeOutcome> {
    const { store, posts, lines, questions, notify, log } = this.options;
    // The raid can be moved to another gym between looking and locking: then look again.
    for (let attempt = 0; attempt < 3; attempt++) {
      const before = store.get(partyId);
      if (!before || !isRaid(before)) return { kind: 'gone' };
      const locked = [
        ...new Set([before.gymId, targetGym].filter((id): id is number => typeof id === 'number')),
      ].sort((a, b) => a - b);
      let moved = false;
      let meetings: string[] = [];
      let released = false;
      const seen: { before?: RaidParty } = {};
      const decide = (party: RaidParty): Decision => {
        seen.before = party;
        if (party.gymId !== null && !locked.includes(party.gymId)) {
          moved = true;
          return { ok: true, party };
        }
        // Read here, under the locks: waiting for them may have taken a while.
        const now = this.now();
        const changed = change(party, posts.rules(), now);
        if (!changed.ok || changed.party === party) return changed;
        const other = this.inTheWay(party, changed.party, now);
        if (other) return { ...refused('gym-taken'), other };
        const fitted = fitMeetingTimes(party, changed.party);
        meetings = meetingLines(fitted);
        let result = member ? noteMember(fitted.party, member.id, member) : fitted.party;
        // An egg again: nobody is asked whether they are done with it. Those who are done stay so.
        if (raidStage(result, now) === 'egg') {
          const asked = membersWhere(result, (a) => a.status === PartyStatus.CompletePending);
          const release = releaseAsked(result, asked);
          released = release.released.length > 0;
          result = release.party;
        }
        return { ...changed, party: result };
      };
      const update = () =>
        storedChange<RaidParty, unknown, RaidRefusal>(
          store,
          partyId,
          isRaid,
          decide,
          byMember(member),
        );
      const result = await locked.reduceRight<() => ReturnType<typeof update>>(
        (inner, gymId) => () => store.withGymLock(gymId, inner),
        update,
      )();
      if (moved) continue;
      if (result.kind === 'gone') return { kind: 'gone' };
      if (result.kind === 'refused') {
        const { reason, other } = result.refusal;
        return { kind: 'refused', reason, ...(other ? { other } : {}) };
      }
      if (result.written) {
        posts.changed(partyId);
        // Every change of a raid by a member ends here: the notifier sees what it is about.
        // Staff's move of a boss by its tier (no member) tells nobody (plan 8X-J).
        if (seen.before && member) notify?.raidChanged(seen.before, result.party, member.id);
        const postId = result.party.forumPostId;
        const text = line(result.party);
        const notices = released
          ? [...meetings, 'The raid has not hatched yet, so nobody is asked whether they are done.']
          : meetings;
        for (const said of [...(text ? [text] : []), ...notices]) {
          if (postId !== null) lines.say(postId, said);
        }
        if (released) {
          questions?.removeQuestions(partyId).catch((err: unknown) => {
            log.warn({ err, party: partyId }, 'could not remove a completion question');
          });
        }
      }
      return { kind: 'ok', party: result.party, changed: result.written };
    }
    log.warn({ party: partyId }, 'a raid kept moving while it was to be changed');
    return { kind: 'gone' };
  }

  /**
   * The other raid that a changed raid would share its gym with, both standing at it
   * (`raidStandingAt`, of any kind and of its server: plan 8E). Undefined when the change makes no
   * difference to that: a raid that already stood at the same gym may be changed whatever else is
   * there (its tier too, standard to elite and back; two raids stored at one gym before plan 8E
   * both may).
   */
  private inTheWay(before: RaidParty, after: RaidParty, now: number): RaidParty | undefined {
    const { gymId, guildId } = after;
    if (gymId === null || !standsAtGym(after, guildId, gymId, now)) return undefined;
    if (standsAtGym(before, guildId, gymId, now)) return undefined;
    const raids = this.options.store.active().filter(isRaid);
    return raidStandingAt(raids, guildId, gymId, now, after.id);
  }
}
