import { BoundedMap } from '../bounded-map.js';
import type { Settings } from '../config/settings.js';
import type { WantStorage } from '../db/repositories/pokemon-notification-repository.js';
import type { UnownGiftStorage } from '../db/repositories/unown-gift-repository.js';
import { pokemonTarget } from '../domain/pogo/notification-target.js';
import type { Logger } from '../log.js';
import type { GameDataProvider } from './game-data-service.js';
import { UNOWN_DEX } from './spawn-service.js';

export interface UnownWantServiceOptions {
  wants: Pick<WantStorage, 'list' | 'set'>;
  gifts: UnownGiftStorage;
  gameData: GameDataProvider;
  settings: Settings;
  log: Logger;
  now?: () => number;
  /** As many members as are remembered as met. Default `MET_MEMBERS`. */
  maxMet?: number;
}

/**
 * As many members (per server) as are remembered as met in a run of the bot; beyond that the
 * one met longest ago is forgotten and looked at again with their next interaction, which for a
 * member without the role costs reading the names of their roles once more. A key is some
 * forty characters: this bounds the set at a few megabytes however long the bot runs.
 */
export const MET_MEMBERS = 50_000;

/**
 * Unown wants for holders of the old role (Matt, 2026-10-12). The legacy bot answered `!want
 * unown` with a role (`settings.roles.unown`) and pinged that role for a sighting; this bot
 * tells who has a want for Unown, as for any other Pokémon. The holders of a role cannot be
 * listed without the Server Members intent, so they are met one by one: a member whose
 * interaction shows a role of that name, and who has no want for Unown in that server, is
 * given one for its spawns (the species, every letter). Once per member and server, recorded in
 * the database (`UnownWantGift`), so that a member who removes the want keeps it removed. Only
 * where notifications are on.
 *
 * It is in nobody's way: `noticed` returns at once and never throws; after the first
 * interaction of a member in a server during a run of the bot it is one look into a set (also
 * for a member without the role: one who gets the role later is met after the next start, or
 * once `MET_MEMBERS` others were met since); everything else happens on the side, and what fails
 * is logged and tried again with that member's next interaction. When only the record could
 * not be written after the want, only the record is tried again: the member may have removed
 * the want meanwhile, and must not get it back.
 */
export class UnownWantService {
  private readonly now: () => number;
  /** The members met in this run of the bot, as `<server>:<member>`. */
  private readonly met: BoundedMap<string, true>;
  /** The members whose want is settled and whose record could not be written yet. */
  private readonly owed = new Set<string>();
  private readonly background = new Set<Promise<void>>();

  constructor(private readonly options: UnownWantServiceOptions) {
    this.now = options.now ?? (() => Date.now());
    this.met = new BoundedMap(options.maxMet ?? MET_MEMBERS);
  }

  /** How many members were met in this run. For tests. */
  get seen(): number {
    return this.met.size;
  }

  /**
   * A member used the bot in a server. `roleNames` gives the names of their roles as the
   * interaction shows them, and is asked only at a member's first interaction of this run.
   */
  noticed(guildId: string, memberId: string, roleNames: () => Iterable<string>): void {
    const { settings, log } = this.options;
    if (!settings.features.notifications) return;
    const key = `${guildId}:${memberId}`;
    if (this.met.has(key)) return;
    // The one met longest ago goes when there are too many.
    this.met.set(key, true);
    try {
      // As a team is read from the roles: by name, whatever its letter case.
      const role = settings.roles.unown.trim().toLowerCase();
      const holds = [...roleNames()].some((name) => name.trim().toLowerCase() === role);
      if (!holds) return;
    } catch (err) {
      log.warn({ err, guild: guildId }, 'could not read the roles of a member');
      return;
    }
    const work = this.settle(key, guildId, memberId)
      .catch((err: unknown) => {
        // Not settled: their next interaction tries again.
        this.met.delete(key);
        log.warn({ err, guild: guildId, member: memberId }, 'could not give an Unown want');
      })
      .finally(() => this.background.delete(work));
    this.background.add(work);
  }

  private async settle(key: string, guildId: string, memberId: string): Promise<void> {
    const { wants, gifts, gameData, log } = this.options;
    if (!this.owed.has(key)) {
      if (await gifts.given(memberId, guildId)) return;
      // A game master without Unown has nothing to want; asked again after the next start.
      if (!gameData.catalogue.species(UNOWN_DEX)) return;
      const { wants: own } = await wants.list(memberId, guildId);
      const has = own.some(
        (want) => want.target.kind === 'pokemon' && want.target.dex === UNOWN_DEX,
      );
      // The want first, the record after it: a stop between the two gives nothing twice, since
      // the member then has the want. Recorded also for a member who had one already.
      if (!has) {
        await wants.set(memberId, guildId, pokemonTarget(UNOWN_DEX), 'spawn');
        log.info(
          { guild: guildId, member: memberId },
          'a holder of the Unown role got a want for Unown',
        );
      }
      // From here on only the record is owed: should it fail, the next try writes the record
      // alone and never looks at the wants again (the member may have removed theirs).
      this.owed.add(key);
    }
    await gifts.record(memberId, guildId, this.now());
    this.owed.delete(key);
  }

  /** Waits for what is on its way. For shutdown and for tests. */
  async flush(): Promise<void> {
    while (this.background.size > 0) await Promise.all(this.background);
  }
}
