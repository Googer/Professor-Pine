import { ComponentType } from 'discord.js';
import { describe, expect, it } from 'vitest';
import { missingPermissions, refusedBody } from '../../test/support/fake-gateway.js';
import type { OutgoingMessage, V2Message } from '../discord/party-gateway.js';
import {
  RefusedFiles,
  refusalSaid,
  sendInForms,
  type LeftOut,
  type MessageForms,
  type Refusal,
} from './refused-files.js';

/** What a form shows: the file of its picture, the application's emoji, its pictures. */
interface Shown {
  files: boolean;
  emoji: boolean;
  picture: boolean;
}

/**
 * The forms of a message that has what `has` says, each telling in its text what it shows (the
 * file goes with the pictures, as a post's egg does).
 */
function formsOf(has: Partial<Shown> = {}): MessageForms {
  const { files = false, emoji = true, picture = true } = has;
  const form = (left: LeftOut): V2Message => {
    const shown: Shown = {
      files: files && left.files !== false && left.picture !== false,
      emoji: emoji && left.customEmoji !== false,
      picture: picture && left.picture !== false,
    };
    return {
      v2: true,
      components: [{ type: ComponentType.TextDisplay, content: JSON.stringify(shown) }],
      files: shown.files ? ['pictures/eggs/egg.png'] : [],
    };
  };
  return { message: form({}), without: form };
}

const shownBy = (message: OutgoingMessage): Shown => {
  const [text] = message.v2 ? message.components : [];
  return JSON.parse((text as { content: string }).content) as Shown;
};

/** Invalid Form Body naming a field (`emoji` or a picture's `media`), or none. */
const namedEmoji = () =>
  refusedBody('emoji', {
    components: {
      '0': { emoji: { id: { _errors: [{ code: 'COMPONENT_INVALID_EMOJI', message: 'x' }] } } },
    },
  });
const namedPicture = () =>
  refusedBody('picture', {
    components: {
      '0': { accessory: { media: { url: { _errors: [{ code: 'X', message: 'x' }] } } } },
    },
  });
const unnamed = () => refusedBody('something');

const CHANNEL = '300000000000000001';

/** Sends `forms` into a channel that refuses what `refuse` gives an error for. */
async function sent(
  forms: MessageForms,
  refuse: (shown: Shown) => Error | undefined,
  refused = new RefusedFiles(() => 0),
) {
  const tried: Shown[] = [];
  const said: Refusal[] = [];
  const warned: string[] = [];
  let failure: unknown;
  try {
    await sendInForms(
      forms,
      CHANNEL,
      refused,
      (message) => {
        const shown = shownBy(message);
        tried.push(shown);
        const err = refuse(shown);
        return err === undefined ? Promise.resolve('sent') : Promise.reject(err);
      },
      (_err, what, dropped) => {
        said.push(what);
        warned.push(refusalSaid(what, 'sending', dropped));
      },
    );
  } catch (err) {
    failure = err;
  }
  return { tried, said, warned, failure, refused };
}

const ALL = { files: false, emoji: true, picture: true };

describe('sendInForms: the forms of a message Discord refuses', () => {
  it('tries the plain emoji with the pictures kept before the bare form, after a refusal it does not name', async () => {
    const made = await sent(formsOf(), (shown) => (shown.picture ? unnamed() : undefined));
    expect(made.tried).toEqual([
      ALL,
      { files: false, emoji: false, picture: true },
      { files: false, emoji: false, picture: false },
    ]);
    expect(made.said).toEqual(['body', 'body']);
    expect(made.failure).toBeUndefined();
  });

  it('goes straight to the plain emoji, files and pictures kept, where Discord names an emoji', async () => {
    const made = await sent(formsOf({ files: true }), (shown) =>
      shown.emoji ? namedEmoji() : undefined,
    );
    expect(made.tried).toEqual([
      { files: true, emoji: true, picture: true },
      { files: true, emoji: false, picture: true },
    ]);
    expect(made.said).toEqual(['emoji']);
    expect(made.refused.has(CHANNEL)).toBe(false);
  });

  it('drops the pictures only when the form with plain emoji is refused too', async () => {
    const made = await sent(formsOf(), (shown) =>
      shown.emoji ? namedEmoji() : shown.picture ? unnamed() : undefined,
    );
    expect(made.tried).toEqual([
      ALL,
      { files: false, emoji: false, picture: true },
      { files: false, emoji: false, picture: false },
    ]);
    expect(made.said).toEqual(['emoji', 'body']);
  });

  it('keeps the custom emoji where Discord names a picture alone', async () => {
    const made = await sent(formsOf(), (shown) => (shown.picture ? namedPicture() : undefined));
    expect(made.tried).toEqual([ALL, { files: false, emoji: true, picture: false }]);
    expect(made.said).toEqual(['picture']);
  });

  it('leaves out a form identical to one tried: without custom emoji, the bare form next', async () => {
    const made = await sent(formsOf({ emoji: false }), (shown) =>
      shown.picture ? unnamed() : undefined,
    );
    expect(made.tried).toEqual([
      { files: false, emoji: false, picture: true },
      { files: false, emoji: false, picture: false },
    ]);
  });

  it('tries each form once at most, and then gives the last refusal', async () => {
    const made = await sent(formsOf({ files: true }), () => unnamed());
    expect(made.tried).toEqual([
      { files: true, emoji: true, picture: true },
      { files: false, emoji: true, picture: true },
      { files: false, emoji: false, picture: true },
      { files: false, emoji: false, picture: false },
    ]);
    expect(made.failure).toBeDefined();
    const plain = await sent(formsOf({ emoji: false, picture: false }), () => unnamed());
    expect(plain.tried).toHaveLength(1);
  });

  it('passes on a failure that no form gets round', async () => {
    const made = await sent(formsOf(), () => missingPermissions('sendMessage'));
    expect(made.tried).toEqual([ALL]);
    expect(made.said).toEqual([]);
  });

  it('remembers a channel whose refusal of files the form without them got round, and sends none there next', async () => {
    const refusesFiles = (shown: Shown) =>
      shown.files ? missingPermissions('sendMessage') : undefined;
    const first = await sent(formsOf({ files: true }), refusesFiles);
    expect(first.said).toEqual(['files']);
    expect(first.refused.has(CHANNEL)).toBe(true);
    const next = await sent(formsOf({ files: true }), refusesFiles, first.refused);
    expect(next.tried).toEqual([{ files: false, emoji: true, picture: true }]);
    expect(next.said).toEqual([]);
  });

  it('remembers the channel where the form without files needed plain emoji as well', async () => {
    const made = await sent(formsOf({ files: true }), (shown) =>
      shown.files ? missingPermissions('sendMessage') : shown.emoji ? namedEmoji() : undefined,
    );
    expect(made.said).toEqual(['files', 'emoji']);
    expect(made.failure).toBeUndefined();
    expect(made.refused.has(CHANNEL)).toBe(true);
  });

  it('does not remember the channel where the refusal taken as of the files was of the message', async () => {
    // Invalid Form Body of a message with files: tried without them, but the files were not shown
    // to be what Discord refused.
    const made = await sent(formsOf({ files: true }), (shown) =>
      shown.files ? unnamed() : undefined,
    );
    expect(made.said).toEqual(['files']);
    expect(made.failure).toBeUndefined();
    expect(made.refused.has(CHANNEL)).toBe(false);
  });

  it('does not remember the channel where the form without files was refused as well', async () => {
    const made = await sent(formsOf({ files: true }), () => missingPermissions('sendMessage'));
    expect(made.said).toEqual(['files']);
    expect(made.failure).toBeDefined();
    expect(made.refused.has(CHANNEL)).toBe(false);
  });
});

describe('refusalSaid: the warning of a refusal got round', () => {
  it('says what the next form newly leaves out, after a refusal Discord did not name', async () => {
    const made = await sent(formsOf(), (shown) => (shown.picture ? unnamed() : undefined));
    expect(made.warned).toEqual([
      'Discord refused the picture or an emoji of a button; sending with plain emoji',
      'Discord refused the picture or an emoji of a button; sending without the pictures',
    ]);
  });

  it('says the pictures go where an emoji was named and the plain emoji are in use already', async () => {
    const made = await sent(formsOf({ emoji: false }), (shown) =>
      shown.picture ? namedEmoji() : undefined,
    );
    expect(made.warned).toEqual([
      'Discord refused an emoji of a button; sending without the pictures',
    ]);
  });

  it('names the files and the plain emoji', async () => {
    const made = await sent(formsOf({ files: true }), (shown) =>
      shown.files ? missingPermissions('sendMessage') : shown.emoji ? namedEmoji() : undefined,
    );
    expect(made.warned).toEqual([
      'Discord refused the files; sending without the files',
      'Discord refused an emoji of a button; sending with plain emoji',
    ]);
  });
});
