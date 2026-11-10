/**
 * The icons of the Report button's menu (plan 8M-9A; Matt's notes of 2026-10-25, follow-ups "From
 * Phase 8M-7"; Matt's choice of 2026-10-28, plan 8M-11A S14): the game's own where it has one,
 * Pine's own train otherwise, outlined to read on any background (a `drop-shadow` of `theme.css`'s
 * values, `map.css`), except in dark on the masks, the train and the light pictures, which the
 * light halo blew out. The game's pictures are PokeMiners' pogo_assets at one pinned commit, on
 * raw.githubusercontent.com, an origin the page loads pictures from already (`pictureOrigins`: the
 * stops' `ENCOUNTER_PICTURE`), or kept in Pine and served by it (`/icons/`, `'self'`), so the
 * Content Security Policy is unchanged; `report-icons.test.ts` holds every address to that.
 *
 * - Raid: the game's raid icon (`Images/Raids/ic_raid_small.png`, the picture the screenshot
 *   reader's tier heads were matched against), white: no outline in dark (`light`).
 * - Max battle: the game's Dynamax map icon (the Pokémon GO wiki's `File:Mp-Icon Dynamax.png`,
 *   kept as `pictures/icons/dynamax.png`, served at `/icons/dynamax.png`), a mask tinted
 *   `--tier-dynamax`.
 * - Field research (plan 8M-9B, B17): the game's quest symbol (`Images/Quests/QuestSymbol.png`,
 *   white on clear), a mask tinted `--research`.
 * - Team GO Rocket (B17): the game's Team GO Rocket "R" (`Images/Rocket/teamrocket_r.png`), also
 *   the marker of a stop with a grunt (goal 2).
 * - Wild spawn: Campfire's one-color Poké Ball (`Images/Campfire/Menu Icons/pokeball.<hash>.svg`),
 *   a mask in Poké Ball red, white in dark (`--ball`).
 * - Train: Pine's own, C3b (Matt, 2026-10-28): a low, solid two-car high-speed train facing right,
 *   its windows cut out, over a line of three stations; a drawing of 48 units in `--train`.
 * - Meetup: the game's calendar with six dots (`Images/Menu Icons/calendar_icon.png`, Campfire's
 *   meetup icon), a mask tinted `--meetup`.
 *
 * pogo_assets carries no license of its own: they are the game's files, used as Pine's other game
 * pictures are (raid eggs, type and weather icons).
 */

/** pogo_assets at the commit Pine's other game pictures are pinned to (`raid-eggs.ts`). */
export const POGO_ASSETS =
  'https://raw.githubusercontent.com/PokeMiners/pogo_assets/c2a686eb08ace6e890d8fe3d2134c76988db87b5/Images/';

/** Where Pine serves the game's pictures it keeps itself (`pictures/icons/`, plan 8M-11A). */
export const ICON_PATH = '/icons/';

/** What can be reported from the Report button (8M-9B adds research and Team GO Rocket). */
export type ReportKindId = 'raid' | 'max' | 'research' | 'rocket' | 'spawn' | 'train' | 'meetup';

/** An element of a drawing of Pine's own: its tag, its attributes, what is in it. */
export interface ShapeElement {
  tag: 'g' | 'path' | 'circle';
  attributes: Readonly<Record<string, string>>;
  children?: readonly ShapeElement[];
}

/**
 * An icon: a picture by its address (`light`: white, drawn without the outline in dark); a picture
 * whose shape is drawn in the color of what it stands for (`mask`: a CSS mask over
 * `currentColor`, plan 8M-9B, B17; mask pictures are fetched with CORS, which
 * raw.githubusercontent.com answers with `*`, and Pine's own are of its origin); or a drawing of
 * Pine's own, whole (plan 8M-11A: its view box, the attributes of its `svg`, its elements), so
 * that strokes and holes are kept.
 */
export type ReportIcon =
  | { kind: 'picture'; src: string; light?: true }
  | { kind: 'mask'; name: string; src: string }
  | {
      kind: 'shape';
      name: string;
      viewBox: string;
      attributes: Readonly<Record<string, string>>;
      elements: readonly ShapeElement[];
    };

const SOLID = { fill: 'currentColor', stroke: 'none' } as const;

/** The train C3b of the design (`2026-10-28-web-fix-pass-design.md`, S14), as given there. */
const TRAIN_C3B: readonly ShapeElement[] = [
  {
    tag: 'g',
    attributes: { transform: 'translate(0 -4)' },
    children: [
      {
        tag: 'path',
        attributes: {
          'fill-rule': 'evenodd',
          ...SOLID,
          d: 'M1 19h8a4 4 0 0 1 4 4v6a4 4 0 0 1-4 4H1zM3.5 24h5.5v4H3.5z',
        },
      },
      { tag: 'path', attributes: { d: 'M12.5 28h3', 'stroke-width': '3' } },
      {
        tag: 'path',
        attributes: {
          'fill-rule': 'evenodd',
          ...SOLID,
          d: 'M15 33V20.5a1.5 1.5 0 0 1 1.5-1.5H30c8 0 13.5 4 16.2 8.6a3.8 3.8 0 0 1-3.4 5.4zM19.5 24h8v4h-8zM32.5 22.6c3.5.8 6.6 2.4 8.4 4.4h-8.4z',
        },
      },
      { tag: 'path', attributes: { d: 'M3 40h42', 'stroke-width': '2.5' } },
      { tag: 'circle', attributes: { cx: '10', cy: '40', r: '3.2', ...SOLID } },
      { tag: 'circle', attributes: { cx: '24', cy: '40', r: '3.2', ...SOLID } },
      { tag: 'circle', attributes: { cx: '38', cy: '40', r: '3.2', ...SOLID } },
    ],
  },
];

/**
 * The game's Gigantamax map icon, the filled twin of Dynamax's (the Pokémon GO wiki's
 * `File:Mp-Icon Gigantamax.png`, kept as `pictures/icons/gigantamax.png`), a mask tinted
 * `--tier-gigantamax`: a train's kind in Manage…. Nothing is reported as Gigantamax from the menu.
 */
export const GIGANTAMAX_ICON: ReportIcon = {
  kind: 'mask',
  name: 'gigantamax',
  src: `${ICON_PATH}gigantamax.png`,
};

export const REPORT_ICONS: Readonly<Record<ReportKindId, ReportIcon>> = {
  raid: { kind: 'picture', src: `${POGO_ASSETS}Raids/ic_raid_small.png`, light: true },
  max: { kind: 'mask', name: 'max', src: `${ICON_PATH}dynamax.png` },
  research: { kind: 'mask', name: 'research', src: `${POGO_ASSETS}Quests/QuestSymbol.png` },
  rocket: { kind: 'picture', src: `${POGO_ASSETS}Rocket/teamrocket_r.png` },
  spawn: {
    kind: 'mask',
    name: 'spawn',
    src: `${POGO_ASSETS}Campfire/Menu%20Icons/pokeball.53b7f974309c231f1fe98c2a66de6e91.svg`,
  },
  train: {
    kind: 'shape',
    name: 'train',
    viewBox: '0 0 48 48',
    attributes: {
      fill: 'none',
      stroke: 'currentColor',
      'stroke-width': '4',
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
    },
    elements: TRAIN_C3B,
  },
  meetup: { kind: 'mask', name: 'meetup', src: `${POGO_ASSETS}Menu%20Icons/calendar_icon.png` },
};
