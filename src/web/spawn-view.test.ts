import { describe, expect, it } from 'vitest';
import type { StandingSpawn } from '../db/repositories/spawn-report-repository.js';
import { spawnsView, type SpawnViewInput } from './spawn-view.js';

const GUILD = '412345678901234567';
const CHANNEL = '512345678901234567';
const NOW = 1_800_000_000_000;
const LEEK_DUCK = 'https://cdn.leekduck.com/assets/img/pokemon_icons/pm25.icon.png';

const spawn = (more: Partial<StandingSpawn> = {}): StandingSpawn => ({
  channelId: CHANNEL,
  messageId: '612345678901234567',
  deleteAt: NOW + 1_800_000,
  guildId: GUILD,
  pokemon: { key: 'pikachu', name: 'Pikachu' },
  costumed: false,
  iv: null,
  details: 'by the fountain',
  reporterName: 'Alice',
  image: LEEK_DUCK,
  near: null,
  madeAt: NOW,
  ...more,
});

const input = (spawns: StandingSpawn[], more: Partial<SpawnViewInput> = {}): SpawnViewInput => ({
  spawns,
  shown: () => true,
  region: () => '#west',
  guild: GUILD,
  pictureOrigins: ['https://cdn.leekduck.com'],
  ...more,
});

describe('the spawns as the map shows them', () => {
  it('says a costumed spawn as its message does, found by its costume too', () => {
    const [shown] = spawnsView(input([spawn({ costumed: true, iv: 'zero' })])).spawns;
    expect(shown).toMatchObject({
      pokemon: 'Pikachu',
      costumed: true,
      ivs: '0% IVs',
      picture: 'https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm25.icon.png',
      words: ['pikachu', 'costumed', 'costume'],
    });
  });

  it('shows a picture only from an origin the page may load', () => {
    const [shown] = spawnsView(input([spawn({ image: 'https://example.com/pm25.png' })])).spawns;
    expect(shown).not.toHaveProperty('picture');
    const [none] = spawnsView(input([spawn({ image: null })])).spawns;
    expect(none).not.toHaveProperty('picture');
  });

  // Staging of 2026-11-07: the uncropped icon was a small figure in a big transparent square.
  it('shows the cropped icon as the stops show theirs: the square one Pine serves, by the lookup', () => {
    const crop = 'https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm25.icon.png';
    const asked: string[] = [];
    const square = 'https://map.example.test/pictures/abc.png?v=1';
    const [shown] = spawnsView(
      input([spawn()], {
        pictureOrigins: ['https://cdn.leekduck.com', 'https://map.example.test'],
        picture: (source) => {
          asked.push(source);
          return square;
        },
      }),
    ).spawns;
    expect(asked).toEqual([crop]);
    expect(shown?.picture).toBe(square);
    // Not made square yet: the cropped icon itself.
    const [plain] = spawnsView(input([spawn()], { picture: (source) => source })).spawns;
    expect(plain?.picture).toBe(crop);
    // The cropped one gone: the uncropped icon rather than none.
    const [gone] = spawnsView(input([spawn()], { picture: () => undefined })).spawns;
    expect(gone?.picture).toBe(LEEK_DUCK);
  });

  it('names a pin by the name its link gave, else a dropped pin; and a reporter without a name a member', () => {
    const pin = { kind: 'pin' as const, lat: 40.02, lon: -80.02, near: null };
    const { spawns } = spawnsView(
      input([
        spawn({ near: { ...pin, linkName: 'Riverside Park' }, reporterName: null }),
        spawn({ near: { ...pin, linkName: null }, reporterName: '  ' }),
        spawn({
          near: {
            kind: 'powerspot',
            id: 'p1',
            title: 'Old Mill',
            lat: 40.03,
            lon: -80.03,
            address: null,
            image: null,
          },
        }),
      ]),
    );
    expect(spawns.map(({ near, point, reporter }) => ({ near, point, reporter }))).toEqual([
      { near: 'Riverside Park', point: { lat: 40.02, lon: -80.02 }, reporter: 'a member' },
      { near: 'Dropped pin', point: { lat: 40.02, lon: -80.02 }, reporter: 'a member' },
      { near: 'Near Old Mill (Power Spot)', point: { lat: 40.03, lon: -80.03 }, reporter: 'Alice' },
    ]);
  });

  it('leaves out what the member may not see, keeping the order', () => {
    const { spawns } = spawnsView(
      input([spawn({ messageId: '1' }), spawn({ messageId: '2' }), spawn({ messageId: '3' })], {
        shown: (one) => one.messageId !== '2',
      }),
    );
    expect(spawns.map((one) => one.id)).toEqual(['1', '3']);
  });
});
