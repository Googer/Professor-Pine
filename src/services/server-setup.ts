import { setupDone, setupItems, type SetupFacts } from '../domain/servers/setup.js';
import type { Logger } from '../log.js';
import { setUpWords } from '../render/server-setup.js';
import type { ServerSettingsService } from './server-settings.js';

export interface ServerSetupOptions {
  servers: Pick<ServerSettingsService, 'of' | 'inSetup' | 'markSetUp' | 'serversInSetup'>;
  /**
   * How many of a server's regions have an outline, and how many gyms it has (its `Guild` row's,
   * from memory: `RegionDirectory`, `GymProvider.of`).
   */
  counts(serverId: string): Promise<{ regions: number; gyms: number }>;
  /**
   * Posts plain text in a channel (`noticeSender`: only where Pine may send there); rejects where
   * nothing was sent.
   */
  send(channelId: string, text: string): Promise<unknown>;
  /**
   * Told once a server left setup: what was held for it begins (the zones in use, its summaries,
   * its events forum, the posts of its stops). One that throws is logged.
   */
  setUp?: (serverId: string) => void;
  log: Logger;
}

/**
 * `ServerSetupOptions.counts` over the regions and gyms in memory: the server's `Guild` row, then
 * its regions with an outline (one per channel, as `regionsAtPoint` counts them) and its gyms
 * (`GymProvider.of`). None without a row.
 */
export function setupCounts(deps: {
  guilds: { idFor(snowflake: string): Promise<number | undefined> };
  regions: { all(): readonly { guildId: number | null; channelId: string; bounds: unknown }[] };
  gyms: { of(guildId: number | undefined): { all(): readonly unknown[] } };
}): (serverId: string) => Promise<{ regions: number; gyms: number }> {
  return async (serverId) => {
    const row = await deps.guilds.idFor(serverId);
    if (row === undefined) return { regions: 0, gyms: 0 };
    const outlined = new Set(
      deps.regions
        .all()
        .filter((region) => region.guildId === row && region.bounds !== null)
        .map((region) => region.channelId),
    );
    return { regions: outlined.size, gyms: deps.gyms.of(row).all().length };
  };
}

/**
 * A server's setup (plan 19C-2, `servers.md`; spec "Joining, the setup state, leaving"): what
 * `/admin setup`'s checklist reads (`facts`), and the leaving of it (`check`): once every required
 * item is done (`setupDone`: the time zone, the bot lab, the moderators' bot lab, one region with
 * an outline), whatever did the last one (the panel, `/region import`, the region editor), the
 * server is recorded set up, once (`ServerSettings.markSetUp`), and its bot lab told so with what
 * can follow (`setUpWords`). Asked after each change of a server's values, after each change of
 * the regions, at the start and when `/admin setup` is shown. A server never leaves setup
 * otherwise, and never comes back to it.
 */
export class ServerSetup {
  constructor(private readonly options: ServerSetupOptions) {}

  /** What the checklist and the leaving read of a server. */
  async facts(serverId: string): Promise<SetupFacts> {
    const { regions, gyms } = await this.options.counts(serverId);
    return { values: this.options.servers.of(serverId), regions, gyms };
  }

  /**
   * Takes a server in setup out of it where its required items are done: whether this call did.
   * Never rejects: a failed read or write is logged, and the server stays in setup until the
   * next check; a bot lab that does not take the message is logged, the server set up all the same.
   */
  async check(serverId: string): Promise<boolean> {
    const { servers, log } = this.options;
    if (!servers.inSetup(serverId)) return false;
    let marked: boolean;
    let counts: { regions: number; gyms: number };
    try {
      counts = await this.options.counts(serverId);
      // Decided on the values as they are in the server's turn (S4): a change asked before the
      // write (a bot lab unset) is seen.
      marked = await servers.markSetUp(serverId, (values) => setupDone({ values, ...counts }));
    } catch (err) {
      log.warn({ err, server: serverId }, 'could not record a server set up');
      return false;
    }
    if (!marked) return false;
    const facts: SetupFacts = { values: servers.of(serverId), ...counts };
    log.info({ server: serverId }, 'a server is set up');
    try {
      this.options.setUp?.(serverId);
    } catch (err) {
      log.error({ err, server: serverId }, 'could not begin what waited for a server’s setup');
    }
    const lab = facts.values.channels['bot-lab'];
    if (lab !== undefined) {
      try {
        await this.options.send(lab, setUpWords(setupItems(facts)));
      } catch (err) {
        log.warn({ err, server: serverId }, 'could not tell a server that it is set up');
      }
    }
    return true;
  }

  /** `check` of every server in setup, one after the other (a region saved, the start). */
  async checkAll(): Promise<void> {
    for (const serverId of this.options.servers.serversInSetup()) await this.check(serverId);
  }
}
