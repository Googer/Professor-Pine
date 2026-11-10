import type { APIModalInteractionResponseCallbackData } from 'discord.js';
import { encodeCustomId } from '../discord/custom-id.js';
import { dialog, openToken, type DialogOption } from '../discord/dialog.js';
import { meetTimes, type MeetTime } from '../domain/party/meet-times.js';
import { groupOf, groupStamp, type BattleParty, type GroupId } from '../domain/party/party.js';
import type { MapMeet } from '../domain/web/party-data.js';
import {
  MEET_LABEL,
  MEET_TEXT,
  MEET_TIME_NOW,
  meetTimeLabel,
  meetTitle,
  NO_MEETING_TIME,
} from './meet-words.js';
import { clockText } from './text.js';

/*
 * Meet…'s dialog (plan 8X-1B, decisions 5 and 8; design
 * `2026-10-20-join-group-meet-buttons-design.md`): the meeting time of the member's own group,
 * chosen from the game's in-game RSVP times and the round clock times between them.
 */

/**
 * The custom-id kind of Meet…'s dialog: a kind of its own, not the party controls', so that its
 * Submit counts in `/meet`'s window (`MEET_WINDOW`), as `/meet` itself does.
 */
export const MEET_KIND = 'meet';

/** The custom-id action of the dialog: `meet:<party id>:time:<group>:<stamp>[:~<token>]`. */
export const MEET_FORM = 'time';

/** The menu of the times. */
export const MEET_INPUT = 'time';

/** The choice that removes the group's meeting time. */
export const NO_MEETING = 'none';

/** What Meet…'s dialog is drawn from. */
export interface MeetDialogView {
  party: BattleParty;
  /** The member's own group. */
  groupId: GroupId;
  /** The settings' time zone: the choices name clock times. */
  zone: string;
  now: number;
}

/** A time as its choice names it: `At hatch (7:22 PM) · in-game RSVP`, `7:37 PM · in-game RSVP`. */
function timeLabel(time: MeetTime, zone: string): string {
  return meetTimeLabel(time, clockText(time.at, zone));
}

/**
 * What Meet… offers the member's group now (shared with the map, plan 8M-8B): the group by its
 * letter and stamp, its meeting time (`set`), the times of `meetTimes` in time order (the group's
 * own among them), and the one chosen to start with: the group's time, else the next in-game RSVP
 * time (the hatch on an egg: the most common meeting time), else the first.
 */
export function meetChoices(view: MeetDialogView): {
  group: GroupId;
  stamp: string;
  set: number | undefined;
  times: MeetTime[];
  start: MeetTime | undefined;
} {
  const { party, groupId, now } = view;
  const group = groupOf(party, groupId);
  const set = group?.startTime;
  const times = meetTimes(party, now, set);
  const start =
    times.find((time) => time.at === set) ?? times.find((time) => time.rsvp) ?? times[0];
  return { group: groupId, stamp: group ? groupStamp(party, group) : '0', set, times, start };
}

/**
 * Meet… on the map (plan 8M-8B): what `meetChoices` offers, with the dialog's words; the times as
 * moments, which the page names in the reader's zone (`meetTimeLabel`).
 */
export function meetOnTheMap(view: MeetDialogView): MapMeet {
  const { group, stamp, set, times, start } = meetChoices(view);
  return {
    title: meetTitle(group, view.party.groups.length),
    text: MEET_TEXT,
    label: MEET_LABEL,
    group,
    stamp,
    times: times.map(({ at, rsvp, hatch }) => ({ at, rsvp, ...(hatch ? { hatch } : {}) })),
    set: set ?? null,
    picked: start?.at ?? null,
  };
}

/**
 * Meet…'s dialog for the member's group: titled `Meeting time for group B` (`Meeting time` with
 * one group), `For your group: everybody in it is told.`, and the menu "When does your group
 * meet?" of `meetTimes` in time order (the group's own time among them, said so) and, while the
 * group has one, "No meeting time" last. The group's time is chosen to start with, else the next
 * in-game RSVP time (the hatch on an egg: the most common meeting time), else the first. A menu
 * keeps its order, so its start is marked only (Discord's `default`). Its custom id names the
 * group by its letter and stamp (a Submit for a group that went is refused) and ends in a per-open
 * token (`openToken`, plan 8X-F), so that Discord's client starts with the value marked.
 */
export function meetDialog(view: MeetDialogView): APIModalInteractionResponseCallbackData {
  const { party, groupId, zone, now } = view;
  const { stamp, set, times, start } = meetChoices(view);
  const options: DialogOption[] = [
    ...times.map((time) => ({
      value: String(time.at),
      label: timeLabel(time, zone),
      ...(time.at === set ? { description: MEET_TIME_NOW } : {}),
    })),
    ...(set === undefined ? [] : [{ value: NO_MEETING, label: NO_MEETING_TIME }]),
  ];
  return dialog({
    customId: encodeCustomId({
      kind: MEET_KIND,
      id: party.id,
      action: MEET_FORM,
      args: [groupId, stamp, openToken(now)],
    }),
    title: meetTitle(groupId, party.groups.length),
    text: MEET_TEXT,
    choice: {
      id: MEET_INPUT,
      label: MEET_LABEL,
      menu: true,
      options,
      ...(start === undefined ? {} : { picked: String(start.at) }),
    },
  });
}
