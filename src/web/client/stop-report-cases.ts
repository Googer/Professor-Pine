import type {
  MapGrunt,
  MapHideout,
  MapResearch,
  MapReward,
  ResearchOptionsView,
  RocketOptionsView,
  StopReportsView,
} from '../../domain/web/stop-report-data.js';
import type { MapSpawn, SpawnsView } from '../../domain/web/spawn-data.js';

/*
 * Reports at stops as `/api/stop-reports` and the pick lists give them (plan 8M-9B), for the tests
 * of the page's pure parts (the page's own type check cannot take `test/support/`). The page never
 * imports it.
 */

export const CASE_ZONE = 'America/New_York';
/** Tuesday 27 October 2026, 14:00 in New York. */
export const CASE_NOW = Date.UTC(2026, 9, 27, 18);
const MINUTE = 60_000;
export const CASE_ICONS = 'https://cdn.leekduck.com/assets/img/pokemon_icons_crop/';

/** Stop `n`: `stop-<n>`, a little north of the one before. */
export const caseStop = (n: number) => ({
  key: `stop-${String(n)}`,
  name: `Yellow Mural ${String(n)}`,
  address: 'Market Street',
  lat: 40.44 + n * 0.001,
  lon: -79.95,
});

/** Brock's Dragon task at stop `n`, for the rest of the day, Dratini. */
export const caseResearch = (n: number, more: Partial<MapResearch> = {}): MapResearch => ({
  id: n,
  stop: caseStop(n),
  madeAt: CASE_NOW - 30 * MINUTE,
  endsAt: CASE_NOW + 10 * 60 * MINUTE,
  reporter: 'Brock',
  mayTakeBack: false,
  link: 'https://discord.com/channels/1/2/3',
  task: `dragon:${String(n)}`,
  text: 'Catch a Dragon-type Pokémon',
  category: 'Catching',
  typed: false,
  oneOf: false,
  rewards: [
    {
      kind: 'encounter',
      name: 'Dratini',
      value: 'pokemon:dratini',
      quantity: 0,
      shiny: true,
      image: `${CASE_ICONS}pm147.icon.png`,
    },
  ],
  rewardText: 'Dratini',
  picture: `${CASE_ICONS}pm147.icon.png`,
  // As the server's `reportSearch` gives them (plan 8M-12).
  words: ['catch', 'a', 'dragon', 'type', 'pokemon', 'dratini'],
  ...more,
});

/** Misty's Water-type grunt (the Magikarp lineup) at stop `n`, 25 minutes left. */
export const caseGrunt = (n: number, more: Partial<MapGrunt> = {}): MapGrunt => ({
  id: 100 + n,
  stop: caseStop(n),
  madeAt: CASE_NOW - 5 * MINUTE,
  endsAt: CASE_NOW + 25 * MINUTE,
  reporter: 'Misty',
  mayTakeBack: true,
  link: 'https://discord.com/channels/1/2/4',
  who: 'grunt:water:male',
  typeKey: 'grunt:water',
  name: 'Water-type grunt',
  catches: [
    {
      kind: 'encounter',
      name: 'Magikarp',
      value: 'pokemon:magikarp',
      quantity: 0,
      shiny: true,
      image: `${CASE_ICONS}pm129.icon.png`,
    },
  ],
  lineup: 'Magikarp, Feebas',
  picture: `${CASE_ICONS}pm129.icon.png`,
  words: ['water', 'type', 'grunt', 'magikarp', 'feebas', 'rocket'],
  ...more,
});

/** Brock's Arlo at stop `n`, for the day. */
export const caseHideout = (n: number, more: Partial<MapHideout> = {}): MapHideout => ({
  id: 200 + n,
  stop: caseStop(n),
  madeAt: CASE_NOW - 60 * MINUTE,
  endsAt: CASE_NOW + 9 * 60 * MINUTE,
  reporter: 'Brock',
  mayTakeBack: false,
  link: 'https://discord.com/channels/1/2/3',
  who: 'leader:arlo',
  name: 'Arlo',
  catches: [
    {
      kind: 'encounter',
      name: 'Mudkip',
      value: 'pokemon:mudkip',
      quantity: 0,
      shiny: false,
      image: `${CASE_ICONS}pm258.icon.png`,
    },
  ],
  picture: 'https://map.example.test/pictures/arlo.png',
  words: ['arlo', 'mudkip', 'rocket', 'leader'],
  ...more,
});

/** A view of the reports, none unless given. */
export const caseView = (more: Partial<StopReportsView> = {}): StopReportsView => ({
  zone: CASE_ZONE,
  event: null,
  research: [],
  waiting: null,
  readOnly: false,
  grunts: [],
  hideouts: [],
  ...more,
});

const DRATINI = caseResearch(1).rewards[0]!;
const BAGON: MapReward = {
  kind: 'encounter',
  name: 'Bagon',
  value: 'pokemon:bagon',
  quantity: 0,
  shiny: true,
  image: `${CASE_ICONS}pm371.icon.png`,
};
const RARE_CANDY: MapReward = {
  kind: 'item',
  name: 'Rare Candy',
  value: 'item:rare-candy',
  quantity: 3,
  shiny: false,
  image: 'https://cdn.leekduck.com/assets/img/items/Rare%20Candy.png',
};

/** The pick lists of a research report: the Dragon task of three versions, Spin of one. */
export const caseResearchOptions = (
  more: Partial<ResearchOptionsView> = {},
): ResearchOptionsView => ({
  stale: false,
  readAt: CASE_NOW - 60 * MINUTE,
  maxStops: 5,
  maxTyped: 100,
  tasks: [
    {
      key: 'dragon',
      text: 'Catch a Dragon-type Pokémon',
      category: 'Catching',
      rewards: [DRATINI, BAGON],
      versions: [
        { value: 'dragon:aaaa1111', label: 'Dratini', oneOf: false, rewards: [DRATINI] },
        { value: 'dragon:bbbb2222', label: 'Bagon', oneOf: false, rewards: [BAGON] },
        {
          value: 'dragon',
          label: 'one of Dratini, Bagon',
          oneOf: true,
          rewards: [DRATINI, BAGON],
        },
      ],
    },
    {
      key: 'spin',
      text: 'Spin 3 PokéStops',
      category: 'Exploring',
      rewards: [RARE_CANDY],
      versions: [
        { value: 'spin:cccc3333', label: 'Rare Candy ×3', oneOf: false, rewards: [RARE_CANDY] },
      ],
    },
  ],
  rewards: [
    { value: 'item:rare-candy', name: 'Rare Candy' },
    { value: 'item:stardust', name: 'Stardust' },
  ],
  ...more,
});

/** The pick list of a Rocket report: the water grunts of two lineups, Arlo, Giovanni. */
export const caseRocketOptions = (more: Partial<RocketOptionsView> = {}): RocketOptionsView => ({
  stale: false,
  readAt: CASE_NOW - 60 * MINUTE,
  choices: [
    {
      key: 'grunt:water',
      name: 'Water-type grunt',
      hideout: false,
      catches: [caseGrunt(1).catches[0]!, caseHideout(1).catches[0]!],
      lineups: [
        {
          key: 'grunt:water:female',
          value: 'grunt:water:female#f1',
          label: 'Mudkip, Tentacool, Krabby',
          fingerprint: 'f1',
          catches: [caseHideout(1).catches[0]!],
        },
        {
          key: 'grunt:water:male',
          value: 'grunt:water:male#m1',
          label: 'Magikarp, Feebas',
          fingerprint: 'm1',
          catches: [caseGrunt(1).catches[0]!],
        },
      ],
    },
    { key: 'grunt:fire', name: 'Fire-type grunt', hideout: false, catches: [] },
    { key: 'leader:arlo', name: 'Arlo', hideout: true, catches: caseHideout(1).catches },
    {
      key: 'giovanni',
      name: 'Giovanni',
      hideout: true,
      catches: [],
      note: 'Report Giovanni only when you are sure.',
    },
  ],
  ...more,
});

/**
 * Alice's Dratini `n` (Matt, 2026-11-07: wild spawns on the map), at a pin near stop `n`,
 * reported 10 minutes ago and going away in 20.
 */
export const caseSpawn = (n: number, more: Partial<MapSpawn> = {}): MapSpawn => ({
  id: `60000000000000000${String(n)}`,
  pokemon: 'Dratini',
  costumed: false,
  ivs: '100% IVs',
  picture: `${CASE_ICONS}pm147.icon.png`,
  details: 'by the bench',
  near: `Near Yellow Mural ${String(n)} (PokéStop)`,
  point: { lat: caseStop(n).lat + 0.0002, lon: caseStop(n).lon },
  reporter: 'Alice',
  region: '#west',
  madeAt: CASE_NOW - 10 * MINUTE,
  goneAt: CASE_NOW + 20 * MINUTE,
  link: `https://discord.com/channels/1/2/60000000000000000${String(n)}`,
  words: ['dratini'],
  ...more,
});

/** `/api/spawns` with these spawns. */
export const caseSpawns = (spawns: MapSpawn[]): SpawnsView => ({ spawns });
