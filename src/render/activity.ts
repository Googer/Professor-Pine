import { MAX_GROUP_LABEL } from '../domain/party/attendance.js';
import {
  GROUP_IDS,
  groupOf,
  MAX_MEETUP_DESCRIPTION,
  MAX_PARTY_NAME,
  MAX_ROUTE_STOPS,
  partyWord,
  type Attendee,
  type Party,
  type PartyProblem,
} from '../domain/party/party.js';
import { POST_PERMISSIONS, type PostsRefused } from '../domain/party/post-permissions.js';
import { PartyStatus } from '../domain/party/status.js';
import { GROUP_LABEL, groupWords } from './party-controls.js';
import { numberWord } from './number-words.js';
import { ALREADY_ON_ROUTE } from './route-words.js';
import { memberText, timestamp, type NamedMember } from './text.js';

/**
 * Who a line in a post says did something: the member as a sentence names one (`memberText`),
 * or undefined for the member who made the party and asked not to be named (a train made with
 * privacy Anonymous): such a line says what happened and not who did it ("Stop 2 was added
 * to the route"), or a maker who is not signed up would be the one name the post shows.
 */
export function doer(party: Party, member: NamedMember): string | undefined {
  return party.anonymous && party.createdById === member.id ? undefined : memberText(member);
}

const STATUS_WORDS: Readonly<Record<Attendee['status'], string>> = {
  [PartyStatus.Interested]: 'interested',
  [PartyStatus.Coming]: 'coming',
  [PartyStatus.Present]: 'here',
  [PartyStatus.CompletePending]: 'here',
  [PartyStatus.Complete]: 'done',
};

/**
 * What the post is told when its archiving is scheduled (and again while members go on writing
 * in it). A raid is over by then, and so is a meetup whose end time has passed. A meetup without
 * an end time has only been given its day: the post says that a time keeps it open, since any
 * time that is set then calls the archiving off.
 */
export function archiveWarning(
  party: Pick<Party, 'type' | 'endTime'>,
  deletionTime: number,
): string {
  const word = partyWord(party);
  const archive = `I will archive this post ${timestamp(deletionTime, 'R')}; it stays readable afterwards.`;
  if (party.type === 'raid' || party.endTime !== null) return `This ${word} is over. ${archive}`;
  return (
    `This ${word} has no end time, so I take it to be over. ${archive} ` +
    'A time set with `/meet` or `/end` keeps it open.'
  );
}

export interface StandingOptions {
  /** Say "in person" for a member who is not remote: for the answer to switching it off. */
  sayInPerson?: boolean;
}

/**
 * How an attendee stands, as the end of a sentence: `coming with 2 more, in group B, remotely`.
 * The group is named only when the party has more than one. Somebody who is done is just that:
 * whom they brought and how they took part no longer matters.
 */
export function standing(party: Party, attendee: Attendee, options: StandingOptions = {}): string {
  if (attendee.status === PartyStatus.Complete) return STATUS_WORDS[attendee.status];
  const parts = [STATUS_WORDS[attendee.status]];
  if (attendee.number > 1) parts[0] += ` with ${attendee.number - 1} more`;
  if (party.groups.length > 1) {
    parts.push(`in ${groupWords(groupOf(party, attendee.group) ?? { id: attendee.group })}`);
  }
  if (attendee.remote) parts.push('remotely');
  else if (options.sayInPerson) parts.push('in person');
  return parts.join(', ');
}

/** What the member is told, privately, after a change: `You are coming with 2 more.` */
export function standingReply(
  party: Party,
  attendee: Attendee,
  options: StandingOptions = {},
): string {
  return `You are ${standing(party, attendee, options)}.`;
}

/** The line in the post for everybody: `**Name** (<@id>) is coming with 2 more.` It pings nobody. */
export function standingLine(
  party: Party,
  memberId: string,
  attendee: Attendee,
  options: StandingOptions = {},
): string {
  const member = memberText({ id: memberId, name: attendee.name });
  return `${member} is ${standing(party, attendee, options)}.`;
}

/**
 * Why a change was refused, as a sentence for the member. `word` is what the party is called
 * (`partyWord`): the reasons that any kind of party can give name it.
 */
export function problemText(
  reason: PartyProblem,
  limits: { maxNumber: number },
  word: string,
): string {
  switch (reason) {
    case 'not-attending':
      return `You are not signed up for this ${word}.`;
    case 'no-such-group':
      return `This ${word} has no such group.`;
    case 'bad-count':
      return `Give the number of trainers including yourself, from 1 to ${limits.maxNumber}.`;
    case 'in-person-only':
      return 'Elite raids can only be done in person.';
    case 'too-many-groups':
      return `A ${word} cannot have more than ${numberWord(GROUP_IDS.length)} groups.`;
    case 'no-groups':
      return `A ${word} has no groups.`;
    case 'party-wide-start':
      return `A ${word} starts for everybody at once: its groups have no meeting times.`;
    case 'not-pending':
      return 'You were not asked, or you have answered already.';
    case 'label-too-long':
      return `That label is too long: keep it to ${MAX_GROUP_LABEL} characters.`;
    case 'not-hatched':
      return 'This raid has not hatched yet.';
    case 'no-boss':
      return 'This raid has no boss yet.';
    case 'bad-duration':
      return 'A raid lasts at least 1 minute and not longer than a few hours.';
    case 'already-done':
      // A raid's or a max battle's: the battles have Done (`isBattle`).
      return `You are done with this ${word === 'max battle' ? word : 'raid'}. Use Join or Here if you are back.`;
    case 'gym-taken':
      return 'That gym already has a raid.';
    case 'elite-egg-time':
      // Matt, 2026-10-29 (A): `/hatch` judges a time by the egg's tier, so it cannot set it.
      return (
        'An Elite egg needs its hatch time: once staff delete this egg, report it again with ' +
        '`/raid` and its hatch time.'
      );
    case 'spot-taken':
      return 'That spot has another max battle by now: this one stays as it is.';
    case 'max-kind-change':
      return (
        'A Dynamax battle cannot become a Gigantamax one, nor the other way round (the lobby ' +
        'size would change). Report the new battle with `/max`.'
      );
    case 'max-other-boss':
      return 'That spot has a max battle against another boss: `/boss` there changes its boss.';
    case 'not-a-move':
      return 'The boss of this raid does not have that move.';
    case 'bad-name':
      return `Give a name of 1 to ${MAX_PARTY_NAME} characters.`;
    case 'description-too-long':
      return `That is too long: keep it to ${MAX_MEETUP_DESCRIPTION} characters.`;
    case 'end-before-start':
      return (
        `A ${word} cannot end before it starts. Give a later end, or change the start first ` +
        'with `/meet`.'
      );
    case 'start-after-end':
      return (
        `A ${word} cannot start after it ends. Give an earlier start, or change the end first ` +
        'with `/end`.'
      );
    case 'gym-gone':
      return 'That gym is no longer in my gym list.';
    case 'spot-gone':
      return 'That Power Spot is no longer in my list of Power Spots.';
    case 'post-not-made':
      return (
        'I could not make the post in the other region: it was deleted while I was making it. ' +
        'The raid stays here; try again.'
      );
    case 'posts-refused':
      return (
        "I am not allowed to make posts in the other region's forum: the server's staff must " +
        'give me Manage Posts there (and View Channel, Create Posts and Send Messages in Posts). ' +
        'The raid stays here.'
      );
    case 'other-region':
      return (
        'That gym is not in a region of this server that has a raid forum, so the raid cannot ' +
        'move there.'
      );
    case 'no-route':
      return 'This train has no route yet. Add its stops with `/route add`.';
    case 'route-finished':
      return 'This train has finished its route.';
    case 'at-first-stop':
      return 'This train is at its first stop.';
    case 'no-stop-to-skip':
      return 'There is no stop after the next one to skip to.';
    case 'one-stop-route':
      return 'A route of one stop has no other order.';
    case 'reverse-turns-back':
      return 'This train turns back by itself at the end of its route.';
    case 'reverse-mid-route':
      return 'The route of this train can be reversed only at its first or last stop.';
    case 'reverse-finished-elsewhere':
      return 'A finished route can be reversed only when it was finished at its last stop.';
    case 'already-on-route':
      return ALREADY_ON_ROUTE;
    case 'route-full':
      return `A route has at most ${MAX_ROUTE_STOPS} stops.`;
    case 'no-such-stop':
      return 'The route has no stop with that number.';
    case 'empty-route':
      return 'That route has no stops.';
    case 'not-conductor':
      return 'This train has a conductor: only they and the moderators can move it.';
    case 'conductor-or-staff':
      return 'Only the conductor of this train and the moderators can do that.';
    case 'train-moved-on':
      return 'The train has moved on meanwhile.';
    case 'route-changed':
      return 'The route changed meanwhile, so that button is out of date.';
    case 'route-edited':
      return 'The route changed meanwhile: here it is as it is now.';
    case 'conductor-changed':
      return 'The conductor of this train changed meanwhile: here it is as it is now.';
    case 'one-group':
      return `This ${word} has one group: there is no group to split off it.`;
    case 'empty-group':
      return 'Nobody is in that group: there is nobody to split off.';
    case 'whole-train':
      return `Everybody on this ${word} is in that group: there is nothing to split it from.`;
    case 'unposted':
      return `This ${word} has no post yet: try again in a moment.`;
    case 'split-pending':
      return `This ${word} is still being split off another: try again in a moment.`;
    case 'not-in-group':
      return "Only a group's members, the conductor and the moderators can split a group off.";
    case 'conductor-in-group':
      return 'The conductor is in that group: only they and the moderators can split it off.';
    case 'group-changed':
      return `The groups of this ${word} changed meanwhile.`;
    case 'meeting-time-gone':
      return 'That time is no longer offered: press Meet… again.';
    case 'nothing-to-change':
      // Group…'s Submit and `/group new` name the group (`nothingToChange`).
      return 'You are alone in your group already: a new group would change nothing.';
    case 'no-longer-signed-up':
      return `You are no longer signed up: press ${GROUP_LABEL} again.`;
    case 'changed-meanwhile':
      return `This ${word} changed meanwhile: here it is as it is now.`;
  }
}

/** Said when the post of a new party went while it was being made: nothing was kept. */
export const NO_POST_MADE =
  'I could not finish the post: it was deleted while I was making it. Nothing was kept; try again.';

/**
 * What a member is told of a party's post that was not made (`NoPost`): it went while it was
 * being made (`NO_POST_MADE`), or the bot may not make posts in the forum (plan 8S-3), named as
 * the caller names a channel (a mention on Discord, `#name` on the live map), with what it lacks
 * there by the names the forum's settings show; staff must give it.
 */
export function noPostWords(
  refused: PostsRefused | undefined,
  channel: (channelId: string) => string,
): string {
  if (refused === undefined) return NO_POST_MADE;
  const forum = channel(refused.forumId);
  const { missing } = refused;
  if (missing.length === 0) {
    return (
      `Discord does not let me make posts in ${forum}. Nothing was made. The server's staff ` +
      `must check that I have ${andList(POST_PERMISSIONS)} there.`
    );
  }
  const one = missing.length === 1;
  return (
    `I am not allowed to make posts in ${forum}: I lack the permission${one ? '' : 's'} ` +
    `${andList(missing)} there. Nothing was made. The server's staff must give ` +
    `${one ? 'it' : 'them'} to me.`
  );
}

/**
 * Why a raid did not move into another region (`posts-refused`, plan 8S-3): the bot may not make
 * posts in that region's forum (named as the caller names a channel), with what it lacks there.
 */
export function postsRefusedMoveWords(
  refused: PostsRefused,
  channel: (channelId: string) => string,
): string {
  const forum = `${channel(refused.forumId)}, the other region's forum`;
  const { missing } = refused;
  if (missing.length === 0) {
    return (
      `Discord does not let me make posts in ${forum}. The server's staff must check that I ` +
      `have ${andList(POST_PERMISSIONS)} there. The raid stays here.`
    );
  }
  const one = missing.length === 1;
  return (
    `I am not allowed to make posts in ${forum}: I lack the permission${one ? '' : 's'} ` +
    `${andList(missing)} there. The server's staff must give ${one ? 'it' : 'them'} to me. ` +
    'The raid stays here.'
  );
}

/**
 * Why an approved meetup could not be made where the bot may not make posts in its forum (plan
 * 8S-3), as the moderator and the maker are told it after "but": what it lacks there. `forum`
 * is how the forum is named: "its forum", or its mention in the moderators' post (plan 8S-4).
 */
export function postsRefusedFailure(
  refused: Pick<PostsRefused, 'missing'>,
  forum = 'its forum',
): string {
  if (refused.missing.length === 0) {
    return (
      `Discord does not let me make posts in ${forum} (the server's staff must check that I ` +
      `have ${andList(POST_PERMISSIONS)} there)`
    );
  }
  return (
    `I am not allowed to make posts in ${forum} (the server's staff must give me ` +
    `${andList(refused.missing)} there)`
  );
}

/**
 * What `/admin setup-forums` says of a region whose summary post the bot may not make (plan
 * 8S-3): what it lacks in the forum (`<#id>`), by the names the forum's settings show.
 */
export function summaryRefusedWords(refused: PostsRefused): string {
  const forum = `<#${refused.forumId}>`;
  const { missing } = refused;
  if (missing.length === 0) {
    return (
      `Discord does not let me post the board in ${forum}. Check that I have ` +
      `${andList(POST_PERMISSIONS)} there, and run this again.`
    );
  }
  const one = missing.length === 1;
  return (
    `I am not allowed to post the board in ${forum}: I lack the ` +
    `permission${one ? '' : 's'} ${andList(missing)} there. Give ${one ? 'it' : 'them'} to me ` +
    'and run this again.'
  );
}

/** "a", "a and b", "a, b and c". */
function andList(items: readonly string[]): string {
  return items.length <= 1
    ? (items[0] ?? '')
    : `${items.slice(0, -1).join(', ')} and ${items.at(-1) ?? ''}`;
}
