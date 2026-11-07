import { createHash } from 'node:crypto';
import type { APIModalInteractionResponseCallbackData } from 'discord.js';
import { encodeCustomId } from '../discord/custom-id.js';
import { dialog, openToken, type DialogChoice, type DialogOption } from '../discord/dialog.js';
import {
  MAX_MEETUP_DESCRIPTION,
  MAX_PARTY_NAME,
  type MeetupParty,
  type RaidParty,
} from '../domain/party/party.js';
import { raidWords } from '../domain/pogo/raid-tier.js';
import type { RaidMovesView, RaidOptionsView } from '../domain/web/raid-options-data.js';
import { PARTY_KIND } from './party-controls.js';
import { isFarOff, timestamp, truncate } from './text.js';

/*
 * Manage… of a raid's and a meetup's post (plan 8M-21; Matt, 2026-11-07: "I'd prefer the UI is 100%
 * consistent there between Discord and web"): the map's forms "Manage the raid" (`changeForm`,
 * `src/web/client/raid-forms.ts`) and "Manage <meetup>" (`meetupEditor`, `meetup-forms.ts`) as
 * Discord dialogs, with their fields, labels and placeholders. Where a dialog cannot do what the
 * page does (a field that changes another as it is picked), the nearest: noted at each.
 */

/** The action of a raid's Manage… dialog, under the post's kind (`party:<id>:raidform:~…`). */
export const RAID_MANAGE_FORM = 'raidform';

/** The custom ids of the raid dialog's fields: the names of the map's form's fields. */
export const RAID_HATCH_INPUT = 'hatch';
export const RAID_END_INPUT = 'end';
export const RAID_BOSS_INPUT = 'boss';
export const RAID_QUICK_INPUT = 'quick';
export const RAID_CHARGE_INPUT = 'charge';

/** Discord's most options in a menu. */
const MENU_ROOM = 25;
/** The longest time a command takes (its option's length), as the map's fields take it. */
const TIME_LENGTH = 40;
/** The map's placeholder of a raid's times. */
const RAID_TIME_PLACEHOLDER = 'minutes, or a time like 6:15pm';

/** What a raid's Manage… is drawn from: the raid, the pick lists, its boss's moves, the clock. */
export interface RaidManageView {
  party: RaidParty;
  options: RaidOptionsView;
  moves: RaidMovesView | undefined;
  now: number;
}

/**
 * The boss menu (the map's `bossSelect`, its first entry "Pick the boss or the egg" as the
 * placeholder of a menu left empty): Discord's menu holds 25, the map's list more (every current
 * boss, then an egg of every tier), so the raid's own tier comes first, its egg and then its
 * bosses, then the other bosses and eggs in the map's order as far as there is room (`/boss` names
 * any of them). Each option's tier is its description, as the map's groups name them.
 */
function bossChoice(view: RaidManageView): DialogChoice {
  const ownTier = raidWords(view.party.raid.tier);
  const eggs: DialogOption[] = view.options.eggs.map((egg) => ({
    value: egg.value,
    label: `${egg.tier} egg`,
  }));
  const bosses: DialogOption[] = view.options.bosses.map((boss) => ({
    value: boss.value,
    label: boss.name,
    description: boss.tier,
  }));
  const own = (option: DialogOption, index: number, isEgg: boolean): boolean =>
    isEgg
      ? view.options.eggs[index]?.tier === ownTier
      : view.options.bosses[index]?.tier === ownTier;
  const ownEggs = eggs.filter((egg, index) => own(egg, index, true));
  const ownBosses = bosses.filter((boss, index) => own(boss, index, false));
  const others = [
    ...bosses.filter((boss, index) => !own(boss, index, false)),
    ...eggs.filter((egg, index) => !own(egg, index, true)),
  ];
  return {
    id: RAID_BOSS_INPUT,
    label: 'Boss',
    menu: true,
    optional: { placeholder: 'Pick the boss or the egg' },
    options: [...ownEggs, ...ownBosses, ...others].slice(0, MENU_ROOM),
  };
}

/**
 * A menu of the boss's moves of one kind, empty for no change (the map's first entry "Fast move:
 * no change" as its placeholder). The map turns the moves off while a boss is picked; a dialog
 * cannot, so its boss menu says that moves picked with a boss wait (`MOVES_LATER` in the answer).
 */
function moveChoice(
  id: string,
  label: string,
  unchanged: string,
  moves: RaidMovesView['fast'],
): DialogChoice | undefined {
  // More moves than a menu holds (a Mew): left to `/moveset`, which takes any by its name.
  if (moves.length === 0 || moves.length > MENU_ROOM) return undefined;
  return {
    id,
    label: truncate(label, 45),
    menu: true,
    optional: { placeholder: unchanged },
    options: moves.map((move) => ({ value: move.id, label: move.name })),
  };
}

/**
 * Manage… of a raid (the map's `changeForm`): "Hatches in" and "Ends in", minutes or a clock time
 * as `/hatch` and `/end` read them; "Boss" (`bossChoice`); and where its boss's moves are known,
 * a menu of its fast and of its charged moves. Nothing is filled in or chosen to start with: what
 * is left empty stays as it is. The custom id ends in a per-open token, so that what was submitted
 * before never comes back in place of the empty fields.
 */
export function raidManageDialog(view: RaidManageView): APIModalInteractionResponseCallbackData {
  const { moves } = view;
  const fast =
    moves &&
    moveChoice(RAID_QUICK_INPUT, `Fast move of ${moves.boss}`, 'Fast move: no change', moves.fast);
  const charged =
    moves &&
    moveChoice(
      RAID_CHARGE_INPUT,
      `Charged move of ${moves.boss}`,
      'Charged move: no change',
      moves.charged,
    );
  const boss = bossChoice(view);
  return dialog({
    customId: encodeCustomId({
      kind: PARTY_KIND,
      id: view.party.id,
      action: RAID_MANAGE_FORM,
      args: [openToken(view.now)],
    }),
    title: 'Manage the raid',
    asks: [
      {
        field: {
          id: RAID_HATCH_INPUT,
          label: 'Hatches in',
          maxLength: TIME_LENGTH,
          placeholder: RAID_TIME_PLACEHOLDER,
        },
      },
      {
        field: {
          id: RAID_END_INPUT,
          label: 'Ends in',
          maxLength: TIME_LENGTH,
          placeholder: RAID_TIME_PLACEHOLDER,
        },
      },
      {
        choice:
          fast || charged
            ? { ...boss, description: 'With a new boss, its moves are set in Manage… afterwards.' }
            : boss,
      },
      ...(fast ? [{ choice: fast }] : []),
      ...(charged ? [{ choice: charged }] : []),
    ],
  });
}

/** The kind of a meetup's Manage… dialog (`mmanage:<id>:form:…`): its own window (`START_WINDOW`). */
export const MEETUP_MANAGE_KIND = 'mmanage';
/** The action of a meetup's Manage… dialog. */
export const MEETUP_MANAGE_FORM = 'form';

/** The custom ids of the meetup dialog's fields: the names of the map's editor's fields. */
export const MEETUP_NAME_INPUT = 'name';
export const MEETUP_INFO_INPUT = 'info';
export const MEETUP_START_INPUT = 'start';
export const MEETUP_END_INPUT = 'end';

/** A text with its line endings as a text input gives them back (`\n`), as the map compares. */
export function oneLineEnding(text: string): string {
  return text.replace(/\r\n?/gu, '\n');
}

/**
 * The mark of a value a meetup's dialog was drawn from, in its custom id (the name and the
 * information do not fit there): seven characters at most of its hash. Its Submit tells by it
 * whether the meetup is still what the dialog showed (the map sends the value itself, `drawn`).
 */
export function drawnMark(value: string | number | null): string {
  const text = typeof value === 'string' ? oneLineEnding(value) : JSON.stringify(value);
  const hex = createHash('sha256').update(text).digest('hex').slice(0, 8);
  return Number.parseInt(hex, 16).toString(36);
}

/** What a meetup's Manage… is drawn from: the meetup, whether it asks the start, the clock. */
export interface MeetupManageView {
  party: MeetupParty;
  /** The member may change the start (`mayArrange`, as `/meet`): the map's `panel.start`. */
  asksStart: boolean;
  now: number;
}

/** The map's "Starts now: 6:00 PM", "Ends now: none" (`nowLine`), in Discord's time. */
function nowLine(words: string, at: number | null, now: number): string {
  return at === null
    ? `${words}: none`
    : `${words}: ${timestamp(at, isFarOff(at, now) ? 'f' : 't')}`;
}

/**
 * Manage… of a meetup (the map's `meetupEditor`), for its maker and staff: when it starts and
 * ends now; its name and its information, each with what it has to change; when it starts (only
 * for a member signed up, as `/meet`; else the map's words why not) and when it ends, empty, as
 * the map's are: what is left as it is stays. The custom id carries the marks of what the dialog
 * showed (`drawnMark`), so that a change of what somebody else changed since is refused, as the
 * map refuses it, and ends in a per-open token.
 */
export function meetupManageDialog(
  view: MeetupManageView,
): APIModalInteractionResponseCallbackData {
  const { party, now } = view;
  const startTime = party.timed.startTime;
  const text = [
    view.asksStart ? nowLine('Starts now', startTime, now) : nowLine('Starts', startTime, now),
    ...(view.asksStart ? [] : ['Sign up for it to change when it starts.']),
    nowLine('Ends now', party.endTime, now),
  ];
  return dialog({
    customId: encodeCustomId({
      kind: MEETUP_MANAGE_KIND,
      id: party.id,
      action: MEETUP_MANAGE_FORM,
      args: [
        drawnMark(party.timed.name),
        drawnMark(party.meetup.description ?? ''),
        drawnMark(startTime),
        drawnMark(party.endTime),
        openToken(now),
      ],
    }),
    title: `Manage ${party.timed.name}`,
    text: text.join('\n'),
    asks: [
      {
        field: {
          id: MEETUP_NAME_INPUT,
          label: 'Name',
          maxLength: MAX_PARTY_NAME,
          placeholder: 'Its name',
          value: party.timed.name,
          required: true,
        },
      },
      {
        field: {
          id: MEETUP_INFO_INPUT,
          label: 'Information',
          maxLength: MAX_MEETUP_DESCRIPTION,
          placeholder: 'Where to meet, what to bring, how long it goes.',
          paragraph: true,
          ...(party.meetup.description === null ? {} : { value: party.meetup.description }),
        },
      },
      ...(view.asksStart
        ? [
            {
              field: {
                id: MEETUP_START_INPUT,
                label: 'Starts',
                maxLength: TIME_LENGTH,
                placeholder: '6:15pm, 10-17 6:15pm or in 30',
              },
            },
          ]
        : []),
      {
        field: {
          id: MEETUP_END_INPUT,
          label: 'Ends',
          maxLength: TIME_LENGTH,
          placeholder: '8pm, in 90, or none',
        },
      },
    ],
  });
}
