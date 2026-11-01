import {
  ButtonStyle,
  ComponentType,
  TextInputStyle,
  type APIActionRowComponent,
  type APIButtonComponentWithCustomId,
  type APIComponentInMessageActionRow,
  type APIMessageComponentEmoji,
  type APIModalInteractionResponseCallbackData,
} from 'discord.js';
import { encodeCustomId } from '../discord/custom-id.js';
import type { ControlIconName } from '../domain/pogo/game-icons.js';
import {
  hasGroups,
  isBattle,
  isRaid,
  isTrain,
  remoteAllowed,
  type Party,
} from '../domain/party/party.js';
import { completionAsk, NOT_YET, TAKEN_AS_DONE, YES_DONE } from './completion-words.js';
import type { PostButton, PostEmoji } from './party-post.js';
import { fitItems, plain } from './text.js';

/** The custom-id kind of the controls of a party's post (and of its copies in other channels). */
export const PARTY_KIND = 'party';

/**
 * What a control of a post does: the action part of its custom id. `group` carries the group's
 * letter as its argument, `answer` carries `yes` or `no` (the completion question). `time` is
 * the "Set time…" button, and the form it opens, which carries `hatch` or `end`. `delete` is the
 * form a member's `/delete` opened before it was for staff only (plan 8S-2), taken as a report
 * (`/report`'s form is `report:<party id>:party`); no button has it. `move` is "Move…" of a
 * train's post ("Manage train…" before plan 8X-G), which opens the dialog `moveform`; `manage` is
 * "Manage…", which opens `manageform` (`train-dialogs.ts`); `next`, `previous`, `skip`, `finish`,
 * `reverse`, `atend` and `kind` were the Manage train panel's and answer as stale. `route` is
 * "Route" of a train's post, which shows the route privately. `shot` is "Screenshot feedback" of a raid reported from a
 * screenshot, which shows that screenshot privately. `split` is "Split…" of a train with
 * two groups or more, which opens the dialog `splitform` (`train-split.ts`; `<group>:<mark>` when
 * it asks about one group); no button has `splitform`. `regroup` is "Group…" and `meet` is
 * "Meet…" (plan 8X-1B), each of which opens a dialog; `joinform` is the dialog that asks a newcomer
 * which group, `regroupform` Group…'s (no button has either). `group` is the letter Join of a post drawn
 * before plan 8X-1B ("A", "B"): it still joins its letter until the post is shown anew, and is
 * refused as no such group once that letter is gone.
 */
export const PARTY_ACTIONS = [
  'maybe',
  'join',
  'here',
  'done',
  'leave',
  'less',
  'more',
  'remote',
  'group',
  'answer',
  'time',
  'delete',
  'move',
  'next',
  'previous',
  'skip',
  'finish',
  'reverse',
  'atend',
  'kind',
  'route',
  'shot',
  'split',
  'splitform',
  'regroup',
  'joinform',
  'regroupform',
  'meet',
  'moveform',
  'manage',
  'manageform',
] as const;
export type PartyAction = (typeof PARTY_ACTIONS)[number];

export function isPartyAction(value: string): value is PartyAction {
  return (PARTY_ACTIONS as readonly string[]).includes(value);
}

/**
 * The actions that only the controls of a raid have: no other post shows them. A group button
 * is not among them: a train has groups too; nor are Done, the completion question's answers and
 * Meet…: a max battle has them too (plan 8X-3, review B6).
 */
const RAID_ACTIONS: readonly PartyAction[] = ['time', 'shot'];

/** Whether a control with this action can only have been a raid's. */
export function isRaidAction(value: string): boolean {
  return (RAID_ACTIONS as readonly string[]).includes(value);
}

/** The names of a completion question are cut so that the whole message stays well under 2,000. */
const QUESTION_NAMES = 1_700;

type Row = APIActionRowComponent<APIComponentInMessageActionRow>;

/**
 * A control of a party's post or panel: its label (none for a button that shows only its icon)
 * and its emoji, a character by itself or a custom emoji (`controlEmoji`).
 */
export function partyButton(
  partyId: string,
  action: PartyAction,
  label: string | undefined,
  style: APIButtonComponentWithCustomId['style'],
  args?: string[],
  emoji?: string | APIMessageComponentEmoji,
): APIButtonComponentWithCustomId {
  return {
    type: ComponentType.Button,
    custom_id: encodeCustomId({ kind: PARTY_KIND, id: partyId, action, ...(args ? { args } : {}) }),
    ...(label === undefined ? {} : { label }),
    style,
    ...(emoji === undefined ? {} : { emoji: typeof emoji === 'string' ? { name: emoji } : emoji }),
  };
}

/**
 * Where the controls find their custom emoji: the post's `PostEmoji.controlIcon`, the
 * application's emoji only (`PartyService.emoji`; a server's cache may be stale, and an emoji
 * Discord does not know on a button has the whole message refused). An application without
 * them (none uploaded yet, a test) passes `{}` and the plain emoji stand in.
 */
export type ControlIcons = Pick<PostEmoji, 'controlIcon'>;

/** A custom emoji as message text: `<:name:id>`, `<a:name:id>` when animated. */
const CUSTOM_EMOJI = /^<(a?):(\w{2,32}):(\d{17,20})>$/;

/**
 * The emoji of a control (plan 8D-G): the application's emoji named `name` as a button takes it
 * (a custom one by its id and name, not as message text), else `plain`: anything that is not a
 * custom emoji's text gives `plain`. The one place where a control's emoji is looked up by name,
 * as `PostEmoji.icon` is for the game's icons in text.
 */
export function controlEmoji(
  icons: ControlIcons,
  name: ControlIconName,
  plain: string,
): APIMessageComponentEmoji {
  return buttonEmojiOf(icons.controlIcon?.(name)) ?? { name: plain };
}

/**
 * A custom emoji's message text (`<:name:id>`) as a button takes it, by its id and name;
 * undefined for anything else (no emoji, a character).
 */
export function buttonEmojiOf(text: string | undefined): APIMessageComponentEmoji | undefined {
  const custom = CUSTOM_EMOJI.exec(text ?? '');
  if (!custom) return undefined;
  const [, animated, emojiName = '', id = ''] = custom;
  return { id, name: emojiName, ...(animated ? { animated: true } : {}) };
}

/**
 * A post's button with the application's emoji `icon` (`controlEmoji`), and the plain emoji it
 * shows instead where Discord refuses that one (`PostButton.plain`, `customEmoji: false`).
 */
function iconButton(
  icons: ControlIcons,
  icon: ControlIconName,
  plain: string,
  make: (emoji: APIMessageComponentEmoji) => APIButtonComponentWithCustomId,
): PostButton {
  const emoji = controlEmoji(icons, icon, plain);
  return { button: make(emoji), ...(emoji.id === undefined ? {} : { plain }) };
}

/** The statuses a post lists, each with the button that signs a member up so. */
export type ShownStatus = 'interested' | 'coming' | 'present' | 'complete';

/** A status's action, its custom icon (Interested has none), its plain emoji and its colour. */
const STATUS_BUTTONS: Readonly<
  Record<
    ShownStatus,
    [PartyAction, ControlIconName | undefined, string, APIButtonComponentWithCustomId['style']]
  >
> = {
  interested: ['maybe', undefined, '🤔', ButtonStyle.Secondary],
  coming: ['join', 'pinejoin', '🏃', ButtonStyle.Primary],
  present: ['here', 'pinehere', '✅', ButtonStyle.Success],
  complete: ['done', 'pinedone', '🎉', ButtonStyle.Secondary],
};

/**
 * A status's button: Interested, Join, Here or Done, an icon without a label (plan 8D-G, Matt,
 * 2026-10-17), in the first row of a post's controls. The post's line of that status starts with
 * the same icon (`statusIcon`, plan 8X-1B), which is how the button explains itself; Discord has
 * no text for a button's accessible name but its label, so a screen reader reads the emoji's
 * name (`pinejoin`, or the character's).
 */
export function statusButton(
  party: Pick<Party, 'id'>,
  status: ShownStatus,
  icons: ControlIcons,
): PostButton {
  const [action, icon, plain, style] = STATUS_BUTTONS[status];
  const make = (emoji: string | APIMessageComponentEmoji) =>
    partyButton(party.id, action, undefined, style, undefined, emoji);
  return icon === undefined ? { button: make(plain) } : iconButton(icons, icon, plain, make);
}

/**
 * An icon of a control as message text: the application's emoji of that name where it has one
 * (`<:pinejoin:…>`), else the plain one (where a custom emoji is gone, text shows `:name:` and
 * nothing is refused, unlike a button).
 */
function iconText(icons: ControlIcons, name: ControlIconName, plain: string): string {
  return customIconText(icons, name) ?? plain;
}

/**
 * The application's emoji named `name` as message text (`<:pinetrain:…>`), where it has one;
 * undefined else (none uploaded, a character): by the resolver the controls' icons use (8D-H), so
 * that text marked with it (plan 8M-11A: the train before a train's name) reads as before without.
 */
export function customIconText(icons: ControlIcons, name: ControlIconName): string | undefined {
  const custom = icons.controlIcon?.(name) ?? '';
  return CUSTOM_EMOJI.test(custom) ? custom : undefined;
}

/** The icon a post's line of a status starts with: that of its button (`statusButton`). */
export function statusIcon(icons: ControlIcons, status: ShownStatus): string {
  const [, icon, plain] = STATUS_BUTTONS[status];
  return icon === undefined ? plain : iconText(icons, icon, plain);
}

/** The plain emoji of Meet… until the application has `pinemeet` (the game's Select Time icon). */
const MEET_PLAIN = '⏰';

/** Meet…'s icon as message text, for the hints that name it (plan 8X-1B). */
export function meetIcon(icons: ControlIcons): string {
  return iconText(icons, 'pinemeet', MEET_PLAIN);
}

/*
 * The third row of a train's post (plan 8X-G; Matt, 2026-10-22): Group… · Move… · Manage… ·
 * Split… · Route, short words and no emoji. Five buttons fit one row.
 */

/** The label of the button of a train's post that opens Move…. */
export const MOVE_TRAIN_LABEL = 'Move…';

/** The label of the button of a train's post that opens Manage…. */
export const MANAGE_TRAIN_LABEL = 'Manage…';

/** The label of the button of a train's post that shows its whole route. */
export const WHOLE_ROUTE_LABEL = 'Route';

/** The label of the button of a train's post that splits a group off. */
export const SPLIT_GROUP_LABEL = 'Split…';

/**
 * The button "Move…" of a train's post while it has a route (plan 8X-G): the dialog of its
 * moves. `party:<id>:move`, the action of "Manage train…" before, so that the button of a post
 * not drawn anew opens it too. A copy for another region leaves it out (`moves`).
 */
export function moveTrainButton(party: Pick<Party, 'id'>): PostButton {
  return {
    button: partyButton(party.id, 'move', MOVE_TRAIN_LABEL, ButtonStyle.Secondary),
    moves: true,
  };
}

/**
 * The button "Manage…" of a train's post (plan 8X-G): the dialog of its route (Reverse, Finish),
 * its mode at the end and its kind. A copy for another region leaves it out (`moves`).
 */
export function manageTrainButton(party: Pick<Party, 'id'>): PostButton {
  return {
    button: partyButton(party.id, 'manage', MANAGE_TRAIN_LABEL, ButtonStyle.Secondary),
    moves: true,
  };
}

/**
 * The button "Route" of a train's post whose route is longer than the post lists: the route
 * privately, as `/route show` answers it. It only shows: no `…`. A copy for another region keeps
 * it.
 */
export function wholeRouteButton(party: Pick<Party, 'id'>): PostButton {
  return { button: partyButton(party.id, 'route', WHOLE_ROUTE_LABEL, ButtonStyle.Secondary) };
}

/**
 * The button "Split…" of a train's post with two groups or more (plan 8T): the dialog of
 * splitting a group off into a train of its own (plan 8T-H). A copy for another region leaves it
 * out, as it leaves out Move… and Manage… (`moves`).
 */
export function splitGroupButton(party: Pick<Party, 'id'>): PostButton {
  return {
    button: partyButton(party.id, 'split', SPLIT_GROUP_LABEL, ButtonStyle.Secondary),
    moves: true,
  };
}

/** The label of the button of a raid's or a train's post that changes or opens a group. */
export const GROUP_LABEL = 'Group…';

/**
 * "Group…" (plan 8X-1B, decision 3): a dialog to move to another group or open a new one, for
 * whoever is signed up, and for a newcomer, whom it signs up as coming in the group they choose.
 * Always shown, so that the buttons around it never move (Matt, 2026-10-20), and switched off
 * (for everybody: Discord has no button per member) while nobody is signed up, when it could do
 * nothing that Join does not; the first sign-up shows the post anew, which switches it on.
 */
export function groupButton(party: Pick<Party, 'id' | 'attendees'>, emoji = true): PostButton {
  const button = partyButton(
    party.id,
    'regroup',
    GROUP_LABEL,
    ButtonStyle.Secondary,
    undefined,
    emoji ? '👥' : undefined,
  );
  return {
    button: Object.keys(party.attendees).length === 0 ? { ...button, disabled: true } : button,
  };
}

/**
 * "Meet…" of a raid with times (plan 8X-1B, decision 5): the dialog that sets the meeting time of
 * the member's own group. The game's Select Time icon (`pinemeet`), plain ⏰ until the
 * application has it; no label.
 */
export function meetButton(party: Pick<Party, 'id'>, icons: ControlIcons): PostButton {
  return iconButton(icons, 'pinemeet', MEET_PLAIN, (icon) =>
    partyButton(party.id, 'meet', undefined, ButtonStyle.Secondary, undefined, icon),
  );
}

export interface BottomOptions {
  /** Where the buttons find their custom emoji (the post's `PostEmoji`). */
  emoji: ControlIcons;
  /**
   * The buttons with a label of the party's own kind, after Group… in the third row (a train's
   * Move…, Manage…, Split… and Route).
   */
  opens?: readonly PostButton[];
}

/**
 * The rows of a post's controls (plan 8X-1B, decision 1; Matt, 2026-10-20): the same for one
 * group and several, and in raids and trains alike. Row 1 the statuses in legacy Pine's order,
 * Interested, Join, Here, Done (a battle's, `isBattle`: elsewhere Done means leave) and Leave; row 2 Meet… (a
 * raid with times), −1, +1 and Remote (not for an elite raid); both rows icons only (the lines of
 * the post start with the statuses' icons). Row 3 the buttons with a label, which open
 * something: Group… (where the party has groups), then for a raid "Set time" (in Meet…'s place
 * while it has no times, spec 4.3: the two never show together) and "Screenshot feedback" (one
 * reported from a kept screenshot, spec 7B), then `opens`. A row with nothing in it is none.
 * Nothing depends on the time, so the controls never need an edit of their own: Done on an egg
 * is refused when it is pressed. A meetup has no Done, Meet…, Set time or Group….
 */
export function bottomControls(party: Party, options: BottomOptions): PostButton[][] {
  const { id } = party;
  const { emoji } = options;
  const raid = isRaid(party) ? party : undefined;
  const statuses: PostButton[] = [
    statusButton(party, 'interested', emoji),
    statusButton(party, 'coming', emoji),
    statusButton(party, 'present', emoji),
    ...(isBattle(party) ? [statusButton(party, 'complete', emoji)] : []),
    iconButton(emoji, 'pineleave', '👋', (icon) =>
      partyButton(id, 'leave', undefined, ButtonStyle.Danger, undefined, icon),
    ),
  ];
  const counts: PostButton[] = [
    // A meeting time needs the raid's times (`/meet`'s rule); a max battle always has its end.
    ...((raid && raid.hatchTime !== null) || party.type === 'max'
      ? [meetButton(party, emoji)]
      : []),
    { button: partyButton(id, 'less', undefined, ButtonStyle.Secondary, undefined, '⬇️') },
    { button: partyButton(id, 'more', undefined, ButtonStyle.Secondary, undefined, '⬆️') },
    ...(remoteAllowed(party)
      ? [
          iconButton(emoji, 'pineremote', '📡', (icon) =>
            partyButton(id, 'remote', undefined, ButtonStyle.Secondary, undefined, icon),
          ),
        ]
      : []),
  ];
  const opens: PostButton[] = [
    // A train's third row is words only (plan 8X-G, Matt): its Group… has no emoji.
    ...(hasGroups(party) ? [groupButton(party, !isTrain(party))] : []),
    // Only while the raid has no times: afterwards `/hatch` and `/end` correct them.
    ...(raid && raid.hatchTime === null
      ? [{ button: partyButton(id, 'time', 'Set time…', ButtonStyle.Primary, undefined, '⏰') }]
      : []),
    // Only a kept screenshot can be shown.
    ...(raid?.raid.screenshot?.id
      ? [
          {
            button: partyButton(
              id,
              'shot',
              SCREENSHOT_FEEDBACK,
              ButtonStyle.Secondary,
              undefined,
              '📷',
            ),
          },
        ]
      : []),
    ...(options.opens ?? []),
  ];
  return [statuses, counts, opens].filter((row) => row.length > 0);
}

/** The label of the button of a raid's post that shows the screenshot it was reported from. */
export const SCREENSHOT_FEEDBACK = 'Screenshot feedback';

/**
 * The question to members who were present when somebody of their group completed the raid, with
 * its two answers. The members are named as mentions, as many as fit; whom it may ping is the
 * caller's choice. Either button answers for whoever was asked, named or not.
 */
export function completionQuestion(
  partyId: string,
  members: readonly string[],
  timeoutMinutes: number,
  /** What the party is called (`partyWord`): a raid, or a max battle (plan 8X-3). */
  word = 'raid',
): { content: string; components: Row[] } {
  const minutes = timeoutMinutes === 1 ? '1 minute' : `${timeoutMinutes} minutes`;
  const names = fitItems(
    members.map((id) => `<@${id}>`),
    QUESTION_NAMES,
  );
  return {
    // The map's words too (`completion-words.ts`, plan 8M-8B).
    content: `${names}: ${completionAsk(word)} Without an answer within ${minutes} ${TAKEN_AS_DONE}`,
    components: [
      {
        type: ComponentType.ActionRow,
        components: [
          partyButton(partyId, 'answer', YES_DONE, ButtonStyle.Success, ['yes']),
          partyButton(partyId, 'answer', NOT_YET, ButtonStyle.Secondary, ['no']),
        ],
      },
    ],
  };
}

/** The id of the one input of the "Set time" form. */
export const TIME_INPUT = 'time';

/**
 * The form the "Set time" button opens: one line for the time. Which time it asks for is
 * decided when it opens (an egg is asked when it hatches, a hatched raid when it ends) and
 * travels in the form's custom id, so the answer is read as what was asked.
 */
export function timeForm(
  partyId: string,
  parameter: 'hatch' | 'end',
): APIModalInteractionResponseCallbackData {
  return {
    custom_id: encodeCustomId({ kind: PARTY_KIND, id: partyId, action: 'time', args: [parameter] }),
    title: parameter === 'hatch' ? 'When does the egg hatch?' : 'When does the raid end?',
    components: [
      {
        type: ComponentType.ActionRow,
        components: [
          {
            type: ComponentType.TextInput,
            custom_id: TIME_INPUT,
            label: parameter === 'hatch' ? 'Hatch time' : 'End time',
            style: TextInputStyle.Short,
            required: true,
            max_length: 40,
            placeholder: '20 (minutes from now) or 6:15pm',
          },
        ],
      },
    ],
  };
}

/** A group's label as text for a sentence: `group B` or `group B (park side)`. */
export function groupWords(group: { id: string; label?: string }): string {
  return group.label ? `group ${group.id} (${plain(group.label)})` : `group ${group.id}`;
}
