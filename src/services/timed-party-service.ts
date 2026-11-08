import type { UserSettingsReader } from '../db/repositories/user-repository.js';
import type { PartyGateway } from '../discord/party-gateway.js';
import { noteMember } from '../domain/party/attendance.js';
import {
  isMeetup,
  isTimed,
  membersWhere,
  partyWord,
  type Change,
  type MeetupParty,
  type Party,
  type PartyProblem,
  type TimedParty,
} from '../domain/party/party.js';
import { setDescription } from '../domain/party/meetup.js';
import { PartyStatus } from '../domain/party/status.js';
import {
  asDrawn,
  nameOf,
  setName,
  setStartTime,
  setTimedEnd,
  startTimeOf,
} from '../domain/party/timed.js';
import type { Logger } from '../log.js';
import { doer } from '../render/activity.js';
import { clockOrDay, LIMITS, memberText, plain, timestamp, withMentions } from '../render/text.js';
import type { Member } from './attendance-service.js';
import { Gathered } from './gathered.js';
import type { PartyNotifier } from './notify-service.js';
import { byMember, pingInMessages, settingsOf, storedChange } from './party-change.js';
import type { PartyLines } from './party-lines.js';
import type { PartyStore } from './party-store.js';

/**
 * What came of a change to a timed party. `gone`: there is no such active party of that kind (a
 * raid is none). `refused`: the party stays as it was. `ok`: the party as it is stored now;
 * `changed` is false when it already was so.
 */
export type TimedChangeOutcome<Extra = unknown, P extends TimedParty = TimedParty> =
  | { kind: 'gone' }
  | { kind: 'refused'; reason: PartyProblem }
  | ({ kind: 'ok'; party: P; changed: boolean } & Extra);

export interface TimedPartyServiceOptions {
  store: PartyStore;
  gateway: Pick<PartyGateway, 'sendMessage'>;
  /** Told after every stored change, to bring the post and the summary up to date. */
  posts: { changed(partyId: string): void };
  /** Where the lines go that ping nobody. */
  lines: Pick<PartyLines, 'say'>;
  /** The members' settings: who lets the bot ping them. */
  users: UserSettingsReader;
  /** Told when the start of a party has changed and the post was told. */
  notify?: Pick<PartyNotifier, 'startTimeChanged'>;
  log: Logger;
  /** IANA zone in which "today" is judged when a time is named (`settings.timezone`). */
  zone: string;
  now?: () => number;
  /**
   * How long after the last change of a party's start the others are told. Default five
   * seconds: a member who corrects what they typed is one message, with one ping.
   */
  announceDelayMs?: number;
}

/**
 * A start whose announcement is waiting: what it was before, who changed it last, and the lines
 * said of the party meanwhile, which follow the start in its message (`after`).
 */
interface PendingStart {
  before: number | null;
  by: Member;
  after: string[];
}

/**
 * The start's line and as many of the lines gathered after it as fit into its message with room
 * for the mentions of the first message (`withMentions`), in order (review SF1-1: what is
 * gathered while the start keeps changing can pass what a message holds); the rest (`rest`), from
 * the first that does not fit, is said after it as lines.
 */
function beside(
  startLine: string,
  after: readonly string[],
  pinged: readonly string[],
): { said: string; rest: string[] } {
  const room = LIMITS.content - withMentions('', pinged).content.length;
  let said = startLine;
  const rest: string[] = [];
  for (const text of after) {
    if (rest.length === 0 && said.length + 1 + text.length <= room) said = `${said}\n${text}`;
    else rest.push(text);
  }
  return { said, rest };
}

/**
 * What members change about a party that has a name and times of its own: a meetup or a train
 * (`TimedParty`). It is to such a party what `RaidChangeService` is to a raid: every
 * method decides inside the store, has the post shown anew and says in the post who changed
 * what; the caller tells the member privately.
 *
 * A new start time is the one thing that pings: it is said in a message of its own to everybody
 * else who is signed up and allows it, as the meeting time of a group is in a raid. That message
 * is gathered: it goes out a few seconds after the last change, with the start as the store has
 * it then, so two quick changes are one ping, and the messages of one party never overtake each
 * other. Everything else is a line that pings nobody, said at once; but a line said of a party
 * while its start's announcement waits goes into that message after the start (staging of
 * 2026-11-07: Manage… set both times, and the end was said before the start), and so do the lines
 * of changes made `together`.
 */
export class TimedPartyService {
  private readonly now: () => number;
  /** The starts whose announcement is waiting for its delay, by party. */
  private readonly starts: Gathered<PendingStart>;
  /** The lines of the parties whose changes are made `together`, held until they are made. */
  private readonly held = new Map<string, Array<{ postId: string; text: string }>>();

  constructor(private readonly options: TimedPartyServiceOptions) {
    this.now = options.now ?? (() => Date.now());
    this.starts = new Gathered({
      delayMs: options.announceDelayMs ?? 5_000,
      send: (partyId, pending) =>
        this.announceStart(partyId, pending.before, pending.by, pending.after),
      // Two announcements made one: the start as it was before the older of them.
      fold: (older, newer) => ({
        ...newer,
        before: older.before,
        after: [...older.after, ...newer.after],
      }),
      onError: (err, party) => {
        options.log.warn({ err, party }, 'could not announce a start time');
      },
    });
  }

  /** A time as a line names it: with its date when it is not today, and how long until then. */
  private when(time: number): string {
    return `${clockOrDay(time, this.now(), this.options.zone)} (${timestamp(time, 'R')})`;
  }

  /**
   * Another name for the party; the title of its post follows with the next render. Who may is
   * the caller's to ask (a meetup's: `meetupChangeRefusal`). Refused with `bad-name` for a text
   * that is no name. `drawn`: the name the change was drawn from (the live map), refused with
   * `changed-meanwhile` when the party has another by now; left out, none is asked (the commands).
   */
  setName(
    partyId: string,
    member: Member,
    text: string,
    drawn?: string,
  ): Promise<TimedChangeOutcome> {
    return this.apply(
      partyId,
      member,
      isTimed,
      (party) => asDrawn(nameOf(party), drawn) ?? setName(party, text),
      (party) => {
        const who = doer(party, member);
        const name = `**${plain(nameOf(party))}**`;
        return who
          ? `${who} renamed this ${partyWord(party)}: ${name}.`
          : `This ${partyWord(party)} was renamed: ${name}.`;
      },
    );
  }

  /**
   * What the post of a meetup says about it (`/info`); a text of nothing but white space
   * removes it. Who may is the caller's to ask (`meetupChangeRefusal`). The line in the post says
   * that it changed, not what to: the text is in the post itself. Only a meetup has it: any other
   * party is `gone`.
   */
  setDescription(
    partyId: string,
    member: Member,
    text: string,
    drawn?: string | null,
  ): Promise<TimedChangeOutcome<unknown, MeetupParty>> {
    return this.apply(
      partyId,
      member,
      isMeetup,
      (party) => asDrawn(party.meetup.description, drawn) ?? setDescription(party, text),
      (party) =>
        party.meetup.description === null
          ? `${memberText(member)} removed the information.`
          : `${memberText(member)} changed the information.`,
    );
  }

  /**
   * When the party starts, for everybody, or no start any more with null. Only for a member who
   * is signed up (`not-attending`); refused when it would not lie before the end. `others` are
   * the members who will be told. The caller has checked the time (`typedTimedTime`).
   */
  async setStartTime(
    partyId: string,
    member: Member,
    time: number | null,
    drawn?: number | null,
  ): Promise<TimedChangeOutcome<{ others: string[] }>> {
    let before: number | null = null;
    const outcome = await this.apply(partyId, member, isTimed, (party, now) => {
      before = startTimeOf(party);
      return asDrawn(before, drawn) ?? setStartTime(party, member.id, time, now);
    });
    if (outcome.kind === 'ok' && outcome.changed) this.announceLater(partyId, before, member);
    return outcome;
  }

  /**
   * When the party ends, or no end any more with null. Anybody in the post may (as with the
   * legacy bot); refused when it would not lie after the start. The caller has checked the time.
   */
  setEndTime(
    partyId: string,
    member: Member,
    time: number | null,
    drawn?: number | null,
  ): Promise<TimedChangeOutcome> {
    return this.apply(
      partyId,
      member,
      isTimed,
      (party, now) => asDrawn(party.endTime, drawn) ?? setTimedEnd(party, time, now),
      (party) => {
        const who = doer(party, member);
        const word = partyWord(party);
        if (party.endTime === null) {
          return who
            ? `${who} removed the end time of this ${word}.`
            : `The end time of this ${word} was removed.`;
        }
        return who
          ? `${who} set the end of this ${word}: ${this.when(party.endTime)}.`
          : `The end of this ${word} was set: ${this.when(party.endTime)}.`;
      },
    );
  }

  /**
   * Has the others told about the start of a party, once it has stood for `announceDelayMs`.
   * A change that comes sooner starts the wait anew; `before` stays the start as it was before
   * the first of them, so that a start that was put back is not announced at all.
   */
  private announceLater(partyId: string, before: number | null, by: Member): void {
    this.starts.later(partyId, (earlier) => ({
      before: earlier ? earlier.before : before,
      by,
      after: earlier?.after ?? [],
    }));
  }

  /**
   * Makes changes of one party together (a train's Manage… and a meetup's editor set the start and
   * the end, in either order): the lines they say are held until `work` is done, then said as
   * every line is (`say`), so that they follow a new start in its message, whichever was set first.
   */
  async together<T>(partyId: string, work: () => Promise<T>): Promise<T> {
    if (this.held.has(partyId)) return work();
    const lines: Array<{ postId: string; text: string }> = [];
    this.held.set(partyId, lines);
    try {
      return await work();
    } finally {
      this.held.delete(partyId);
      for (const { postId, text } of lines) this.line(partyId, postId, text);
    }
  }

  /**
   * Says a line of a party in its post, pinging nobody: held while its changes are made
   * `together`; after the start in the message of a start that waits for its announcement; else
   * at once, with the post's other lines. A train's changes of its own say theirs this way too
   * (`TrainServiceOptions.timedLines`, review SF1-6), so that Manage… is one message.
   */
  line(partyId: string, postId: string, text: string): void {
    const held = this.held.get(partyId);
    if (held) {
      held.push({ postId, text });
      return;
    }
    const after = this.starts.amend(partyId, (pending) => ({
      ...pending,
      after: [...pending.after, text],
    }));
    if (!after) this.options.lines.say(postId, text);
  }

  /**
   * Says the start a party has now, or that it has none any more, to everybody else who is
   * signed up; nothing when the start is what it was before the changes that led here.
   */
  private async announceStart(
    partyId: string,
    before: number | null,
    by: Member,
    after: readonly string[],
  ): Promise<void> {
    const { store, gateway, users, lines } = this.options;
    const party = store.get(partyId);
    const postId = party?.forumPostId ?? null;
    if (!party || !isTimed(party) || postId === null) return;
    const start = startTimeOf(party);
    if (start === before) {
      // No news of the start: what was said meanwhile is said as the lines it is.
      for (const text of after) lines.say(postId, text);
      return;
    }
    const word = partyWord(party);
    const who = doer(party, by);
    const startLine =
      start === null
        ? who
          ? `${who} removed the start time of this ${word}.`
          : `The start time of this ${word} was removed.`
        : who
          ? `${who} set the start of this ${word}: ${this.when(start)}.`
          : `The start of this ${word} was set: ${this.when(start)}.`;
    const others = membersWhere(
      party,
      (attendee, id) => id !== by.id && attendee.status !== PartyStatus.Complete,
    );
    const settings = await settingsOf(users, others, this.options.log);
    // The setting of a raid's meeting times: it is the same kind of news.
    const pingable = others.filter((id) => {
      const found = settings.get(id);
      return found !== undefined && found.mentions && found.mentionsGroups;
    });
    const { said, rest } = beside(startLine, after, pingable);
    // A message into the post of a party that has ended would open an archived post again.
    if (!store.get(partyId)) return;
    try {
      // Everybody, in as many messages as it takes (plan 8X-4: a Gigantamax train holds a hundred).
      await pingInMessages({ store, gateway }, partyId, postId, said, pingable);
    } finally {
      // What did not fit beside the start follows it, as the lines it is (review SF1-1).
      for (const text of rest) lines.say(postId, text);
      // Everybody else who is signed up also gets a direct message (always, as in a raid),
      // after the post was told: telling members must never be in the way of that.
      this.options.notify?.startTimeChanged(party, by);
    }
  }

  /**
   * Runs one change of a party that `fits` (a timed party, or a meetup for what only a meetup
   * has), decided inside the store; any other party is `gone`: there is no such party. The
   * member's name and team are noted with it when they are signed up. `line` is said in the
   * post, pinging nobody, when the change was stored.
   */
  private async apply<P extends TimedParty, Extra>(
    partyId: string,
    member: Member,
    fits: (party: Party) => party is P,
    change: (party: P, now: number) => Change<P, Extra>,
    line?: (party: P) => string | undefined,
  ): Promise<TimedChangeOutcome<Extra, P>> {
    const { store, posts } = this.options;
    const stored = await storedChange<P, Extra>(
      store,
      partyId,
      fits,
      (party) => {
        const changed = change(party, this.now());
        if (!changed.ok || changed.party === party) return changed;
        return { ...changed, party: noteMember(changed.party, member.id, member) };
      },
      byMember(member),
    );
    if (stored.kind === 'gone') return { kind: 'gone' };
    if (stored.kind === 'refused') return { kind: 'refused', reason: stored.refusal.reason };
    const { party } = stored;
    if (stored.written) {
      posts.changed(partyId);
      const text = line?.(party);
      if (text !== undefined && party.forumPostId !== null) {
        this.line(partyId, party.forumPostId, text);
      }
    }
    return { ...stored.extra, kind: 'ok', party, changed: stored.written };
  }

  /**
   * Sends the announcements that are waiting without waiting for their delay, and waits for
   * what is on its way. For shutdown and for tests.
   */
  async flush(): Promise<void> {
    await this.starts.flush();
  }
}
