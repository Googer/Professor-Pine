import { describe, expect, it } from 'vitest';
import { sectionsOf, textDisplays } from '../../test/support/messages.js';
import { testRaid, withAttendees } from '../../test/support/parties.js';
import type { Attendee, GroupId, RaidParty } from '../domain/party/party.js';
import { PartyStatus } from '../domain/party/status.js';
import {
  LOBBY_OVER,
  postMessage,
  trainerBlocks,
  type Fit,
  type PostBlock,
  type PostEmoji,
} from './party-post.js';

const { Interested, Coming, Present, CompletePending, Complete } = PartyStatus;
const emoji: PostEmoji = {
  shiny: '✨',
  remote: '📡',
  teams: { instinct: '⚡', mystic: '❄️', valor: '🔥' },
};
const all: Fit = { list: (items) => items.join(', '), part: (make) => make(Infinity) };
const ALL = { complete: true, lobby: true, meetHint: false };
const shown = (blocks: PostBlock[]) => postMessage({ accent: 1, blocks });
const contents = (blocks: PostBlock[]) =>
  blocks.map((block) => (block.type === 'text' || block.type === 'section' ? block.content : ''));
/** The first line of each block. */
const headings = (blocks: PostBlock[]) => contents(blocks).map((text) => text.split('\n')[0]);

function raidOf(
  attendees: Record<string, Partial<Attendee>>,
  groups: GroupId[] = ['A'],
): RaidParty {
  const raid = testRaid();
  return withAttendees(
    { ...raid, attendees: {}, groups: groups.map((id) => ({ id })), defaultGroupId: 'A' },
    attendees,
  );
}

describe('trainerBlocks with a lobby size', () => {
  it('heads one group with its committed heads over the size, and who is interested', () => {
    const party = raidOf({
      '300000000000000001': { name: 'Ann', status: Coming, number: 2, remote: true },
      '300000000000000002': { name: 'Bea', status: Present },
      '300000000000000003': { name: 'Cid', status: Interested },
      '300000000000000004': { name: 'Dot', status: Complete, number: 3 },
    });
    const blocks = trainerBlocks({ party, emoji, lobbySize: 4 }, ALL, all);
    // The status lines stay as they are, under it.
    expect(contents(blocks)).toEqual([
      '3/4 coming · 1 interested\n' +
        '🤔 Interested (1): Cid\n🏃 Coming (2): Ann +1 📡\n✅ Here (1): Bea\n🎉 Done (3): Dot +2',
    ]);
    expect(sectionsOf(shown(blocks))).toEqual([]);
  });

  it('leaves out who is interested when nobody is, and names the group when it has a label', () => {
    const party = raidOf({ '300000000000000001': { name: 'Ann', status: Coming } });
    expect(headings(trainerBlocks({ party, emoji, lobbySize: 4 }, ALL, all))[0]).toBe('1/4 coming');
    const labelled = { ...party, groups: [{ id: 'A' as const, label: 'north' }] };
    expect(headings(trainerBlocks({ party: labelled, emoji, lobbySize: 4 }, ALL, all))[0]).toBe(
      '**Group A: north** · 1/4 coming',
    );
  });

  it('says a group over its size could lose somebody to another group', () => {
    const party = raidOf({
      '300000000000000001': { name: 'Ann', status: Coming, number: 3 },
      '300000000000000002': { name: 'Bea', status: CompletePending, pendingUntil: 1, number: 2 },
      '300000000000000003': { name: 'Cid', status: Interested },
    });
    expect(LOBBY_OVER).toBe('Over the lobby size: someone should move to another group.');
    expect(contents(trainerBlocks({ party, emoji, lobbySize: 4 }, ALL, all))[0]).toMatch(
      new RegExp(`^5/4 coming · 1 interested\\n${LOBBY_OVER}\\n🤔 Interested`),
    );
  });

  it('heads each of several groups so, the note over the size under it', () => {
    const party = raidOf(
      {
        '300000000000000001': { name: 'Ann', status: Coming, number: 4 },
        '300000000000000002': { name: 'Bea', status: Interested, group: 'A' },
        '300000000000000003': { name: 'Cid', status: Present, group: 'B', number: 5 },
      },
      ['A', 'B', 'C'],
    );
    const message = shown(trainerBlocks({ party, emoji, lobbySize: 4 }, ALL, all));
    expect(sectionsOf(message)).toEqual([]);
    expect(textDisplays(message)).toEqual([
      '**Group A** · 4/4 coming · 1 interested\n🤔 Interested (1): Bea\n🏃 Coming (4): Ann +3',
      `**Group B** · 5/4 coming\n${LOBBY_OVER}\n✅ Here (5): Cid +4`,
      '**Group C** · 0/4 coming\nNobody yet',
    ]);
  });

  it('tells a group of a raid to split up by the raid lobby of the settings', () => {
    const crowd: Record<string, Partial<Attendee>> = {};
    for (let n = 0; n < 4; n++) crowd[`31000000000000000${n}`] = { number: 3 };
    const party = raidOf(crowd);
    const second = (blocks: PostBlock[]) => contents(blocks)[0]?.split('\n')[1];
    expect(second(trainerBlocks({ party, emoji, splitLobby: 11 }, ALL, all))).toBe(
      'More than 11 trainers: a lobby holds 11, so split up.',
    );
    // Not over it: no note; and without the setting, the game's 20.
    expect(second(trainerBlocks({ party, emoji, splitLobby: 12 }, ALL, all))).toMatch(/^🏃/);
    expect(second(trainerBlocks({ party, emoji }, ALL, all))).toMatch(/^🏃/);
  });

  it('tells no group to split up where the kind of party has no such size', () => {
    const crowd: Record<string, Partial<Attendee>> = {};
    for (let n = 0; n < 7; n++) crowd[`31000000000000000${n}`] = { number: 3 };
    const party = raidOf(crowd);
    expect(contents(trainerBlocks({ party, emoji }, ALL, all))[0]).toContain(
      '\nMore than 20 trainers: a lobby holds 20, so split up.\n',
    );
    expect(contents(trainerBlocks({ party, emoji, splitLobby: null }, ALL, all))[0]).not.toContain(
      'split up',
    );
  });

  it('tells a sized group of more than a raid lobby only that it is over its size', () => {
    const crowd: Record<string, Partial<Attendee>> = {};
    for (let n = 0; n < 7; n++) crowd[`31000000000000000${n}`] = { number: 3 };
    const party = raidOf(crowd, ['A', 'B']);
    const blocks = trainerBlocks({ party, emoji, lobbySize: 4 }, ALL, all);
    const texts = textDisplays(shown(blocks));
    expect(texts[0]).toMatch(
      new RegExp(`^\\*\\*Group A\\*\\* · 21/4 coming\\n${LOBBY_OVER}\\n🏃 Coming \\(21\\): `),
    );
    expect(texts.join('\n')).not.toContain('so split up');
    const one = trainerBlocks({ party: raidOf(crowd), emoji, lobbySize: 4 }, ALL, all);
    expect(contents(one)[0]).toMatch(new RegExp(`^21/4 coming\\n${LOBBY_OVER}\\n`));
  });

  it('shows the post of today without a size', () => {
    const party = raidOf({ '300000000000000001': { name: 'Ann', status: Coming, number: 4 } }, [
      'A',
      'B',
    ]);
    expect(headings(trainerBlocks({ party, emoji }, ALL, all))[0]).toBe('**Group A** · 4 trainers');
    const one = raidOf({ '300000000000000001': { name: 'Ann', status: Coming } });
    expect(headings(trainerBlocks({ party: one, emoji }, ALL, all))[0]).toBe('1 trainer');
  });
});
