import { BoundedMap } from '../bounded-map.js';
import {
  isRefusedBody,
  isRefusedFile,
  refusedPart,
  type OutgoingMessage,
} from '../discord/party-gateway.js';
import { postMessage, type PostLayout, type PostVariant } from '../render/party-post.js';

/** How long a channel that refused files is sent none (a permission is rarely given at once). */
export const FILES_REFUSED_FOR_MS = 10 * 60_000;

/** At most this many channels are remembered. */
const CHANNELS_KEPT = 1_000;

/**
 * The channels (a forum, a post, a channel of copies) that refused the files of a message lately
 * (no Attach Files: plan 8D-F's egg pictures without the web pages): for `FILES_REFUSED_FOR_MS`
 * a message goes there without them at once, so that an egg's post does not cost a refused call
 * and a warning at every edit.
 */
export class RefusedFiles {
  private readonly until = new BoundedMap<string, number>(CHANNELS_KEPT);

  constructor(private readonly now: () => number) {}

  /** Whether files sent into this channel were refused lately. */
  has(channelId: string): boolean {
    const until = this.until.get(channelId);
    return until !== undefined && until > this.now();
  }

  /** Remembers that this channel refused files. */
  note(channelId: string): void {
    this.until.set(channelId, this.now() + FILES_REFUSED_FOR_MS);
  }
}

/**
 * What a refusal was taken to be: of the files (no Attach Files, or a file that could not be
 * read), of an emoji or a picture Discord named (`refusedPart`), or of something in the message
 * it did not name (`body`: it may be a picture or an emoji all the same).
 */
export type Refusal = 'files' | 'emoji' | 'picture' | 'body';

const REFUSED: Record<Refusal, string> = {
  files: 'the files',
  emoji: 'an emoji of a button',
  picture: 'a picture',
  body: 'the picture or an emoji of a button',
};

const INSTEAD: Record<keyof LeftOut, string> = {
  files: 'without the files',
  customEmoji: 'with plain emoji',
  picture: 'without the pictures',
};

/**
 * The warning of a refusal that was got round: what it was taken to be, then `doing`, what was
 * done instead (`editing`), in the form that newly leaves out `dropped` (`FormStep.dropped`).
 */
export function refusalSaid(what: Refusal, doing: string, dropped: keyof LeftOut): string {
  return `Discord refused ${REFUSED[what]}; ${doing} ${INSTEAD[dropped]}`;
}

/**
 * What a form of a message leaves out of it (`PostVariant`): the post's picture where it is a
 * file (`files`), the application's emoji on its buttons (`customEmoji`: the plain ones instead),
 * its pictures, the post's and the gym's (`picture`).
 */
export interface LeftOut {
  files?: false;
  customEmoji?: false;
  picture?: false;
}

/** A message as it is sent, and the message with less (`without`), for when Discord refuses it. */
export interface MessageForms {
  message: OutgoingMessage;
  /** The message without what `left` names: the same message where it has none of that. */
  without(left: LeftOut): OutgoingMessage;
}

/** A post's message in `variant`, and its forms with less. */
export function postForms(layout: PostLayout, variant: PostVariant = {}): MessageForms {
  return {
    message: postMessage(layout, variant),
    without: (left) => postMessage(layout, { ...variant, ...left }),
  };
}

/**
 * What the next form leaves out after a refusal, by what the refusal was taken to be: each in
 * turn until a form differs from those tried. So the forms after an unnamed refusal are the
 * message with plain emoji and its pictures, then without the pictures too (bare); after an
 * emoji Discord named, the same, the forms without files skipped; after a picture it named, the
 * message without the pictures with the custom emoji kept, then bare.
 */
const NEXT: Record<Refusal, readonly (keyof LeftOut)[]> = {
  files: ['files'],
  emoji: ['customEmoji', 'picture'],
  picture: ['picture', 'customEmoji'],
  body: ['customEmoji', 'picture'],
};

/**
 * A step to the next form after a refusal: what the refusal was taken to be, and what the next
 * form newly leaves out: the part whose leaving out made it a form not tried yet (one that
 * changed nothing, as the plain emoji of a message without custom ones, is not it).
 */
export interface FormStep {
  what: Refusal;
  dropped: keyof LeftOut;
}

/**
 * The forms of one message as they are tried, one after another as Discord refuses them: the
 * message (without its files where the channel refused them lately: `start`), without its files
 * where Discord refused them, with plain emoji (its pictures kept), then bare. A form identical to
 * one already tried is left out, and none is tried twice: at most four sends.
 */
export class FormTrail {
  private readonly tried = new Set<string>();
  private left: LeftOut;
  /** The form to send now. */
  message: OutgoingMessage;

  constructor(
    private readonly forms: MessageForms,
    start: LeftOut = {},
  ) {
    this.left = { ...start };
    this.message = Object.keys(start).length === 0 ? forms.message : forms.without(start);
    this.tried.add(JSON.stringify(this.message));
  }

  /** What the forms leave out by now. */
  get leftOut(): LeftOut {
    return { ...this.left };
  }

  /**
   * After a refusal of `message`: what it was taken to be and what the next form newly leaves out,
   * with `message` that form; undefined when no form is left for it, or the failure is none a form
   * could get round (a timeout, a missing permission for a message without files). An emoji
   * Discord named goes first, then files the message carries, then a picture it named; `asBody`
   * takes any other failure as a refusal of what the message holds (a first message of a post
   * refused as empty).
   */
  next(err: unknown, asBody = false): FormStep | undefined {
    const what = this.refusalOf(err, asBody);
    if (what === undefined) return undefined;
    for (const part of NEXT[what]) {
      if (this.left[part] === false) continue;
      this.left = { ...this.left, [part]: false };
      const message = this.forms.without(this.left);
      const key = JSON.stringify(message);
      if (this.tried.has(key)) continue;
      this.tried.add(key);
      this.message = message;
      return { what, dropped: part };
    }
    return undefined;
  }

  private refusalOf(err: unknown, asBody: boolean): Refusal | undefined {
    const part = refusedPart(err);
    if (part === 'emoji') return 'emoji';
    if (isRefusedFile(err, this.message)) return 'files';
    if (part === 'picture') return 'picture';
    return isRefusedBody(err) || asBody ? 'body' : undefined;
  }
}

/**
 * Sends `forms` into a channel through `send`, in the forms of a `FormTrail`: without its files at
 * once where the channel refused files lately; else as it is, and after each refusal in the next
 * form. A channel whose refusal of files (one that was not Invalid Form Body, which may be the
 * message's own) was got round by a form without them is remembered, also when that form needed
 * plain emoji or no pictures as well. `said` hears of each refusal as the next form is tried, with
 * what that form newly leaves out (`FormStep.dropped`); the last refusal is thrown.
 */
export async function sendInForms<T>(
  forms: MessageForms,
  channelId: string,
  refused: RefusedFiles,
  send: (message: OutgoingMessage) => Promise<T>,
  said: (err: unknown, what: Refusal, dropped: keyof LeftOut) => void,
): Promise<T> {
  const trail = new FormTrail(forms, refused.has(channelId) ? { files: false } : {});
  let filesRefused = false;
  for (;;) {
    try {
      const sent = await send(trail.message);
      if (filesRefused && trail.leftOut.files === false) refused.note(channelId);
      return sent;
    } catch (err) {
      const step = trail.next(err);
      if (step === undefined) throw err;
      if (step.what === 'files' && !isRefusedBody(err)) filesRefused = true;
      said(err, step.what, step.dropped);
    }
  }
}
