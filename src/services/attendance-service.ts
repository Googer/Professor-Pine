import { BoundedMap } from '../bounded-map.js';
import type { Settings } from '../config/settings.js';
import type { UserSettings, UserSettingsReader } from '../db/repositories/user-repository.js';
import type { PartyGateway } from '../discord/party-gateway.js';
import {
  answerCompletion,
  attendanceLimits,
  changeNumber,
  createGroup,
  finishParty,
  joinGroup,
  joinChosen,
  joinInto,
  joinStamped,
  labelGroup,
  leaveParty,
  noteMember,
  releaseAsked,
  servedQuestions,
  setAttendance,
  setMeetingTime,
  setNotHere,
  setRemote,
  type AttendanceLimits,
  type AttendanceOptions,
  type GroupChoice,
  type MemberInfo,
  withdrawQuestions,
} from '../domain/party/attendance.js';
import { lobbySize } from '../domain/party/lobby.js';
import { setMeetingTimeAsDrawn, type MeetDrawn } from '../domain/party/meet-times.js';
import {
  attendeeOf,
  groupOf,
  MAX_COMPLETION_PROMPTS,
  membersWhere,
  partyWord,
  refused,
  type Attendee,
  type Change,
  type GroupId,
  type Party,
  type PartyProblem,
  type Refusal,
} from '../domain/party/party.js';
import { closedToNewcomers } from '../domain/party/over.js';
import { PartyStatus } from '../domain/party/status.js';
import type { Logger } from '../log.js';
import { doer, standingLine } from '../render/activity.js';
import { completionQuestion, GROUP_LABEL, groupWords } from '../render/party-controls.js';
import { LIMITS, memberText, plain, timestamp } from '../render/text.js';
import type { PartyNotifier } from './notify-service.js';
import { byMember, pingInMessages, settingsOf, storedChange } from './party-change.js';
import type { PartyLines } from './party-lines.js';
import type { PartyStore } from './party-store.js';

/** The member who acts: their snowflake and what the interaction said about them. */
export interface Member extends MemberInfo {
  id: string;
}

/** What a line callback of `apply` answers for the usual line: how the member stands now. */
const STANDING = Symbol('standing');

/** Said in the post when a question is taken back; the question itself is deleted. */
export const WITHDRAWN_LINE = 'So I took back my question, and the others I asked are here again.';

/**
 * What came of a member's action. `gone`: there is no such active party (it ended meanwhile), or
 * the member is a newcomer to a raid or max battle over by the clock (`refusesNewcomer`) that
 * the scheduler has not ended yet.
 * `refused`: the party stays as it was. `ok`: the party as it is stored now, with the member's
 * attendee record (undefined after leaving) and `acted`, false when the action changed nothing
 * (Join from somebody who was coming already). `withdrawn` are the members who are no longer
 * asked whether they completed the raid, because the member who had pressed Done is not done
 * after all.
 */
export type AttendanceOutcome<Extra = unknown> =
  | { kind: 'gone' }
  | { kind: 'refused'; reason: PartyProblem }
  | ({
      kind: 'ok';
      party: Party;
      attendee: Attendee | undefined;
      acted: boolean;
      withdrawn: string[];
    } & Extra);

export interface AttendanceServiceOptions {
  store: PartyStore;
  gateway: PartyGateway;
  /** Told after every stored change, to bring the post and the summary up to date. */
  posts: { changed(partyId: string): void };
  /** Where the public lines go. */
  lines: PartyLines;
  users: UserSettingsReader;
  /** Told when a member sets or cancels the meeting time of their group. */
  notify?: Pick<PartyNotifier, 'meetingTimeChanged'>;
  settings: Settings;
  log: Logger;
  now?: () => number;
  /**
   * How many trainers one group of a party holds; by default `lobbySize` of the settings, which
   * no party of today has. Tests give a size here to reach what max battles (plan 8X-3) switch on.
   */
  lobbySize?: (party: Party) => number | undefined;
}

/** How long after one new group's pings another new group of the party pings nobody (plan 8Z). */
export const GROUP_PING_MS = 5 * 60_000;

/** The parties whose last ping of a new group is remembered. */
const GROUP_PINGS_KEPT = 10_000;

/** What the post is told when a member has left; the conductor of a train leaves it without one. */
function leftLine(member: Member, result: { conductorLeft?: true }): string {
  return result.conductorLeft
    ? `${memberText(member)} has left: this train has no conductor now.`
    : `${memberText(member)} has left.`;
}

function stillAsked(party: Party, members: readonly string[]): boolean {
  return members.some((id) => attendeeOf(party, id)?.status === PartyStatus.CompletePending);
}

function isDone(party: Party, memberId: string): boolean {
  return attendeeOf(party, memberId)?.status === PartyStatus.Complete;
}

/** Whom a dialog of Group… was drawn for (plan 8X-1B): a member signed up then, or not. */
export interface DrawnFor {
  signedUp?: boolean;
}

/**
 * The refusal of a Submit of a dialog drawn for a member signed up who has left since
 * (`no-longer-signed-up`), decided inside the store; undefined for anything else.
 */
function notAsDrawn(party: Party, memberId: string, drawn: DrawnFor): Refusal | undefined {
  return drawn.signedUp === true && attendeeOf(party, memberId) === undefined
    ? refused('no-longer-signed-up')
    : undefined;
}

/**
 * What members do in a party: sign up, change how they come, complete the raid, use groups. The
 * buttons of a post and the slash commands both end here. Every method stores the change, has the
 * post shown anew, and says in the post what happened, in a line that pings nobody; the caller
 * tells the member privately (`standingReply`, `problemText`).
 *
 * A member who had pressed Done and then does anything that makes them not done takes the
 * question back that their Done put to the others, unless one of those has completed the raid
 * and still stands by it (`withdrawQuestions`, which runs with every change).
 */
export class AttendanceService {
  private readonly now: () => number;
  /** Messages being sent or deleted on the side; `flush` waits for them. */
  private readonly background = new Set<Promise<void>>();
  /** When a new group of a party last pinged anybody, by party; a restart forgets it. */
  private readonly groupPings = new BoundedMap<string, number>(GROUP_PINGS_KEPT);

  /** How many trainers one group of a party holds, where it has a size (`lobbySize`). */
  private readonly lobbySize: (party: Party) => number | undefined;

  constructor(private readonly options: AttendanceServiceOptions) {
    this.now = options.now ?? (() => Date.now());
    this.lobbySize = options.lobbySize ?? ((party) => lobbySize(party, options.settings.lobbies));
  }

  /**
   * Whether this member is a newcomer to a party that takes none any more (`closedToNewcomers`,
   * by the service's clock: a raid or max battle over by the clock), whom every change is answered
   * `gone`, as for a party that has ended; also asked before a dialog that would ask a newcomer.
   */
  refusesNewcomer(party: Party, memberId: string): boolean {
    return closedToNewcomers(party, this.now()) && attendeeOf(party, memberId) === undefined;
  }

  /** The largest head count a member may bring, from the settings. */
  limits(): AttendanceLimits {
    return attendanceLimits(this.options.settings);
  }

  /**
   * The limits of a change of this party: with the size of its groups where it has one, and the
   * time (a group the change opens is stamped with it).
   */
  private limitsOf(party: Party): AttendanceLimits {
    return { ...this.limits(), lobbySize: this.lobbySize(party), now: this.now() };
  }

  /** Interested, coming or here; what `options` leaves out stays as it is. */
  signUp(
    partyId: string,
    member: Member,
    status: typeof PartyStatus.Interested | typeof PartyStatus.Coming | typeof PartyStatus.Present,
    options: AttendanceOptions = {},
  ): Promise<AttendanceOutcome> {
    return this.apply(partyId, member, (party) =>
      setAttendance(party, member.id, status, options, this.limitsOf(party)),
    );
  }

  /** Remote or in person; `'toggle'` is the other of what the member is now. */
  setRemote(
    partyId: string,
    member: Member,
    remote: boolean | 'toggle',
    options: Omit<AttendanceOptions, 'remote'> = {},
  ): Promise<AttendanceOutcome> {
    return this.apply(
      partyId,
      member,
      (party) => {
        if (isDone(party, member.id)) return refused('already-done');
        const wanted =
          remote === 'toggle' ? !(attendeeOf(party, member.id)?.remote ?? false) : remote;
        return setRemote(party, member.id, wanted, options, this.limitsOf(party));
      },
      (party) => {
        const attendee = attendeeOf(party, member.id);
        // "In person" is said here: without it the line after switching remote off would read
        // like the one before switching it on.
        return attendee && standingLine(party, member.id, attendee, { sayInPerson: true });
      },
    );
  }

  /** One more or one fewer in the member's head count. */
  changeNumber(partyId: string, member: Member, delta: 1 | -1): Promise<AttendanceOutcome> {
    return this.apply(partyId, member, (party) =>
      isDone(party, member.id)
        ? refused('already-done')
        : changeNumber(party, member.id, delta, this.limitsOf(party)),
    );
  }

  notHere(partyId: string, member: Member): Promise<AttendanceOutcome> {
    return this.apply(partyId, member, (party) => setNotHere(party, member.id));
  }

  leave(partyId: string, member: Member): Promise<AttendanceOutcome> {
    return this.apply(
      partyId,
      member,
      (party) => leaveParty(party, member.id),
      (_party, result) => leftLine(member, result),
    );
  }

  /**
   * The member is done (`finishParty`). In a raid they have completed it: the others of their
   * group who are present are asked in the post whether they have too (`asked`); refused while
   * the raid is an egg. In any other party done means leave (`left`).
   */
  async done(
    partyId: string,
    member: Member,
  ): Promise<AttendanceOutcome<{ asked: string[]; wasComplete: boolean; left: boolean }>> {
    const now = this.now();
    const outcome = await this.apply(
      partyId,
      member,
      (party) => finishParty(party, member.id, now, this.options.settings.raidCompleteTimeout),
      (_party, result) => (result.left ? leftLine(member, result) : STANDING),
    );
    if (outcome.kind === 'ok' && outcome.asked.length > 0) {
      this.inBackground(this.ask(outcome.party, outcome.asked), partyId, 'ask who completed');
    }
    return outcome;
  }

  /** A member's answer to the completion question. */
  answer(partyId: string, member: Member, completed: boolean): Promise<AttendanceOutcome> {
    return this.apply(
      partyId,
      member,
      (party) => answerCompletion(party, member.id, completed),
      // "Is here" would read like an arrival; they were listed under Here all along.
      completed ? undefined : () => `${memberText(member)} is not done yet.`,
    );
  }

  joinGroup(partyId: string, member: Member, group: GroupId): Promise<AttendanceOutcome> {
    return this.apply(partyId, member, (party) =>
      isDone(party, member.id)
        ? refused('already-done')
        : joinGroup(party, member.id, group, this.limitsOf(party)),
    );
  }

  /**
   * How many trainers one group of this party holds, where it has a size (`lobbySize`): the
   * dialog that asks a newcomer which group offers "Any group with room" then (plan 8X-1B).
   */
  lobbyOf(party: Party): number | undefined {
    return this.lobbySize(party);
  }

  /**
   * The Submit of "which group?" (plan 8X-1B, `joinChosen`): the member signed up with that
   * status in the group they chose, as things are now.
   */
  joinChosen(
    partyId: string,
    member: Member,
    status: typeof PartyStatus.Interested | typeof PartyStatus.Coming | typeof PartyStatus.Present,
    choice: GroupChoice,
  ): Promise<AttendanceOutcome<{ stayed?: GroupId }>> {
    return this.apply(partyId, member, (party) =>
      joinChosen(party, member.id, status, choice, this.limitsOf(party)),
    );
  }

  /** "Join A" of a post with several groups (`joinInto`): coming in that group. */
  joinInto(partyId: string, member: Member, group: GroupId): Promise<AttendanceOutcome> {
    return this.apply(partyId, member, (party) =>
      isDone(party, member.id)
        ? refused('already-done')
        : joinInto(party, member.id, group, this.limitsOf(party)),
    );
  }

  /**
   * Group…'s move (plan 8X-1B, `joinStamped`): to the group of that letter while it has that
   * stamp, as `/group join` moves a member. `drawn.signedUp`: the dialog was drawn for a member
   * signed up, so one who has left since is refused `no-longer-signed-up`, not signed up again.
   */
  joinStamped(
    partyId: string,
    member: Member,
    group: GroupId,
    stamp: string,
    drawn: DrawnFor = {},
  ): Promise<AttendanceOutcome> {
    return this.apply(partyId, member, (party) =>
      isDone(party, member.id)
        ? refused('already-done')
        : (notAsDrawn(party, member.id, drawn) ??
          joinStamped(party, member.id, group, stamp, this.limitsOf(party))),
    );
  }

  /**
   * Opens the next group and moves the member into it, with `label` where given (Group…;
   * `drawn` as for `joinStamped`). The attendees who have not completed the raid are told in the
   * post; those who allow it are pinged.
   */
  async newGroup(
    partyId: string,
    member: Member,
    label?: string,
    drawn: DrawnFor = {},
  ): Promise<AttendanceOutcome<{ group: GroupId }>> {
    const outcome = await this.apply(
      partyId,
      member,
      (party) =>
        notAsDrawn(party, member.id, drawn) ??
        createGroup(party, member.id, this.limitsOf(party), label),
      'none',
    );
    if (outcome.kind === 'ok' && outcome.acted) {
      this.inBackground(
        this.announceGroup(outcome.party, member, outcome.group, outcome.others),
        partyId,
        'announce a new group',
      );
    }
    return outcome;
  }

  /** Labels the member's own group; an empty text removes the label. */
  labelGroup(
    partyId: string,
    member: Member,
    text: string,
  ): Promise<AttendanceOutcome<{ group: GroupId }>> {
    return this.apply(
      partyId,
      member,
      (party) => labelGroup(party, member.id, text),
      (party, result) => {
        const group = groupOf(party, result.group);
        return {
          text: group?.label
            ? `${memberText(member)} named ${groupWords(group)}.`
            : `${memberText(member)} removed the name of group ${result.group}.`,
          // Its own key: it must not take the place of how the member comes.
          key: `group:${result.group}`,
        };
      },
    );
  }

  /**
   * Sets the meeting time of the member's own group, or removes it with null. The others of the
   * group who have not completed the raid are told in the post; those who allow it are pinged.
   * `changed` is false when the group already had that time (or none). With `drawn` (Meet…'s
   * Submit) it is decided for that group, by its stamp, and a time Meet… offers now
   * (`setMeetingTimeAsDrawn`).
   */
  async setMeetingTime(
    partyId: string,
    member: Member,
    time: number | null,
    drawn?: MeetDrawn,
  ): Promise<AttendanceOutcome<{ group: GroupId; others: string[] }>> {
    const seen: { before?: number | undefined } = {};
    const now = this.now();
    const outcome = await this.apply(
      partyId,
      member,
      (party) => {
        const group = attendeeOf(party, member.id)?.group;
        seen.before = group === undefined ? undefined : groupOf(party, group)?.startTime;
        // Meet…'s Submit (plan 8X-1B): decided here, for the group its dialog was drawn for.
        return drawn === undefined
          ? setMeetingTime(party, member.id, time)
          : setMeetingTimeAsDrawn(party, member.id, drawn, time, now);
      },
      'none',
    );
    if (outcome.kind === 'ok' && outcome.acted) {
      // The others of the group also get a direct message (always: it is part of the party).
      this.options.notify?.meetingTimeChanged(partyId, outcome.group, seen.before, member);
      this.inBackground(
        this.announceMeeting(outcome.party, member, outcome.group, outcome.others),
        partyId,
        'announce a meeting time',
      );
    }
    return outcome;
  }

  private async announceMeeting(
    party: Party,
    member: Member,
    groupId: GroupId,
    others: readonly string[],
  ): Promise<void> {
    const postId = party.forumPostId;
    if (postId === null) return;
    const group = groupOf(party, groupId);
    const whose = party.groups.length > 1 ? ` of ${groupWords(group ?? { id: groupId })}` : '';
    const time = group?.startTime;
    // The reporter of a raid who asked not to be named is not named here either.
    const who = doer(party, member);
    const said =
      time === undefined
        ? who === undefined
          ? `The meeting time${whose} was canceled.`
          : `${who} canceled the meeting time${whose}.`
        : `${who === undefined ? `The meeting time${whose} was set` : `${who} set the meeting time${whose}`}` +
          `: ${timestamp(time)} (${timestamp(time, 'R')}).`;
    // The whole group, in as many messages as it takes (plan 8X-4: a Gigantamax lobby is a hundred).
    const pingable = await this.pingable(others, (settings) => settings.mentionsGroups, Infinity);
    await pingInMessages(this.options, party.id, postId, said, pingable);
  }

  /**
   * `/shout`: says a member's message in the post to everybody else who is signed up and has
   * not completed the raid, in whatever group; those who allow it are pinged. Only somebody who
   * is signed up themself may (Matt, 2026-10-11), done or not: `not-attending` otherwise.
   * `nobody` when there is nobody else: nothing is said then. With `group` (design
   * `2026-10-20-max-battles-design.md`, section 5) only the others of the member's own group:
   * `one-group` in a party that has one, `nobody` (with the group) when nobody else is in it.
   * Everybody it pings is pinged, in as many messages as it takes (`pingInMessages`), one after
   * the other; when the party ends between two, or its post is another now, the rest is not sent
   * (`gone`, or `moved` when the party has another post now, with how many were `pinged`
   * before).
   */
  async shout(
    partyId: string,
    member: Member,
    text: string,
    options: { group?: boolean } = {},
  ): Promise<
    | { kind: 'gone'; pinged?: number }
    | { kind: 'moved'; pinged: number }
    | { kind: 'refused'; reason: 'not-attending' }
    | { kind: 'one-group' }
    | { kind: 'nobody'; group?: GroupId }
    | { kind: 'ok'; pinged: number }
  > {
    const { store, gateway } = this.options;
    const party = store.get(partyId);
    const postId = party?.forumPostId ?? null;
    if (!party || postId === null) return { kind: 'gone' };
    const shouter = attendeeOf(party, member.id);
    if (!shouter) return { kind: 'refused', reason: 'not-attending' };
    if (options.group && party.groups.length < 2) return { kind: 'one-group' };
    const group = options.group ? shouter.group : undefined;
    const others = membersWhere(
      party,
      (attendee, id) =>
        id !== member.id &&
        attendee.status !== PartyStatus.Complete &&
        (group === undefined || attendee.group === group),
    );
    if (others.length === 0)
      return group === undefined ? { kind: 'nobody' } : { kind: 'nobody', group };
    const pingable = await this.pingable(others, (settings) => settings.mentionsShouts, Infinity);
    const to = group === undefined ? `this ${partyWord(party)}` : `group ${group}`;
    const said = await pingInMessages(
      { store, gateway },
      partyId,
      postId,
      `${memberText(member)} to everybody in ${to}:\n> ${plain(text)}`,
      pingable,
    );
    return said.complete
      ? { kind: 'ok', pinged: said.pinged }
      : { kind: said.stopped, pinged: said.pinged };
  }

  /**
   * Runs one change of a member in a party. The member's name and team are noted with it. When
   * the change did something, the post gets a line: what `line` gives, or by default how the
   * member stands now (also when `line` answers `STANDING`); `'none'` when the caller says it
   * another way. A line has a key (the member's, unless `line` names another): a newer line with
   * the same key takes the place of one that was not sent yet.
   */
  private async apply<Extra>(
    partyId: string,
    member: Member,
    change: (party: Party) => Change<Party, Extra>,
    line?:
      | 'none'
      | ((
          party: Party,
          result: Extra,
        ) => typeof STANDING | string | { text: string; key: string } | undefined),
  ): Promise<AttendanceOutcome<Extra>> {
    const { store, posts, lines } = this.options;
    type Told = Extra & { acted: boolean; withdrawn: string[] };
    // A raid or max battle over by the clock is gone for a newcomer, as once the scheduler has
    // ended it; who is signed up goes on until its post is archived (Matt, 2026-11-07).
    const fits = (party: Party): party is Party => !this.refusesNewcomer(party, member.id);
    const stored = await storedChange<Party, Told>(
      store,
      partyId,
      fits,
      (party) => {
        const changed = change(party);
        if (!changed.ok) return changed;
        const withdrawn = withdrawQuestions(changed.party);
        return {
          ...changed,
          party: noteMember(withdrawn.party, member.id, member),
          acted: changed.party !== party,
          withdrawn: withdrawn.released,
        };
      },
      // For the audit log: attendance itself logs nothing, but a conductor who leaves takes the
      // train's conductor with them.
      byMember(member),
    );
    if (stored.kind === 'gone') return { kind: 'gone' };
    if (stored.kind === 'refused') return { kind: 'refused', reason: stored.refusal.reason };
    const { party, extra } = stored;
    const { acted, withdrawn } = extra;
    const attendee = attendeeOf(party, member.id);
    if (stored.written) posts.changed(partyId);
    if (acted) {
      if (line !== 'none' && party.forumPostId !== null) {
        const given = line ? line(party, extra) : STANDING;
        const text =
          given === STANDING ? attendee && standingLine(party, member.id, attendee) : given;
        if (typeof text === 'object') lines.say(party.forumPostId, text.text, text.key);
        else if (text) lines.say(party.forumPostId, text, `member:${member.id}`);
      }
    }
    if (withdrawn.length > 0 && party.forumPostId !== null) {
      lines.say(party.forumPostId, WITHDRAWN_LINE, `withdrawn:${member.id}`);
    }
    if (acted || withdrawn.length > 0) this.settleQuestions(party);
    return { ...extra, kind: 'ok', party, attendee, acted, withdrawn };
  }

  private inBackground(work: Promise<void>, partyId: string, what: string): void {
    const run = work
      .catch((err: unknown) => {
        this.options.log.warn({ err, party: partyId }, `could not ${what}`);
      })
      .finally(() => this.background.delete(run));
    this.background.add(run);
  }

  /**
   * The members of `ids` who let the bot ping them, for this kind of message; at most as many as
   * one message may name, unless `most` says otherwise (a shout, sent in as many messages as it
   * takes). A member whose settings cannot be read is not pinged.
   */
  private async pingable(
    ids: readonly string[],
    allows: (settings: UserSettings) => boolean,
    most: number = LIMITS.pings,
  ): Promise<string[]> {
    const settings = await settingsOf(this.options.users, ids, this.options.log);
    return ids
      .filter((id) => {
        const found = settings.get(id);
        return found !== undefined && found.mentions && allows(found);
      })
      .slice(0, most);
  }

  /** Deletes messages of a post, each by itself; gives the ids that are gone now. */
  private async deleteMessages(postId: string, ids: readonly string[]): Promise<string[]> {
    const { gateway, log } = this.options;
    const results = await Promise.allSettled(ids.map((id) => gateway.deleteMessage(postId, id)));
    return ids.filter((id, index) => {
      const result = results[index];
      if (result?.status === 'fulfilled') return true;
      log.warn(
        { err: result?.reason as unknown, post: postId, message: id },
        'could not delete a message',
      );
      return false;
    });
  }

  /**
   * Asks these members in the post whether they completed the raid, with the two answer buttons,
   * and remembers the message with the members it asked, so that it can be removed once none of
   * them is left to answer. For the Done button and command, and for the scheduler when a
   * group's meeting time has passed. When the question cannot be sent, the members are present
   * again: nobody is left asked without a question.
   */
  async ask(party: Party, members: readonly string[]): Promise<void> {
    const { gateway, store, settings } = this.options;
    const postId = party.forumPostId;
    if (postId === null || members.length === 0) return;
    const question = completionQuestion(
      party.id,
      members,
      settings.raidCompleteTimeout,
      partyWord(party),
    );
    let messageId: string | undefined;
    try {
      const users = await this.pingable(members, () => true);
      // A message into the post of a party that has ended would open an archived post again.
      if (!store.get(party.id)) return;
      messageId = await gateway.sendMessage(postId, { ...question, mention: { users } });
    } catch (err) {
      await this.release(party.id, members);
      throw err;
    }
    if (messageId === undefined) return;
    const sent = messageId;
    let dropped: string[] = [];
    let recorded = false;
    try {
      const result = await store.update(party.id, (current) => {
        if (!stillAsked(current, members)) return {};
        const all = [...current.prompts.completion, { id: sent, members: [...members] }];
        dropped = all.slice(0, Math.max(0, all.length - MAX_COMPLETION_PROMPTS)).map((q) => q.id);
        const completion = all.slice(-MAX_COMPLETION_PROMPTS);
        return { party: { ...current, prompts: { ...current.prompts, completion } } };
      });
      recorded = result?.written ?? false;
    } finally {
      // Not recorded: everybody answered while the question was on its way, it was withdrawn,
      // the party ended, or the write failed. A question nobody remembers would stay for good.
      await this.deleteMessages(postId, recorded ? dropped : [sent]);
    }
  }

  /** Those of `members` who are still asked are present again; the post is shown anew. */
  private async release(partyId: string, members: readonly string[]): Promise<void> {
    const { store, posts, log } = this.options;
    try {
      const result = await store.update(partyId, (current) => releaseAsked(current, members));
      if (result?.written) posts.changed(partyId);
    } catch (err) {
      log.warn({ err, party: partyId }, 'could not take back a question that was not sent');
    }
  }

  /** Removes the completion questions of a party that have nobody left to answer them. */
  private settleQuestions(party: Party): void {
    if (servedQuestions(party).length === 0) return;
    this.inBackground(this.removeQuestions(party.id), party.id, 'remove a completion question');
  }

  /**
   * Deletes the completion questions of a party that none of the members they asked has still
   * to answer. A question that could not be deleted stays remembered and is tried again the next
   * time. Also for the scheduler, after it has completed those who did not answer.
   */
  async removeQuestions(partyId: string): Promise<void> {
    const { store } = this.options;
    let questions: string[] = [];
    let postId: string | null = null;
    // Decided inside the store, without a write.
    await store.update(partyId, (current) => {
      questions = servedQuestions(current).map((question) => question.id);
      postId = current.forumPostId;
      return {};
    });
    if (postId === null || questions.length === 0) return;
    const gone = new Set(await this.deleteMessages(postId, questions));
    if (gone.size === 0) return;
    await store.update(partyId, (current) => ({
      party: {
        ...current,
        prompts: {
          ...current.prompts,
          completion: current.prompts.completion.filter((question) => !gone.has(question.id)),
        },
      },
    }));
  }

  private async announceGroup(
    party: Party,
    member: Member,
    group: GroupId,
    others: readonly string[],
  ): Promise<void> {
    const postId = party.forumPostId;
    if (postId === null) return;
    const wanting = await this.pingable(others, (settings) => settings.mentionsGroups, Infinity);
    if (!this.options.store.get(party.id)) return;
    // At most one ping of a new group per party in `GROUP_PING_MS`, however it was opened (plan
    // 8Z); no await between reading the stamp and setting it, and a sentence that pings nobody
    // takes no turn. The group opens and the sentence is said in any case.
    const now = this.now();
    const lastPing = this.groupPings.get(party.id);
    const pingable = lastPing !== undefined && now - lastPing < GROUP_PING_MS ? [] : wanting;
    if (pingable.length > 0) this.groupPings.set(party.id, now);
    const opened = `${memberText(member)} opened ${groupWords(groupOf(party, group) ?? { id: group })}.`;
    if (others.length === 0) {
      await this.options.gateway.sendMessage(postId, { content: opened, mention: { users: [] } });
      return;
    }
    // The sentence with its hint goes first; every mention after it, in as many messages as it
    // takes (plan 8X-4).
    await pingInMessages(
      this.options,
      party.id,
      postId,
      `${opened} To move to it, press ${GROUP_LABEL} on the post or use \`/group join\`.`,
      pingable,
    );
  }

  /** Sends what is waiting and waits for what is on its way. For shutdown and for tests. */
  async flush(): Promise<void> {
    const { lines } = this.options;
    do {
      await lines.flush();
      await Promise.all(this.background);
    } while (lines.pending > 0 || this.background.size > 0);
  }
}
