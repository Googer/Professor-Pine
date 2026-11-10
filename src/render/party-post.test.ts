import { ComponentType } from 'discord.js';
import { describe, expect, it } from 'vitest';
import {
  accentOf,
  buttonLabels,
  buttonNames,
  componentCount,
  customIdsOf,
  sectionsOf,
  textDisplays,
  textOf,
  thumbnailOf,
  v2,
} from '../../test/support/messages.js';
import { FakePartyGateway } from '../../test/support/fake-gateway.js';
import { testRaid, withAttendees } from '../../test/support/parties.js';
import type { Attendee } from '../domain/party/party.js';
import { PartyStatus } from '../domain/party/status.js';
import { moveTrainButton, statusButton } from './party-controls.js';
import {
  attendeeTexts,
  fitLists,
  cutText,
  fittedLayout,
  inShownOrder,
  layoutTextLength,
  LEAD_ROOM,
  postMessage,
  TEXT_BUDGET,
  trainerBlocks,
  type Fit,
  type PostBlock,
  type PostEmoji,
  type PostLayout,
} from './party-post.js';

const teams = { instinct: '⚡', mystic: '❄️', valor: '🔥' };
const party = withAttendees(testRaid(), {
  '300000000000000001': { name: 'Ann' },
  '300000000000000002': { name: 'Bea' },
  '300000000000000003': { name: 'Cid', team: 'mystic' },
  '300000000000000004': { name: 'Dot', team: 'mystic', number: 2 },
  '300000000000000005': { name: 'Eve', team: 'valor', remote: true },
});
const ids = inShownOrder(
  party,
  Object.keys(party.attendees).filter((id) => id.startsWith('3')),
);

describe('attendeeTexts', () => {
  it('writes the emoji of a team once, before the first of its members', () => {
    const emoji: PostEmoji = { shiny: '✨', remote: '📡', teams };
    expect(attendeeTexts(party, ids, emoji)).toEqual([
      'Ann',
      'Bea',
      '❄️ Cid',
      'Dot +1',
      '🔥 Eve 📡',
    ]);
  });

  it('marks the members without a team only where there is a teamless emoji', () => {
    const emoji: PostEmoji = { shiny: '✨', remote: '📡', teams, teamless: '<:teamless:1>' };
    expect(attendeeTexts(party, ids, emoji)).toEqual([
      '<:teamless:1> Ann',
      'Bea',
      '❄️ Cid',
      'Dot +1',
      '🔥 Eve 📡',
    ]);
  });
});

describe('postMessage', () => {
  const join = statusButton({ id: 'p1' }, 'coming', {});
  const move = moveTrainButton({ id: 'p1' });
  const layout: PostLayout = {
    accent: 0x2ecc71,
    picture: 'https://x.test/boss.png',
    blocks: [
      { type: 'section', content: '### Title', accessory: 'picture' },
      { type: 'separator' },
      { type: 'section', content: '**Coming (0)**', accessory: join },
      { type: 'section', content: '**Current gym**', accessory: move },
      { type: 'separator' },
      { type: 'controls', rows: [[statusButton({ id: 'p1' }, 'present', {})]] },
    ],
  };

  it('is one container of the post’s colour, a picture and buttons beside their texts', () => {
    const message = postMessage(layout);
    expect(accentOf(message)).toBe(0x2ecc71);
    expect(thumbnailOf(message)).toBe('https://x.test/boss.png');
    expect(textDisplays(message)).toEqual(['### Title', '**Coming (0)**', '**Current gym**']);
    expect(buttonNames(message)).toEqual(['🏃', 'Move…', '✅']);
    // Container; 3 sections of 2 each with their texts; 2 lines; a row and its button.
    expect(componentCount(message)).toBe(1 + 9 + 2 + 2);
  });

  it('leaves out the picture, the controls or the move button, keeping every text', () => {
    expect(thumbnailOf(postMessage(layout, { picture: false }))).toBeUndefined();
    const last = postMessage(layout, { controls: false });
    expect(buttonLabels(last)).toEqual([]);
    expect(textDisplays(last)).toEqual(['### Title', '**Coming (0)**', '**Current gym**']);
    expect(thumbnailOf(last)).toBe('https://x.test/boss.png');
    expect(buttonNames(postMessage(layout, { move: false }))).toEqual(['🏃', '✅']);
  });

  it('shows a part with a picture of its own as its text without the picture, or not at all', () => {
    const pictured = (withoutPicture?: string | null): PostLayout => ({
      accent: 1,
      blocks: [
        { type: 'text', content: '### Title' },
        {
          type: 'section',
          content: '**About**\nOnly beside the picture',
          accessory: { thumbnail: 'https://x.test/gym.png', withoutPicture },
        },
      ],
    });
    // With the picture, the text as it is.
    expect(textDisplays(postMessage(pictured(null)))).toEqual([
      '### Title',
      '**About**\nOnly beside the picture',
    ]);
    // Without it: the same text, another text, or nothing.
    expect(textDisplays(postMessage(pictured(), { picture: false }))).toEqual([
      '### Title',
      '**About**\nOnly beside the picture',
    ]);
    expect(textDisplays(postMessage(pictured('**About**'), { picture: false }))).toEqual([
      '### Title',
      '**About**',
    ]);
    expect(textDisplays(postMessage(pictured(null), { picture: false }))).toEqual(['### Title']);
    // And where the picture would make the message too large.
    const row = [1, 2, 3, 4, 5].map(() => statusButton({ id: 'p1' }, 'present', {}));
    const crowded: PostLayout = {
      ...pictured(null),
      blocks: [
        ...pictured(null).blocks,
        { type: 'controls', rows: [row, row, row, row, row, row, row] },
      ],
    };
    const message = postMessage(crowded);
    expect(thumbnailOf(message)).toBeUndefined();
    expect(textDisplays(message)).toEqual(['### Title']);
  });

  it('puts what stands under a button’s text back beside it, last first, past the limit', () => {
    const group = (id: string): PostBlock => ({
      type: 'section',
      content: `**Group ${id}**`,
      details: `Coming (1): ${id}${id}`,
      accessory: statusButton({ id: 'p1' }, 'coming', {}),
    });
    const row = [1, 2, 3, 4, 5].map(() => statusButton({ id: 'p1' }, 'present', {}));
    /** Four rows of five buttons, and a row of `more` buttons when there are any. */
    const crowded = (more: number): PostLayout => ({
      accent: 1,
      blocks: [
        {
          type: 'section',
          content: '**Where**',
          accessory: { thumbnail: 'https://x.test/gym.png' },
        },
        group('A'),
        group('B'),
        group('C'),
        {
          type: 'controls',
          rows: [row, row, row, row, ...(more > 0 ? [row.slice(0, more)] : [])],
        },
      ],
    });
    // Container 1, the gym's section 3, three groups of 3 and a text each: 1 + 3 + 12 = 16, and
    // four rows of six: 40.
    const roomy = postMessage(crowded(0));
    expect(componentCount(roomy)).toBe(40);
    expect(sectionsOf(roomy).map((part) => part.text)).toEqual([
      '**Where**',
      '**Group A**',
      '**Group B**',
      '**Group C**',
    ]);
    // A row of one more (two components): the last two groups' members go back into their
    // sections, as few as make it fit, and the gym keeps its picture.
    const full = postMessage(crowded(1));
    expect(componentCount(full)).toBe(40);
    expect(sectionsOf(full).map((part) => part.text)).toEqual([
      '**Where**',
      '**Group A**',
      '**Group B**\nComing (1): BB',
      '**Group C**\nComing (1): CC',
    ]);
    expect(thumbnailOf(full)).toBe('https://x.test/gym.png');
    expect(textOf(full)).toBe(textOf(roomy));
    // Still too many with every group's members back beside their buttons: the picture goes.
    const over = postMessage(crowded(3));
    expect(componentCount(over)).toBeLessThanOrEqual(40);
    expect(thumbnailOf(over)).toBeUndefined();
    // Without its button a text and what stands under it are one text.
    expect(textDisplays(postMessage(crowded(0), { controls: false })).slice(1)).toEqual([
      '**Group A**\nComing (1): AA',
      '**Group B**\nComing (1): BB',
      '**Group C**\nComing (1): CC',
    ]);
  });

  it('carries the file its picture names, and says it carries none otherwise', () => {
    const carried: PostLayout = {
      ...layout,
      picture: 'attachment://raid_egg_2_icon.png',
      pictureFile: '/bot/pictures/eggs/raid_egg_2_icon.png',
    };
    const message = postMessage(carried);
    expect(thumbnailOf(message)).toBe('attachment://raid_egg_2_icon.png');
    expect(message.files).toEqual(['/bot/pictures/eggs/raid_egg_2_icon.png']);
    FakePartyGateway.checkMessage(message);
    // A copy carries it too; without its picture the message has no file, and says so, so that
    // an edit takes the one it had away.
    expect(postMessage(carried, { lead: 'A raid: <#1>' }).files).toEqual(message.files);
    expect(postMessage(carried, { picture: false }).files).toEqual([]);
    expect(postMessage(layout).files).toEqual([]);
  });

  it('puts the line of a copy first, in the first text: no component more than the post', () => {
    const copy = postMessage(layout, { lead: 'A raid: <#1>' });
    expect(textDisplays(copy)[0]).toBe('A raid: <#1>\n### Title');
    expect(componentCount(copy)).toBe(componentCount(postMessage(layout)));
    expect(thumbnailOf(copy)).toBe('https://x.test/boss.png');
  });

  it('never leaves a thin line first, last or twice', () => {
    const copy = postMessage(layout, { lead: 'A raid: <#1>', controls: false });
    const inner = v2(copy).components[0];
    const types =
      inner?.type === ComponentType.Container ? inner.components.map((part) => part.type) : [];
    expect(types.at(-1)).not.toBe(ComponentType.Separator);
    const lonely = postMessage({
      accent: 1,
      blocks: [
        { type: 'separator' },
        { type: 'text', content: 'a' },
        { type: 'separator' },
        { type: 'separator' },
        { type: 'text', content: 'b' },
        { type: 'separator' },
      ],
    });
    const parts = v2(lonely).components[0];
    expect(
      parts?.type === ComponentType.Container ? parts.components.map((part) => part.type) : [],
    ).toEqual([ComponentType.TextDisplay, ComponentType.Separator, ComponentType.TextDisplay]);
  });
});

describe('fitLists and fittedLayout', () => {
  it('shortens the longest list first, one member at a time, never to nothing', () => {
    const long = ['aaaaaaaaaa', 'bbbbbbbbbb', 'cccccccccc', 'dddddddddd'];
    const short = ['e', 'f'];
    const texts = fitLists([long, short], 30);
    expect(texts).toEqual(['aaaaaaaaaa, …and 3 more', 'e, f']);
    expect(fitLists([long, short], 0)).toEqual(['…and 4 more', '…and 2 more']);
    expect(fitLists([long], 1_000)).toEqual([long.join(', ')]);
  });

  it('lays a post out once more with the lists cut down by as much as it is over', () => {
    const names = Array.from({ length: 50 }, (_, i) => `Trainer ${String(i).padStart(2, '0')}`);
    const build = ({ list }: Fit): PostLayout => ({
      accent: 1,
      blocks: [
        { type: 'text', content: 'x'.repeat(100) },
        { type: 'text', content: `**Coming**\n${list(names)}` },
        { type: 'text', content: `**Here**\n${list(names.slice(0, 5))}` },
      ],
    });
    expect(layoutTextLength(fittedLayout(build))).toBeLessThan(TEXT_BUDGET - LEAD_ROOM);
    const fitted = fittedLayout(build, 400);
    expect(layoutTextLength(fitted)).toBeLessThanOrEqual(400);
    const texts = fitted.blocks.map((block) => (block.type === 'text' ? block.content : ''));
    expect(texts[1]).toMatch(/…and \d+ more$/);
    expect(texts[2]).toBe(`**Here**\n${names.slice(0, 5).join(', ')}`);
  });
});

describe('fittedLayout: the last resort', () => {
  it('cuts the longest of the other texts when the lists alone cannot make room', () => {
    const notes = '*'.repeat(1500);
    const build = ({ list, part }: Fit): PostLayout => ({
      accent: 1,
      blocks: [
        { type: 'text', content: `### ${part((room) => cutText(notes, room))}` },
        { type: 'text', content: `**Group A: ${part((room) => cutText('b'.repeat(900), room))}**` },
        { type: 'text', content: `**Coming**\n${list(['Ann', 'Bea'])}` },
      ],
    });
    const fitted = fittedLayout(build, 1000);
    expect(layoutTextLength(fitted)).toBeLessThanOrEqual(1000);
    const [title, group, coming] = fitted.blocks.map((block) =>
      block.type === 'text' ? block.content : '',
    );
    // The longest gave way first, down to the next longest, then both together.
    expect(title?.length).toBeLessThan(notes.length);
    expect(title).toMatch(/…$/);
    expect(group).toMatch(/…\*\*$/);
    // The lists are as short as they get first.
    expect(coming).toBe('**Coming**\n…and 2 more');
  });

  it('cuts a text at a whole character, never after a lone backslash, and marks the cut', () => {
    expect(cutText('abcdef', 10)).toBe('abcdef');
    expect(cutText('abcdef', 4)).toBe('abc…');
    expect(cutText('ab\\*cd', 4)).toBe('ab…');
    expect(cutText('abc', 0)).toBe('…');
    // An emoji at the cut goes whole or not at all: half of it is no character.
    expect(cutText('ab😀cd', 4)).toBe('ab…');
    expect(cutText('ab😀cd', 5)).toBe('ab😀…');
  });
});

describe('trainerBlocks', () => {
  const mixed = withAttendees(testRaid(), {
    '300000000000000001': { name: 'Ann' },
    '300000000000000002': { name: 'Bea' },
    '300000000000000003': { name: 'Cid', team: 'mystic' },
    '300000000000000004': { name: 'Dot', team: 'mystic', number: 2, status: PartyStatus.Present },
    '300000000000000005': {
      name: 'Eve',
      team: 'valor',
      remote: true,
      status: PartyStatus.CompletePending,
    },
  });
  const view = (raid = mixed, icons: Partial<PostEmoji> = {}) => ({
    party: raid,
    emoji: { shiny: '✨', remote: '📡', teams, ...icons } satisfies PostEmoji,
  });
  const all: Fit = { list: (items) => items.join(', '), part: (make) => make(Infinity) };
  const contents = (blocks: PostBlock[]) =>
    blocks.map((block) => (block.type === 'text' || block.type === 'section' ? block.content : ''));
  const ALL = { complete: true, lobby: true, meetHint: false };
  const HINT = { complete: true, lobby: true, meetHint: true };

  /** The blocks as a post shows them. */
  const shown = (blocks: PostBlock[]) => postMessage({ accent: 1, blocks });

  it('gives one group its head count and a line per status somebody is in, as text', () => {
    // Plan 8X-1B (Matt, 2026-10-20): the layout of several groups for one too, the buttons all
    // in the rows at the bottom; each line starts with its button's icon.
    const message = shown(trainerBlocks(view(), ALL, all));
    expect(sectionsOf(message)).toEqual([]);
    expect(textDisplays(message)).toEqual([
      '7 trainers\n' +
        '🤔 Interested (1): <@200000000000000001>\n' +
        '🏃 Coming (3): Ann, Bea, ❄️ Cid\n' +
        '✅ Here (3): ❄️ Dot +1, 🔥 Eve 📡',
    ]);
    // Who is done has a line of their own, last, where the raid can be completed.
    const done = withAttendees(mixed, {
      '300000000000000002': { name: 'Bea', status: PartyStatus.Complete },
    });
    expect(
      contents(trainerBlocks(view(done), ALL, all))[0]
        ?.split('\n')
        .at(-1),
    ).toBe('🎉 Done (1): Bea');
    expect(contents(trainerBlocks(view(done), { ...ALL, complete: false }, all))[0]).not.toContain(
      'Done',
    );
  });

  it("starts each line with the application's icon of its button where there is one", () => {
    const icons = { controlIcon: (name: string) => `<:${name}:1400823744760905729>` };
    expect(contents(trainerBlocks(view(mixed, icons), ALL, all))[0]?.split('\n')).toEqual([
      '7 trainers',
      '🤔 Interested (1): <@200000000000000001>',
      '<:pinejoin:1400823744760905729> Coming (3): Ann, Bea, ❄️ Cid',
      '<:pinehere:1400823744760905729> Here (3): ❄️ Dot +1, 🔥 Eve 📡',
    ]);
  });

  it('says so of one group nobody is in', () => {
    const nobody = { ...mixed, attendees: {} };
    expect(contents(trainerBlocks(view(nobody), ALL, all))).toEqual(['Nobody yet']);
  });

  it('names the one group in its heading when it has a label, and says its meeting time', () => {
    const labelled = {
      ...mixed,
      groups: [{ id: 'A' as const, label: 'park *side*', startTime: 1_800_000_000_000 }],
    };
    expect(contents(trainerBlocks(view(labelled), ALL, all))[0]?.split('\n')[0]).toBe(
      '**Group A: park \\*side\\*** · 7 trainers · meeting at <t:1800000000:t>',
    );
    const met = { ...mixed, groups: [{ id: 'A' as const, startTime: 1_800_000_000_000 }] };
    expect(contents(trainerBlocks(view(met), ALL, all))[0]?.split('\n')[0]).toBe(
      '7 trainers · meeting at <t:1800000000:t>',
    );
  });

  it('gives several groups a text each, and then who completed the raid', () => {
    const grouped = withAttendees(
      { ...mixed, groups: [{ id: 'A' as const }, { id: 'B' as const, label: 'late' }] },
      {
        '300000000000000002': { name: 'Bea', group: 'B' },
        '300000000000000004': {
          name: 'Dot',
          team: 'mystic',
          number: 2,
          status: PartyStatus.Complete,
        },
      },
    );
    const message = shown(trainerBlocks(view(grouped), ALL, all));
    expect(sectionsOf(message)).toEqual([]);
    expect(customIdsOf(message)).toEqual([]);
    expect(textDisplays(message)).toEqual([
      '**Group A** · 4 trainers\n' +
        '🤔 Interested (1): <@200000000000000001>\n🏃 Coming (2): Ann, ❄️ Cid\n✅ Here (1): 🔥 Eve 📡',
      '**Group B: late** · 1 trainer\n🏃 Coming (1): Bea',
      '🎉 Done (2): ❄️ Dot +1',
    ]);
    // A group without members says so under its heading.
    const empty = shown(
      trainerBlocks(
        view({ ...mixed, groups: [{ id: 'A' as const }, { id: 'B' as const }] }),
        ALL,
        all,
      ),
    );
    expect(textDisplays(empty)[1]).toBe('**Group B** · 0 trainers\nNobody yet');
  });

  it("says how to set a meeting time by Meet…'s icon while a group somebody is in has none", () => {
    const meet = {
      controlIcon: (name: string) =>
        name === 'pinemeet' ? '<:pinemeet:1400823744760905729>' : undefined,
    };
    expect(
      contents(trainerBlocks(view(mixed), HINT, all))[0]
        ?.split('\n')
        .at(-1),
    ).toBe('-# No meeting time yet: ⏰ sets one.');
    expect(
      contents(trainerBlocks(view(mixed, meet), HINT, all))[0]
        ?.split('\n')
        .at(-1),
    ).toBe('-# No meeting time yet: <:pinemeet:1400823744760905729> sets one.');
    const met = { ...mixed, groups: [{ id: 'A' as const, startTime: 1_800_000_000_000 }] };
    expect(contents(trainerBlocks(view(met), HINT, all)).join('\n')).not.toContain('-#');
    // Several groups: one line after them, naming the groups without one.
    const three = withAttendees(
      {
        ...mixed,
        groups: [
          { id: 'A' as const },
          { id: 'B' as const, startTime: 1_800_000_000_000 },
          { id: 'C' as const },
          { id: 'D' as const },
        ],
      },
      { '300000000000000002': { group: 'B' }, '300000000000000003': { group: 'C' } },
    );
    expect(contents(trainerBlocks(view(three), HINT, all)).at(-1)).toBe(
      "-# Groups A and C have no meeting time yet: ⏰ sets your group's.",
    );
    const two = { ...three, groups: three.groups.slice(0, 3) };
    const one = withAttendees(two, { '300000000000000003': { group: 'B' } });
    expect(contents(trainerBlocks(view(one), HINT, all)).at(-1)).toBe(
      "-# Group A has no meeting time yet: ⏰ sets your group's.",
    );
  });

  it('puts a big group’s lobby note under its heading with several groups', () => {
    const crowd: Record<string, Partial<Attendee>> = {};
    for (let n = 0; n < 7; n++) crowd[`31000000000000000${n}`] = { number: 3 };
    const crowded = withAttendees(
      { ...testRaid(), groups: [{ id: 'A' as const }, { id: 'B' as const }] },
      crowd,
    );
    const message = shown(trainerBlocks(view(crowded), ALL, all));
    expect(textDisplays(message)[0]).toMatch(
      /^\*\*Group A\*\* · 22 trainers\nMore than 20 trainers: a lobby holds 20, so split up\.\n🤔 Interested \(1\): /,
    );
  });

  it('tells a group bigger than a lobby to split up, where asked', () => {
    const crowd: Record<string, Partial<Attendee>> = {};
    for (let n = 0; n < 7; n++) crowd[`31000000000000000${n}`] = { number: 3 };
    const crowded = withAttendees(testRaid(), crowd);
    expect(
      contents(trainerBlocks(view(crowded), ALL, all))[0]
        ?.split('\n')
        .slice(0, 2),
    ).toEqual(['22 trainers', 'More than 20 trainers: a lobby holds 20, so split up.']);
  });
});
