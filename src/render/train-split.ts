import type { APIModalInteractionResponseCallbackData } from 'discord.js';
import { encodeCustomId } from '../discord/custom-id.js';
import { dialog, openToken, TEXT_ROOM } from '../discord/dialog.js';
import {
  groupOf,
  headCount,
  isGroupId,
  memberOf,
  type GroupId,
  type PartyGroup,
  type TrainParty,
} from '../domain/party/party.js';
import { nameOf } from '../domain/party/timed.js';
import { currentStop, groupMark, routeFinished, splitTrain } from '../domain/party/train.js';
import { PARTY_KIND } from './party-controls.js';
import { groupInPostOrder, guestsOf } from './party-post.js';
import { stopLabel } from './train-stops.js';
import { count, memberName, plain, truncate } from './text.js';
import type { TrainPlaces } from './train-post.js';

/** What the dialog of a split is drawn from: the train and who asks (plan 8T-H). */
export interface SplitView extends TrainPlaces {
  /** The member who asks: the dialog speaks to them. */
  memberId: string;
  staff: boolean;
  /** The member asked not to be named (`RaidPrivacy.Anonymous`): then they lead nothing. */
  anonymous: boolean;
  now: number;
}

/**
 * The action of the dialog's custom id: `party:<id>:splitform:<group>:<mark>` when it asks about
 * one group, `party:<id>:splitform` when the member picks the group (`SPLIT_GROUP_INPUT`).
 */
export const SPLIT_FORM = 'splitform';

/** The custom id of the radio group of the dialog that asks which group leaves. */
export const SPLIT_GROUP_INPUT = 'group';

const TITLE = 'Split a group off the train';

/** The one-group dialog names this many of those who move, and how many more. */
const NAMES_SHOWN = 10;

/** What a choice's label holds (Discord's limit). */
const CHOICE_ROOM = 100;

/** A group's label in a choice is cut to this, so that its count fits beside it. */
const LABEL_ROOM = 40;

/** `Dawn`, `Dawn and Iris`, `Dawn, Iris and Cilan`, `Dawn, …, and 12 more`. */
function nameList(names: readonly string[]): string {
  if (names.length <= 1) return names.join('');
  if (names.length <= NAMES_SHOWN) {
    return `${names.slice(0, -1).join(', ')} and ${names.at(-1) ?? ''}`;
  }
  return `${names.slice(0, NAMES_SHOWN).join(', ')}, and ${names.length - NAMES_SHOWN} more`;
}

/** `B (Fast)` of a group with a label, `B` of one without. */
function groupName(group: PartyGroup): string {
  return group.label ? `${group.id} (${plain(group.label)})` : group.id;
}

/** A member's own text on one line, for a choice's label, which Discord shows as it is. */
function oneLine(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * Where the train is, which the new train is too: `the same route, at the same stop (stop 2 of
 * 3: The Stacks), the same boss and start, and it does the same at the end of the route`,
 * `no route yet, …`, `the same route,
 * finished, …`, and `, not started yet` before the start.
 */
function whereWords(view: SplitView): string {
  const { party } = view;
  const { route, stop } = party.train;
  const rest = 'the same boss and start, and it does the same at the end of the route';
  if (route.length === 0) return `no route yet, ${rest}`;
  if (routeFinished(party)) return `the same route, finished, ${rest}`;
  const at = currentStop(party);
  const name = at === undefined ? '' : plain(stopLabel(view.stop(at)));
  const start = party.timed.startTime;
  const waiting = start !== null && start > view.now ? ', not started yet' : '';
  return (
    `the same route, at the same stop (stop ${stop + 1} of ${route.length}: ${name})` +
    `${waiting}, ${rest}`
  );
}

/** How the words of who leads name the old train and a member (`oneGroupText`). */
interface Naming {
  train: string;
  member: (id: string) => string;
}

/**
 * Who leads each train afterwards, as `splitTrain` decides it (`conductor` of the new train):
 * `you are its conductor; Ash stays the conductor of Saturday Loop`, and when the conductor goes
 * with the group, `…, and Saturday Loop has none then`.
 */
function leadWords(view: SplitView, conductor: string | null, naming: Naming): string {
  const { party, memberId } = view;
  const name = naming.train;
  const who = (id: string) => (id === memberId ? 'you' : naming.member(id));
  const is = (id: string) => (id === memberId ? 'are' : 'is');
  const stays = (id: string) => (id === memberId ? 'stay' : 'stays');
  const old = party.train.conductorId;
  const leads =
    conductor === null ? 'it has no conductor' : `${who(conductor)} ${is(conductor)} its conductor`;
  if (old !== null && old === conductor) return `${leads}, and ${name} has none then`;
  if (old === null) return leads;
  return `${leads}; ${who(old)} ${stays(old)} the conductor of ${name}`;
}

/** The new train as `splitTrain` would make it of this group now. */
function previewOf(view: SplitView, group: GroupId): TrainParty {
  return splitTrain(view.party, {
    id: view.party.id,
    by: view.memberId,
    anonymous: view.anonymous,
    group,
    now: view.now,
  });
}

/** The words of the dialog that asks about one group (mockup v4). */
function oneGroupText(view: SplitView, groupId: GroupId): string {
  const { party } = view;
  const group = groupOf(party, groupId) ?? { id: groupId };
  const preview = previewOf(view, groupId);
  // As the post lists them (`groupInPostOrder`), by name only.
  const moving = groupInPostOrder(party, groupId).map((id) => memberName(memberOf(party, id)));
  const verb = moving.length === 1 ? 'moves' : 'move';
  const naming: Naming = {
    train: plain(nameOf(party)),
    member: (id) => memberName(memberOf(party, id)),
  };
  return [
    `Group **${groupName(group)}** leaves **${plain(nameOf(party))}** and becomes a train of ` +
      `its own, **${plain(nameOf(preview))}**:`,
    `- ${whereWords(view)}`,
    `- ${nameList(moving)} ${verb} to it as they are signed up now`,
    `- ${leadWords(view, preview.train.conductorId, naming)}`,
    '',
    'Submit splits it off.',
  ].join('\n');
}

/**
 * `Group B (Fast) · 4 trainers`: which group, and how many trainers it has, guests counted, as
 * the post counts them (`headCount`). Who is in it is in the dialog's text (`groupLines`).
 */
function choiceLabel(party: TrainParty, group: PartyGroup): string {
  const label = group.label ? ` (${truncate(oneLine(group.label), LABEL_ROOM)})` : '';
  const trainers = count(headCount(party, group.id), 'trainer');
  return truncate(`Group ${group.id}${label} · ${trainers}`, CHOICE_ROOM);
}

/**
 * A member's name for the dialog's text (`memberName`), or undefined when the bot has none: then
 * `memberName` would mention them, which a dialog may not show (8Q staging step 26).
 */
function textName(member: { id: string; name?: string | undefined }): string | undefined {
  const name = memberName(member);
  return name === memberName({ id: member.id }) ? undefined : name;
}

/**
 * Who is in each group, a line each, in the order of the choices: `**Group B (Fast)** (4
 * trainers): Cilan +1, Dawn, Iris`, the members by the names the post lists them with, in its
 * order (`groupInPostOrder`), those the bot has no name for counted only (`, and 1 more`). When
 * the lines would not fit into `room`, every group names as many as fit, the same number for
 * each, and how many more (mockup v6, Matt, 2026-10-20).
 */
function groupLines(party: TrainParty, groups: readonly GroupId[], room: number): string {
  const entries = groups.map((id) => {
    const group = groupOf(party, id) ?? { id };
    const ids = groupInPostOrder(party, id);
    const names = ids.flatMap((member) => {
      const attendee = party.attendees[member];
      const name = attendee && textName({ id: member, name: attendee.name });
      return attendee && name !== undefined ? [`${name}${guestsOf(attendee)}`] : [];
    });
    const head = `**Group ${groupName(group)}** (${count(headCount(party, id), 'trainer')}): `;
    return { head, names, members: ids.length };
  });
  const lines = (cap: number) =>
    entries
      .map(({ head, names, members }) => {
        const shown = names.slice(0, cap);
        const more = members - shown.length;
        const rest = more === 0 ? '' : `${shown.length > 0 ? ', and ' : ''}${more} more`;
        return `${head}${shown.join(', ')}${rest}`;
      })
      .join('\n');
  const most = Math.max(...entries.map(({ names }) => names.length));
  for (let cap = most; cap > 0; cap--) {
    const text = lines(cap);
    if (text.length <= room) return text;
  }
  return lines(0);
}

/**
 * Who leads the new train, for each group whose train somebody would lead (`splitTrain`):
 * ` If group A leaves, you go with it as its conductor, and Saturday Loop has none then.`, and
 * for staff in a group, ` If group C leaves, you go with it as its conductor.` Nothing for the
 * groups whose train would have none: the old train keeps its conductor (Matt, 2026-10-20: said
 * once, not in every choice).
 */
function leadSentences(view: SplitView, groups: readonly GroupId[]): string {
  const { party, memberId } = view;
  const old = party.train.conductorId;
  return groups
    .flatMap((id) => {
      const conductor = previewOf(view, id).train.conductorId;
      if (conductor === null) return [];
      const named = textName(memberOf(party, conductor)) ?? 'a trainer';
      const who = conductor === memberId ? 'you go' : `${named} goes`;
      const none = conductor === old ? `, and ${plain(nameOf(party))} has none then` : '';
      return [` If group ${id} leaves, ${who} with it as its conductor${none}.`];
    })
    .join('');
}

/** A choice's value: the group's letter and mark, `B:<mark>` (`splitChoice` reads it). */
function choiceValue(party: TrainParty, groupId: GroupId): string {
  return `${groupId}:${groupMark(party, groupId) ?? '0'}`;
}

/** The group and mark of a choice of the dialog; undefined for anything else. */
export function splitChoice(value: string): { group: GroupId; mark: string } | undefined {
  const at = value.indexOf(':');
  const group = value.slice(0, at);
  const mark = value.slice(at + 1);
  return at > 0 && isGroupId(group) && mark !== '' ? { group, mark } : undefined;
}

/**
 * The dialog of splitting a group off a train (plan 8T-H; design
 * `2026-10-18-train-split-dialog-design.md`), titled `Split a group off the train`, with
 * Discord's own Submit and Cancel (`dialog`). For one group (`groups` of one: the member may split only it,
 * or `/group split` named it): one text, what becomes of the group (the new train's name, as
 * `splitTrain` makes it), the same route at the same stop, who moves (the first `NAMES_SHOWN`),
 * who leads which train, and `Submit splits it off.`; its custom id
 * `party:<id>:splitform:<group>:<mark>` (`groupMark`, so that a Submit for a group called
 * otherwise or gone by now is refused). For several (the conductor and staff): what is the same
 * for every group, who leads which train (`leadSentences`) and who is in each group
 * (`groupLines`, mockup v6), then the required radio group `Group that leaves` of `groups` in
 * their order, nothing picked, each choice named by `choiceLabel` alone, its value
 * `<group>:<mark>`; the custom id `party:<id>:splitform`. Who is in the group is carried by
 * neither: who is in it at Submit goes (design, "Decided").
 */
export function splitDialog(
  view: SplitView,
  groups: readonly [GroupId, ...GroupId[]],
): APIModalInteractionResponseCallbackData {
  const form = splitForm(view, groups);
  const token = openToken(view.now);
  const args = form.only === undefined ? [token] : [form.only.group, form.only.mark, token];
  return dialog({
    customId: encodeCustomId({ kind: PARTY_KIND, id: view.party.id, action: SPLIT_FORM, args }),
    title: form.title,
    text: form.text,
    ...(form.choice === undefined
      ? {}
      : {
          choice: { id: SPLIT_GROUP_INPUT, label: form.choice.label, options: form.choice.options },
        }),
  });
}

/**
 * What the dialog of a split says and asks (plan 8T-H), apart from Discord's dialog, so that one
 * builder serves the dialog and the live map's form (plan 8M-8C): its title and text; for one
 * group the group and its mark (`only`: Submit splits it); for several the choice "Group that
 * leaves" of `groups` in their order, nothing picked, each value `<group>:<mark>`.
 */
export interface SplitForm {
  title: string;
  /** Discord's markdown: the map makes it text of the page. */
  text: string;
  only?: { group: GroupId; mark: string };
  choice?: { label: string; options: Array<{ value: string; label: string }> };
}

/** The dialog of a split as `splitDialog` draws it (`SplitForm`), without Discord's parts. */
export function splitForm(view: SplitView, groups: readonly [GroupId, ...GroupId[]]): SplitForm {
  const { party } = view;
  const [first] = groups;
  if (groups.length === 1) {
    return {
      title: TITLE,
      text: oneGroupText(view, first),
      only: { group: first, mark: groupMark(party, first) ?? '0' },
    };
  }
  const head =
    `The group you pick leaves **${plain(nameOf(party))}** and becomes a train of its own, ` +
    `named after the group (**${plain(nameOf(previewOf(view, first)))}**): ` +
    `${whereWords(view)}. Its members move to it as they are signed up now.` +
    leadSentences(view, groups);
  return {
    title: TITLE,
    text: `${head}\n\n${groupLines(party, groups, TEXT_ROOM - head.length - 2)}`,
    choice: {
      label: 'Group that leaves',
      options: groups.map((id) => ({
        label: choiceLabel(party, groupOf(party, id) ?? { id }),
        value: choiceValue(party, id),
      })),
    },
  };
}
