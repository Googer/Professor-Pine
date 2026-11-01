import type { APIModalInteractionResponseCallbackData } from 'discord.js';
import { encodeCustomId } from '../discord/custom-id.js';
import { dialog, openToken, type DialogOption } from '../discord/dialog.js';
import {
  chooseGroup,
  MAX_GROUP_LABEL,
  newGroupChangesNothing,
  nextGroupId,
} from '../domain/party/attendance.js';
import {
  attendeeOf,
  groupOf,
  hasGroups,
  inLetterOrder,
  groupStamp,
  headCount,
  isGroupId,
  isBattle,
  lobbyCount,
  partyWord,
  type GroupId,
  type Party,
  type PartyGroup,
} from '../domain/party/party.js';
import type { AttendanceLimits } from '../domain/party/attendance.js';
import { PartyStatus } from '../domain/party/status.js';
import type { MapRegroup } from '../domain/web/party-data.js';
import { problemText } from './activity.js';
import { groupLine } from './group-words.js';
import { groupWords, PARTY_KIND } from './party-controls.js';
import { clockText, count, truncate, unplain } from './text.js';

/*
 * The dialogs about groups of a post (plan 8X-1B; design
 * `2026-10-20-join-group-meet-buttons-design.md`): which group a newcomer joins (decision 2), and
 * Group…'s (decision 3). A choice names a group by its letter and stamp (`groupChoice`), since a
 * group nobody is in goes and a later one may take its letter: a Submit for a group that went is
 * refused, never taken for the new one.
 */

/** The custom-id action of the dialog that asks a newcomer which group. */
export const WHICH_GROUP_FORM = 'joinform';

/** The radio group of the groups to choose from. */
export const GROUP_INPUT = 'group';

/** The choice "Any group with room", where the party's groups have a size. */
export const ANY_GROUP = 'any';

/** The status buttons that ask a newcomer which group: Interested, Join, Here. */
export type JoinAction = 'maybe' | 'join' | 'here';

export function isJoinAction(value: string | undefined): value is JoinAction {
  return value === 'maybe' || value === 'join' || value === 'here';
}

/** What the dialogs about groups are drawn from. */
export interface GroupDialogView {
  party: Party;
  /** The member who pressed. */
  memberId: string;
  /** How many trainers a group holds, where the party has a size (`lobbySize`). */
  lobbySize: number | undefined;
  /** The settings' time zone: a choice shows a meeting time as a clock time. */
  zone: string;
  now: number;
}

/** A choice's value for a group: `B:<stamp>` (`groupStamp`). */
export function groupChoice(party: Pick<Party, 'createdAt'>, group: PartyGroup): string {
  return `${group.id}:${groupStamp(party, group)}`;
}

/** The group and stamp of a choice's value; undefined for anything else (`ANY_GROUP` too). */
export function chosenGroup(value: string): { group: GroupId; stamp: string } | undefined {
  const [group, stamp, ...rest] = value.split(':');
  return group !== undefined && isGroupId(group) && stamp && rest.length === 0
    ? { group, stamp }
    : undefined;
}

/** `Group B: by the bridge`, within the 100 characters of a choice's label. */
export function groupLabel(group: PartyGroup): string {
  return truncate(group.label ? `Group ${group.id}: ${group.label}` : `Group ${group.id}`, 100);
}

/** A group's lobby, as the post's heading counts it: `2/4 coming · 1 interested`. */
function lobbyWords(party: Party, group: GroupId, size: number): string {
  const interested = Object.values(party.attendees)
    .filter((attendee) => attendee.group === group && attendee.status === PartyStatus.Interested)
    .reduce((sum, attendee) => sum + attendee.number, 0);
  const coming = `${lobbyCount(party, group)}/${size} coming`;
  return interested > 0 ? `${coming} · ${interested} interested` : coming;
}

/**
 * How many are in a group, as its choice says it: its lobby where groups have a size
 * (`2/4 coming`), else `2 trainers`, or `Nobody yet`.
 */
export function groupSize(
  view: Pick<GroupDialogView, 'party' | 'lobbySize'>,
  group: PartyGroup,
): string {
  const { party, lobbySize } = view;
  const someone = Object.values(party.attendees).some((attendee) => attendee.group === group.id);
  return lobbySize !== undefined
    ? lobbyWords(party, group.id, lobbySize)
    : someone
      ? count(headCount(party, group.id), 'trainer')
      : 'Nobody yet';
}

/**
 * A short line of a group, for its choice: how many are in it (`groupSize`), and a raid's meeting
 * time or that it has none yet (`groupLine`, the map's wording too).
 */
export function groupDescription(view: GroupDialogView, group: PartyGroup): string {
  const { party, zone } = view;
  const size = groupSize(view, group);
  if (!isBattle(party)) return size;
  const meeting = group.startTime === undefined ? null : clockText(group.startTime, zone);
  return truncate(groupLine(size, meeting), 100);
}

/**
 * "Any group with room" (where groups have a size, decision 2): what `chooseGroup` would choose
 * for the member now, which the Submit chooses anew; when every group is full and the party may
 * have no more, it says the join goes to the one with the most room (over its size).
 */
function anyGroupOption(view: GroupDialogView, size: number): DialogOption {
  const { party, memberId, now } = view;
  const chosen = chooseGroup(party, memberId, 1, size, now);
  if (chosen.party !== party) {
    return {
      value: ANY_GROUP,
      label: 'Any group with room',
      description: `Now: a new group, ${chosen.group}`,
    };
  }
  const words = `group ${chosen.group} (${lobbyWords(party, chosen.group, size)})`;
  return lobbyCount(party, chosen.group, memberId) + 1 > size
    ? {
        value: ANY_GROUP,
        label: 'Any group: all are full',
        description: `The one with the most room: ${words}`,
      }
    : { value: ANY_GROUP, label: 'Any group with room', description: `Now: ${words}` };
}

const TITLES: Readonly<Record<JoinAction, (word: string) => string>> = {
  maybe: (word) => `Interested in this ${word}`,
  join: (word) => `Join this ${word}`,
  here: (word) => `Here for this ${word}`,
};

/**
 * The dialog that asks a member who is not signed up which group, for a press of Interested,
 * Join or Here on a post of several groups (decision 2): one required radio choice, "Which
 * group?", of "Any group with room" first where the groups have a size, then every group in
 * letter order (plan 8X-G), "Any group with room" marked to start with where there is one, else
 * the default group, where Join, +1 and Remote put a newcomer (review r0 A2; decision 9: Android
 * picks the first itself, group A, an iPhone what is marked). Each group by its label and a short line (`groupDescription`). Its custom id
 * `party:<id>:joinform:<action>:<token>` keeps which button it was, and a per-open token
 * (`openToken`, plan 8X-F: Discord's client starts with the value marked); a choice is
 * `ANY_GROUP` or `groupChoice`.
 */
export function whichGroupDialog(
  view: GroupDialogView,
  action: JoinAction,
): APIModalInteractionResponseCallbackData {
  const { party, lobbySize } = view;
  const defaultGroup = party.groups.find((group) => group.id === party.defaultGroupId);
  const options: DialogOption[] = [
    ...(lobbySize === undefined ? [] : [anyGroupOption(view, lobbySize)]),
    ...inLetterOrder(party.groups).map((group) => ({
      value: groupChoice(party, group),
      label: groupLabel(group),
      description: groupDescription(view, group),
    })),
  ];
  return dialog({
    customId: encodeCustomId({
      kind: PARTY_KIND,
      id: party.id,
      action: WHICH_GROUP_FORM,
      args: [action, openToken(view.now)],
    }),
    title: TITLES[action](partyWord(party)),
    choice: {
      id: GROUP_INPUT,
      label: 'Which group?',
      options,
      // "Any group with room" where the groups have a size; else the default group, where Join,
      // +1 and Remote put a newcomer (review r0 A2). Android picks the first itself (group A).
      picked:
        lobbySize !== undefined || defaultGroup === undefined
          ? options[0]?.value
          : groupChoice(party, defaultGroup),
    },
  });
}

/** The custom-id action of Group…'s dialog. */
export const GROUP_MENU_FORM = 'regroupform';

/** The choice of Group…'s dialog that opens a new group. */
export const NEW_GROUP = 'new';

/** The line of Group…'s dialog for the label of a new group. */
export const LABEL_INPUT = 'label';

/**
 * The first argument of Group…'s dialog drawn for a member signed up (`Change group`): its Submit
 * is refused once they have left, instead of signing them up again (no group or way is `in`).
 */
export const SIGNED_UP_MARK = 'in';

/** What Group… can do for a member: move them to a group, or open a new one (its letter). */
export type GroupWay = { kind: 'move'; group: PartyGroup } | { kind: 'new'; id: GroupId };

/**
 * What Group… offers this member (decision 3): every other group (all of them for a member who
 * is not signed up), in letter order (plan 8X-G), then a new group while the party may have one more
 * (`nextGroupId`) and it would change something (not for a member alone in a plain group of
 * their own: `newGroupChangesNothing`). Nothing where there is nothing to choose.
 */
export function groupWays(party: Party, memberId: string): GroupWay[] {
  const own = attendeeOf(party, memberId)?.group;
  const next = newGroupChangesNothing(party, memberId) ? undefined : nextGroupId(party);
  return [
    ...inLetterOrder(party.groups)
      .filter((group) => group.id !== own)
      .map((group): GroupWay => ({ kind: 'move', group })),
    ...(next === undefined ? [] : [{ kind: 'new' as const, id: next }]),
  ];
}

/** A way as the value of a choice: `NEW_GROUP`, or the group's `groupChoice`. */
function wayValue(party: Party, way: GroupWay): string {
  return way.kind === 'new' ? NEW_GROUP : groupChoice(party, way.group);
}

/** What a dialog without a choice says Submit does: `Submit opens group C and moves you to it.` */
function onlyWay(way: GroupWay, signedUp: boolean): string {
  if (way.kind === 'new') {
    return signedUp
      ? `Submit opens group ${way.id} and moves you to it.`
      : `Submit opens group ${way.id} and signs you up as coming in it.`;
  }
  return signedUp
    ? `Submit moves you to group ${way.group.id}.`
    : `Submit signs you up as coming in group ${way.group.id}.`;
}

/**
 * The words of Group…'s dialog for these ways (decisions 3 and 8), the dialog's and the map's
 * (plan 8M-8B, over the ways it offers): the title, `Change group` for a member signed up (who
 * `signedUp`), else `Join a group`; the text, which group the member is in, or how a newcomer
 * joins, and what Submit does where one way is left (`only`); the choice's label.
 */
export function groupMenuText(
  view: Pick<GroupDialogView, 'party' | 'memberId'>,
  ways: readonly GroupWay[],
): { title: string; text: string; label: string; signedUp: boolean; only?: GroupWay } {
  const { party, memberId } = view;
  const own = attendeeOf(party, memberId)?.group;
  const ownGroup = own === undefined ? undefined : groupOf(party, own);
  const intro = ownGroup
    ? `You're in ${groupWords(ownGroup)}.`
    : 'You join as coming, in the group you pick.';
  const only = ways.length === 1 ? ways[0] : undefined;
  return {
    title: ownGroup ? 'Change group' : 'Join a group',
    text:
      only === undefined
        ? intro
        : ownGroup
          ? `${intro} ${onlyWay(only, true)}`
          : onlyWay(only, false),
    label: ownGroup ? 'Move to' : 'Join',
    signedUp: ownGroup !== undefined,
    ...(only === undefined ? {} : { only }),
  };
}

/** What Group… says to the one member of a party's one group (decision 8). */
export const NOTHING_TO_CHANGE = 'You are the only one here: a new group would change nothing.';

/**
 * What Group… and `/group new` say to a member alone in a plain group of their own
 * (`newGroupChangesNothing`): `NOTHING_TO_CHANGE` in a party of one group, else that they are
 * alone in their group already.
 */
export function nothingToChange(party: Party, memberId: string): string {
  const own = attendeeOf(party, memberId)?.group;
  return party.groups.length === 1 || own === undefined
    ? NOTHING_TO_CHANGE
    : `You are alone in group ${own} already: a new group would change nothing.`;
}

/**
 * Group… for a member as the party is now (plan 8M-8B: moved out of the press's handler, so that
 * the post's dialog and the map decide it alike): why it does not open (a party without groups,
 * a member who completed the raid, no way left: `nothingToChange`, or too many groups), else the
 * ways it offers (`groupWays`).
 */
export function groupMenu(
  party: Party,
  memberId: string,
  limits: AttendanceLimits,
): { refused: string } | { ways: GroupWay[] } {
  const word = partyWord(party);
  if (!hasGroups(party)) return { refused: problemText('no-groups', limits, word) };
  if (attendeeOf(party, memberId)?.status === PartyStatus.Complete) {
    return { refused: problemText('already-done', limits, word) };
  }
  const ways = groupWays(party, memberId);
  if (ways.length > 0) return { ways };
  return {
    refused: newGroupChangesNothing(party, memberId)
      ? nothingToChange(party, memberId)
      : problemText('too-many-groups', limits, word),
  };
}

/**
 * Group… on the map (plan 8M-8B): what `groupMenu` decides, the moves only (a new group needs a
 * word with the others: "Start a new group on Discord"), worded as the dialog words them over
 * those ways (`groupMenuText`; its text as plain text), each group by its letter and stamp, label,
 * size and, for a raid or a max battle, its meeting time as a moment (shown in the reader's zone);
 * undefined for a party without groups (it has no Group…).
 */
export function regroupOnTheMap(
  view: GroupDialogView,
  limits: AttendanceLimits,
): MapRegroup | undefined {
  const { party } = view;
  if (!hasGroups(party)) return undefined;
  const menu = groupMenu(party, view.memberId, limits);
  if ('refused' in menu) return { refused: unplain(menu.refused) };
  const moves = menu.ways.flatMap((way) => (way.kind === 'move' ? [way] : []));
  // Only a new group left (review W-1): nothing to submit here; the page links the post.
  if (moves.length === 0) return { onlyNewGroup: true };
  const { title, text, label, signedUp } = groupMenuText(view, moves);
  return {
    title,
    text: unplain(text),
    label,
    signedUp,
    choices: moves.map(({ group }) => ({
      group: group.id,
      stamp: groupStamp(party, group),
      label: groupLabel(group),
      size: groupSize(view, group),
      ...(isBattle(party) ? { meeting: group.startTime ?? null } : {}),
    })),
    newGroup: menu.ways.some((way) => way.kind === 'new'),
  };
}

/**
 * Group…'s dialog (decision 3; decision 8 for a single way): titled `Change group` (`Join a
 * group` for a member who is not signed up, whom it signs up as coming), saying which group the
 * member is in; the required radio choice `Move to` of `ways` in their order (the first picked to
 * start with), a new group last as `A new group (C)`; where only one way is left no choice, and
 * the text says what Submit does. "Label for a new group (optional)" where a new group is among
 * the ways (ignored for a move). Its custom id `party:<id>:regroupform`, `SIGNED_UP_MARK` first
 * for `Change group`, then the one way as its arguments where it asks nothing (`new`, or the
 * group's letter and stamp), and last a per-open token (`openToken`, plan 8X-F).
 */
export function groupMenuDialog(
  view: GroupDialogView,
  ways: readonly GroupWay[],
): APIModalInteractionResponseCallbackData {
  const { party } = view;
  const { title, text, label, signedUp, only } = groupMenuText(view, ways);
  const [first] = ways;
  const options: DialogOption[] = ways.map((way) =>
    way.kind === 'new'
      ? {
          value: NEW_GROUP,
          label: `A new group (${way.id})`,
          description: 'Just you, until others join',
        }
      : {
          value: groupChoice(party, way.group),
          label: groupLabel(way.group),
          description: groupDescription(view, way.group),
        },
  );
  return dialog({
    customId: encodeCustomId({
      kind: PARTY_KIND,
      id: party.id,
      action: GROUP_MENU_FORM,
      args: [
        ...(signedUp ? [SIGNED_UP_MARK] : []),
        ...(only === undefined ? [] : wayValue(party, only).split(':')),
        openToken(view.now),
      ],
    }),
    title,
    text,
    ...(only === undefined && first !== undefined
      ? {
          choice: {
            id: GROUP_INPUT,
            label,
            options,
            picked: wayValue(party, first),
          },
        }
      : {}),
    ...(ways.some((way) => way.kind === 'new')
      ? {
          field: {
            id: LABEL_INPUT,
            label: 'Label for a new group (optional)',
            maxLength: MAX_GROUP_LABEL,
          },
        }
      : {}),
  });
}
