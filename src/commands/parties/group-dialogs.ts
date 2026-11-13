import type { ButtonInteraction, ModalSubmitInteraction } from 'discord.js';
import type { AppContext } from '../../app-context.js';
import { deferSubmit, withoutOpenToken } from '../../discord/dialog.js';
import { UserError } from '../../discord/errors.js';
import { partyOfServer } from '../../discord/guards.js';
import { STALE_COMPONENT } from '../../discord/router.js';
import type { AttendanceLimits, GroupChoice } from '../../domain/party/attendance.js';
import {
  groupOf,
  hasGroups,
  attendeeOf,
  type GroupId,
  type Party,
} from '../../domain/party/party.js';
import { PartyStatus } from '../../domain/party/status.js';
import { standingReply } from '../../render/activity.js';
import type { AttendanceOutcome } from '../../services/attendance-service.js';
import {
  ANY_GROUP,
  chosenGroup,
  GROUP_INPUT,
  groupMenu,
  groupMenuDialog,
  isJoinAction,
  LABEL_INPUT,
  NEW_GROUP,
  nothingToChange,
  SIGNED_UP_MARK,
  whichGroupDialog,
  type GroupDialogView,
  type JoinAction,
} from '../../render/group-dialogs.js';
import { GROUP_LABEL, groupWords } from '../../render/party-controls.js';
import { actingMember, outcomeWords, partyOver, throwIfGivenBack } from './reply.js';

/*
 * The dialogs about groups of a post on Discord (plan 8X-1B; design
 * `2026-10-20-join-group-meet-buttons-design.md`): which group a newcomer joins, for Interested,
 * Join and Here of a post of several groups (decision 2). The buttons and the dialogs are the
 * party's controls, with their guards and `ACTION_THROTTLE`: opening counts as a press, and so
 * does a Submit. Nothing is read from the database before a dialog opens (the party is in
 * memory); since plan 8Z-2 (fix round F-A6) the press asks Discord whether somebody keeps a
 * newcomer out of the forum first (`AttendanceService.newcomerRefusal`), within `readInTime`.
 */

/** The status each button gives. */
const STATUS_OF: Readonly<
  Record<
    JoinAction,
    typeof PartyStatus.Interested | typeof PartyStatus.Coming | typeof PartyStatus.Present
  >
> = {
  maybe: PartyStatus.Interested,
  join: PartyStatus.Coming,
  here: PartyStatus.Present,
};

/** The button each dialog came from, as a sentence names it. */
const BUTTON_WORDS: Readonly<Record<JoinAction, string>> = {
  maybe: 'Interested',
  join: 'Join',
  here: 'Here',
};

/**
 * Whether a press of Interested, Join or Here asks which group: only a member who is not
 * signed up, of a post of several groups (decision 2). Anybody else's press changes their status
 * in their own group, as before; +1, −1, Remote and the commands never ask (they place a
 * newcomer as they always did: `chooseGroup` with a lobby size, else the default group).
 */
export function asksWhichGroup(party: Party | undefined, memberId: string): party is Party {
  return (
    party !== undefined &&
    hasGroups(party) &&
    party.groups.length > 1 &&
    attendeeOf(party, memberId) === undefined
  );
}

/** What the attendance service answers for a party that is not there. */
const GONE: AttendanceOutcome = { kind: 'gone' };

/** The dialog "which group?" for this press (`whichGroupDialog`), as the party is now. */
export async function openWhichGroup(
  interaction: ButtonInteraction,
  ctx: AppContext,
  party: Party,
  action: JoinAction,
): Promise<void> {
  await interaction.showModal(whichGroupDialog(viewFor(ctx, party, interaction.user.id), action));
}

export { NOTHING_TO_CHANGE } from '../../render/group-dialogs.js';

/**
 * What a new group's refusal `nothing-to-change` (decided inside the store, `createGroup`) is
 * told, by the party as it is now (`nothingToChange`); undefined for any other outcome. For
 * Group…'s Submit and `/group new` alike.
 */
export function newGroupRefusal(
  ctx: AppContext,
  partyId: string,
  memberId: string,
  outcome: AttendanceOutcome,
): string | undefined {
  if (outcome.kind !== 'refused' || outcome.reason !== 'nothing-to-change') return undefined;
  const party = ctx.parties.get(partyId);
  return party ? nothingToChange(party, memberId) : undefined;
}

/** The view of the dialogs about groups for this member, as the party is now. */
function viewFor(ctx: AppContext, party: Party, memberId: string): GroupDialogView {
  return {
    party,
    memberId,
    lobbySize: ctx.attendance.lobbyOf(party),
    zone: ctx.partyService.zoneOf(party),
    now: Date.now(),
  };
}

/**
 * "Group…" of a post (decision 3): its dialog (`groupMenuDialog`) of the ways left to this
 * member (`groupWays`: no new group for a member alone in a plain group of their own); refused
 * privately before it opens (8S-3's rule) for a party that ended, and as `groupMenu` decides it
 * (shared with the map, plan 8M-8B): one without groups, a member who has completed the raid,
 * and where no way is left (the one member of a party's one group: `NOTHING_TO_CHANGE`).
 */
export async function openGroupMenu(
  interaction: ButtonInteraction,
  ctx: AppContext,
  partyId: string,
): Promise<void> {
  const party = partyOfServer(interaction, ctx, partyId);
  if (!party) throw new UserError(partyOver(party));
  const memberId = interaction.user.id;
  const menu = groupMenu(party, memberId, ctx.attendance.limits());
  if ('refused' in menu) throw new UserError(menu.refused);
  await interaction.showModal(groupMenuDialog(viewFor(ctx, party, memberId), menu.ways));
}

/**
 * What a move of Group… is told (`joinStamped`'s outcome), by the Submit of its dialog and the
 * map's form alike (plan 8M-8B): `Group B has changed since: press Group… again.` for a group
 * that went or was opened again under its letter, else the outcome's words (`party` as it was
 * found before the move: a refusal and "it is over" name its kind).
 */
export function movedWords(
  limits: AttendanceLimits,
  party: Pick<Party, 'type'> | undefined,
  group: GroupId,
  outcome: AttendanceOutcome,
): { ok: boolean; text: string } {
  return outcome.kind === 'refused' && outcome.reason === 'group-changed'
    ? { ok: false, text: `Group ${group} has changed since: press ${GROUP_LABEL} again.` }
    : outcomeWords(limits, party, outcome);
}

/** The way a Submit of Group…'s dialog asks for: from its custom id, else its choice. */
function chosenWay(
  interaction: ModalSubmitInteraction,
  args: readonly string[],
): { new: true } | { group: GroupId; stamp: string } | undefined {
  const value =
    args.length > 0
      ? args.join(':')
      : interaction.fields.fields.has(GROUP_INPUT)
        ? (interaction.fields.getRadioGroup(GROUP_INPUT) ?? '')
        : '';
  return value === NEW_GROUP ? { new: true } : chosenGroup(value);
}

/**
 * Submit of Group…'s dialog (`party:<id>:regroupform[:in][:<way>][:~<token>]`): acknowledged privately,
 * then, as things are now, a new group opened with the label typed (`/group new`'s notice and
 * answer: `You opened group C (label) and are in it.`; refused inside the store where it would
 * change nothing, `newGroupRefusal`) or a move to the group picked by its stamp (`joinStamped`: a
 * newcomer comes; `Group B has changed since: press Group… again.` for one that went), the label
 * ignored. A dialog drawn for a member signed up (`SIGNED_UP_MARK`, `Change group`) is refused
 * once they have left (`You are no longer signed up: press Group… again.`), decided inside the
 * store too.
 */
export async function submitGroupMenu(
  interaction: ModalSubmitInteraction,
  ctx: AppContext,
  partyId: string,
  drawn: readonly string[],
): Promise<void> {
  const args = withoutOpenToken(drawn);
  const signedUp = args[0] === SIGNED_UP_MARK;
  const way = chosenWay(interaction, signedUp ? args.slice(1) : args);
  if (way === undefined) throw new UserError(STALE_COMPONENT);
  const label = interaction.fields.fields.has(LABEL_INPUT)
    ? interaction.fields.getTextInputValue(LABEL_INPUT)
    : '';
  await deferSubmit(interaction);
  const party = partyOfServer(interaction, ctx, partyId);
  const member = actingMember(interaction);
  const limits = ctx.attendance.limits();
  // A party of another server is none here: answered as one that has ended, nothing written.
  if (!party) {
    await interaction.editReply({ content: outcomeWords(limits, party, GONE).text });
    return;
  }
  let text: string;
  if ('new' in way) {
    const outcome = await ctx.attendance.newGroup(partyId, member, label, { signedUp });
    text =
      newGroupRefusal(ctx, partyId, member.id, outcome) ??
      outcomeWords(limits, party, outcome, (ok) => {
        const group = groupOf(ok.party, ok.group);
        return `You opened ${groupWords(group ?? { id: ok.group })} and are in it.`;
      }).text;
    throwIfGivenBack(outcome, text);
  } else {
    const outcome = await ctx.attendance.joinStamped(partyId, member, way.group, way.stamp, {
      signedUp,
    });
    text = movedWords(limits, party, way.group, outcome).text;
    throwIfGivenBack(outcome, text);
  }
  await interaction.editReply({ content: text });
}

/** The choice a Submit picked; undefined for a dialog of another shape or a forged one. */
function pickedChoice(interaction: ModalSubmitInteraction): GroupChoice | undefined {
  if (!interaction.fields.fields.has(GROUP_INPUT)) return undefined;
  const value = interaction.fields.getRadioGroup(GROUP_INPUT) ?? '';
  return value === ANY_GROUP ? { any: true } : chosenGroup(value);
}

/**
 * Submit of "which group?" (`party:<id>:joinform:<action>[:~<token>]`): acknowledged privately, then the
 * member is signed up as things are now (`AttendanceService.joinChosen`) and told how they stand;
 * a group that went or was opened again under its letter is `Group B has changed since: press
 * Join again.`, a member who signed up meanwhile hears they stay in their own group, a party
 * that ended that it is over.
 */
export async function submitWhichGroup(
  interaction: ModalSubmitInteraction,
  ctx: AppContext,
  partyId: string,
  args: readonly string[],
): Promise<void> {
  const [action] = withoutOpenToken(args);
  const choice = pickedChoice(interaction);
  if (!isJoinAction(action) || choice === undefined) throw new UserError(STALE_COMPONENT);
  await deferSubmit(interaction);
  const party = partyOfServer(interaction, ctx, partyId);
  if (!party) {
    // A party of another server is none here: answered as one that has ended, nothing written.
    await interaction.editReply({
      content: outcomeWords(ctx.attendance.limits(), party, GONE).text,
    });
    return;
  }
  const outcome = await ctx.attendance.joinChosen(
    partyId,
    actingMember(interaction),
    STATUS_OF[action],
    choice,
  );
  const text =
    outcome.kind === 'refused' && outcome.reason === 'group-changed' && 'group' in choice
      ? `Group ${choice.group} has changed since: press ${BUTTON_WORDS[action]} again.`
      : outcomeWords(ctx.attendance.limits(), party, outcome, (ok) =>
          ok.stayed === undefined || ok.attendee === undefined
            ? undefined
            : `${standingReply(ok.party, ok.attendee)} You were signed up already, so you stay ` +
              `in your group: ${GROUP_LABEL} moves you.`,
        ).text;
  throwIfGivenBack(outcome, text);
  await interaction.editReply({ content: text });
}
