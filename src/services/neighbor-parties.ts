import { isMax, isRaid, type BattleParty, type Party } from '../domain/party/party.js';
import type { NeighborMatches } from './neighbor-matches.js';
import type { PartyProvider } from './party-store.js';
import type { QuietServers } from './quiet-servers.js';
import type { ServerNeighbors } from './server-neighbors.js';

/** A neighbor's party at the same gym or Power Spot, with its server. */
export interface NeighborParty {
  serverId: string;
  party: BattleParty;
}

export interface NeighborPartiesOptions {
  neighbors: Pick<ServerNeighbors, 'neighborsOf'>;
  /** The quiet servers (left or in setup): nothing of theirs is shown, nor shows theirs. */
  quiet?: QuietServers;
  matches: Pick<NeighborMatches, 'sameGym' | 'sameSpot' | 'changesOf'>;
  /** A server's `Guild` row, and a row's server (every row read at the start). */
  rowOf: (serverId: string) => number | undefined;
  serverOfRow: (row: number) => string | undefined;
  parties: Pick<PartyProvider, 'raidAt' | 'maxAt'>;
}

/**
 * The parties of a server's neighbors at the same gym or Power Spot as one of its own (plan 19E),
 * from memory: the neighbors (`ServerNeighbors`), the same gym (`NeighborMatches`) and the party
 * that stands there (`PartyStore.raidAt`, `maxAt`: one of a server at a gym or spot). A raid at a
 * gym, a max battle at a Power Spot; never a meetup, a train or a battle at a pin. Asked by a
 * post's render (`of`), and the other way round by what follows a change (`in`).
 */
export class NeighborParties {
  constructor(private readonly options: NeighborPartiesOptions) {}

  /** A server's neighbors (`ServerNeighbors.neighborsOf`). */
  neighborsOf(serverId: string): string[] {
    return this.options.neighbors.neighborsOf(serverId);
  }

  /**
   * The live parties with a post of `party`'s neighbors at its gym or Power Spot, in the order of
   * the neighbors' ids: none while its server or the neighbor is quiet.
   */
  of(party: Party, now: number): NeighborParty[] {
    const { neighbors, quiet } = this.options;
    const server = this.options.serverOfRow(party.guildId);
    if (server === undefined || quiet?.isQuiet(server) === true) return [];
    return neighbors.neighborsOf(server).flatMap((neighbor) => {
      if (quiet?.isQuiet(neighbor) === true) return [];
      const found = this.in(party, neighbor, now);
      return found ? [found] : [];
    });
  }

  /**
   * After the gyms of these servers (`Guild` rows) changed: the live raids, of both servers of
   * each of their pairs of neighbors, at the gyms that gained, lost or changed their match
   * (`NeighborMatches.changesOf`, review R9), whose posts are to be drawn anew. Each pair is
   * compared once, whichever of its servers changed.
   */
  matchesChanged(guildRows: readonly number[], now: number): BattleParty[] {
    const { matches, parties, neighbors } = this.options;
    const pairs = new Map<string, [number, number]>();
    for (const row of guildRows) {
      const server = this.options.serverOfRow(row);
      if (server === undefined) continue;
      for (const neighbor of neighbors.neighborsOf(server)) {
        const other = this.options.rowOf(neighbor);
        if (other === undefined || other === row) continue;
        const [low, high] = row < other ? [row, other] : [other, row];
        pairs.set(`${String(low)}:${String(high)}`, [low, high]);
      }
    }
    const found: BattleParty[] = [];
    for (const [low, high] of pairs.values()) {
      for (const [row, gymIds] of matches.changesOf(low, high)) {
        for (const gymId of gymIds) {
          const raid = parties.raidAt(row, gymId, now);
          if (raid) found.push(raid);
        }
      }
    }
    return found;
  }

  /**
   * `other`'s live party with a post at `party`'s gym or Power Spot, whether or not the two
   * servers are neighbors or quiet (what follows a change of either asks it).
   */
  in(party: Party, other: string, now: number): NeighborParty | undefined {
    const { matches, parties } = this.options;
    const row = this.options.rowOf(other);
    if (row === undefined || row === party.guildId) return undefined;
    let found: BattleParty | undefined;
    if (isRaid(party) && party.gymId !== null) {
      const gym = matches.sameGym(party.guildId, party.gymId, row);
      found = gym === undefined ? undefined : parties.raidAt(row, gym, now);
    } else if (isMax(party) && party.max.spot.kind === 'powerspot') {
      const { spot } = party.max;
      found = matches.sameSpot(party.guildId, spot.id, row)
        ? parties.maxAt(row, spot, now)
        : undefined;
    }
    return found && found.forumPostId !== null ? { serverId: other, party: found } : undefined;
  }
}
