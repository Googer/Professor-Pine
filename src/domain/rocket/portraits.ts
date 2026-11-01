import type { Leader } from './lineups.js';

/*
 * The portraits of Team GO Rocket's leaders and boss (plan 8R-6; design
 * `2026-10-23-stop-pictures-design.md`, rule 5): Leek Duck's, 128 by 128 and square already. A
 * hideout of a leader or Giovanni shows the portrait, the Pokémon caught stays in the text. They
 * pass the host check of the feeds' pictures (`leekDuckPicture`); one that fails to load shows no
 * picture.
 */

/** Where Leek Duck keeps the portraits. */
const PORTRAITS = 'https://cdn.leekduck.com/assets/img/rocket/';

/** Cliff's, Arlo's and Sierra's portraits. */
export const LEADER_PORTRAITS: Readonly<Record<Leader, string>> = {
  cliff: `${PORTRAITS}leader-cliff.png`,
  arlo: `${PORTRAITS}leader-arlo.png`,
  sierra: `${PORTRAITS}leader-sierra.png`,
};

/** Giovanni's portrait. */
export const GIOVANNI_PORTRAIT = `${PORTRAITS}boss-giovanni.png`;
