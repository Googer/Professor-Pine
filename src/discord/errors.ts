import type { V2Message } from './party-gateway.js';

/**
 * What the map answers a write it does not allow (403) and Discord's Manage… of a raid answers a
 * member kept out of its forum (review M10): the same words.
 */
export const NOT_ALLOWED = 'Not allowed.';

/**
 * A problem caused by the user's input or situation (wrong channel, bad value).
 * The router shows the message ephemerally and does not log it as an error. With `answer`, the
 * router shows that message instead of the text (a refusal with a control of its own: the
 * Appeal of a member blocked from making meetups), where the interaction can still be answered
 * privately; the text stays what the log and a public deferral's answer say. With `givesBack`,
 * the refusal is no doing of the member's (the bot may not make posts in a forum, the moderators
 * could not be asked: plan 8S-3), and the router gives back the uses it counted, as for an
 * unexpected error. With `said`, the handler has told the member already, in its own answer
 * (`/raid`'s, with the screenshot's feedback button): the router answers nothing more.
 */
export class UserError extends Error {
  override name = 'UserError';
  readonly answer: V2Message | undefined;
  readonly givesBack: boolean;
  readonly said: boolean;

  constructor(
    message: string,
    options: { answer?: V2Message; givesBack?: boolean; said?: boolean } = {},
  ) {
    super(message);
    this.answer = options.answer;
    this.givesBack = options.givesBack ?? false;
    this.said = options.said ?? false;
  }
}

/**
 * A choice of a list that changed under it (the task list's `TASK_LIST_CHANGED`, the lineups'
 * `LINEUPS_CHANGED`): known by its kind, not its words, by the map's routes (plan 8M-9B, review
 * F8: `reason: 'list-changed'`, the page asking for its lists again).
 */
export class ListChanged extends UserError {
  override name = 'ListChanged';
}
