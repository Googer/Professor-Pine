import type { AppContext } from '../../app-context.js';
import { UserError } from '../../discord/errors.js';
import type { PokemonEntry } from '../../domain/pogo/game-master.js';
import type { Place } from '../../domain/geo/place.js';
import { postLink } from '../../render/notify-dm.js';
import { IV_WORDS, SPAWN_MINUTES } from '../../render/spawn.js';
import { plain, type NamedMember } from '../../render/text.js';
import { placeWords } from '../place-option.js';

/**
 * Reporting a wild Pokémon as `/wild` and the live map (plan 8M-4S) share it: the report through
 * `SpawnService` (`reportSpawnAs`), and the command's words for what came of it, a report and a
 * channel named by the caller (`SpawnNames`). What both read first (the Pokémon and the details)
 * is `readSpawn` of `wild.ts`.
 */

/** Said when the text channel of the region no longer exists. */
export const CHANNEL_GONE =
  'The channel of this region is gone, so I cannot post the report. Tell a moderator.';

/** Said for a report that comes while the bot shuts down. */
export const RESTARTING =
  'I am restarting just now, so the report was not made. Report it again in a minute.';

/**
 * A report that was not made, in `/wild`'s words, and why (`kind`): the region's channel gone
 * (`no-channel`), the bot not allowed to post there (`refused`), the bot shutting down
 * (`closed`). A `UserError`, so `/wild` answers it as any; the map answers `closed` as a
 * moment's unavailability (503) and the others as refusals.
 */
export class SpawnNotMade extends UserError {
  override name = 'SpawnNotMade';

  constructor(
    message: string,
    readonly kind: 'no-channel' | 'refused' | 'closed',
  ) {
    super(message);
  }
}

/** What reporting needs: the spawn service. */
export type SpawnReporting = Pick<AppContext, 'spawns'>;

/**
 * How an answer names the report and a region's channel: on Discord the report's link and a
 * mention; on the map no report (undefined leaves the link out) and a channel by its name.
 */
export interface SpawnNames {
  report(guildId: string, channelId: string, messageId: string): string | undefined;
  channel(channelId: string): string;
}

export const DISCORD_SPAWN_NAMES: SpawnNames = {
  report: (guildId, channelId, messageId) => postLink(guildId, channelId, messageId),
  channel: (channelId) => `<#${channelId}>`,
};

/** A report whose Pokémon, details and region are known. */
export interface SpawnReportRequest {
  guildId: string;
  /** The text channel of the region the report goes to. */
  regionChannelId: string;
  /** What `readSpawn` read: the Pokémon and the details. */
  read: { entry: Pick<PokemonEntry, 'dex' | 'key' | 'name'>; details: string };
  iv?: 'perfect' | 'zero' | undefined;
  reporter: NamedMember;
  /** Where it is: a place a member named (`/wild near:`) or a point of the map (a pin). */
  near?: Place | undefined;
}

/**
 * Reports the spawn as the member and gives the command's words for it: what was reported (the
 * IVs and the place included: the member sees what was taken), the report's link as `names`
 * gives it, and when it goes away. A report that was not made is thrown as a `SpawnNotMade` in
 * the command's words.
 */
export async function reportSpawnAs(
  ctx: SpawnReporting,
  request: SpawnReportRequest,
  names: SpawnNames,
): Promise<string> {
  const { guildId, regionChannelId, read, iv, near } = request;
  const { entry } = read;
  const outcome = await ctx.spawns.report({
    guildId,
    regionChannelId,
    pokemon: { dex: entry.dex, key: entry.key, name: entry.name },
    details: read.details,
    iv,
    reporter: request.reporter,
    ...(near === undefined ? {} : { near }),
  });
  if (outcome.kind === 'no-channel') throw new SpawnNotMade(CHANNEL_GONE, 'no-channel');
  if (outcome.kind === 'refused') {
    throw new SpawnNotMade(
      `I am not allowed to post in ${names.channel(regionChannelId)}, so the report was not ` +
        'made. Tell a moderator.',
      'refused',
    );
  }
  if (outcome.kind === 'closed') throw new SpawnNotMade(RESTARTING, 'closed');
  // The channel is named by the link alone: Discord shows a message link as its channel.
  const ivs = iv === undefined ? '' : ` with ${IV_WORDS[iv]}`;
  const place = near === undefined ? '' : ` ${placeWords(near)}`;
  const link = names.report(guildId, outcome.channelId, outcome.messageId);
  return (
    `Reported: a wild ${outcome.costumed === true ? 'costumed ' : ''}${plain(entry.name)}${ivs}${place}.${link === undefined ? '' : ` ${link}`}\n` +
    `The report is removed in ${String(SPAWN_MINUTES)} minutes.`
  );
}
