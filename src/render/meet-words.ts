/*
 * The words of Meet…'s times (plan 8X-1B, decisions 5 and 8) on Discord and on the map (plan
 * 8M-8B), without an import, so that the map's page takes it whole: one wording for both, the
 * clock time the caller's (the server's zone in the dialog, the reader's on the map).
 */

/** A time Meet… offers, as its choice names it: an in-game RSVP time, the hatch among them. */
export interface MeetTimeWords {
  rsvp: boolean;
  hatch?: true;
}

/** `At hatch (7:22 PM) · in-game RSVP`, `7:37 PM · in-game RSVP`, `7:40 PM`. */
export function meetTimeLabel(time: MeetTimeWords, clock: string): string {
  if (time.hatch) return `At hatch (${clock}) · in-game RSVP`;
  return time.rsvp ? `${clock} · in-game RSVP` : clock;
}

/** The line under the group's own meeting time among the choices. */
export const MEET_TIME_NOW = "Your group's meeting time now";

/** The choice that removes the group's meeting time, while it has one. */
export const NO_MEETING_TIME = 'No meeting time';

/** Meet…'s title: `Meeting time for group B`, `Meeting time` with one group. */
export function meetTitle(groupId: string, groups: number): string {
  return groups > 1 ? `Meeting time for group ${groupId}` : 'Meeting time';
}

/** What Meet… says above its choice, and the choice's label. */
export const MEET_TEXT = 'For your group: everybody in it is told.';
export const MEET_LABEL = 'When does your group meet?';
