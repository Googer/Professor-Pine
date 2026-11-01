import { ButtonStyle } from 'discord.js';
import { describe, expect, it } from 'vitest';
import {
  testMeetup,
  testRaid,
  testTrain,
  withAttendees,
  ALICE,
} from '../../test/support/parties.js';
import type { PostButtonView, PostView, PostViewBlock } from '../domain/web/party-data.js';
import { MAX_COLOUR } from './max-post.js';
import {
  bottomControls,
  manageTrainButton,
  moveTrainButton,
  partyButton,
  splitGroupButton,
  wholeRouteButton,
} from './party-controls.js';
import { ENDED_COLOUR, type PostLayout } from './party-post.js';
import {
  accentName,
  CONTROLS,
  layoutKey,
  POST_VIEW_VERSION,
  postKey,
  postView,
  type PostViewOptions,
} from './post-view.js';
import { STAGE_COLOURS } from './raid-post.js';
import { TIMED_COLOUR } from './timed-post.js';

const GUILD = '412345678901234567';
const SERVED = '111111111111111111';

const options: PostViewOptions = {
  emoji: (id) => (id === SERVED ? `/emoji/${id}.png` : undefined),
  channel: (id) => ({ href: `https://discord.com/channels/${GUILD}/${id}`, name: 'another post' }),
  linkable: (url) => url.startsWith('https://www.google.com/maps/'),
  picture: (url) => (url.startsWith('https://cdn.example.test/') ? url : undefined),
  thumbnail: (url) =>
    url === 'https://lh3.googleusercontent.com/kept=s400' ? '/s/x/pictures/gym/1' : undefined,
};

const view = (layout: PostLayout): PostView => postView(layout, options);

/** The buttons of a view's rows of controls, row by row. */
function rows(shown: PostView): PostButtonView[][] {
  return shown.blocks.flatMap((block) => (block.type === 'controls' ? block.rows : []));
}

/** A text block's lines as plain words, for reading a test. */
function words(block: PostViewBlock | undefined): string[] {
  if (block?.type !== 'text') return [];
  return block.lines.map((line) =>
    line.nodes.map((node) => ('text' in node ? node.text : `<${node.kind}>`)).join(''),
  );
}

describe('postView: the controls', () => {
  it('maps a raid’s buttons to presses (+1 and −1 among them, plan 8M-8B) and panels, never sending a custom id', () => {
    const raid = withAttendees(testRaid(), { [ALICE]: {} });
    const icons = {
      controlIcon: (name: string) => (name === 'pinejoin' ? `<:pinejoin:${SERVED}>` : undefined),
    };
    const shown = view({
      accent: STAGE_COLOURS.egg,
      blocks: [{ type: 'controls', rows: bottomControls(raid, { emoji: icons }) }],
    });
    expect(rows(shown)).toEqual([
      [
        {
          name: 'Interested',
          emoji: { name: '🤔' },
          style: 'secondary',
          disabled: false,
          does: { kind: 'press', action: 'interested' },
        },
        {
          name: 'Coming',
          emoji: { name: 'pinejoin', src: `/emoji/${SERVED}.png` },
          style: 'primary',
          disabled: false,
          does: { kind: 'press', action: 'join' },
        },
        {
          name: 'Here',
          emoji: { name: '✅' },
          style: 'success',
          disabled: false,
          does: { kind: 'press', action: 'here' },
        },
        {
          name: 'Done',
          emoji: { name: '🎉' },
          style: 'secondary',
          disabled: false,
          does: { kind: 'press', action: 'done' },
        },
        {
          name: 'Leave',
          emoji: { name: '👋' },
          style: 'danger',
          disabled: false,
          does: { kind: 'press', action: 'leave' },
        },
      ],
      [
        {
          name: '−1',
          emoji: { name: '⬇️' },
          style: 'secondary',
          disabled: false,
          does: { kind: 'press', action: 'less' },
        },
        {
          name: '+1',
          emoji: { name: '⬆️' },
          style: 'secondary',
          disabled: false,
          does: { kind: 'press', action: 'more' },
        },
        {
          name: 'Remote',
          emoji: { name: '📡' },
          style: 'secondary',
          disabled: false,
          does: { kind: 'press', action: 'remote' },
        },
      ],
      [
        {
          name: 'Group…',
          label: 'Group…',
          emoji: { name: '👥' },
          style: 'secondary',
          disabled: false,
          does: { kind: 'panel', panel: 'group' },
        },
        {
          name: 'Set time…',
          label: 'Set time…',
          emoji: { name: '⏰' },
          style: 'primary',
          disabled: false,
          does: { kind: 'panel', panel: 'time' },
        },
      ],
    ]);
    expect(JSON.stringify(shown)).not.toContain(`party:${raid.id}`);
  });

  // Plan 8M-8B: Meet… is the map's form.
  it('opens the map’s Meet… from the post’s Meet…', () => {
    const raid = { ...testRaid(), hatchTime: 1, endTime: 2 };
    const [, counts] = rows(
      view({
        accent: STAGE_COLOURS.egg,
        blocks: [{ type: 'controls', rows: bottomControls(raid, { emoji: {} }) }],
      }),
    );
    expect(counts?.[0]).toMatchObject({ name: 'Meet…', does: { kind: 'panel', panel: 'meet' } });
  });

  it('shows a custom emoji Pine serves no picture of as the button’s plain one', () => {
    const icons = {
      controlIcon: (name: string) =>
        name === 'pinehere' ? '<:pinehere:222222222222222222>' : undefined,
    };
    const [statuses] = rows(
      view({
        accent: TIMED_COLOUR,
        blocks: [{ type: 'controls', rows: bottomControls(testMeetup(), { emoji: icons }) }],
      }),
    );
    expect(statuses?.find((button) => button.name === 'Here')?.emoji).toEqual({ name: '✅' });
  });

  it('opens the map’s moves, manage and route panels from a train’s, Split… on Discord', () => {
    const train = testTrain();
    const third = rows(
      view({
        accent: TIMED_COLOUR,
        blocks: [
          {
            type: 'controls',
            rows: [
              [
                moveTrainButton(train),
                manageTrainButton(train),
                splitGroupButton(train),
                wholeRouteButton(train),
              ],
            ],
          },
        ],
      }),
    )[0];
    expect(third?.map((button) => [button.label, button.does])).toEqual([
      ['Move…', { kind: 'panel', panel: 'moves' }],
      ['Manage…', { kind: 'panel', panel: 'manage' }],
      ['Split…', { kind: 'panel', panel: 'split' }],
      ['Route', { kind: 'panel', panel: 'route' }],
    ]);
  });

  it('says a raid was reported from a screenshot in the place of Screenshot feedback', () => {
    const raid = {
      ...testRaid(),
      raid: { ...testRaid().raid, screenshot: { id: 'abcdefghijkl', timeUncertain: false } },
    };
    const third = rows(
      view({
        accent: STAGE_COLOURS.egg,
        blocks: [{ type: 'controls', rows: bottomControls(raid, { emoji: {} }) }],
      }),
    ).at(-1);
    expect(third?.at(-1)?.does).toEqual({ kind: 'screenshot' });
  });

  it('keeps a button off that the post has off, and does nothing for one it does not know', () => {
    const party = { ...testRaid(), attendees: {} };
    const strange = { button: partyButton(party.id, 'kind', 'Kind', ButtonStyle.Secondary) };
    const [row] = rows(
      view({
        accent: STAGE_COLOURS.egg,
        blocks: [
          {
            type: 'controls',
            rows: [[...(bottomControls(party, { emoji: {} })[2] ?? []), strange]],
          },
        ],
      }),
    );
    expect(row?.[0]).toMatchObject({ label: 'Group…', disabled: true });
    expect(row?.at(-1)?.does).toEqual({ kind: 'none' });
  });
});

describe('postView: the parts', () => {
  it('puts the post’s picture beside its heading, only one the page may load', () => {
    const layout = (picture: string): PostLayout => ({
      accent: STAGE_COLOURS.hatched,
      picture,
      blocks: [
        { type: 'section', content: '### Level 5 raid', accessory: 'picture', role: 'head' },
      ],
    });
    expect(view(layout('https://cdn.example.test/yveltal.png')).blocks[0]).toMatchObject({
      type: 'text',
      role: 'head',
      beside: { kind: 'picture', src: 'https://cdn.example.test/yveltal.png' },
    });
    expect(view(layout('attachment://egg-5.png')).blocks[0]).not.toHaveProperty('beside');
  });

  it('puts a place’s picture beside Where by Pine’s address, else its text without it', () => {
    const where = (thumbnail: string): PostLayout => ({
      accent: STAGE_COLOURS.hatched,
      blocks: [
        {
          type: 'section',
          content: '**Where**\n**Library** · (no address available)',
          accessory: { thumbnail, withoutPicture: '**Where**\n**Library**' },
          role: 'where',
        },
      ],
    });
    const kept = view(where('https://lh3.googleusercontent.com/kept=s400')).blocks[0];
    expect(kept).toMatchObject({ beside: { kind: 'picture', src: '/s/x/pictures/gym/1' } });
    expect(words(kept)).toEqual(['<strong>', '<strong> · (no address available)']);
    const other = view(where('https://lh3.googleusercontent.com/other=s400')).blocks[0];
    expect(other).not.toHaveProperty('beside');
    expect(words(other)).toEqual(['<strong>', '<strong>']);
  });

  it('reads a section’s details under it, and leaves out empty texts and stray lines', () => {
    const shown = view({
      accent: STAGE_COLOURS.egg,
      blocks: [
        { type: 'separator' },
        { type: 'text', content: '' },
        { type: 'section', content: 'Coming (1)', accessory: 'picture', details: 'Alice' },
        { type: 'separator' },
        { type: 'separator' },
        { type: 'text', content: '-# Reported by **Ash**', role: 'note' },
        { type: 'separator' },
      ],
    });
    expect(shown.blocks.map((block) => block.type)).toEqual(['text', 'separator', 'text']);
    expect(words(shown.blocks[0])).toEqual(['Coming (1)', 'Alice']);
    expect(shown.blocks[2]).toMatchObject({ role: 'note', lines: [{ style: 'small' }] });
  });
});

describe('postView: the accent', () => {
  it('names every color a post’s edge has after a value of theme.css', () => {
    const colors = [...Object.values(STAGE_COLOURS), ENDED_COLOUR, MAX_COLOUR, TIMED_COLOUR];
    expect(colors.map(accentName)).toEqual(['egg', 'hatched', 'ended', 'ended', 'max', 'timed']);
    expect(accentName(0x123456)).toBe('other');
  });
});

describe('postKey', () => {
  it('is the same for the same layout and another for another', () => {
    const one: PostLayout = { accent: TIMED_COLOUR, blocks: [{ type: 'text', content: 'a' }] };
    expect(postKey(one)).toBe(postKey({ ...one, blocks: [{ type: 'text', content: 'a' }] }));
    expect(postKey(one)).not.toBe(postKey({ ...one, blocks: [{ type: 'text', content: 'b' }] }));
    expect(postKey(one)).toMatch(/^[0-9a-f]{16}$/u);
  });

  // Plan 8M-8B (X6): the browser keeps a post's view by its key for a day, so a view drawn anew
  // (a button that does another thing on the map) must come under another key.
  it('changes with the version of the view, so that no page keeps a view an older one drew', () => {
    const one: PostLayout = { accent: TIMED_COLOUR, blocks: [{ type: 'text', content: 'a' }] };
    expect(postKey(one)).toBe(layoutKey(one, POST_VIEW_VERSION, CONTROLS));
    expect(layoutKey(one, POST_VIEW_VERSION + 1, CONTROLS)).not.toBe(postKey(one));
    expect(layoutKey(one, POST_VIEW_VERSION + 1, CONTROLS)).toMatch(/^[0-9a-f]{16}$/u);
  });

  // Review W-3: what each button does on the map is part of the key by itself, so that a change
  // of the table never needs a version raised by hand.
  it('changes with what a button does on the map', () => {
    const one: PostLayout = { accent: TIMED_COLOUR, blocks: [{ type: 'text', content: 'a' }] };
    const changed = { ...CONTROLS, maybe: { kind: 'none' as const } };
    expect(layoutKey(one, POST_VIEW_VERSION, changed)).not.toBe(postKey(one));
  });
});
