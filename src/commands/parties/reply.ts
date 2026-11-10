import {
  type AutocompleteInteraction,
  type ChatInputCommandInteraction,
  type MessageComponentInteraction,
  type ModalSubmitInteraction,
} from 'discord.js';
import type { AppContext } from '../../app-context.js';
import { decodeCustomId } from '../../discord/custom-id.js';
import { UserError } from '../../discord/errors.js';
import { answer } from '../../discord/late-reply.js';
import { notAMeetup, notARaid, notATrain, notTimed, partyOf } from '../../discord/guards.js';
import { memberInfo } from '../../discord/member-info.js';
import type { Throttle } from '../../discord/throttle.js';
import {
  hasGroups,
  headCount,
  isGroupId,
  isMeetup,
  isRaid,
  isTimed,
  isTrain,
  partyWord,
  type Attendee,
  type GroupId,
  type MeetupParty,
  type Party,
  type RaidParty,
  type TimedParty,
  type TrainParty,
} from '../../domain/party/party.js';
import type { AttendanceLimits } from '../../domain/party/attendance.js';
import { PartyStatus } from '../../domain/party/status.js';
import { problemText, standingReply } from '../../render/activity.js';
import { isRaidAction } from '../../render/party-controls.js';
import { truncate } from '../../render/text.js';
import type {
  AttendanceOutcome,
  AttendanceService,
  Member,
} from '../../services/attendance-service.js';

/**
 * What a member is told about a party that has ended. Pass the party when it is known. One that
 * is not at hand (it has left the store, and with it what kind it was) is spoken of without a
 * kind.
 */
export function partyOver(party?: Pick<Party, 'type'>): string {
  return party ? `This ${partyWord(party)} is over.` : 'This has ended.';
}

/**
 * How often one member may act on parties: per minute, for the buttons of a post together and
 * for each command by itself. Every action writes to the database and says a line in the post.
 */
export const ACTION_THROTTLE: Throttle = { uses: 30, perSeconds: 60 };

/** The member who made an interaction, as the attendance service wants them. */
export function actingMember(
  interaction: ChatInputCommandInteraction | MessageComponentInteraction | ModalSubmitInteraction,
): Member {
  return { id: interaction.user.id, ...memberInfo(interaction) };
}

/**
 * The party of the post a command was used in. The guard `requireParty` has checked it, but the
 * party can end between the guard and the handler.
 */
export function commandParty(interaction: ChatInputCommandInteraction, ctx: AppContext): Party {
  const party = partyOf(interaction, ctx);
  if (!party) throw new UserError(partyOver());
  return party;
}

/**
 * The raid of the post a command was used in. The guard `requireRaid` has checked it; like
 * `commandParty` this copes with a raid that ended in between.
 */
export function commandRaid(interaction: ChatInputCommandInteraction, ctx: AppContext): RaidParty {
  const party = partyOf(interaction, ctx);
  if (!party) throw new UserError(partyOver({ type: 'raid' }));
  if (!isRaid(party)) throw new UserError(notARaid(party));
  return party;
}

/**
 * The timed party of the post a command was used in (`requireTimed` has checked it), as
 * `commandRaid` gives the raid. When it ended in between, nothing says any more whether it was
 * a train or a meetup: it is spoken of without a kind.
 */
export function commandTimed(
  interaction: ChatInputCommandInteraction,
  ctx: AppContext,
): TimedParty {
  const party = partyOf(interaction, ctx);
  if (!party) throw new UserError(partyOver());
  if (!isTimed(party)) throw new UserError(notTimed(party));
  return party;
}

/** The train of the post a command was used in (`requireTrain` has checked it). */
export function commandTrain(
  interaction: ChatInputCommandInteraction,
  ctx: AppContext,
): TrainParty {
  const party = partyOf(interaction, ctx);
  if (!party) throw new UserError(partyOver({ type: 'train' }));
  if (!isTrain(party)) throw new UserError(notATrain(party));
  return party;
}

/** The meetup of the post a command was used in (`requireMeetup` has checked it). */
export function commandMeetup(
  interaction: ChatInputCommandInteraction,
  ctx: AppContext,
): MeetupParty {
  const party = partyOf(interaction, ctx);
  if (!party) throw new UserError(partyOver({ type: 'meetup' }));
  if (!isMeetup(party)) throw new UserError(notAMeetup(party));
  return party;
}

/**
 * The group a member picked from the list or typed: its letter. `B`, `b`, `group b`, and what
 * the list shows (`Group B: park side (4)`) all mean B. Whether the party has that group is for
 * the service to say; `party` is only named in the refusal of a text that is no group at all.
 */
export function typedGroup(ctx: AppContext, party: Pick<Party, 'type'>, text: string): GroupId {
  const letter = /^(?:GROUP\s*)?([A-Z])(?:\s*[:(].*)?$/.exec(text.trim().toUpperCase())?.[1] ?? '';
  if (!isGroupId(letter)) {
    throw new UserError(problemText('no-such-group', ctx.attendance.limits(), partyWord(party)));
  }
  return letter;
}

/**
 * Answers the autocomplete of a group option with the groups the raid of this post has, each
 * with its name and head count (`Group B: park side (4)`); with none anywhere else.
 */
export function respondWithGroups(
  interaction: AutocompleteInteraction,
  ctx: AppContext,
): Promise<void> {
  return respondWithGroupsOf(interaction, ctx, (party) => party.groups.map((group) => group.id));
}

/**
 * As `respondWithGroups`, with only the groups `pick` names of the party of this post (`/group
 * split`: those the member may split off).
 */
export async function respondWithGroupsOf(
  interaction: AutocompleteInteraction,
  ctx: AppContext,
  pick: (party: Party) => readonly GroupId[],
): Promise<void> {
  const party = partyOf(interaction, ctx);
  // Nothing either for a party that has its one group for good: there is nothing to choose.
  if (!party || !hasGroups(party)) {
    await interaction.respond([]);
    return;
  }
  const picked = new Set(pick(party));
  const typed = interaction.options
    .getFocused()
    .trim()
    .toLowerCase()
    .replace(/^group\s*/, '');
  const all = party.groups
    .filter((group) => picked.has(group.id))
    .map((group) => ({
      // The label gives way, never the head count: a choice has at most 100 characters.
      name: `Group ${group.id}${group.label ? `: ${truncate(group.label, 70)}` : ''} (${headCount(party, group.id)})`,
      label: (group.label ?? '').toLowerCase(),
      value: group.id,
    }));
  // A letter means that group; anything else is looked for in the names of the groups.
  const byLetter = all.filter((choice) => choice.value.toLowerCase() === typed);
  const found =
    typed === ''
      ? all
      : byLetter.length > 0
        ? byLetter
        : all.filter((choice) => choice.label.includes(typed));
  await interaction.respond(found.map(({ name, value }) => ({ name, value })));
}

export type Ok<Extra> = Extract<AttendanceOutcome<Extra>, { kind: 'ok' }>;

/**
 * Tells the member, privately, what came of their action: how they stand now, or what `words`
 * makes of the outcome. A refusal and a party that has ended are thrown as `UserError`s, which
 * the router shows the same way. `party` is the party the action was for, as the command found
 * it: a refusal and "it is over" name its kind. Through `answer`, so that a command acknowledged
 * late (`defer: 'late'`, plan 8Z-2: a newcomer is asked of Discord first) is answered in its
 * acknowledgement's place.
 */
export async function answerOutcome<Extra>(
  interaction: ChatInputCommandInteraction | MessageComponentInteraction,
  ctx: AppContext,
  party: Pick<Party, 'type'>,
  outcome: AttendanceOutcome<Extra>,
  words?: (ok: Ok<Extra>) => string | undefined,
): Promise<void> {
  await answer(interaction, { content: outcomeContent(ctx, party, outcome, words) });
}

/**
 * The same for a click on a control of a post: the answers to a burst of clicks by one member on
 * one party are gathered into one (`ClickAnswers`); a refusal is still shown at once.
 */
export async function answerClick<Extra>(
  interaction: MessageComponentInteraction,
  ctx: AppContext,
  partyId: string,
  outcome: AttendanceOutcome<Extra>,
  words?: (ok: Ok<Extra>) => string | undefined,
): Promise<void> {
  // A control names its party by id only. A party that refused is still there to be asked its
  // kind; one that has ended is not. What only the post of a raid has (Set time, Screenshot
  // feedback: `isRaidAction`) was a raid's; of anything else the kind is not known (Done and the
  // completion question's answers are a max battle's too).
  const action = decodeCustomId(interaction.customId)?.action;
  const party =
    ctx.parties.get(partyId) ??
    (action !== undefined && isRaidAction(action) ? ({ type: 'raid' } as const) : undefined);
  const content = outcomeContent(ctx, party, outcome, words);
  await ctx.clickAnswers.answer(`${partyId}:${interaction.user.id}`, interaction, content);
}

/**
 * What the member is told for an outcome; a refusal and a party that has ended are thrown, a
 * refusal that is none of the member's doing (`refusalGivesBack`) with its use given back.
 */
function outcomeContent<Extra>(
  ctx: AppContext,
  party: Pick<Party, 'type'> | undefined,
  outcome: AttendanceOutcome<Extra>,
  words?: (ok: Ok<Extra>) => string | undefined,
): string {
  const said = outcomeWords(ctx.attendance.limits(), party, outcome, words);
  if (!said.ok) throw new UserError(said.text, { givesBack: refusalGivesBack(outcome) });
  return said.text;
}

/**
 * Whether an attendance outcome is a refusal that is none of the member's doing, whose use goes
 * back (plan 8Z-2, fix round F-A1): Discord could not say just now whether somebody keeps a
 * newcomer out of the party's forum (`forum-unknown`). On Discord (`UserError.givesBack`) and on
 * the map (`givenBackOnTheMap`) alike.
 */
export function refusalGivesBack(outcome: AttendanceOutcome<unknown>): boolean {
  return outcome.kind === 'refused' && outcome.reason === 'forum-unknown';
}

/**
 * For a dialog's Submit, which answers in its acknowledged reply: a refusal that gives its use
 * back (`refusalGivesBack`) is thrown with `text` instead, for the router to say and give back.
 */
export function throwIfGivenBack(outcome: AttendanceOutcome<unknown>, text: string): void {
  if (refusalGivesBack(outcome)) throw new UserError(text, { givesBack: true });
}

/**
 * What the member is told for an outcome, and whether it worked: how they stand now (or what
 * `words` makes of it), why it was refused, or that the party is over. `party` is the party the
 * action was for, as far as it is known: a refusal and "it is over" name its kind. The answer of
 * a post's control (thrown, when it did not work) and of a press on the live map alike.
 */
export function outcomeWords<Extra>(
  limits: AttendanceLimits,
  party: Pick<Party, 'type'> | undefined,
  outcome: AttendanceOutcome<Extra>,
  words?: (ok: Ok<Extra>) => string | undefined,
): { ok: boolean; text: string } {
  if (outcome.kind === 'gone') return { ok: false, text: partyOver(party) };
  if (outcome.kind === 'refused') {
    // A party that refused is in the store, so its kind is known; `party` is said otherwise.
    const word = party ? partyWord(party) : 'party';
    return { ok: false, text: problemText(outcome.reason, limits, word) };
  }
  return { ok: true, text: outcomeText(outcome as Ok<Extra>, words) };
}

/**
 * A press of one of the attendance buttons of a post (spec 4.1): Interested (`maybe`), Join,
 * Here, Done, Leave, and "Join B" (`group`: the letter buttons of a post drawn before plan
 * 8X-1B, `joinInto`). The live map presses the same buttons (plan 8M-3); its popup asks a
 * newcomer which group as the post's dialog does, and sends Interested, Join and Here with it
 * (`chosen`: as the dialog's Submit, `joinChosen` by the group's letter, so a member who signed
 * up meanwhile keeps their group).
 */
export type StatusPress =
  | { action: 'maybe' | 'join' | 'here' | 'done' | 'leave' | 'more' | 'less' }
  | { action: 'group'; group: GroupId }
  | { action: 'chosen'; status: 'maybe' | 'join' | 'here'; group: GroupId }
  | { action: 'answer'; yes: boolean };

/** What a press is answered with: the outcome, and how its answer is worded. */
export type PressAnswerer<R> = <Extra>(
  outcome: AttendanceOutcome<Extra>,
  words?: (ok: Ok<Extra>) => string | undefined,
) => Promise<R>;

/**
 * Carries out a press of an attendance button through the attendance service, exactly as the
 * post's button does, and has `answer` tell the member (the button: `answerClick`; the live map:
 * its JSON). The one code path of the post's buttons and the map's: the statuses, +1 and −1
 * (`moreWords`) and the completion question's "Yes, done" and "Not yet" (plan 8M-8B).
 */
export async function pressStatus<R>(
  attendance: Pick<
    AttendanceService,
    'signUp' | 'joinInto' | 'joinChosen' | 'done' | 'leave' | 'changeNumber' | 'answer'
  >,
  partyId: string,
  member: Member,
  press: StatusPress,
  answer: PressAnswerer<R>,
): Promise<R> {
  switch (press.action) {
    case 'more':
      return answer(await attendance.changeNumber(partyId, member, 1), moreWords);
    case 'less':
      return answer(await attendance.changeNumber(partyId, member, -1));
    case 'answer':
      return answer(await attendance.answer(partyId, member, press.yes));
    case 'maybe':
      return answer(await attendance.signUp(partyId, member, PartyStatus.Interested));
    case 'join':
      return answer(await attendance.signUp(partyId, member, PartyStatus.Coming));
    case 'here':
      return answer(await attendance.signUp(partyId, member, PartyStatus.Present));
    case 'done':
      return answer(await attendance.done(partyId, member), doneWords);
    case 'leave':
      return answer(await attendance.leave(partyId, member), leftWords);
    case 'group':
      return answer(await attendance.joinInto(partyId, member, press.group));
    case 'chosen':
      return answer(
        await attendance.joinChosen(partyId, member, CHOSEN_STATUS[press.status], {
          group: press.group,
        }),
      );
  }
}

/** The status each button of the map's popup gives with a chosen group. */
const CHOSEN_STATUS = {
  maybe: PartyStatus.Interested,
  join: PartyStatus.Coming,
  here: PartyStatus.Present,
} as const;

/** What a member is told after an action that worked. */
export function outcomeText<Extra>(
  ok: Ok<Extra>,
  words?: (ok: Ok<Extra>) => string | undefined,
): string {
  const said =
    words?.(ok) ??
    (ok.attendee
      ? standingReply(ok.party, ok.attendee)
      : `You are not signed up for this ${partyWord(ok.party)}.`);
  return ok.withdrawn.length > 0 ? `${said} ${WITHDRAWN_REPLY}` : said;
}

/** Added to the answer of a member whose going back took their question to the others back. */
export const WITHDRAWN_REPLY = 'I have taken back the question whether the others are done.';

/** What the remote switch answers: "in person" is said, or switching it off would say nothing. */
export function remoteWords(ok: {
  party: Party;
  attendee: Attendee | undefined;
}): string | undefined {
  return ok.attendee && standingReply(ok.party, ok.attendee, { sayInPerson: true });
}

/** What +1 answers: a click that changed nothing has met the most one member may bring. */
export function moreWords(ok: {
  party: Party;
  attendee: Attendee | undefined;
  acted: boolean;
}): string | undefined {
  if (ok.acted || !ok.attendee) return undefined;
  return `${standingReply(ok.party, ok.attendee)} That is the most one member may bring.`;
}

/** What Leave answers. */
export function leftWords(ok: { party: Party }): string {
  return `You have left this ${partyWord(ok.party)}.`;
}

/**
 * What Done answers: whether the others were asked, or that nothing changed. In a party where
 * done means leave (a train, a meetup), that the member has left.
 */
export function doneWords(ok: {
  party: Party;
  asked: string[];
  wasComplete: boolean;
  left: boolean;
}): string {
  if (ok.left) return leftWords(ok);
  if (ok.wasComplete) return 'You were done already.';
  return ok.asked.length === 0
    ? 'You are done.'
    : 'You are done. I have asked the others of your group who are here whether they are too.';
}
