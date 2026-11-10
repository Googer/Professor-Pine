import { battleKindOf } from '../pogo/max-tier.js';
import type { Party } from './party.js';

/**
 * How many trainers one lobby of each kind of battle holds (`settings.lobbies`; design
 * `2026-10-20-max-battles-design.md`, section 4): a raid, a Dynamax battle, a Gigantamax battle.
 * `raid` is only the size above which the post tells a group of a raid or a train to split up:
 * their members choose their groups themselves (Q6), so it is no `lobbySize`.
 */
export interface Lobbies {
  raid: number;
  dynamax: number;
  gigantamax: number;
}

/** The sizes of the game's lobbies, which a settings file without `lobbies` takes. */
export const DEFAULT_LOBBIES: Lobbies = { raid: 20, dynamax: 4, gigantamax: 100 };

/** The smallest and the largest lobby size the settings take. */
export const MIN_LOBBY = 1;
export const MAX_LOBBY = 100;

/**
 * How many trainers one group of this party should hold, or undefined where its groups have no
 * size: then Join puts a member in the default group and the post counts no lobby, as for every
 * party before max battles. Where there is a size, Join fills the groups (`chooseGroup`) and a
 * group's line shows `3/4 coming`.
 */
export function lobbySize(party: Party, lobbies: Lobbies): number | undefined {
  switch (party.type) {
    // A max battle by its tier (plan 8X-3): a Dynamax lobby or a Gigantamax one.
    case 'max':
      return battleKindOf(party.max.tier) === 'gigantamax' ? lobbies.gigantamax : lobbies.dynamax;
    // A raid and a raid train choose their groups themselves (Q6): no size.
    case 'raid':
      return undefined;
    // By its kind (plan 8X-4, Q6): a Gigantamax train fills groups of a Gigantamax lobby; a raid
    // train chooses its groups itself and a Dynamax train forms its lobbies on the spot: none.
    case 'train':
      return party.train.kind === 'gigantamax' ? lobbies.gigantamax : undefined;
    // A meetup has its one group for good.
    case 'meetup':
      return undefined;
    default:
      return unknownKind(party);
  }
}

/**
 * Above how many heads the post tells a group of this party to split up ("More than 20
 * trainers: a lobby holds 20, so split up."), or undefined where it never does. Apart from
 * `lobbySize`: these parties' members choose their groups themselves (Q6), and the note only
 * advises; a party with a `lobbySize` says that it is over its size instead.
 */
export function splitLobby(party: Party, lobbies: Lobbies): number | undefined {
  switch (party.type) {
    // A max battle has a `lobbySize` and no such note.
    case 'max':
      return undefined;
    case 'raid':
      return lobbies.raid;
    // Only a raid train (plan 8X-4): a Dynamax train has none (its lobbies form on the spot), a
    // Gigantamax train a `lobbySize`.
    case 'train':
      return party.train.kind === 'raid' ? lobbies.raid : undefined;
    // A meetup has no lobby.
    case 'meetup':
      return undefined;
    default:
      return unknownKind(party);
  }
}

/** A kind of party this switch was not told about: the compiler refuses it, a stored one throws. */
function unknownKind(party: never): never {
  throw new Error(`No lobby size for a party of kind ${(party as { type: string }).type}`);
}
