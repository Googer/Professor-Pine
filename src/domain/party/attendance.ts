import {
  attendeeOf,
  GROUP_IDS,
  groupOf,
  newestFirst,
  withGroupAdded,
  groupOpened,
  hasGroups,
  isBattle,
  isRaid,
  isTimed,
  isTrain,
  lobbyCount,
  MAX_MEMBER_NAME,
  membersWhere,
  refused,
  remoteAllowed,
  stampedGroup,
  type Attendee,
  type Change,
  type CompletionQuestion,
  type GroupId,
  type Party,
  type PartyGroup,
  type BattleParty,
  type Team,
} from './party.js';
import { raidStage } from './raid.js';
import { PartyStatus } from './status.js';
import { tidyShortText } from './visible-text.js';

const MINUTE = 60_000;
/** A group label is shown in the post and on a button, which takes 100 characters. */
export const MAX_GROUP_LABEL = 100;

export interface AttendanceLimits {
  /** The largest head count one member may bring, themself included. */
  maxNumber: number;
  /**
   * How many trainers one group of this party holds (`lobbySize`), where it has a size: then a
   * member who joins without naming a group is placed by `chooseGroup`. Undefined: the default
   * group, as always.
   */
  lobbySize?: number | undefined;
  /**
   * When the change is made (epoch ms): a group it opens is stamped with it (`PartyGroup.opened`).
   * The services give it with every change; without it (a test) the party's last write stands in.
   */
  now?: number | undefined;
}

/** `maximumAdditionalAttendees` of the settings counts the people a member brings along. */
export function attendanceLimits(settings: {
  maximumAdditionalAttendees: number;
}): AttendanceLimits {
  return { maxNumber: 1 + settings.maximumAdditionalAttendees };
}

export interface AttendanceOptions {
  /** Head count, the member included. Kept as it is when omitted (1 for a new attendee). */
  number?: number;
  /** Kept when omitted (the default group for a new attendee). */
  group?: GroupId;
  /** Kept when omitted (in person for a new attendee). */
  remote?: boolean;
}

/**
 * Whether two records have the same own keys with the same values. Over the keys of the records
 * and not a list of fields, so a field added later cannot be left out of the comparison.
 */
function sameRecord(a: object, b: object): boolean {
  const left = Object.entries(a);
  const right = new Map(Object.entries(b));
  return (
    left.length === right.size &&
    left.every(([key, value]) => right.has(key) && right.get(key) === value)
  );
}

function sameAttendee(a: Attendee, b: Attendee): boolean {
  return sameRecord(a, b);
}

function sameGroup(a: PartyGroup, b: PartyGroup): boolean {
  return sameRecord(a, b);
}

/** The party with this attendee record; the very same party when the record is what it was. */
function withAttendee<P extends Party>(party: P, memberId: string, attendee: Attendee): P {
  const before = attendeeOf(party, memberId);
  if (before && sameAttendee(before, attendee)) return party;
  return { ...party, attendees: { ...party.attendees, [memberId]: attendee } };
}

/** The party with this group record; the very same party when the record is what it was. */
function withGroup<P extends Party>(party: P, group: PartyGroup): P {
  const before = groupOf(party, group.id);
  if (before && sameGroup(before, group)) return party;
  return { ...party, groups: party.groups.map((g) => (g.id === group.id ? group : g)) };
}

/** What an interaction tells about the member who made it. */
export interface MemberInfo {
  /** The display name in the server; undefined when the interaction did not say. */
  name?: string;
  /** Undefined for a member without a team role. */
  team?: Team;
}

/**
 * Records a member's name and team with their attendee record, so that the post can sort,
 * mark and name them; the name of the member who made the party is kept with the party as well
 * (`makerName`), signed up or not. For anybody else who is not signed up, nothing. The team is
 * replaced by what `info` says (a member who dropped the role has none); a name is replaced only
 * by a name. An `info` without a name says nothing at all (the interaction did not show the
 * member), and then what is recorded stays. The very same party comes back when nothing differs.
 */
export function noteMember<P extends Party>(party: P, memberId: string, info: MemberInfo): P {
  if (info.name === undefined) return party;
  const tidy = info.name.replace(/\s+/g, ' ').trim();
  const typed = tidy ? [...tidy].slice(0, MAX_MEMBER_NAME).join('') : undefined;
  const made =
    typed !== undefined && memberId === party.createdById && party.makerName !== typed
      ? { ...party, makerName: typed }
      : party;
  const existing = attendeeOf(made, memberId);
  if (!existing) return made;
  const { name: oldName, team: _oldTeam, ...rest } = existing;
  const name = typed ?? oldName;
  const noted: Attendee = {
    ...rest,
    ...(name === undefined ? {} : { name }),
    ...(info.team === undefined ? {} : { team: info.team }),
  };
  return withAttendee(made, memberId, noted);
}

/** The record without what belongs to having been asked whether they completed the raid. */
function unasked(attendee: Attendee): Omit<Attendee, 'pendingUntil' | 'askedBy'> {
  const { pendingUntil: _pendingUntil, askedBy: _askedBy, ...rest } = attendee;
  return rest;
}

/**
 * An attendee moved to another group: one who was asked whether they completed the raid has
 * answered "not yet" and is present again.
 */
function movedTo(existing: Attendee, group: GroupId): Attendee {
  if (existing.group === group) return existing;
  if (existing.status !== PartyStatus.CompletePending) return { ...existing, group };
  return { ...unasked(existing), status: PartyStatus.Present, group };
}

function checked(
  party: Party,
  options: AttendanceOptions,
  limits: AttendanceLimits,
): 'no-such-group' | 'bad-count' | 'in-person-only' | undefined {
  const { number, group, remote } = options;
  if (
    number !== undefined &&
    (!Number.isInteger(number) || number < 1 || number > limits.maxNumber)
  )
    return 'bad-count';
  if (group !== undefined && !groupOf(party, group)) return 'no-such-group';
  if (remote === true && !remoteAllowed(party)) return 'in-person-only';
  return undefined;
}

/**
 * Signs a member up as interested, coming or present, or changes an attendee to that status.
 * It works from every status (a member who was done can come back). What `options` leaves out
 * stays as it is.
 */
export function setAttendance<P extends Party>(
  party: P,
  memberId: string,
  status: typeof PartyStatus.Interested | typeof PartyStatus.Coming | typeof PartyStatus.Present,
  options: AttendanceOptions,
  limits: AttendanceLimits,
): Change<P, { joined: boolean }> {
  const problem = checked(party, options, limits);
  if (problem) return refused(problem);
  const existing = attendeeOf(party, memberId);
  const number = options.number ?? existing?.number ?? 1;
  const placed = placedFor(party, memberId, existing, status, number, options, limits);
  const attendee: Attendee = {
    number,
    status,
    group: placed.group,
    remote: options.remote ?? existing?.remote ?? false,
    ...(existing?.name === undefined ? {} : { name: existing.name }),
    ...(existing?.team === undefined ? {} : { team: existing.team }),
  };
  return { ok: true, party: withAttendee(placed.party, memberId, attendee), joined: !existing };
}

/**
 * The group `setAttendance` puts a member in, and the party with it (a group `chooseGroup`
 * opened): the group they named; where the party has a lobby size and they named none, a new
 * attendee by `chooseGroup`, and an interested one who comes their own group while it has room
 * for them, else by `chooseGroup` too; anybody else stays where they are (a new attendee without
 * a size: the default group).
 */
function placedFor<P extends Party>(
  party: P,
  memberId: string,
  existing: Attendee | undefined,
  status: PartyStatus,
  number: number,
  options: AttendanceOptions,
  limits: AttendanceLimits,
): { party: P; group: GroupId } {
  if (options.group !== undefined) return { party, group: options.group };
  const size = limits.lobbySize;
  if (!existing) {
    return size === undefined
      ? { party, group: party.defaultGroupId }
      : chooseGroup(party, memberId, number, size, limits.now);
  }
  const comes = status === PartyStatus.Coming || status === PartyStatus.Present;
  if (size === undefined || existing.status !== PartyStatus.Interested || !comes) {
    return { party, group: existing.group };
  }
  if (lobbyCount(party, existing.group, memberId) + number <= size) {
    return { party, group: existing.group };
  }
  return chooseGroup(party, memberId, number, size, limits.now);
}

/**
 * A new group of this letter, opened at `now` (the party's last write when not given), and in
 * any case after the party's last write and after every group it has: stamps strictly increase,
 * also for changes within one millisecond (the store writes a party never before a stamp of its
 * groups, so a group pruned and opened again under its letter gets a stamp of its own).
 */
function openedGroup(party: Party, id: GroupId, now: number | undefined): PartyGroup {
  const latest = Math.max(
    party.updatedAt,
    ...party.groups.map((group) => groupOpened(party, group)),
  );
  return { id, opened: Math.max(now ?? party.updatedAt, latest + 1) };
}

/**
 * The group a member and their +1s (`heads`) are put in where the party's groups hold `size`
 * trainers each (design `2026-10-20-max-battles-design.md`, section 4), counting the committed
 * members of each (`lobbyCount`) but the member themself: the default group while they fit in
 * it; else the first group by letter that has room for them; else a new group while the party
 * has fewer than five (`nextGroupId`), opened silently (no line, nobody told) and made the
 * default; else the group with the most room left, the first by letter on a tie, over its size.
 * A member larger than a lobby by themself fits nowhere, a new group included: they go straight
 * to the group with the most room. A party without groups (a meetup) keeps its one. The party
 * comes back with the group opened (stamped `now`), else the very same.
 */
export function chooseGroup<P extends Party>(
  party: P,
  memberId: string,
  heads: number,
  size: number,
  now?: number,
): { party: P; group: GroupId } {
  if (!hasGroups(party)) return { party, group: party.defaultGroupId };
  const count = (id: GroupId) => lobbyCount(party, id, memberId);
  const byLetter = GROUP_IDS.filter((id) => groupOf(party, id) !== undefined);
  // Larger than a lobby by themself: no group has room, a new one would not either.
  const fits = heads <= size;
  if (fits && count(party.defaultGroupId) + heads <= size) {
    return { party, group: party.defaultGroupId };
  }
  const roomy = fits ? byLetter.find((id) => count(id) + heads <= size) : undefined;
  if (roomy !== undefined) return { party, group: roomy };
  const id = fits ? nextGroupId(party) : undefined;
  if (id !== undefined) {
    return {
      party: {
        ...party,
        groups: withGroupAdded(party.groups, openedGroup(party, id, now)),
        defaultGroupId: id,
      },
      group: id,
    };
  }
  let least = byLetter[0] ?? party.defaultGroupId;
  for (const group of byLetter) if (count(group) < count(least)) least = group;
  return { party, group: least };
}

/**
 * Marks a member as taking part remotely or in person. An attendee keeps their status; anybody
 * else is signed up as interested. An attendee who was asked whether they completed the raid
 * stays asked (with the same `pendingUntil`) when only the flag or the head count changes; a
 * move to another group answers "not yet" (see `joinGroup`).
 */
export function setRemote<P extends Party>(
  party: P,
  memberId: string,
  remote: boolean,
  options: Omit<AttendanceOptions, 'remote'>,
  limits: AttendanceLimits,
): Change<P, { joined: boolean }> {
  const existing = attendeeOf(party, memberId);
  if (!existing) {
    return setAttendance(party, memberId, PartyStatus.Interested, { ...options, remote }, limits);
  }
  const problem = checked(party, { ...options, remote }, limits);
  if (problem) return refused(problem);
  const attendee: Attendee = {
    ...movedTo(existing, options.group ?? existing.group),
    number: options.number ?? existing.number,
    remote,
  };
  return { ok: true, party: withAttendee(party, memberId, attendee), joined: false };
}

/**
 * One more or one fewer in a member's head count. `+1` from somebody who is not signed up signs
 * them up as interested, alone. The count stays between 1 and the maximum; `changed` says
 * whether anything moved. A count above the maximum (the setting was lowered) is never raised
 * by `-1` nor lowered by `+1`: `+1` leaves it, `-1` goes down by one from where it is. An
 * attendee who was asked whether they completed the raid stays asked.
 */
export function changeNumber<P extends Party>(
  party: P,
  memberId: string,
  delta: 1 | -1,
  limits: AttendanceLimits,
): Change<P, { joined: boolean; changed: boolean }> {
  const existing = attendeeOf(party, memberId);
  if (!existing) {
    if (delta < 0) return refused('not-attending');
    const signedUp = setAttendance(party, memberId, PartyStatus.Interested, {}, limits);
    return signedUp.ok ? { ...signedUp, changed: true } : signedUp;
  }
  const number =
    delta > 0
      ? Math.max(existing.number, Math.min(existing.number + 1, limits.maxNumber))
      : Math.max(existing.number - 1, 1);
  if (number === existing.number) return { ok: true, party, joined: false, changed: false };
  return {
    ok: true,
    party: withAttendee(party, memberId, { ...existing, number }),
    joined: false,
    changed: true,
  };
}

/** A present member steps back to interested ("not here"). Only for an attendee. */
export function setNotHere<P extends Party>(party: P, memberId: string): Change<P> {
  const existing = attendeeOf(party, memberId);
  if (!existing) return refused('not-attending');
  return {
    ok: true,
    party: withAttendee(party, memberId, {
      ...unasked(existing),
      status: PartyStatus.Interested,
    }),
  };
}

/** The party without this member as the conductor of a train; the very same party otherwise. */
function withoutConductor<P extends Party>(party: P, memberId: string): P {
  if (!isTrain(party) || party.train.conductorId !== memberId) return party;
  return { ...party, train: { ...party.train, conductorId: null } };
}

/**
 * Removes a member from the party. The conductor of a train who leaves stops being it
 * (`conductorLeft`): a train is not led by somebody who is not on it.
 */
export function leaveParty<P extends Party>(
  party: P,
  memberId: string,
): Change<P, { conductorLeft?: true }> {
  if (!attendeeOf(party, memberId)) return refused('not-attending');
  const { [memberId]: _left, ...attendees } = party.attendees;
  const gone: P = { ...party, attendees };
  const left = withoutConductor(gone, memberId);
  return { ok: true, party: left, ...(left === gone ? {} : { conductorLeft: true as const }) };
}

/**
 * Members of a group who are present are asked whether they completed the raid: they become
 * `CompletePending` until `now + timeoutMinutes`, after which silence counts as yes. `except` is
 * the member whose Done asks them; it is recorded with each of them (`askedBy`).
 */
function askPresent<P extends BattleParty>(
  party: P,
  groupId: GroupId,
  except: string | undefined,
  now: number,
  timeoutMinutes: number,
): { party: P; asked: string[] } {
  const asked = membersWhere(
    party,
    (attendee, memberId) =>
      memberId !== except && attendee.group === groupId && attendee.status === PartyStatus.Present,
  );
  if (asked.length === 0) return { party, asked };
  const attendees = { ...party.attendees };
  for (const memberId of asked) {
    const attendee = attendees[memberId];
    if (!attendee) continue;
    attendees[memberId] = {
      ...attendee,
      status: PartyStatus.CompletePending,
      pendingUntil: now + timeoutMinutes * MINUTE,
      ...(except === undefined ? {} : { askedBy: except }),
    };
  }
  return { party: { ...party, attendees }, asked };
}

/**
 * A member has completed the raid. When they were coming, present or asked themself, the others
 * of their group who are present are asked whether they have too (`asked`). A member who was
 * merely interested, or had already completed the raid (`wasComplete`, and then the very same
 * party comes back), asks nobody. Only for an attendee.
 */
export function completeRaid<P extends BattleParty>(
  party: P,
  memberId: string,
  now: number,
  timeoutMinutes: number,
): Change<P, { asked: string[]; wasComplete: boolean }> {
  const existing = attendeeOf(party, memberId);
  if (!existing) return refused('not-attending');
  const { pendingUntil: _pendingUntil, ...rest } = existing;
  const done = withAttendee(party, memberId, { ...rest, status: PartyStatus.Complete });
  const wasComplete = existing.status === PartyStatus.Complete;
  const asksOthers =
    existing.status === PartyStatus.Coming ||
    existing.status === PartyStatus.Present ||
    existing.status === PartyStatus.CompletePending;
  if (!asksOthers) return { ok: true, party: done, asked: [], wasComplete };
  return {
    ok: true,
    ...askPresent(done, existing.group, memberId, now, timeoutMinutes),
    wasComplete,
  };
}

/**
 * A member is done with the party. In a battle (`isBattle`: a raid, a max battle) that completes
 * it (`completeRaid`), which a raid refuses while it is an egg: nobody can have completed that.
 * Any other party has nothing
 * to complete, so done means leave, as with the legacy bot: the member is taken off (`left`),
 * nobody is asked anything and nobody ever has the status `Complete`; the conductor of a train
 * stops being it (`conductorLeft`, which the legacy bot forgot for done). Only for an attendee.
 */
export function finishParty<P extends Party>(
  party: P,
  memberId: string,
  now: number,
  timeoutMinutes: number,
): Change<P, { asked: string[]; wasComplete: boolean; left: boolean; conductorLeft?: true }> {
  if (!isBattle(party)) {
    const gone = leaveParty(party, memberId);
    return gone.ok ? { ...gone, asked: [], wasComplete: false, left: true } : gone;
  }
  if (isRaid(party) && raidStage(party, now) === 'egg') return refused('not-hatched');
  const done = completeRaid(party, memberId, now, timeoutMinutes);
  return done.ok ? { ...done, left: false } : done;
}

/** Asks the present members of a group, as after its meeting time (see `completeRaid`). */
export function askGroupWhetherComplete<P extends BattleParty>(
  party: P,
  groupId: GroupId,
  now: number,
  timeoutMinutes: number,
): { party: P; asked: string[] } {
  return askPresent(party, groupId, undefined, now, timeoutMinutes);
}

/** A member's answer to "have you completed this raid?": yes completes, no is present again. */
export function answerCompletion<P extends Party>(
  party: P,
  memberId: string,
  completed: boolean,
): Change<P> {
  const existing = attendeeOf(party, memberId);
  if (existing?.status !== PartyStatus.CompletePending) return refused('not-pending');
  const { pendingUntil: _pendingUntil, ...rest } = existing;
  const answered: Attendee = completed
    ? { ...rest, status: PartyStatus.Complete }
    : { ...unasked(existing), status: PartyStatus.Present };
  return { ok: true, party: withAttendee(party, memberId, answered) };
}

/**
 * Takes back the questions that no longer have a reason: a member who had pressed Done is not
 * done after all (a mis-tap), and nobody their Done asked has completed the raid either. The
 * members who are still asked by such a Done are present again (`released`). While the member
 * who pressed Done is done, or one of those asked has completed the raid (the raid was done,
 * then), the question stands. Questions of the scheduler (a meeting time) have no asker and
 * always stand. It looks at the whole party, so it can follow every change a member makes.
 */
export function withdrawQuestions<P extends Party>(party: P): { party: P; released: string[] } {
  const done = (id: string): boolean => attendeeOf(party, id)?.status === PartyStatus.Complete;
  const followed = new Set(
    Object.values(party.attendees)
      .filter((attendee) => attendee.status === PartyStatus.Complete)
      .map((attendee) => attendee.askedBy),
  );
  const orphaned = membersWhere(
    party,
    ({ status, askedBy }) =>
      status === PartyStatus.CompletePending &&
      askedBy !== undefined &&
      !done(askedBy) &&
      !followed.has(askedBy),
  );
  return releaseAsked(party, orphaned);
}

/**
 * Those of `members` who are still asked whether they completed the raid are present again, as
 * if they had not been asked: for a question that was withdrawn or could not be sent.
 */
export function releaseAsked<P extends Party>(
  party: P,
  members: readonly string[],
): { party: P; released: string[] } {
  const released = members.filter(
    (id) => attendeeOf(party, id)?.status === PartyStatus.CompletePending,
  );
  if (released.length === 0) return { party, released };
  const attendees = { ...party.attendees };
  for (const memberId of released) {
    const attendee = attendees[memberId];
    if (attendee) attendees[memberId] = { ...unasked(attendee), status: PartyStatus.Present };
  }
  return { party: { ...party, attendees }, released };
}

/** The completion questions that have served: none of the members they asked is still asked. */
export function servedQuestions(party: Party): CompletionQuestion[] {
  const pending = new Set(
    membersWhere(party, (attendee) => attendee.status === PartyStatus.CompletePending),
  );
  return party.prompts.completion.filter((question) =>
    question.members.length === 0
      ? pending.size === 0
      : !question.members.some((id) => pending.has(id)),
  );
}

/**
 * Completes everybody whose time to answer has run out; `completed` lists them. A pending
 * attendee without a time (it cannot happen through these functions) counts as run out.
 */
export function completeUnanswered<P extends BattleParty>(
  party: P,
  now: number,
): { party: P; completed: string[] } {
  const completed = membersWhere(
    party,
    (attendee) =>
      attendee.status === PartyStatus.CompletePending && (attendee.pendingUntil ?? 0) <= now,
  );
  if (completed.length === 0) return { party, completed };
  const attendees = { ...party.attendees };
  for (const memberId of completed) {
    const attendee = attendees[memberId];
    if (!attendee) continue;
    const { pendingUntil: _pendingUntil, ...rest } = attendee;
    attendees[memberId] = { ...rest, status: PartyStatus.Complete };
  }
  return { party: { ...party, attendees }, completed };
}

/**
 * Moves a member to a group. Somebody who is not signed up joins it as coming, alone. A member
 * who was asked whether they completed the raid has answered "not yet" by moving: they are
 * present again. Joining the group they are in changes nothing. Refused with `no-groups` in a
 * party that has its one group for good.
 */
export function joinGroup<P extends Party>(
  party: P,
  memberId: string,
  groupId: GroupId,
  limits: AttendanceLimits,
): Change<P, { joined: boolean }> {
  if (!hasGroups(party)) return refused('no-groups');
  const existing = attendeeOf(party, memberId);
  if (!existing) {
    return setAttendance(party, memberId, PartyStatus.Coming, { group: groupId }, limits);
  }
  if (!groupOf(party, groupId)) return refused('no-such-group');
  return {
    ok: true,
    party: withAttendee(party, memberId, movedTo(existing, groupId)),
    joined: false,
  };
}

/**
 * Joins a member into a group, as "Join A" beside a group of a post does: whoever is not signed
 * up, interested or present (or asked whether they completed the raid) is coming in that group
 * then, as Join makes them; a member who is coming already is only moved there (`joinGroup`).
 * The Join of the group a member is in changes only who is interested: who is present (or asked)
 * there stays so. The head count and remote stay as they are. Refused with `no-groups` in a party
 * that has its one group for good, and `no-such-group` for a group it does not have.
 */
export function joinInto<P extends Party>(
  party: P,
  memberId: string,
  groupId: GroupId,
  limits: AttendanceLimits,
): Change<P, { joined: boolean }> {
  if (!hasGroups(party)) return refused('no-groups');
  const attendee = attendeeOf(party, memberId);
  if (attendee?.status === PartyStatus.Coming) {
    return joinGroup(party, memberId, groupId, limits);
  }
  if (!groupOf(party, groupId)) return refused('no-such-group');
  if (
    (attendee?.status === PartyStatus.Present ||
      attendee?.status === PartyStatus.CompletePending) &&
    attendee.group === groupId
  ) {
    return { ok: true, party, joined: false };
  }
  return setAttendance(party, memberId, PartyStatus.Coming, { group: groupId }, limits);
}

/**
 * What a member chose in the dialog "which group?": any group with room, or one by its stamp; by
 * its letter alone (`stamp` undefined) on the live map, whose popup names groups by letter.
 */
export type GroupChoice = { any: true } | { group: GroupId; stamp?: string };

/**
 * The answer to "which group?" (plan 8X-1B, decision 2), decided as things are at the Submit: a
 * member who is not signed up is signed up with the status of the button they pressed
 * (Interested, Join, Here) in the group they chose, also over its size where groups have one (a
 * group named, as in 8X-1), or, for "any group with room", where `setAttendance` places a
 * newcomer (`chooseGroup` with a lobby size, else the default group). A group that went or whose
 * letter a group opened since has (`stampedGroup`) is refused `group-changed`. A member who
 * signed up meanwhile only gets that status in their own group, as the button gives it (coming
 * out of a full group where groups have a size: where `setAttendance` places them); `stayed`
 * names that group when they had chosen another and are still in it.
 */
export function joinChosen<P extends Party>(
  party: P,
  memberId: string,
  status: typeof PartyStatus.Interested | typeof PartyStatus.Coming | typeof PartyStatus.Present,
  choice: GroupChoice,
  limits: AttendanceLimits,
): Change<P, { joined: boolean; stayed?: GroupId }> {
  const before = attendeeOf(party, memberId)?.group;
  if (before !== undefined) {
    const changed = setAttendance(party, memberId, status, {}, limits);
    if (!changed.ok) return changed;
    // Coming out of a full group moves them (a lobby size): their answer says where to, then.
    const own = changed.party.attendees[memberId]?.group;
    return 'group' in choice && own === before && own !== choice.group
      ? { ...changed, stayed: own }
      : changed;
  }
  if ('any' in choice) return setAttendance(party, memberId, status, {}, limits);
  // By its letter alone, a group the party has not is no such group (setAttendance says so).
  if (choice.stamp !== undefined && !stampedGroup(party, choice.group, choice.stamp)) {
    return refused('group-changed');
  }
  return setAttendance(party, memberId, status, { group: choice.group }, limits);
}

/**
 * The letter of the next group: one that no group has and that no group split off a train went
 * by (plan 8T, `train.splitOff`), the first after the last letter in use, else the first such;
 * when every free letter was a split's, the first free one. A letter can come again: a group
 * nobody is in goes (`pruneGroups`, plan 8X-1B), and a split's letter is given once no other is
 * free; what names a group across time names it by its stamp too (`groupStamp`, `groupMark`),
 * so a dialog drawn for the group that went is refused. Undefined when the party has every group
 * it may.
 */
export function nextGroupId(party: Party): GroupId | undefined {
  const used = new Set(party.groups.map((group) => group.id));
  const gone = new Set(isTrain(party) ? party.train.splitOff.map((split) => split.group) : []);
  const last = Math.max(...party.groups.map((group) => GROUP_IDS.indexOf(group.id)));
  const fresh = (id: GroupId) => !used.has(id) && !gone.has(id);
  return (
    GROUP_IDS.slice(last + 1).find(fresh) ??
    GROUP_IDS.find(fresh) ??
    GROUP_IDS.find((id) => !used.has(id))
  );
}

/**
 * A group's label as it is kept, as a party's name is (`tidyShortText`); undefined for none, also
 * for a label in which nothing shows.
 */
function tidyLabel(text: string): string | undefined {
  const label = tidyShortText(text);
  return label === '' ? undefined : label;
}

/**
 * Opens the next group (`nextGroupId`, stamped `limits.now`) and moves the member into it, with
 * `label` where given (Group…'s dialog, plan 8X-1B; tidied, an empty one none, refused
 * `label-too-long` past `MAX_GROUP_LABEL`). It becomes the group new attendees land in. Refused
 * `nothing-to-change` for a member alone in a plain group of their own (`newGroupChangesNothing`),
 * for Group…'s Submit and `/group new` alike. `others` are the attendees who have not completed
 * the raid, to be told about it.
 */
export function createGroup<P extends Party>(
  party: P,
  memberId: string,
  limits: AttendanceLimits,
  label?: string,
): Change<P, { group: GroupId; joined: boolean; others: string[] }> {
  if (!hasGroups(party)) return refused('no-groups');
  if (newGroupChangesNothing(party, memberId)) return refused('nothing-to-change');
  const id = nextGroupId(party);
  if (id === undefined) return refused('too-many-groups');
  const tidy = label === undefined ? undefined : tidyLabel(label);
  if (tidy !== undefined && tidy.length > MAX_GROUP_LABEL) return refused('label-too-long');
  const group = openedGroup(party, id, limits.now);
  const opened: P = {
    ...party,
    groups: withGroupAdded(party.groups, tidy === undefined ? group : { ...group, label: tidy }),
    defaultGroupId: id,
  };
  const moved = joinGroup(opened, memberId, id, limits);
  if (!moved.ok) return moved;
  const others = membersWhere(
    moved.party,
    (attendee, other) => other !== memberId && attendee.status !== PartyStatus.Complete,
  );
  return { ...moved, group: id, others };
}

/**
 * Group…'s move (plan 8X-1B): the member to the group of this letter while it has this stamp
 * (`stampedGroup`; refused `group-changed` for one that went or was opened again under its
 * letter), as `/group join` moves them (`joinGroup`: a member not signed up comes, alone).
 */
export function joinStamped<P extends Party>(
  party: P,
  memberId: string,
  groupId: GroupId,
  stamp: string,
  limits: AttendanceLimits,
): Change<P, { joined: boolean }> {
  if (!hasGroups(party)) return refused('no-groups');
  if (!stampedGroup(party, groupId, stamp)) return refused('group-changed');
  return joinGroup(party, memberId, groupId, limits);
}

/**
 * Whether a new group would change nothing for this member (Group…, decision 8): they are alone
 * in their own group, which has no label and no meeting time and so would go once they left it
 * for the new one, whatever the other groups.
 */
export function newGroupChangesNothing(party: Party, memberId: string): boolean {
  const own = attendeeOf(party, memberId)?.group;
  const group = own === undefined ? undefined : groupOf(party, own);
  if (!group || group.label || group.startTime !== undefined) return false;
  return membersWhere(party, (attendee) => attendee.group === own).length === 1;
}

/** Sets the label of the member's own group; an empty text removes it. Only for an attendee. */
export function labelGroup<P extends Party>(
  party: P,
  memberId: string,
  text: string,
): Change<P, { group: GroupId }> {
  if (!hasGroups(party)) return refused('no-groups');
  const existing = attendeeOf(party, memberId);
  const group = existing && groupOf(party, existing.group);
  if (!group) return refused('not-attending');
  const label = tidyShortText(text);
  if (label.length > MAX_GROUP_LABEL) return refused('label-too-long');
  const { label: _old, ...rest } = group;
  return {
    ok: true,
    party: withGroup(party, label === '' ? rest : { ...rest, label }),
    group: group.id,
  };
}

/**
 * The party without the groups nobody is in (design `2026-10-20-join-group-meet-buttons-design.md`,
 * decision 6; a wish of legacy Pine's): a group goes when no attendee of any status is in it
 * (who is interested and who is done count: the latter are the raid's record), unless it has a
 * label or a meeting time; never the party's last group (of all empty ones the default group
 * stays). The others keep their letters (members were told "group C"). When the default group
 * goes, the newest group left takes over (by when it was opened, `groupOpened`; the later in the
 * list on a tie). The very same party when nothing goes. Silent: whoever runs it says nothing.
 * `PartyStore.update` runs it after every change that returned a new party.
 */
export function pruneGroups<P extends Party>(party: P): P {
  const used = new Set(Object.values(party.attendees).map((attendee) => attendee.group));
  const kept = party.groups.filter(
    (group) => used.has(group.id) || Boolean(group.label) || group.startTime !== undefined,
  );
  if (kept.length === party.groups.length) return party;
  const fallback = groupOf(party, party.defaultGroupId) ?? newestFirst(party)[0];
  const groups = kept.length > 0 ? kept : fallback ? [fallback] : [];
  if (groups.length === party.groups.length) return party;
  if (groups.some((group) => group.id === party.defaultGroupId)) return { ...party, groups };
  let newest = groups[0];
  for (const group of groups) {
    if (newest === undefined || groupOpened(party, group) >= groupOpened(party, newest)) {
      newest = group;
    }
  }
  return { ...party, groups, defaultGroupId: newest?.id ?? party.defaultGroupId };
}

/**
 * Sets the meeting time of the member's own group, or removes it with null. `others` are the
 * attendees of that group who have not completed the raid, to be told; none when the time did
 * not change. The time is floored to the minute, like a hatch time; the caller has checked it
 * (`resolvePartyTime`). Only for an attendee. Refused with `party-wide-start` in a timed party,
 * whether or not it has groups: such a party starts for everybody at once (`setStartTime` of
 * `timed.ts`).
 */
export function setMeetingTime<P extends Party>(
  party: P,
  memberId: string,
  time: number | null,
): Change<P, { group: GroupId; others: string[] }> {
  if (isTimed(party)) return refused('party-wide-start');
  const existing = attendeeOf(party, memberId);
  const group = existing && groupOf(party, existing.group);
  if (!group) return refused('not-attending');
  const { startTime: _startTime, startClearTime: _startClearTime, ...rest } = group;
  const changed = withGroup(
    party,
    time === null ? rest : { ...rest, startTime: Math.floor(time / MINUTE) * MINUTE },
  );
  const others =
    changed === party
      ? []
      : membersWhere(
          party,
          (attendee, other) =>
            other !== memberId &&
            attendee.group === group.id &&
            attendee.status !== PartyStatus.Complete,
        );
  return { ok: true, party: changed, group: group.id, others };
}

/**
 * The reporter's automatic status when they report a raid that already exists: applied only to
 * somebody who is not signed up, so that a second report never resets what a member chose.
 * Where the party's groups hold `lobbySize` trainers, the group is chosen as Join chooses it
 * (`chooseGroup`, a group it opens stamped `now`); otherwise it is the default group.
 */
export function applyAutoStatus<P extends Party>(
  party: P,
  memberId: string,
  status: PartyStatus,
  lobbySize?: number,
  now?: number,
): { party: P; joined: boolean } {
  if (attendeeOf(party, memberId)) return { party, joined: false };
  if (
    status !== PartyStatus.Interested &&
    status !== PartyStatus.Coming &&
    status !== PartyStatus.Present
  )
    return { party, joined: false };
  const placed =
    lobbySize === undefined
      ? { party, group: party.defaultGroupId }
      : chooseGroup(party, memberId, 1, lobbySize, now);
  const attendee: Attendee = { number: 1, status, group: placed.group, remote: false };
  return { party: withAttendee(placed.party, memberId, attendee), joined: true };
}
