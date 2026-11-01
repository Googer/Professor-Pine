import { releaseAsked } from './attendance.js';
import { attendeeOf, membersWhere, NO_PROMPTS, type Attendee, type RaidParty } from './party.js';
import { PartyStatus } from './status.js';

/** Where a raid moves to: the new party's id, and its server, region and gym. */
export interface NewPlace {
  /** A fresh UUID. */
  id: string;
  guildId: number;
  regionId: number;
  gymId: number;
}

/**
 * A raid as the new party it becomes when it moves to a gym of another region (spec 5.2): the
 * same raid with the same members, groups, times and boss, under a new id and in the new place.
 * Its post is in another forum, so it starts without anything on Discord: no post, no link
 * line, no copies, no questions and no archive warning (those were messages of the old post).
 * Members who were asked whether they have completed the raid are present again, as the
 * question went with the old post; a scheduled archiving is called off, and the clock schedules
 * it anew, with a warning in the new post. `createdAt` stays: a raid without times is judged by
 * when it was reported.
 */
export function relocatedRaid(source: RaidParty, place: NewPlace): RaidParty {
  const asked = membersWhere(source, (attendee) => attendee.status === PartyStatus.CompletePending);
  return {
    ...releaseAsked(source, asked).party,
    id: place.id,
    guildId: place.guildId,
    regionId: place.regionId,
    gymId: place.gymId,
    status: 'active',
    forumChannelId: null,
    forumPostId: null,
    regionLinkMessageId: null,
    mirrorMessages: [],
    prompts: NO_PROMPTS,
    deletionTime: null,
  };
}

function sameRecord(a: Attendee | undefined, b: Attendee | undefined): boolean {
  if (a === undefined || b === undefined) return a === b;
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]) as Set<keyof Attendee>;
  return [...keys].every((key) => a[key] === b[key]);
}

/**
 * `target`, the party a raid moved into, with everything the raid was when the old party ended
 * (`source`): the move takes a moment, and what members did in the old post meanwhile must not
 * be lost. The place and what `target` has on Discord by now stay its own.
 *
 * `start` is the new party as it was made. A member whose record in `target` differs from the
 * one in `start` acted on the new party during that moment (somebody who reported the same raid
 * at the new gym is signed up there), and keeps that record; such a member's group is the newest
 * one when the raid has none of that letter. A member who left the new party stays out. Anything
 * else done to the new party in that moment (a time, the boss, a group, a meeting time) is
 * replaced by what the old one had.
 */
export function carriedOver(target: RaidParty, source: RaidParty, start: RaidParty): RaidParty {
  const carried = relocatedRaid(source, {
    id: target.id,
    guildId: target.guildId,
    regionId: target.regionId ?? source.regionId ?? 0,
    gymId: target.gymId ?? source.gymId ?? 0,
  });
  const attendees: Record<string, Attendee> = { ...carried.attendees };
  for (const memberId of Object.keys(start.attendees)) {
    // In the new party from the start and no longer: they left it there.
    if (!attendeeOf(target, memberId)) delete attendees[memberId];
  }
  for (const [memberId, attendee] of Object.entries(target.attendees)) {
    if (sameRecord(attendee, attendeeOf(start, memberId))) continue;
    const known = carried.groups.some((group) => group.id === attendee.group);
    attendees[memberId] = known ? attendee : { ...attendee, group: carried.defaultGroupId };
  }
  return {
    ...carried,
    attendees,
    regionId: target.regionId,
    gymId: target.gymId,
    forumChannelId: target.forumChannelId,
    forumPostId: target.forumPostId,
    regionLinkMessageId: target.regionLinkMessageId,
    mirrorMessages: target.mirrorMessages,
    // What the clock did for the new post stays together: its warning and when it is archived.
    prompts: target.prompts,
    deletionTime: target.deletionTime,
    updatedAt: target.updatedAt,
  };
}
