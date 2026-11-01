import { createHash } from 'node:crypto';
import { ButtonStyle, type APIButtonComponent } from 'discord.js';
import { decodeCustomId } from '../discord/custom-id.js';
import type {
  PostAccent,
  PostBeside,
  PostButtonView,
  PostControl,
  PostView,
  PostViewBlock,
} from '../domain/web/party-data.js';
import { MAX_COLOUR } from './max-post.js';
import { PARTY_KIND, type PartyAction } from './party-controls.js';
import { ENDED_COLOUR, STATUS_WORDS, type PostButton, type PostLayout } from './party-post.js';
import { postText, type PostTextOptions } from './post-text.js';
import { STAGE_COLOURS } from './raid-post.js';
import { TIMED_COLOUR } from './timed-post.js';

/** What making a post's view needs of where it is shown, beside what reading its text needs. */
export interface PostViewOptions extends PostTextOptions {
  /** The post's own picture (a boss, an egg) as the page may load it, undefined to leave it out. */
  picture(url: string): string | undefined;
  /** Pine's address of a place's picture (a gym's from Wayfarer) beside a part, else undefined. */
  thumbnail(url: string): string | undefined;
}

/** The colors of the posts' edges by the names of their values in `theme.css`. */
const ACCENTS: ReadonlyMap<number, PostAccent> = new Map([
  [STAGE_COLOURS.egg, 'egg'],
  [STAGE_COLOURS.hatched, 'hatched'],
  [ENDED_COLOUR, 'ended'],
  [MAX_COLOUR, 'max'],
  [TIMED_COLOUR, 'timed'],
]);

/** A post's color by the name of its value in `theme.css` (`--accent-<name>`). */
export function accentName(accent: number): PostAccent {
  return ACCENTS.get(accent) ?? 'other';
}

/**
 * The version of the post's view's own logic (plan 8M-8B, X6): raised with any change of how
 * `postView` draws the same layout, so that every post's key changes with it and no browser keeps
 * a view an older one drew (the route lets it keep a view by its key for a day). What each button
 * does on the map (`CONTROLS`) is in every key by itself (review W-3): no version for it.
 */
export const POST_VIEW_VERSION = 1;

/** What layouts were keyed already: a layout is kept as the post was last shown, unchanged. */
const keys = new WeakMap<PostLayout, string>();

/**
 * 16 hex digits of the SHA-256 of a view's version, what its buttons do on the map (`controls`,
 * `CONTROLS`) and its layout's JSON.
 */
export function layoutKey(
  layout: PostLayout,
  version: number,
  controls: Partial<Readonly<Record<PartyAction, PostControl>>>,
): string {
  return createHash('sha256')
    .update(`${String(version)}\n${JSON.stringify(controls)}\n${JSON.stringify(layout)}`)
    .digest('hex')
    .slice(0, 16);
}

/**
 * The key of a layout (`MapParty.postKey`): `layoutKey` at the view's version and its `CONTROLS`,
 * the same for the same post and another once anything of it changed (or the view did), so that
 * a page asks for a post only when it changed and may keep it by its key.
 */
export function postKey(layout: PostLayout): string {
  let key = keys.get(layout);
  if (key === undefined) {
    key = layoutKey(layout, POST_VIEW_VERSION, CONTROLS);
    keys.set(layout, key);
  }
  return key;
}

/**
 * The posts a layout links as `<#id>` (a split train's other one): the route asks whether the
 * member may see their parties before it names them.
 */
export function linkedPosts(layout: PostLayout): string[] {
  const texts = layout.blocks.flatMap((block) =>
    block.type === 'text'
      ? [block.content]
      : block.type === 'section'
        ? [block.content, block.details ?? '']
        : [],
  );
  return [
    ...new Set(texts.flatMap((text) => [...text.matchAll(/<#(\d+)>/gu)].map((m) => m[1] ?? ''))),
  ];
}

/**
 * What each of a party's buttons does on the map, by the action of its custom id; in every post's
 * key (`postKey`), so a change here gives every post another key.
 */
export const CONTROLS: Partial<Readonly<Record<PartyAction, PostControl>>> = {
  maybe: { kind: 'press', action: 'interested' },
  join: { kind: 'press', action: 'join' },
  here: { kind: 'press', action: 'here' },
  done: { kind: 'press', action: 'done' },
  leave: { kind: 'press', action: 'leave' },
  remote: { kind: 'press', action: 'remote' },
  regroup: { kind: 'panel', panel: 'group' },
  time: { kind: 'panel', panel: 'time' },
  move: { kind: 'panel', panel: 'moves' },
  manage: { kind: 'panel', panel: 'manage' },
  route: { kind: 'panel', panel: 'route' },
  less: { kind: 'press', action: 'less' },
  more: { kind: 'press', action: 'more' },
  meet: { kind: 'panel', panel: 'meet' },
  split: { kind: 'panel', panel: 'split' },
  shot: { kind: 'screenshot' },
};

/** What an icon-only button is called: the words of the post's lines for a status. */
const ICON_WORDS: Partial<Readonly<Record<PartyAction, string>>> = {
  maybe: STATUS_WORDS.interested,
  join: STATUS_WORDS.coming,
  here: STATUS_WORDS.present,
  done: STATUS_WORDS.complete,
  leave: 'Leave',
  less: '−1',
  more: '+1',
  remote: 'Remote',
  meet: 'Meet…',
};

const STYLES: Readonly<Partial<Record<ButtonStyle, PostButtonView['style']>>> = {
  [ButtonStyle.Primary]: 'primary',
  [ButtonStyle.Secondary]: 'secondary',
  [ButtonStyle.Success]: 'success',
  [ButtonStyle.Danger]: 'danger',
};

/** What a button does on the map: by its custom id, never sent to the page. */
function controlOf(button: APIButtonComponent): { control: PostControl; action?: PartyAction } {
  if (!('custom_id' in button)) return { control: { kind: 'none' } };
  const id = decodeCustomId(button.custom_id);
  if (id?.kind !== PARTY_KIND) return { control: { kind: 'none' } };
  const action = id.action as PartyAction;
  return { control: CONTROLS[action] ?? { kind: 'none' }, action };
}

/**
 * A button as the page draws it: its label, its icon (Pine's picture of a custom emoji, else its
 * plain emoji `PostButton.plain`, as the post shows it where Discord refuses the custom one), its
 * style, off where the post has it off, its name, and what it does on the map.
 */
function buttonView(post: PostButton, options: PostViewOptions): PostButtonView {
  const { button } = post;
  const { control, action } = controlOf(button);
  const label = 'label' in button ? button.label : undefined;
  const emoji = 'emoji' in button ? button.emoji : undefined;
  const src = emoji?.id === undefined ? undefined : options.emoji(emoji.id, emoji.name ?? '');
  const icon =
    emoji === undefined
      ? undefined
      : src !== undefined
        ? { name: emoji.name ?? '', src }
        : emoji.id === undefined
          ? { name: emoji.name ?? '' }
          : { name: post.plain ?? emoji.name ?? '' };
  const name = label ?? (action === undefined ? undefined : ICON_WORDS[action]) ?? icon?.name ?? '';
  return {
    ...(label === undefined ? {} : { label }),
    ...(icon === undefined ? {} : { emoji: icon }),
    style: STYLES[button.style] ?? 'secondary',
    disabled: button.disabled === true,
    name,
    does: control,
  };
}

/** A thin line is never first, last or doubled, whatever was left out around it. */
function withoutStrayLines(blocks: PostViewBlock[]): PostViewBlock[] {
  const kept: PostViewBlock[] = [];
  for (const block of blocks) {
    if (block.type === 'separator' && (kept.length === 0 || kept.at(-1)?.type === 'separator')) {
      continue;
    }
    kept.push(block);
  }
  while (kept.at(-1)?.type === 'separator') kept.pop();
  return kept;
}

/**
 * A post's view for the live map (plan 8M-8A): the layout its message was made of, as the page
 * draws it. Its color by the name of its value in `theme.css`; each text read into nodes
 * (`postText`), a section's details under it; beside a text the post's picture (where the page may
 * load it, `picture`), a place's (by Pine's address, `thumbnail`; without one the text the post
 * shows without its picture, `withoutPicture`) or a button; the rows of buttons, each mapped to
 * what it does on the map (`CONTROLS`). Empty texts and stray lines are left out, as the message
 * leaves them. What a post says is decided by its renderer alone: this only draws it anew. Pure.
 */
export function postView(layout: PostLayout, options: PostViewOptions): PostView {
  const blocks: PostViewBlock[] = [];
  for (const block of layout.blocks) {
    switch (block.type) {
      case 'separator':
        blocks.push({ type: 'separator' });
        break;
      case 'controls': {
        const rows = block.rows
          .map((row) => row.map((button) => buttonView(button, options)))
          .filter((row) => row.length > 0);
        if (rows.length > 0) blocks.push({ type: 'controls', rows });
        break;
      }
      case 'text':
        if (block.content === '') break;
        blocks.push({
          type: 'text',
          ...(block.role === undefined ? {} : { role: block.role }),
          lines: postText(block.content, options),
        });
        break;
      case 'section': {
        const { accessory, role } = block;
        let content = block.content;
        let beside: PostBeside | undefined;
        if (accessory === 'picture') {
          const src = layout.picture === undefined ? undefined : options.picture(layout.picture);
          if (src !== undefined) beside = { kind: 'picture', src };
        } else if ('thumbnail' in accessory) {
          const src = options.thumbnail(accessory.thumbnail);
          if (src !== undefined) beside = { kind: 'picture', src };
          else if (accessory.withoutPicture === null) break;
          else if (accessory.withoutPicture !== undefined) content = accessory.withoutPicture;
        } else {
          beside = { kind: 'button', button: buttonView(accessory, options) };
        }
        const whole = block.details === undefined ? content : `${content}\n${block.details}`;
        blocks.push({
          type: 'text',
          ...(role === undefined ? {} : { role }),
          lines: postText(whole, options),
          ...(beside === undefined ? {} : { beside }),
        });
        break;
      }
    }
  }
  return {
    key: postKey(layout),
    accent: accentName(layout.accent),
    blocks: withoutStrayLines(blocks),
  };
}
