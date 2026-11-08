import { describe, expect, it } from 'vitest';
import type { PageNode } from './popup.js';
import { badgeWords, timeLeft } from './raid-marker.js';
import { spawnName, spawnPopupKey } from './spawn-names.js';
import {
  nextSpawnEnd,
  spawnMarkerNode,
  spawnPlaced,
  spawnPopup,
  spawnsInView,
  spawnsShown,
} from './spawns.js';
import {
  CASE_ICONS as ICONS,
  CASE_NOW as NOW,
  CASE_ZONE as ZONE,
  caseSpawn as spawn,
  caseSpawns as view,
} from './stop-report-cases.js';
import { spawnLines } from './what-is-on.js';

const MINUTE = 60_000;

/** Every class name of a tree. */
const classes = (node: PageNode): string[] => [
  ...(node.className === undefined ? [] : node.className.split(' ')),
  ...(node.children ?? []).flatMap(classes),
];

/** Every text of a tree, in order. */
const texts = (node: PageNode): string[] => [
  ...(node.text === undefined ? [] : [node.text]),
  ...(node.children ?? []).flatMap(texts),
];

/** Every node of a tree with this tag. */
const tagged = (node: PageNode, tag: string): PageNode[] => [
  ...(node.tag === tag ? [node] : []),
  ...(node.children ?? []).flatMap((child) => tagged(child, tag)),
];

const where = { now: NOW, zone: ZONE, located: undefined, units: 'imperial' as const };

describe('the wild spawns on the map', () => {
  it('shows each spawn until it goes away, but the one whose popup is open', () => {
    const gone = spawn(2, { goneAt: NOW });
    const shown = view([spawn(1), gone]);
    expect(spawnsShown(shown, { now: NOW }).map((one) => one.id)).toEqual([spawn(1).id]);
    expect(spawnsShown(shown, { now: NOW, keep: new Set([gone.id]) }).map((one) => one.id)).toEqual(
      [spawn(1).id, gone.id],
    );
    expect(spawnsShown(undefined, { now: NOW })).toEqual([]);
    // Drawn anew when the next one goes away.
    expect(nextSpawnEnd(shown, NOW)).toBe(NOW + 20 * MINUTE);
    expect(nextSpawnEnd(view([gone]), NOW)).toBeUndefined();
  });

  it('names a spawn by its Pokémon, costumed where an event lists it so', () => {
    expect(spawnName(spawn(1))).toBe('Dratini');
    expect(spawnName(spawn(1, { pokemon: 'Pikachu', costumed: true }))).toBe('Costumed Pikachu');
  });

  it('draws a spawn as a marker of its picture in the Poké Ball color, its minutes left under it from street level, dimmed in its last minutes', () => {
    const full = spawnMarkerNode(spawn(1), NOW, 'full');
    expect(classes(full)).toEqual(['stop-marker', 'spawn', 'ring', 'badge']);
    expect(tagged(full, 'img')[0]?.attributes?.src).toBe(`${ICONS}pm147.icon.png`);
    expect(texts(full)).toEqual([badgeWords('end', NOW + 20 * MINUTE, NOW, 'UTC')]);
    expect(full.attributes).toEqual({
      'data-stage': 'hatched',
      'data-end': String(NOW + 20 * MINUTE),
    });
    const small = spawnMarkerNode(spawn(1), NOW, 'small');
    expect(classes(small)).toEqual(['stop-marker', 'spawn', 'size-small', 'ring']);
    // Without a picture: the Report menu's Poké Ball.
    const bare = spawnMarkerNode(spawn(1, { picture: undefined }), NOW, 'full');
    expect(classes(bare)).toContain('mask-spawn');
    const late = spawnMarkerNode(spawn(1, { goneAt: NOW + 2 * MINUTE }), NOW, 'full');
    expect(classes(late)).toContain('dim');
  });

  it('counts the spawns drawn in view, and places one in the list of the things at one place', () => {
    const inView = spawnsInView(
      [spawn(1), spawn(2, { point: null }), spawn(3)],
      (point) => point.lat < spawn(3).point!.lat,
    );
    expect(inView).toBe(1);
    expect(spawnPlaced(spawn(1), NOW)).toEqual({
      key: spawnPopupKey(spawn(1).id),
      gymId: null,
      lat: spawn(1).point!.lat,
      lon: spawn(1).point!.lon,
      picture: `${ICONS}pm147.icon.png`,
      name: 'Dratini',
      time: timeLeft(NOW + 20 * MINUTE, NOW),
    });
  });

  it('says in its popup what its region message says: the Pokémon, the IVs, where, who, until when, and its message', () => {
    const popup = spawnPopup(spawn(1), where);
    expect(texts(popup)).toEqual([
      'Wild spawn · #west',
      'Dratini · 100% IVs',
      'by the bench',
      'Near Yellow Mural 1 (PokéStop)',
      'Directions',
      ' · ',
      'Open on Discord',
      timeLeft(NOW + 20 * MINUTE, NOW),
      ' · reported by Alice',
    ]);
    // Its end on it, for the page to say "Ended" when it passes; the time left kept current.
    const [section] = tagged(popup, 'section');
    expect(section?.attributes).toMatchObject({ 'data-ends': String(NOW + 20 * MINUTE) });
    expect(classes(popup)).toContain('stop-report');
    const links = tagged(popup, 'a').map((link) => link.attributes?.href);
    expect(links).toContain(spawn(1).link);
    // No place: no Directions; nothing said where nothing was said.
    const plain = spawnPopup(
      spawn(2, { point: null, near: undefined, details: null, ivs: undefined, costumed: true }),
      where,
    );
    expect(texts(plain)).toEqual([
      'Wild spawn · #west',
      'Costumed Dratini',
      'Open on Discord',
      timeLeft(NOW + 20 * MINUTE, NOW),
      ' · reported by Alice',
    ]);
  });

  // Staging of 2026-11-07: "Near Cathy (gym)" alone, where Discord says the address beside the
  // place's picture.
  it("says the place's address after its name, as its region message does, its picture beside them", () => {
    const placed = spawnPopup(
      spawn(1, {
        address: '20 Market Street, Pinewood',
        placePicture: '/s/1/pictures/wayspot/abc',
      }),
      where,
    );
    expect(texts(placed)).toContain('Near Yellow Mural 1 (PokéStop) · 20 Market Street, Pinewood');
    const [near] = tagged(placed, 'div').filter((node) => node.className === 'near');
    expect(tagged(near ?? { tag: 'div' }, 'img').map((img) => img.attributes)).toEqual([
      { src: '/s/1/pictures/wayspot/abc', alt: '', draggable: 'false' },
    ]);
    expect(classes(placed)).toContain('place-picture');
    // Without them, the place's name alone and no picture.
    const bare = spawnPopup(spawn(1), where);
    expect(texts(bare)).toContain('Near Yellow Mural 1 (PokéStop)');
    expect(classes(bare)).not.toContain('place-picture');
  });

  it('lists each spawn under Wild spawns, opening its marker where it has a point', () => {
    const [drawn, undrawn] = spawnLines([spawn(1), spawn(2, { point: null, near: undefined })]);
    expect(drawn).toEqual({
      key: `spawn:${spawn(1).id}`,
      kind: 'spawns',
      id: spawn(1).id,
      marker: spawnPopupKey(spawn(1).id),
      name: 'Dratini',
      place: 'Near Yellow Mural 1 (PokéStop)',
      point: spawn(1).point,
      picture: `${ICONS}pm147.icon.png`,
      going: 0,
      soonest: NOW + 20 * MINUTE,
      times: { stage: 'hatched', hatch: null, end: NOW + 20 * MINUTE },
    });
    expect(undrawn).toMatchObject({ marker: null, place: 'by the bench', point: null });
  });
});
