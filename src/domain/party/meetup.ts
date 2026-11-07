import {
  MAX_MEETUP_DESCRIPTION,
  refused,
  type Change,
  type MeetupParty,
  type MeetupPlace,
} from './party.js';
import { newTimedParty, setTimedEnd, settled, tidyName, type NewTimedParty } from './timed.js';

/**
 * A new meetup: its name, and where it is when the member who made it said (`/meetup near:`).
 * The place is set once, here, and never changes afterwards (Matt, 2026-10-17). Since plan 8S-1
 * `/meetup` also asks for its start and its information up front: the moderators need them, and
 * a meetup held for them has no post to set them in.
 */
export interface NewMeetup extends Omit<NewTimedParty, 'startTime'> {
  place?: MeetupPlace | null;
  /** When it starts; the caller has checked it (`resolvePartyTime`). */
  startTime?: number | null;
  /** When it ends; the caller has checked it (`resolvePartyTime`). Refused before the start. */
  endTime?: number | null;
  /** What its post says about it under "Meeting Information", as typed (`tidyDescription`). */
  description?: string | null;
}

/**
 * A new meetup: a name and, when given, its place, start and information, with the member who
 * made it signed up as interested (as the legacy bot did; their automatic status is for raids
 * they report and trains they make). It names who made it, whatever they chose for those: they
 * are the first trainer in its list anyway. Without a start it counts as going on for a day
 * (`OPEN_PARTY_HOURS`) until somebody sets one. Refused with `bad-name` when the text is no
 * name, `description-too-long` when the information is longer than it may be. A start and
 * information given here are what the meetup is made with: nothing announces them as a change.
 */
export function createMeetup(input: NewMeetup): Change<MeetupParty> {
  const name = tidyName(input.name);
  if (name === undefined) return refused('bad-name');
  const description = tidyDescription(input.description ?? '');
  if (description === undefined) return refused('description-too-long');
  const { startTime, endTime, ...rest } = input;
  const core = newTimedParty(
    startTime === undefined || startTime === null ? rest : { ...rest, startTime },
    name,
  );
  const meetup: MeetupParty = {
    ...core,
    type: 'meetup',
    meetup: { description, place: input.place ?? null },
  };
  if (endTime === undefined || endTime === null) {
    return { ok: true, party: settled(meetup, input.now) };
  }
  // The end as `/end` sets it: to the minute, after the start (`setTimedEnd` settles it).
  return setTimedEnd(meetup, endTime, input.now);
}

/**
 * The information of a meetup as it is kept: the lines as they were typed, without white space
 * at their ends and without more than one empty line in a row; null for a text of nothing but
 * white space; undefined when it is longer than `MAX_MEETUP_DESCRIPTION` once tidied.
 */
export function tidyDescription(text: string): string | null | undefined {
  const tidy = text
    .split(/\r\n|\r|\n/)
    .map((line) => line.trimEnd())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (tidy.length > MAX_MEETUP_DESCRIPTION) return undefined;
  return tidy === '' ? null : tidy;
}

/**
 * Whether a member may change a meetup's text (`/name`, `/info`) and, on the map, its other
 * details (spec 3.7, "its maker and staff"; plan 8Z on Discord): the member who made it, or staff
 * (an admin, a moderator, the bot's owner). A meetup's text is safety-relevant since plan 8S-1. A
 * start also needs what `/meet` asks, a sign-up (`mayArrange`).
 */
export function mayEditMeetup(
  party: Pick<MeetupParty, 'createdById'>,
  memberId: string,
  staff: boolean,
): boolean {
  return staff || party.createdById === memberId;
}

/**
 * Sets what the post says about the meetup (`/info`); a text of nothing but white space removes
 * it. The lines stay as they were typed, without white space at their ends and without more than
 * one empty line in a row (`tidyDescription`). Refused with `description-too-long`; the very
 * same party comes back when the text is what it was.
 */
export function setDescription(party: MeetupParty, text: string): Change<MeetupParty> {
  const description = tidyDescription(text);
  if (description === undefined) return refused('description-too-long');
  if (description === party.meetup.description) return { ok: true, party };
  return { ok: true, party: { ...party, meetup: { ...party.meetup, description } } };
}
