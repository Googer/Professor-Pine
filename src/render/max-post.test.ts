import { describe, expect, it } from 'vitest';
import { catalogueFixture } from '../../test/support/game-data.js';
import {
  accentOf,
  buttonNames,
  textDisplays,
  textOf,
  thumbnailOf,
  thumbnailsOf,
} from '../../test/support/messages.js';
import {
  ALICE,
  at,
  BOB,
  CAROL,
  PARTY_NOW,
  PARTY_ZONE,
  TEST_PIN,
  TEST_SPOT,
  testMax,
  withAttendees,
} from '../../test/support/parties.js';
import { expectSendable } from '../../test/support/post-limits.js';
import { keptRow } from '../../test/support/wayspot-cases.js';
import { endParty, type MaxParty } from '../domain/party/party.js';
import { PartyStatus } from '../domain/party/status.js';
import {
  maxLook,
  maxTags,
  maxTitle,
  renderMaxPost,
  UNCERTAIN_MAX_TIME,
  type MaxPostView,
} from './max-post.js';
import { roleLines, withoutRoles } from '../../test/support/post-roles.js';
import { ENDED_COLOUR, KEPT_OPEN, postMessage } from './party-post.js';
import { renderRegionLink } from './summary.js';

const teams = { instinct: '⚡', mystic: '❄️', valor: '🔥' };
const emoji = { shiny: '✨', remote: '🛰️', teams };
const catalogue = catalogueFixture();
const stamp = (time: number, style = 't') => `<t:${time / 1000}:${style}>`;
const machamp = catalogue.byKey('machamp');
const END = at('2026-10-13T21:00');

function view(party: MaxParty, extra: Partial<MaxPostView> = {}): MaxPostView {
  return {
    party,
    now: PARTY_NOW,
    zone: PARTY_ZONE,
    boss: {
      name: 'Machamp',
      ...(machamp ? { entry: machamp } : {}),
      shiny: false,
      image: 'https://example.test/machamp.png',
    },
    catalogue,
    emoji,
    lobbySize: party.max.tier === 'G' ? 100 : 4,
    splitLobby: null,
    ...extra,
  };
}

const post = (party: MaxParty, extra: Partial<MaxPostView> = {}) =>
  renderMaxPost(view(party, extra));

describe('renderMaxPost: the heading (design 3.3)', () => {
  it('names a Dynamax battle by its boss and stars, with its end, types and weaknesses', () => {
    const [heading = ''] = textDisplays(post(testMax()).message);
    const lines = heading.split('\n');
    expect(lines[0]).toBe('### Dynamax Machamp (2★)');
    expect(lines[1]).toBe(`Until ${stamp(END)} (${stamp(END, 'R')}).`);
    expect(lines[2]).toBe('**Types** Fighting');
    expect(lines[3]).toMatch(/^\*\*Weaknesses\*\* /);
    // The catch CP at level 20, never boosted, without weather (plan 8F-1); no moves (Matt:
    // random from the pool).
    const cp = machamp ? catalogue.maxCatchCp(machamp) : { min: 0, max: 0 };
    expect(lines[4]).toBe(`**Catch CP** ${cp.min}–${cp.max}`);
    expect(lines).toHaveLength(5);
    expect(heading).not.toMatch(/Moveset/);
  });

  it('shows no boss lines for a boss without a catalogue entry', () => {
    const [heading = ''] = textDisplays(
      post(testMax(), { boss: { name: 'Newmon', shiny: false } }).message,
    );
    expect(heading).not.toMatch(/Types|Weaknesses|Catch CP/);
  });

  it('names a Gigantamax battle without stars, its picture beside the heading', () => {
    const giga = testMax({ tier: 'G' });
    const rendered = post(giga, {
      boss: { name: 'Machamp', shiny: true, image: 'https://example.test/gmax.png' },
    });
    expect(textDisplays(rendered.message)[0]?.split('\n')[0]).toBe('### Gigantamax Machamp ✨');
    expect(thumbnailOf(rendered.message)).toBe('https://example.test/gmax.png');
  });

  it('says when it ended, and is shown ended once its end has passed', () => {
    const rendered = post(testMax(), { now: END });
    expect(textDisplays(rendered.message)[0]?.split('\n')[1]).toBe(`Ended at ${stamp(END, 'f')}.`);
    expect(accentOf(rendered.message)).toBe(ENDED_COLOUR);
    expect(rendered.tags).toEqual(['Max battle', 'Ended']);
    expect(post(testMax()).tags).toEqual(['Max battle']);
  });

  it('says that an end from a screenshot is a guess, naming /end alone, until it is over', () => {
    const guessed = testMax({ screenshot: { id: 'abcdefghijkl', timeUncertain: true } });
    const lines = textDisplays(post(guessed).message)[0]?.split('\n') ?? [];
    expect(lines[1]).toBe(`Until ${stamp(END)} (${stamp(END, 'R')}).`);
    expect(lines[2]).toBe(UNCERTAIN_MAX_TIME);
    expect(UNCERTAIN_MAX_TIME).toContain('`/end`');
    expect(UNCERTAIN_MAX_TIME).not.toContain('/hatch');
    // A stale moment that is sure is exact (decision 7): only one not known is a guess (S-6).
    expect(UNCERTAIN_MAX_TIME).not.toMatch(/a while before/);
    expect(UNCERTAIN_MAX_TIME).toMatch(/when the screenshot was taken/);
    // Confirmed, or over: not said.
    const sure = testMax({ screenshot: { id: 'abcdefghijkl', timeUncertain: false } });
    expect(textOf(post(sure).message)).not.toContain(UNCERTAIN_MAX_TIME);
    expect(textOf(post(guessed, { now: END }).message)).not.toContain(UNCERTAIN_MAX_TIME);
  });

  it('says why when staff closed it, and that a moderator keeps it open', () => {
    const closed = post(testMax(), { closed: 'Closed by a moderator.' });
    expect(textDisplays(closed.message)[0]?.split('\n')[1]).toBe('Closed by a moderator.');
    expect(closed.tags).toEqual(['Max battle', 'Ended']);
    expect(textOf(post({ ...testMax(), saved: true }).message)).toContain(KEPT_OPEN);
  });
});

describe('renderMaxPost: Where', () => {
  it('shows a Power Spot as a known place, with its address, Map and picture', () => {
    const spot = { ...TEST_SPOT, image: 'https://lh3.googleusercontent.com/spot' };
    const rendered = post(testMax({ spot }));
    const where = textDisplays(rendered.message).find((text) => text.startsWith('**Where**'));
    expect(where).toBe(
      '**Where**\n**Gazebo of the Park** (Power Spot) · 1 Park Lane · ' +
        '[Map](<https://www.google.com/maps/search/?api=1&query=40.0005%2C-80.0005>)',
    );
    expect(thumbnailsOf(rendered.message)).toContain('https://lh3.googleusercontent.com/spot=s400');
  });

  it('shows the Power Spot as it is now while it is the same place', () => {
    const now = keptRow(1, {
      id: TEST_SPOT.id,
      kind: 'powerspot',
      title: 'Gazebo of the Old Park',
      lat: TEST_SPOT.lat,
      lon: TEST_SPOT.lon,
    });
    const rendered = post(testMax(), { wayspot: (id) => (id === TEST_SPOT.id ? now : undefined) });
    expect(textOf(rendered.message)).toContain('**Gazebo of the Old Park** (Power Spot)');
  });

  it('shows a pin as an unlisted power spot with its Map', () => {
    const rendered = post(testMax({ spot: TEST_PIN }));
    const where = textDisplays(rendered.message).find((text) => text.startsWith('**Where**'));
    expect(where).toBe(
      '**Where**\n📍 **Unlisted power spot** · ' +
        '[Map](<https://www.google.com/maps/search/?api=1&query=40.002%2C-80.002>)',
    );
  });
});

describe('maxLook: a max battle on the live map (plan 8X-5)', () => {
  it('gives the boss and picture the post shows, and the spot as it is now while it is the same place', () => {
    const now = keptRow(1, {
      id: TEST_SPOT.id,
      kind: 'powerspot',
      title: 'Gazebo of the Old Park',
      lat: TEST_SPOT.lat,
      lon: TEST_SPOT.lon,
      address: null,
    });
    expect(maxLook(view(testMax()))).toEqual({
      picture: 'https://example.test/machamp.png',
      boss: 'Machamp',
      place: { name: 'Gazebo of the Park', lat: 40.0005, lon: -80.0005, address: '1 Park Lane' },
      spotId: TEST_SPOT.id,
    });
    const renamed = view(testMax(), { wayspot: (id) => (id === TEST_SPOT.id ? now : undefined) });
    expect(maxLook(renamed).place).toEqual({
      name: 'Gazebo of the Old Park',
      lat: 40.0005,
      lon: -80.0005,
      address: null,
    });
  });

  it("gives the Power Spot's address as the kept Wayspots word it, a looked-up one too", () => {
    const now = keptRow(1, {
      id: TEST_SPOT.id,
      kind: 'powerspot',
      title: 'Gazebo of the Park',
      lat: TEST_SPOT.lat,
      lon: TEST_SPOT.lon,
      address: null,
    });
    const looked = view(testMax(), {
      wayspot: (id) => (id === TEST_SPOT.id ? now : undefined),
      addressOf: (wayspot) => (wayspot.id === TEST_SPOT.id ? '600 Grant St, Pittsburgh' : ''),
    });
    expect(maxLook(looked).place.address).toBe('600 Grant St, Pittsburgh');
  });

  it('gives a pin as an unlisted power spot, with no spot and no address', () => {
    expect(maxLook(view(testMax({ spot: TEST_PIN })))).toMatchObject({
      place: { name: 'Unlisted power spot', lat: 40.002, lon: -80.002, address: null },
      spotId: null,
    });
  });
});

describe('renderMaxPost: groups, controls and the rest', () => {
  it('counts each group against its lobby, and has Done but no Set time', () => {
    const party = withAttendees(testMax(), {
      [ALICE]: { status: PartyStatus.Coming, number: 3, name: 'Alice' },
      [BOB]: { status: PartyStatus.Present, name: 'Bob', group: 'B' },
      [CAROL]: { status: PartyStatus.Interested, name: 'Carol', group: 'B' },
    });
    const twoGroups: MaxParty = { ...party, groups: [{ id: 'A' }, { id: 'B' }] };
    const text = textOf(post(twoGroups).message);
    expect(text).toContain('**Group A** · 3/4 coming');
    expect(text).toContain('**Group B** · 1/4 coming · 1 interested');
    const names = buttonNames(post(twoGroups).message);
    expect(names).toContain('🎉');
    expect(names).not.toContain('Set time…');
    expect(names).not.toContain('Screenshot feedback');
    expect(names).toContain('📡');
  });

  it('is titled by its boss and spot, and its link line names a max battle', () => {
    expect(maxTitle(view(testMax()))).toBe('Dynamax Machamp (2★) · Gazebo of the Park');
    expect(maxTitle(view(testMax({ spot: TEST_PIN, tier: 'G' })))).toBe(
      'Gigantamax Machamp · Unlisted power spot',
    );
    // Eternatus's battle is Eternamax in its title, as on the game's screen.
    const eternatus = view(
      testMax({ spot: TEST_PIN, tier: 'G', boss: { key: 'eternatus_eternamax' } }),
      {
        boss: { name: 'Eternatus (Eternamax)', shiny: false },
      },
    );
    expect(maxTitle(eternatus)).toBe('Eternamax Eternatus · Unlisted power spot');
    expect(textDisplays(renderMaxPost(eternatus).message)[0]?.split('\n')[0]).toBe(
      '### Eternamax Eternatus',
    );
    expect(renderRegionLink('300000000000000001', 'max')).toBe(
      'New max battle: <#300000000000000001>',
    );
    expect(maxTags(testMax(), PARTY_NOW)).toEqual(['Max battle']);
  });

  it('names who reported it unless they asked not to be named', () => {
    const named = { ...testMax(), makerName: 'Rita' };
    expect(textOf(post(named).message)).toContain('-# Reported by **Rita**');
    expect(textOf(post({ ...named, anonymous: true }).message)).not.toContain('Reported by');
  });

  it('says in brief what it is, when it ends, where and how many come, with its Map', () => {
    const { brief } = post({ ...testMax(), makerName: 'Rita' });
    expect(brief.lines).toEqual([
      '**Dynamax Machamp (2★)**',
      `Until ${stamp(END)} (${stamp(END, 'R')}).`,
      '**Gazebo of the Park** (Power Spot) · 1 Park Lane',
      '1 trainer',
    ]);
    expect(brief.whereLine).toBe('**Gazebo of the Park** (Power Spot) · 1 Park Lane');
    expect(brief.map).toBe('https://www.google.com/maps/search/?api=1&query=40.0005%2C-80.0005');
    expect(brief.picture).toBe('https://example.test/machamp.png');
  });

  it('fits Discord with every copy, at its worst', () => {
    const many = Object.fromEntries(
      Array.from({ length: 60 }, (_, n) => [
        `2000000000000001${String(n).padStart(2, '0')}`,
        {
          status: PartyStatus.Coming,
          name: '*_`~|>'.repeat(5).slice(0, 32),
          group: (['A', 'B', 'C', 'D', 'E'] as const)[n % 5],
          remote: true,
          number: 3,
        },
      ]),
    );
    // Review B, B10: the spot's picture, an address that is all escapes, a reporter's name too.
    const spot = {
      ...TEST_SPOT,
      title: '*'.repeat(255),
      address: '*_`~|>'.repeat(84).slice(0, 500),
      image: `https://lh3.googleusercontent.com/${'a'.repeat(1900)}`,
    };
    const party: MaxParty = {
      ...withAttendees(testMax({ spot }), many),
      makerName: '*_`~|>'.repeat(6).slice(0, 32),
      groups: (['A', 'B', 'C', 'D', 'E'] as const).map((id) => ({ id, label: '_'.repeat(100) })),
    };
    expect(thumbnailsOf(post(party).message)).toHaveLength(2);
    expect(textOf(post(party).message)).toContain('-# Reported by ');
    expectSendable(post(party));
    expectSendable(post(endParty(party), { now: END }));
    // The boss whose lines are longest as the heading draws them (types, weaknesses and the
    // catch CP; plan 8F-1), named at length, with every copy.
    const width = (entry: (typeof catalogue.all)[number]) =>
      textDisplays(post(testMax(), { boss: { name: 'X', entry, shiny: false } }).message)[0]
        ?.length ?? 0;
    const [widest] = catalogue.all
      .map((entry) => ({ entry, width: width(entry) }))
      .sort((a, b) => b.width - a.width)
      .map(({ entry }) => entry);
    if (!widest) throw new Error('no Pokémon');
    const boss = { name: '*'.repeat(100), entry: widest, shiny: true, image: 'https://x.test/a' };
    expect(textOf(post(party, { boss }).message)).toContain('**Catch CP**');
    expectSendable(post(party, { boss }));
    expectSendable(post(endParty(party), { now: END, boss }));
  });
});

describe('the roles of a max battle post’s blocks (plan 8M-8A)', () => {
  it('marks its heading, Where, trainers and small print, which its message does not show', () => {
    const party = withAttendees(testMax(), { [ALICE]: { name: 'Alice' } });
    const rendered = post(party);
    expect(roleLines(rendered.layout)).toEqual([
      ['head', '### Dynamax Machamp (2★)'],
      ['where', '**Where**'],
      ['trainers', '1/4 coming · 1 interested'],
      ['note', expect.stringMatching(/^-# Reported by /u)],
    ]);
    expect(postMessage(rendered.layout)).toEqual(postMessage(withoutRoles(rendered.layout)));
  });
});
