import { describe, expect, it } from 'vitest';
import type {
  MapAttendance,
  MapMeetup,
  MapMoveRefusal,
  MapRaid,
  MapTrain,
  PostButtonView,
  PostView,
} from '../../domain/web/party-data.js';
import { MEETUP_NOT_YOURS } from '../../domain/web/meetup-data.js';
import type { PageNode } from './popup.js';
import {
  gymWithRaidBoxes,
  mapLine,
  postCard,
  postPopup,
  raidChoices,
  safeHref,
  ON_DISCORD_NOTE,
  type PostDrawContext,
} from './post-draw.js';

/** Tuesday 13 October 2026, 14:00 in New York. */
const NOW = Date.UTC(2026, 9, 13, 18);
const MINUTE = 60_000;
const GUILD = '412345678901234567';
const LINK = `https://discord.com/channels/${GUILD}/700000000000000001`;
const ORIGIN = 'https://map.example.test';
const MAPS = 'https://www.google.com/maps/search/?api=1&query=40.05%2C-80.05';

const context: PostDrawContext = {
  now: NOW,
  origin: ORIGIN,
  guild: GUILD,
  time: { locale: 'en-US', timeZone: 'America/Los_Angeles' },
  stopName: (key) => `Gym ${key}`,
};

const attendance = (more: Partial<MapAttendance> = {}): MapAttendance => ({
  groups: [{ id: 'A', interested: 0, coming: 1, present: 0 }],
  going: 1,
  mine: null,
  actions: [{ action: 'interested' }, { action: 'join' }, { action: 'here' }],
  remote: { offered: true, on: false },
  count: true,
  ...more,
});

const raid = (more: Partial<MapRaid> = {}): MapRaid => ({
  kind: 'raid',
  postKey: 'k',
  id: 'r1',
  gymId: 1,
  picture: null,
  tier: 'Level 5 raid',
  tierGroup: '5',
  heading: 'Level 5 raid (egg)',
  boss: null,
  stage: 'egg',
  hatchTime: NOW + 30 * MINUTE,
  endTime: NOW + 75 * MINUTE,
  link: LINK,
  place: null,
  mayChange: false,
  attendance: attendance(),
  ...more,
});

const button = (more: Partial<PostButtonView> & Pick<PostButtonView, 'does'>): PostButtonView => ({
  style: 'secondary',
  disabled: false,
  name: 'Button',
  ...more,
});

/** A raid's post as the server sends it: heading, times, Where with its Map, a line of controls. */
const VIEW: PostView = {
  key: 'k',
  accent: 'egg',
  blocks: [
    {
      type: 'text',
      role: 'head',
      lines: [
        { style: 'heading', nodes: [{ kind: 'text', text: 'Level 5 raid (egg)' }] },
        {
          style: 'plain',
          nodes: [
            { kind: 'text', text: 'Hatches ' },
            { kind: 'time', at: NOW + 30 * MINUTE, style: 'R' },
            { kind: 'text', text: ', at ' },
            { kind: 'time', at: NOW + 30 * MINUTE, style: 't' },
          ],
        },
      ],
      beside: { kind: 'picture', src: '/eggs/egg-5.png?v=1' },
    },
    { type: 'separator' },
    {
      type: 'text',
      role: 'where',
      lines: [
        {
          style: 'plain',
          nodes: [{ kind: 'strong', children: [{ kind: 'text', text: 'Where' }] }],
        },
        {
          style: 'plain',
          nodes: [
            { kind: 'strong', children: [{ kind: 'text', text: 'Library' }] },
            { kind: 'text', text: ' · ' },
            { kind: 'link', href: MAPS, children: [{ kind: 'text', text: 'Map' }] },
          ],
        },
      ],
    },
    {
      type: 'text',
      role: 'trainers',
      lines: [
        {
          style: 'plain',
          nodes: [
            { kind: 'emoji', name: 'pinejoin', src: '/emoji/111111111111111111.png' },
            { kind: 'text', text: ' Coming (1): Ash ' },
            { kind: 'emoji', name: 'mystic' },
          ],
        },
        { style: 'small', nodes: [{ kind: 'text', text: 'No meeting time yet.' }] },
      ],
    },
    {
      type: 'controls',
      rows: [
        [
          button({
            name: 'Coming',
            style: 'primary',
            emoji: { name: 'pinejoin', src: '/emoji/1.png' },
            does: { kind: 'press', action: 'join' },
          }),
          button({
            name: 'Leave',
            style: 'danger',
            emoji: { name: '👋' },
            does: { kind: 'press', action: 'leave' },
          }),
          button({
            name: 'Remote',
            emoji: { name: '📡' },
            does: { kind: 'press', action: 'remote' },
          }),
        ],
        [
          button({ name: '+1', emoji: { name: '⬆️' }, does: { kind: 'press', action: 'more' } }),
          button({ name: 'Set time…', label: 'Set time…', does: { kind: 'panel', panel: 'time' } }),
          button({ name: 'Group…', label: 'Group…', does: { kind: 'panel', panel: 'group' } }),
          button({
            name: 'Screenshot feedback',
            label: 'Screenshot feedback',
            does: { kind: 'screenshot' },
          }),
        ],
      ],
    },
  ],
};

/** Every node of a tree, depth first. */
function all(node: PageNode): PageNode[] {
  return [node, ...(node.children ?? []).flatMap(all)];
}

/** What a reader sees of a tree: its texts and its pictures' words, in order. */
function seen(node: PageNode): string {
  if (node.tag === 'img') return node.attributes?.alt ?? '';
  return (node.text ?? '') + (node.children ?? []).map(seen).join('');
}

const byClass = (node: PageNode, name: string) =>
  all(node).filter((one) => (one.className ?? '').split(' ').includes(name));
const buttonsOf = (node: PageNode) => all(node).filter((one) => one.tag === 'button');

describe('postCard: a post drawn as Discord draws it (plan 8M-8A)', () => {
  it('draws a button beside a part, as its controls are drawn (review W-4)', () => {
    const card = postCard(
      {
        key: 'k',
        accent: 'egg',
        blocks: [
          {
            type: 'text',
            lines: [{ style: 'plain', nodes: [{ kind: 'text', text: 'Counters' }] }],
            beside: {
              kind: 'button',
              button: button({ label: 'Join', does: { kind: 'press', action: 'join' } }),
            },
          },
        ],
      },
      raid(),
      context,
    );
    const [beside] = buttonsOf(card);
    expect(beside?.text).toBe('Join');
    expect(beside?.className).toContain('beside-control');
    expect(beside?.attributes).toMatchObject({ 'data-party': 'r1', 'data-action': 'join' });
  });

  it('draws its edge, heading, lines and picture, nothing from data as HTML', () => {
    const card = postCard(VIEW, raid(), context);
    expect(card.className).toBe('post accent-egg');
    const head = byClass(card, 'role-head')[0];
    expect(head && all(head).find((one) => one.tag === 'h3')?.children?.[0]?.text).toBe(
      'Level 5 raid (egg)',
    );
    expect(head && seen(head)).toBe('Level 5 raid (egg)Hatches in 30 minutes, at 11:30 AM');
    expect(
      all(card).find((one) => one.tag === 'img' && one.className === 'beside')?.attributes,
    ).toMatchObject({ src: '/eggs/egg-5.png?v=1' });
    const times = all(card).filter((one) => one.tag === 'time');
    expect(times.map((one) => one.attributes)).toEqual([
      {
        datetime: new Date(NOW + 30 * MINUTE).toISOString(),
        'data-at': String(NOW + 30 * MINUTE),
        'data-relative': '',
      },
      { datetime: new Date(NOW + 30 * MINUTE).toISOString(), 'data-at': String(NOW + 30 * MINUTE) },
    ]);
    expect(byClass(card, 'small').map(seen)).toEqual(['No meeting time yet.']);
    expect(all(card).some((one) => one.tag === 'hr')).toBe(true);
  });

  it('links only an address it may, in a tab of its own', () => {
    const card = postCard(VIEW, raid(), context);
    expect(all(card).find((one) => one.tag === 'a' && one.text === undefined)?.attributes).toEqual({
      href: MAPS,
      target: '_blank',
      rel: 'noopener noreferrer',
    });
    expect(safeHref('javascript:alert(1)', ORIGIN, GUILD)).toBeUndefined();
    expect(safeHref('https://evil.example/x', ORIGIN, GUILD)).toBeUndefined();
    expect(safeHref(`${ORIGIN}/s/${GUILD}/map`, ORIGIN, GUILD)).toBe(`${ORIGIN}/s/${GUILD}/map`);
    expect(safeHref(LINK, ORIGIN, GUILD)).toBe(LINK);
  });

  it('draws a login link in a post’s text as its text, and any page of Pine’s that is not this server’s (plan 8Z-2)', () => {
    expect(
      safeHref(`${ORIGIN}/auth/link/${GUILD}/${'A'.repeat(43)}`, ORIGIN, GUILD),
    ).toBeUndefined();
    expect(safeHref(`${ORIGIN}/auth/link/x`, ORIGIN, GUILD)).toBeUndefined();
    expect(safeHref(`${ORIGIN}/s/999999999999999999/map`, ORIGIN, GUILD)).toBeUndefined();
    expect(safeHref(`${ORIGIN}/`, ORIGIN, GUILD)).toBeUndefined();
    expect(safeHref(`${ORIGIN}/s/${GUILD}/history`, ORIGIN, GUILD)).toBe(
      `${ORIGIN}/s/${GUILD}/history`,
    );
    // Drawn so: the words stay, without a link.
    const login = `${ORIGIN}/auth/link/${GUILD}/${'A'.repeat(43)}`;
    const view: PostView = {
      ...VIEW,
      blocks: [
        {
          type: 'text',
          role: 'head',
          lines: [
            {
              style: 'plain',
              nodes: [{ kind: 'link', href: login, children: [{ kind: 'text', text: 'the map' }] }],
            },
          ],
        },
      ],
    };
    const drawn = all(postCard(view, raid(), context));
    expect(drawn.some((one) => one.tag === 'a' && one.attributes?.href === login)).toBe(false);
    expect(drawn.some((one) => one.text === 'the map')).toBe(true);
  });

  it('draws an emoji Pine serves as its picture, any other by its name', () => {
    const trainers = byClass(postCard(VIEW, raid(), context), 'role-trainers')[0];
    const pictures = trainers ? all(trainers).filter((one) => one.tag === 'img') : [];
    expect(pictures.map((one) => one.attributes)).toEqual([
      {
        src: '/emoji/111111111111111111.png',
        alt: ':pinejoin:',
        title: 'pinejoin',
        draggable: 'false',
      },
    ]);
    expect(trainers && seen(trainers)).toBe(
      ':pinejoin: Coming (1): Ash :mystic:No meeting time yet.',
    );
  });

  it('presses what the member may press, as the post’s buttons, named for a screen reader', () => {
    const buttons = buttonsOf(postCard(VIEW, raid(), context));
    const coming = buttons.find((one) => one.attributes?.['aria-label'] === 'Coming');
    expect(coming?.className).toBe('press primary icon');
    expect(coming?.attributes).toMatchObject({
      'data-party': 'r1',
      'data-action': 'join',
      title: 'Coming',
    });
    expect(coming?.attributes).not.toHaveProperty('disabled');
    // Leave: not signed up, as the map's own list of what applies says.
    expect(
      buttons.find((one) => one.attributes?.['aria-label'] === 'Leave')?.attributes,
    ).toHaveProperty('disabled');
    expect(
      buttons.find((one) => one.attributes?.['aria-label'] === 'Remote')?.attributes,
    ).toMatchObject({ 'data-action': 'remote' });
  });

  it('opens the map’s panel where it has one, else says to do it on Discord', () => {
    const plain = buttonsOf(postCard(VIEW, raid(), context));
    expect(plain.find((one) => one.text === 'Set time…')?.attributes).toHaveProperty(
      'data-on-discord',
    );
    // Group… without its choices in the list (read-only, plan 8M-8B X10) is off, not on Discord.
    expect(plain.find((one) => one.text === 'Group…')?.attributes).toMatchObject({
      disabled: '',
    });
    const mayChange = raid({
      mayChange: true,
      attendance: attendance({
        pick: [
          { group: 'A', label: 'Group A' },
          { group: 'B', label: 'Group B' },
        ],
      }),
    });
    const shown = buttonsOf(postCard(VIEW, mayChange, context));
    expect(shown.find((one) => one.text === 'Set time…')?.attributes).toMatchObject({
      'data-change-raid': 'r1',
    });
    expect(shown.find((one) => one.text === 'Group…')?.attributes).toMatchObject({
      'data-focus-pick': '',
    });
    // Plan 8M-11A (S9): no line to Discord under the buttons; the note box says it when pressed.
    expect(byClass(postCard(VIEW, raid(), context), 'on-discord')).toEqual([]);
    expect(plain.find((one) => one.text === 'Set time…')?.attributes).toMatchObject({
      'data-why': '',
      'data-note': ON_DISCORD_NOTE,
    });
  });

  // Plan 8M-8B: Group… opens the map's form from the choices the list carries, or says why not.
  it('opens Group… as the map’s form where the list carries its choices, else says why not', () => {
    const choices = raid({
      attendance: attendance({
        mine: { status: 'coming', group: 'A' },
        regroup: {
          title: 'Change group',
          text: "You're in group A.",
          label: 'Move to',
          signedUp: true,
          choices: [{ group: 'B', stamp: 'b', label: 'Group B', size: '1 trainer' }],
          newGroup: false,
        },
      }),
    });
    const group = (party: MapRaid) =>
      buttonsOf(postCard(VIEW, party, context)).find((one) => one.text === 'Group…');
    expect(group(choices)?.attributes).toMatchObject({ 'data-regroup': 'r1' });
    expect(group(choices)?.attributes).not.toHaveProperty('disabled');
    const refused = raid({
      attendance: attendance({
        regroup: { refused: 'You are done with this raid. Use Join or Here if you are back.' },
      }),
    });
    expect(group(refused)?.attributes).toMatchObject({
      'data-on-discord': 'group',
      'data-why': 'You are done with this raid. Use Join or Here if you are back.',
    });
  });

  // Review B-2: a button the post drew off (Group… while nobody is signed up) gets no form
  // attribute, which `formControls` would turn back on.
  it('gives a button the post drew off no form of the map', () => {
    const offGroup: PostView = {
      key: 'k',
      accent: 'egg',
      blocks: [
        {
          type: 'controls',
          rows: [
            [
              button({
                name: 'Group…',
                label: 'Group…',
                disabled: true,
                does: { kind: 'panel', panel: 'group' },
              }),
            ],
          ],
        },
      ],
    };
    const withChoices = raid({
      attendance: attendance({
        regroup: {
          title: 'Join a group',
          text: 'You join as coming, in the group you pick.',
          label: 'Join',
          signedUp: false,
          choices: [{ group: 'A', stamp: 'a', label: 'Group A', size: 'Nobody yet' }],
          newGroup: true,
        },
      }),
    });
    const [group] = buttonsOf(postCard(offGroup, withChoices, context));
    expect(group?.attributes).toMatchObject({ disabled: '' });
    expect(group?.attributes).not.toHaveProperty('data-regroup');
  });

  // Review N-4, plan 8M-11A (S9): the page reads the note's words off the button pressed.
  it('gives every button that sends to Discord the words of the note it shows', () => {
    const buttons = buttonsOf(postCard(VIEW, raid(), context));
    const onDiscord = buttons.filter((one) => one.attributes?.['data-on-discord'] !== undefined);
    expect(onDiscord.length).toBeGreaterThan(0);
    expect(onDiscord.map((one) => one.attributes?.['data-note'])).toEqual(
      onDiscord.map(() => ON_DISCORD_NOTE),
    );
  });

  // Plan 8M-11A (S9, S20): the answer of a press in a line of the post, under its buttons.
  it('draws the answer line under the post’s buttons: empty, an answer, a refusal', () => {
    const blocks = (node: PageNode) => node.children ?? [];
    const card = postCard(VIEW, raid(), context);
    const at = blocks(card).findIndex((one) => one.className === 'post-controls');
    expect(blocks(card)[at + 1]).toEqual({
      tag: 'div',
      className: 'press-answer',
      text: '',
      attributes: { role: 'status' },
    });
    const answered = postCard(VIEW, raid(), {
      ...context,
      answer: { text: 'You are coming.', ok: true },
    });
    expect(byClass(answered, 'press-answer')[0]?.text).toBe('You are coming.');
    const refused = postCard(VIEW, raid(), {
      ...context,
      answer: { text: 'Only the conductor may move it.', ok: false },
    });
    expect(byClass(refused, 'press-answer')[0]).toMatchObject({
      className: 'press-answer refused',
      text: 'Only the conductor may move it.',
    });
  });

  // Review W-1: a new group the only way, Group… links the post: "Start a new group on Discord →".
  it('sends Group… to the post where a new group is the only way', () => {
    const only = raid({
      attendance: attendance({
        mine: { status: 'coming', group: 'A' },
        regroup: { onlyNewGroup: true },
      }),
    });
    const group = buttonsOf(postCard(VIEW, only, context)).find((one) => one.text === 'Group…');
    // Plan 8M-11A (S9): a note in the form's place, with the post's link as a button.
    expect(group?.attributes).toMatchObject({
      'data-on-discord': 'group',
      'data-why': '',
      'data-note': 'A new group is started on Discord.',
    });
  });

  // Plan 8M-8B: Meet… opens the map's form (which asks the server what it offers), off while
  // nothing may be pressed.
  it('opens Meet… as the map’s form, off while the map is read-only', () => {
    const view: PostView = {
      key: 'k',
      accent: 'hatched',
      blocks: [
        {
          type: 'controls',
          rows: [
            [
              button({
                name: 'Meet…',
                emoji: { name: '⏰' },
                does: { kind: 'panel', panel: 'meet' },
              }),
            ],
          ],
        },
      ],
    };
    const [on] = buttonsOf(postCard(view, raid(), context));
    expect(on?.attributes).toMatchObject({ 'data-meet': 'r1', 'aria-label': 'Meet…' });
    expect(on?.attributes).not.toHaveProperty('disabled');
    const [off] = buttonsOf(
      postCard(view, raid({ attendance: attendance({ count: false }) }), context),
    );
    expect(off?.attributes).toMatchObject({ disabled: '' });
    expect(off?.attributes).not.toHaveProperty('data-meet');
  });

  // Plan 8M-8B: +1 and −1 are presses of the map, off while it is read-only (`count`).
  it('presses +1 and −1 as the map’s presses, off while nothing may be pressed', () => {
    const view: PostView = {
      key: 'k',
      accent: 'egg',
      blocks: [
        {
          type: 'controls',
          rows: [
            [
              button({
                name: '−1',
                emoji: { name: '⬇️' },
                does: { kind: 'press', action: 'less' },
              }),
              button({
                name: '+1',
                emoji: { name: '⬆️' },
                does: { kind: 'press', action: 'more' },
              }),
            ],
          ],
        },
      ],
    };
    const on = buttonsOf(postCard(view, raid(), context));
    expect(on.map((one) => one.attributes)).toEqual([
      expect.objectContaining({ 'data-party': 'r1', 'data-action': 'less', 'aria-label': '−1' }),
      expect.objectContaining({ 'data-party': 'r1', 'data-action': 'more', 'aria-label': '+1' }),
    ]);
    expect(on.some((one) => one.attributes?.disabled !== undefined)).toBe(false);
    const off = buttonsOf(
      postCard(view, raid({ attendance: attendance({ count: false }) }), context),
    );
    expect(off.every((one) => one.attributes?.disabled === '')).toBe(true);
  });

  it('says the raid was reported from a screenshot, its feedback on Discord', () => {
    const note = byClass(postCard(VIEW, raid(), context), 'screenshot-note')[0];
    expect(note && seen(note)).toBe('Reported from a screenshot · feedback on Discord →');
    expect(note?.attributes?.href).toBe(LINK);
  });

  it('turns nothing on while the map is read-only', () => {
    const readOnly = raid({
      attendance: attendance({ actions: [], remote: { offered: false, on: false }, count: false }),
    });
    const presses = buttonsOf(postCard(VIEW, readOnly, context)).filter(
      (one) => one.attributes?.['data-action'],
    );
    expect(presses.every((one) => one.attributes?.disabled === '')).toBe(true);
  });
});

describe('postPopup: the post, the member’s own part and the map’s line', () => {
  it('adds who the member is in it, the group to pick, and how to get there', () => {
    const member = raid({
      mayChange: true,
      mayReport: true,
      attendance: attendance({
        mine: { status: 'coming', group: 'B' },
        groups: [
          { id: 'A', interested: 0, coming: 1, present: 0 },
          { id: 'B', interested: 0, coming: 1, present: 0 },
        ],
        remote: { offered: true, on: true },
      }),
    });
    const popup = postPopup(VIEW, member, {
      ...context,
      place: { lat: 40.05, lon: -80.05 },
      located: { lat: 40.06, lon: -80.05 },
      units: 'imperial',
    });
    expect(byClass(popup, 'mine').map(seen)).toEqual(['You: Coming, group B · remote']);
    // Manage… is the post's own button since plan 8M-21, as Discord's: none in the member's part.
    const mine = byClass(popup, 'mine-part')[0];
    expect(mine && buttonsOf(mine).map((one) => one.text)).not.toContain('Manage…');
    const line = byClass(popup, 'map-line')[0];
    expect(line && seen(line)).toBe('0.7 mi · Directions · Open on Discord · Report…');
  });

  // Plan 8M-8B (X1): staff's Delete… in the map's own line, beside Open on Discord.
  it('offers members Report… and staff Delete… in the map’s line, nothing while read-only', () => {
    const placed = { ...context, place: undefined, located: undefined, units: 'imperial' as const };
    const close = { mayDelete: true, forum: '#west', word: 'raid' };
    const staff = postPopup(VIEW, raid({ close, mayReport: true }), placed);
    const line = byClass(staff, 'map-line')[0];
    expect(line && seen(line)).toBe('Open on Discord · Report… · Delete…');
    expect(line && buttonsOf(line).map((one) => one.attributes)).toEqual([
      expect.objectContaining({ 'data-report-party': 'r1' }),
      expect.objectContaining({ 'data-close-party': 'r1' }),
    ]);
    const member = byClass(postPopup(VIEW, raid({ mayReport: true }), placed), 'map-line')[0];
    expect(member && buttonsOf(member).map((one) => one.text)).toEqual(['Report…']);
    // Not offered (read-only, or a forum the member does not see on Discord: review W-7).
    const away = byClass(postPopup(VIEW, raid(), placed), 'map-line')[0];
    expect(away && buttonsOf(away)).toEqual([]);
  });

  // Plan 8M-8B: the completion question, to the member it asked only, with its two answers.
  it('asks the member the completion question asked them, with "Yes, done" and "Not yet"', () => {
    const placed = { ...context, place: undefined, located: undefined, units: 'imperial' as const };
    const asked = raid({
      stage: 'hatched',
      attendance: attendance({
        mine: { status: 'present', group: 'A' },
        // The party's word as the server sent it (review W-4), never worked out by the page.
        asked: { until: NOW + 10 * MINUTE, word: 'max battle' },
      }),
    });
    const question = byClass(postPopup(VIEW, asked, placed), 'completion')[0];
    // Plan 8M-11A (S21): in the post, above its buttons, not at the popup's end.
    const card = postCard(VIEW, asked, context);
    const parts = card.children ?? [];
    expect(parts.findIndex((one) => one.className === 'completion')).toBe(
      parts.findIndex((one) => one.className === 'post-controls') - 1,
    );
    expect(
      byClass(postPopup(VIEW, asked, placed), 'mine-part').flatMap((one) =>
        byClass(one, 'completion'),
      ),
    ).toEqual([]);
    expect(question && seen(question)).toBe(
      'Have you completed this max battle?Without an answer by 11:10 AM I will take it that you have.' +
        'Yes, doneNot yet',
    );
    expect(question && buttonsOf(question).map((one) => one.attributes)).toEqual([
      expect.objectContaining({ 'data-party': 'r1', 'data-action': 'answer', 'data-yes': 'true' }),
      expect.objectContaining({ 'data-party': 'r1', 'data-action': 'answer', 'data-yes': 'false' }),
    ]);
    expect(byClass(postPopup(VIEW, raid(), placed), 'completion')).toEqual([]);
  });

  it('keeps a train’s conductor and route on the map, the route shown by Route', () => {
    const train: MapTrain = {
      kind: 'train',
      postKey: 'k',
      id: 't1',
      name: 'Loop',
      trainKind: 'raid',
      trainKindWords: 'Raid Train',
      endTime: null,
      startTime: null,
      route: ['1', '2', '3', '4'],
      spots: [],
      stop: 1,
      atEnd: 'finish',
      stopsAhead: [2, 3],
      ahead: 'Next: 3. Gym 3 · 4. Gym 4, the last stop',
      link: LINK,
      attendance: attendance({ mine: { status: 'coming', group: 'A' } }),
      may: { arrange: true, clear: false, load: false },
      moves: {
        title: 'Move the train',
        place: '2',
        text: 'At stop 2 of 4: Gym 2\nNext is Gym 3',
        label: 'Where to',
        moves: [{ move: 'next', target: '3', label: 'Next: Gym 3' }],
      },
      conductor: { who: null, mayTake: true, mayDrop: false },
      moveRefusal: null,
      mayManage: true,
    };
    const view: PostView = {
      key: 'k',
      accent: 'timed',
      blocks: [
        {
          type: 'controls',
          rows: [
            [
              button({ name: 'Move…', label: 'Move…', does: { kind: 'panel', panel: 'moves' } }),
              button({
                name: 'Manage…',
                label: 'Manage…',
                does: { kind: 'panel', panel: 'manage' },
              }),
              button({ name: 'Route', label: 'Route', does: { kind: 'panel', panel: 'route' } }),
              button({ name: 'Split…', label: 'Split…', does: { kind: 'panel', panel: 'split' } }),
            ],
          ],
        },
      ],
    };
    const popup = postPopup(view, train, {
      ...context,
      place: undefined,
      located: undefined,
      units: 'imperial',
    });
    const buttons = buttonsOf(popup);
    expect(buttons.find((one) => one.text === 'Move…')?.attributes).toMatchObject({
      'data-move-train': 't1',
    });
    // Manage… is the map's form of the post's dialog (plan 8M-8C), for who may move the train.
    expect(buttons.find((one) => one.text === 'Manage…')?.attributes).toMatchObject({
      'data-manage-train': 't1',
    });
    expect(buttons.find((one) => one.text === 'Route')?.attributes).toMatchObject({
      'data-toggle': 'route',
    });
    // Split… is the map's form of the post's dialog (plan 8M-8C), which asks the server first.
    expect(buttons.find((one) => one.text === 'Split…')?.attributes).toMatchObject({
      'data-split-train': 't1',
    });
    // The conductor's part is the member's own, outside Manage… (R2), as `/conductor` is.
    expect(byClass(popup, 'manage')).toEqual([]);
    const mine = byClass(popup, 'mine-part')[0];
    // Edit route once, in the member's part above Route's list (review C8).
    expect(mine && buttonsOf(mine).map((one) => one.text)).toEqual([
      'Edit route',
      'Be the conductor',
    ]);
    expect(mine && seen(mine)).toContain('It has no conductor.');
    expect(seen(popup)).not.toContain('What the train is mainly for');
    const route = byClass(popup, 'route')[0];
    expect(
      route &&
        all(route)
          .filter((one) => one.tag === 'li')
          .map(seen),
      // Plan 8M-15: how far away each stop ahead is, as the map's badges number them.
    ).toEqual(['Gym 1', 'Gym 2 (the train is here)', 'Gym 3 (next)', 'Gym 4 (in 2 stops)']);
    // What lies ahead as the server words it (R3); route mode is the member's part's Edit route.
    expect(route && seen(route)).toContain('Next: 3. Gym 3 · 4. Gym 4, the last stop');
    expect(route && buttonsOf(route)).toEqual([]);
    expect(buttons.find((one) => one.text === 'Edit route')?.attributes).toMatchObject({
      'data-route-train': 't1',
    });
    // A turn-back train: each stop its next arrival, out to the end and back to the start; a
    // finished one says none.
    const turning = postPopup(
      view,
      { ...train, atEnd: 'turn-back', stopsAhead: [2, 3, 2, 1, 0] },
      { ...context, place: undefined, located: undefined, units: 'imperial' },
    );
    expect(
      all(byClass(turning, 'route')[0] ?? turning)
        .filter((one) => one.tag === 'li')
        .map(seen),
    ).toEqual([
      'Gym 1 (in 5 stops)',
      'Gym 2 (the train is here)',
      'Gym 3 (next)',
      'Gym 4 (in 2 stops)',
    ]);
    const done = postPopup(
      view,
      { ...train, stop: null, stopsAhead: [] },
      { ...context, place: undefined, located: undefined, units: 'imperial' },
    );
    expect(
      all(byClass(done, 'route')[0] ?? done)
        .filter((one) => one.tag === 'li')
        .map(seen),
    ).toEqual(['Gym 1', 'Gym 2', 'Gym 3', 'Gym 4']);
  });
});

describe('the review’s fixes (8M-8A fix round 1)', () => {
  /** Why not, as the server sends it with the train: the commands' words (review C1 of 8M-8C). */
  const WORDS: Readonly<Record<MapMoveRefusal, string>> = {
    'not-conductor': 'This train has a conductor: only they and the moderators can move it.',
    'not-attending': 'You are not signed up for this train.',
    'no-route': 'This train has no route yet. Add its stops with /route add.',
    'read-only':
      'Discord cannot be reached just now, so nothing can be changed. Try again in a moment.',
  };
  const refused = (reason: MapMoveRefusal) => ({ reason, text: WORDS[reason] });
  const train = (more: Partial<MapTrain> = {}): MapTrain => ({
    kind: 'train',
    postKey: 'k',
    id: 't1',
    name: 'Loop',
    trainKind: 'raid',
    trainKindWords: 'Raid Train',
    endTime: null,
    startTime: null,
    route: ['1', '2'],
    spots: [],
    stop: 0,
    atEnd: 'finish',
    stopsAhead: [1],
    ahead: null,
    link: LINK,
    attendance: attendance(),
    may: { arrange: false, clear: false, load: false },
    moves: null,
    conductor: { who: 'other', mayTake: false, mayDrop: false },
    moveRefusal: refused('not-conductor'),
    mayManage: false,
    ...more,
  });
  const trainView: PostView = {
    key: 'k',
    accent: 'timed',
    blocks: [
      {
        type: 'controls',
        rows: [
          [
            button({ name: 'Move…', label: 'Move…', does: { kind: 'panel', panel: 'moves' } }),
            button({ name: 'Manage…', label: 'Manage…', does: { kind: 'panel', panel: 'manage' } }),
          ],
        ],
      },
    ],
  };

  it('draws __underline__ as underlined (8A-14)', () => {
    const view: PostView = {
      key: 'k',
      accent: 'egg',
      blocks: [
        {
          type: 'text',
          lines: [
            {
              style: 'plain',
              nodes: [{ kind: 'underline', children: [{ kind: 'text', text: 'here' }] }],
            },
          ],
        },
      ],
    };
    expect(all(postCard(view, raid(), context)).some((one) => one.tag === 'u')).toBe(true);
  });

  /** What a button says when pressed: which button, and its words. */
  const pressed = (party: MapTrain, label: string) =>
    buttonsOf(postCard(trainView, party, context)).find((one) => one.text === label)?.attributes;

  // Review C1 of 8M-8C: in the words the server sends, Discord's, never the page's own.
  it('says why the member may not use Move… and Manage… in the words the server sends (8A-12, N1)', () => {
    expect(pressed(train(), 'Move…')).toMatchObject({
      'data-on-discord': 'moves',
      'data-why': WORDS['not-conductor'],
    });
    expect(pressed(train(), 'Manage…')).toMatchObject({
      'data-on-discord': 'manage',
      'data-why': WORDS['not-conductor'],
    });
    // Manage… of a train without a route asks its kind alone (plan 8M-8C): its form opens.
    expect(
      pressed(train({ moveRefusal: refused('no-route'), mayManage: true }), 'Manage…'),
    ).toMatchObject({ 'data-manage-train': 't1' });
    // Branch review B2: whether it opens is the server's word (`mayManage`), not the page's.
    expect(pressed(train({ moveRefusal: null, mayManage: false }), 'Manage…')).not.toHaveProperty(
      'data-manage-train',
    );
    expect(pressed(train({ mayManage: true }), 'Manage…')).toMatchObject({
      'data-manage-train': 't1',
    });
    const unled = train({
      conductor: { who: null, mayTake: false, mayDrop: false },
      moveRefusal: refused('not-attending'),
    });
    expect(pressed(unled, 'Move…')?.['data-why']).toBe(WORDS['not-attending']);
    expect(pressed(unled, 'Manage…')?.['data-why']).toBe(WORDS['not-attending']);
    // The conductor of a train with no route yet: not a matter of who they are.
    const routeless = train({
      route: [],
      stop: null,
      conductor: { who: 'you', mayTake: false, mayDrop: true },
      moveRefusal: refused('no-route'),
    });
    expect(pressed(routeless, 'Move…')?.['data-why']).toBe(WORDS['no-route']);
    const readOnly = train({ moveRefusal: refused('read-only') });
    expect(pressed(readOnly, 'Move…')?.['data-why']).toBe(WORDS['read-only']);
  });

  it('keeps Route open across a redraw (8A-10)', () => {
    const popup = postPopup(
      trainView,
      train({
        may: { arrange: true, clear: false, load: false },
        moveRefusal: refused('not-attending'),
      }),
      {
        ...context,
        place: undefined,
        located: undefined,
        units: 'imperial',
        opened: { route: true },
      },
    );
    expect(byClass(popup, 'route')[0]?.attributes).not.toHaveProperty('hidden');
  });

  it('links only this server’s posts on Discord and Google Maps itself (8A-13)', () => {
    expect(
      safeHref('https://discord.com/channels/999999999999999999/1', ORIGIN, GUILD),
    ).toBeUndefined();
    expect(safeHref('https://www.google.com/mapsx/evil', ORIGIN, GUILD)).toBeUndefined();
    expect(safeHref(MAPS, ORIGIN, GUILD)).toBe(MAPS);
  });

  it('offers no Report raid at a gym that shows its raid, only a spawn, a meetup and a train (8A-2)', () => {
    const boxes = gymWithRaidBoxes(4);
    expect(
      boxes
        .flatMap((box) => all(box))
        .filter((one) => one.tag === 'button')
        .map((one) => one.text),
    ).toEqual(['Report spawn here', 'Hold meetup here', 'Start train here']);
  });
});

describe('mapLine', () => {
  it('says the distance only from where the member is', () => {
    const line = mapLine({ lat: 40.05, lon: -80.05 }, LINK, undefined, 'metric');
    expect(seen(line)).toBe('Directions · Open on Discord');
    expect(all(line).find((one) => one.text === 'Directions')?.attributes?.href).toBe(
      'https://www.google.com/maps/dir/?api=1&destination=40.05,-80.05',
    );
    expect(seen(mapLine(undefined, LINK, undefined, 'metric'))).toBe('Open on Discord');
  });
});

describe('raidChoices', () => {
  it('lists each raid at a gym by its heading, each opening its own post', () => {
    const list = raidChoices('Library', [
      { id: 'r1', picture: '/eggs/egg-5.png', heading: 'Level 5 raid (egg)', time: 'hatches 2:40' },
      { id: 'r2', picture: 'javascript:x', heading: 'Elite raid (egg)', time: 'egg' },
    ]);
    expect(seen(list)).toBe('LibraryLevel 5 raid (egg)hatches 2:40Elite raid (egg)egg');
    expect(buttonsOf(list).map((one) => one.attributes?.['data-show-raid'])).toEqual(['r1', 'r2']);
    expect(
      all(list)
        .filter((one) => one.tag === 'img')
        .map((one) => one.attributes?.src),
    ).toEqual(['/eggs/egg-5.png']);
  });
});

// Plan 8M-21: the post's Manage… of a raid and of a meetup opens the map's form, as Discord's
// opens its dialog; the member's part has none of its own any more.
describe('the post’s Manage… of a raid and a meetup on the map', () => {
  const manageView: PostView = {
    key: 'k',
    accent: 'egg',
    blocks: [
      {
        type: 'controls',
        rows: [
          [button({ name: 'Manage…', label: 'Manage…', does: { kind: 'panel', panel: 'manage' } })],
        ],
      },
    ],
  };
  const meetup = (more: Partial<MapMeetup> = {}): MapMeetup => ({
    kind: 'meetup',
    id: 'm1',
    name: 'Picnic',
    startTime: null,
    endTime: null,
    link: LINK,
    attendance: attendance(),
    postKey: 'k',
    place: null,
    info: null,
    panel: null,
    ...more,
  });
  const placed = { ...context, place: undefined, located: undefined, units: 'imperial' as const };
  const manage = (party: MapRaid | MapMeetup) =>
    buttonsOf(postPopup(manageView, party, placed)).filter((one) => one.text === 'Manage…');

  it('opens a raid’s form for whoever may change it, as Set time… does', () => {
    expect(manage(raid({ mayChange: true })).map((one) => one.attributes)).toEqual([
      expect.objectContaining({ 'data-change-raid': 'r1' }),
    ]);
    expect(manage(raid())[0]?.attributes).toHaveProperty('data-on-discord');
  });

  it('opens a meetup’s editor for its maker and staff, and says why not to anybody else', () => {
    expect(manage(meetup({ panel: { start: true } })).map((one) => one.attributes)).toEqual([
      expect.objectContaining({ 'data-edit-meetup': 'm1' }),
    ]);
    expect(manage(meetup())[0]?.attributes).toMatchObject({
      'data-on-discord': 'manage',
      'data-why': MEETUP_NOT_YOURS,
    });
    // Nothing while read-only, as everything that may be pressed.
    expect(
      manage(meetup({ attendance: attendance({ count: false }) }))[0]?.attributes,
    ).toHaveProperty('disabled');
  });
});
