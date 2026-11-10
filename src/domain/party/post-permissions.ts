/**
 * What the bot needs in a forum to make its posts and keep them, by the names a forum's settings
 * show (plan 8S-3): seeing it, making posts (Send Messages), writing in them, and Manage Posts
 * (Manage Threads: a post's moderated tags, its pin, and archiving and locking it at the end).
 * A refusal Discord gave without naming anything asks for all of them. Names only, so that the
 * words of a refusal need no `discord.js`; the gateway knows the flags (`DiscordPartyGateway`).
 */
export const POST_PERMISSIONS = [
  'View Channel',
  'Create Posts',
  'Send Messages in Posts',
  'Manage Posts',
] as const;

export type PostPermission = (typeof POST_PERMISSIONS)[number];

/**
 * Needed only for a post with a moderated tag (Pine makes its tags moderated): Discord refuses
 * such a post as Missing Access without it. A post without one (a region's summary has no tags)
 * is made without it, as before plan 8S-3; only its pin then fails (a warning).
 */
export const TAGS_PERMISSION: PostPermission = 'Manage Posts';

/**
 * Not needed to make a post: Discord asks only Create Posts (Send Messages) to start one with its
 * first message (review of 8S-3). The bot needs it to write in its posts later, which
 * `cutover-check` asks of every forum (`FORUM_NEEDS`).
 */
const LATER_PERMISSION: PostPermission = 'Send Messages in Posts';

/**
 * What making a post needs in its forum: View Channel and Create Posts, and Manage Posts where
 * the post has a moderated tag (`moderatedTag`).
 */
export function postNeeds(moderatedTag: boolean): PostPermission[] {
  return POST_PERMISSIONS.filter(
    (name) => name !== LATER_PERMISSION && (moderatedTag || name !== TAGS_PERMISSION),
  );
}

/** A forum where the bot may not make posts, and what it lacks there (none known: Discord said so). */
export interface PostsRefused {
  forumId: string;
  /** The names of `POST_PERMISSIONS` the bot lacks; empty where Discord refused it all the same. */
  missing: readonly string[];
}
