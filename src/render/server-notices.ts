/**
 * What a server's staff are told of their server's setup in its moderators' bot lab (plan 19B-1,
 * `ServerNotices`): plain sentences to staff, naming no member, each saying what does not work
 * and what to do, as an instruction to them (text pass review T6, as the fill's notice speaks).
 * Channels by mention (`<#id>`: a lab is a text channel, where Discord shows them).
 */

/** The bot updates channel set for the server is not among its channels any more. */
export const BOT_UPDATES_GONE =
  'The bot updates channel is gone, so I could not announce a change of the raid bosses. Choose ' +
  'another in /admin settings.';

/** The bot may not post in the bot updates channel (the boss announcer's check, `mayPost`). */
export function botUpdatesRefusedWords(channelId: string): string {
  return (
    `I may not post in <#${channelId}>, the bot updates channel, so I could not announce a ` +
    'change of the raid bosses. Give me View Channel, Send Messages and Embed Links there.'
  );
}

/**
 * Why meetup safety cannot work in a server, as the start found it and its staff are told
 * (`warnAtStart`): the moderators' channel they chose is gone, or the bot may not post in it.
 */
export type MeetupSafetyProblem = 'gone' | 'cannot-post';

/** What meetup safety's staff are told at the start of a problem of their server's setup. */
export function meetupSafetyWords(problem: MeetupSafetyProblem, channelId?: string): string {
  switch (problem) {
    case 'gone':
      return (
        'The moderators’ channel is gone, so meetups that need a moderator’s approval cannot ' +
        'be made. Choose another in /admin settings.'
      );
    case 'cannot-post':
      return (
        `I may not post in ${channelId === undefined ? 'the moderators’ channel' : `<#${channelId}>, the moderators’ channel`}, ` +
        'so meetups that need a moderator’s approval cannot be made. Give me View ' +
        'Channel, Send Messages and Embed Links there.'
      );
  }
}

/**
 * The bot may not make posts in a region's forum (`PostsRefusedError`, plan 8S-3): what it lacks
 * there by the names the forum's settings show; none named is Discord's Missing Access.
 */
export function forumRefusedWords(forumId: string, missing: readonly string[]): string {
  const { refused, fix } = refusalWords(`<#${forumId}>`, missing);
  return (
    `${refused} No raid, max battle, train or meetup of the forum’s region can be posted. ` + fix
  );
}

/**
 * The bot may not make posts in the events forum (`PostsRefusedError` or a missing permission,
 * plan 19B-1): what it lacks there, as `forumRefusedWords` says it.
 */
export function eventsForumCannotPostWords(forumId: string, missing: readonly string[]): string {
  const { refused, fix } = refusalWords(`<#${forumId}>, the events forum`, missing);
  return `${refused} I cannot post events. ${fix}`;
}

/**
 * What the bot lacks in a forum, by the names its settings show, and what staff do about it; none
 * named is Missing Access, which names nothing to give.
 */
function refusalWords(forum: string, missing: readonly string[]): { refused: string; fix: string } {
  if (missing.length === 0) {
    return {
      refused: `Discord does not let me make posts in ${forum}.`,
      fix: 'Check my permissions in the forum’s settings.',
    };
  }
  const one = missing.length === 1;
  return {
    refused:
      `I may not make posts in ${forum}: I lack ${one ? 'the permission' : 'the permissions'} ` +
      `${andList(missing)} there.`,
    fix: `Give me ${one ? 'that permission' : 'those permissions'} in the forum’s settings.`,
  };
}

/** The events forum chosen for the server is gone. */
export const EVENTS_FORUM_GONE =
  'The events forum is gone, so I cannot post events. Choose another in /admin settings, ' +
  'or make one with /admin setup-forums.';

/** The bot may not lock, archive or rename the posts of the events forum. */
export function eventsForumRefusedWords(forumId: string): string {
  return (
    `I may not manage the posts of <#${forumId}>, the events forum, so I cannot close or rename ` +
    'the posts of events that ended. Give me Manage Posts there.'
  );
}

/** The listing of the events forum could not be pinned. */
export function eventsListingUnpinnedWords(forumId: string): string {
  return (
    `I could not pin the events listing in <#${forumId}>, the events forum. Give me ` +
    'Manage Posts there or, if another post is pinned there, unpin it: a forum has only one pin.'
  );
}

/** `a`, `a and b`, `a, b and c`. */
function andList(items: readonly string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items.at(-1) ?? ''}`;
}
