/**
 * What a server's staff are told of their server's setup in its moderators' bot lab (plan 19B-1,
 * `ServerNotices`): plain sentences for staff, naming no member, each saying what does not work
 * and what to do. Channels by mention (`<#id>`: a lab is a text channel, where Discord shows them).
 */

/** The bot updates channel set for the server is not among its channels any more. */
export const BOT_UPDATES_GONE =
  'The bot updates channel set for this server is gone, so I could not announce a change of the ' +
  'raid bosses. Staff choose another in /admin settings.';

/** The bot may not post in the bot updates channel (the boss announcer's check, `mayPost`). */
export function botUpdatesRefusedWords(channelId: string): string {
  return (
    `I may not post in <#${channelId}>, the bot updates channel, so I could not announce a ` +
    'change of the raid bosses. Staff give me View Channel, Send Messages and Embed Links there.'
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
        'The moderators’ channel set for this server is gone, so meetups that need a ' +
        'moderator’s approval cannot be made here. Staff choose another in /admin settings.'
      );
    case 'cannot-post':
      return (
        `I may not post in ${channelId === undefined ? 'the moderators’ channel' : `<#${channelId}>, the moderators’ channel`}, ` +
        'so meetups that need a moderator’s approval cannot be made here. Staff give me View ' +
        'Channel, Send Messages and Embed Links there.'
      );
  }
}

/**
 * The bot may not make posts in a region's forum (`PostsRefusedError`, plan 8S-3): what it lacks
 * there by the names the forum's settings show; none named is Discord's Missing Access.
 */
export function forumRefusedWords(forumId: string, missing: readonly string[]): string {
  return (
    `I may not make posts in <#${forumId}>: ${lacksWords(missing)}, so no raid, max battle, ` +
    'train or meetup of its region can be posted. Staff give me what it needs in the forum’s ' +
    'settings.'
  );
}

/**
 * The bot may not make posts in the events forum (`PostsRefusedError` or a missing permission,
 * plan 19B-1): what it lacks there, as `forumRefusedWords` says it.
 */
export function eventsForumCannotPostWords(forumId: string, missing: readonly string[]): string {
  return (
    `I may not make posts in <#${forumId}>, the events forum: ${lacksWords(missing)}, so I ` +
    'post no events. Staff give me what it needs in the forum’s settings.'
  );
}

/** What the bot lacks in a forum, by the names its settings show; none named is Missing Access. */
function lacksWords(missing: readonly string[]): string {
  return missing.length === 0
    ? 'Discord does not let me make posts there'
    : `I lack ${missing.length === 1 ? 'the permission' : 'the permissions'} ${andList(missing)} there`;
}

/** The events forum chosen for the server is gone. */
export const EVENTS_FORUM_GONE =
  'The events forum set for this server is gone, so I post no events. Staff choose another in ' +
  '/admin settings, or make one with /admin setup-forums.';

/** The bot may not lock, archive or rename the posts of the events forum. */
export function eventsForumRefusedWords(forumId: string): string {
  return (
    `I may not manage the posts of <#${forumId}>, the events forum, so I cannot close or rename ` +
    'the posts of events that ended. Staff give me Manage Posts there.'
  );
}

/** The listing of the events forum could not be pinned. */
export function eventsListingUnpinnedWords(forumId: string): string {
  return (
    `I could not pin the events listing in <#${forumId}>, the events forum. Staff give me ` +
    'Manage Posts there, or unpin the post that holds the forum’s one pin.'
  );
}

/** `a`, `a and b`, `a, b and c`. */
function andList(items: readonly string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items.at(-1) ?? ''}`;
}
