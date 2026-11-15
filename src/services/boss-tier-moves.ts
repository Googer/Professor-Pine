import { bossTierMoved, maxBossTierMoved, type BossTierMove } from '../domain/party/boss-move.js';
import { isMax, isRaid, type Party } from '../domain/party/party.js';
import type { RaidDurationRules } from '../domain/time/raid-durations.js';
import type { Logger } from '../log.js';
import { bossMovedLine } from '../render/boss-changes.js';
import { storedChange } from './party-change.js';
import type { PartyLines } from './party-lines.js';
import type { PartyStore } from './party-store.js';
import type { RaidChangeService } from './raid-change-service.js';

export interface BossTierMovesOptions {
  store: PartyStore;
  /** Told after every stored change; knows the raid durations in effect. */
  posts: {
    changed(partyId: string): void;
    rulesOf(party: Pick<Party, 'guildId'>): RaidDurationRules;
  };
  /** A raid moves under the rules of every raid change (review J1). */
  raids: Pick<RaidChangeService, 'moveBossTier'>;
  lines: Pick<PartyLines, 'say'>;
  log: Logger;
  now?: () => number;
}

/** What came of moving the running battles: how many moved, how many raids stayed in the way. */
export interface BossTierMoved {
  moved: number;
  /** Raids the move would have put in the way of another raid at their gym: left as they are. */
  inTheWay: number;
}

/**
 * The running battles moved with an add that moved their boss (plan 8X-J, Matt's answer 4): the
 * active parties of every server (the boss list is the installation's, review J5) that
 * `bossTierMoved` changes. A max battle is changed through the store, its post shown anew and
 * told in a line that pings nobody; a raid through `RaidChangeService.moveBossTier`, which keeps
 * the rules of a raid change (review J1). No notifier, no DMs.
 */
export class BossTierMoves {
  private readonly now: () => number;

  constructor(private readonly options: BossTierMovesOptions) {
    this.now = options.now ?? (() => Date.now());
  }

  /** Moves every running battle of the boss at a tier it moved from. */
  async move(move: BossTierMove): Promise<BossTierMoved> {
    const { store, posts, log } = this.options;
    // Each battle by the rules of its server's zone (plan 19A-2).
    const concerned = store
      .active()
      .filter((party) => bossTierMoved(party, move, posts.rulesOf(party), this.now()) !== party);
    const done: BossTierMoved = { moved: 0, inTheWay: 0 };
    for (const party of concerned) {
      // One battle that cannot be written (the database) keeps the rest from failing with it.
      const outcome = await (
        isRaid(party) ? this.moveRaid(party.id, move) : this.moveMax(party.id, move)
      ).catch((err: unknown) => {
        log.warn({ err, party: party.id }, 'could not move a battle with its boss');
        return 'failed' as const;
      });
      if (outcome === 'moved') done.moved += 1;
      if (outcome === 'in-the-way') done.inTheWay += 1;
    }
    if (done.moved + done.inTheWay > 0) {
      log.info({ boss: move.boss.key, ...done }, 'battles moved with their boss');
    }
    return done;
  }

  private async moveRaid(
    partyId: string,
    move: BossTierMove,
  ): Promise<'moved' | 'in-the-way' | 'no'> {
    const outcome = await this.options.raids.moveBossTier(partyId, move, nameOf(move));
    if (outcome.kind === 'refused' && outcome.reason === 'gym-taken') return 'in-the-way';
    return outcome.kind === 'ok' && outcome.changed ? 'moved' : 'no';
  }

  private async moveMax(partyId: string, move: BossTierMove): Promise<'moved' | 'no'> {
    const { store, posts, lines } = this.options;
    const result = await storedChange(store, partyId, isMax, (party) => ({
      ok: true,
      party: maxBossTierMoved(party, move, this.now()),
    }));
    if (result.kind !== 'ok' || !result.written) return 'no';
    posts.changed(partyId);
    const postId = result.party.forumPostId;
    if (postId !== null) lines.say(postId, bossMovedLine(nameOf(move), move.to));
    return 'moved';
  }
}

/** How the line names the boss: the list's name of it. */
function nameOf(move: BossTierMove): string {
  return move.boss.names[0] ?? move.boss.key;
}
