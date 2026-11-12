import { ChannelType, DiscordAPIError, RESTJSONErrorCodes, Routes } from 'discord.js';
import type { DiscordDelete, DiscordRead } from './discord-rest.js';
import { failureReason } from './emoji-upload.js';
import { staysAtCutover, type LegacyActive } from './legacy-parties.js';

/*
 * The cleanup of the legacy bot's party channels (`/admin cleanup-legacy`, and the count of
 * `cutover-check`): the legacy bot made a text channel per raid, train and meetup, in the
 * category of the region channel it was reported in, named by `generateChannelName` (raids
 * `<pokemon>-<gym words>`, `egg-<tier>-…`, `boss-<tier>-…`, `expired-…`, `ex-raid-…`,
 * `elite-raid-…`; trains `train-<name words>`; meetups `meetup-<name words>`), and posted the
 * party's status as its first message. What is listed for deletion: the channels of the raids
 * the legacy `active/` files name, and orphans (left behind by crashes) that are surely such
 * channels by their category, their name and their first message. The channels of the trains,
 * meetups and saved parties the files name stay (`staysAtCutover`), listed with the party's name,
 * age and sign-ups for a person to delete the dead ones. What only looks like a party channel is
 * listed apart, for a person to judge. Nothing here deletes but `deleteListed`.
 */

export type LegacyKind = 'raid' | 'train' | 'meetup';

/** The words of a legacy channel name: `\w` of JavaScript, lower case as Discord keeps them. */
const WORDS = '[a-z0-9_]+(?:-[a-z0-9_]+)*';
const SURE: readonly (readonly [RegExp, LegacyKind])[] = [
  [new RegExp(`^train(?:-${WORDS})?$`, 'u'), 'train'],
  [new RegExp(`^meetup(?:-${WORDS})?$`, 'u'), 'meetup'],
  [new RegExp(`^(?:egg|boss)-[a-z0-9]+(?:-${WORDS})?$`, 'u'), 'raid'],
  [new RegExp(`^expired-${WORDS}$`, 'u'), 'raid'],
  [new RegExp(`^(?:ex|elite)-raid(?:-${WORDS})?$`, 'u'), 'raid'],
];
/** A hatched raid: the boss's words, then the gym's; as a name, any two words or more. */
const HATCHED = /^[a-z0-9_]+(?:-[a-z0-9_]+)+$/u;

/**
 * What kind of legacy party a channel's name says it is: `sure` for a name only the legacy bot
 * gave (`train-…`, `egg-5-…`), unsure for a hatched raid's (`mewtwo-the-stacks`), which any
 * channel of two words or more also has.
 */
export function legacyNameOf(name: string): { kind: LegacyKind; sure: boolean } | undefined {
  for (const [pattern, kind] of SURE) if (pattern.test(name)) return { kind, sure: true };
  return HATCHED.test(name) ? { kind: 'raid', sure: false } : undefined;
}

/** A channel the cleanup lists: what it is, where, and why. */
export interface CleanupEntry {
  channelId: string;
  name: string;
  /** The name of its category, or null. */
  category: string | null;
  /**
   * What it looks like (by its file, for a channel that stays); undefined for a channel whose
   * name is no legacy name.
   */
  kind: LegacyKind | undefined;
  why: string;
  /** For a channel that stays: its party's name (a train's, a meetup's), age and sign-ups. */
  party?: { name: string | null; createdAt: number | null; signedUp: number };
}

/** A party of the legacy `active/` files, as far as the cleanup needs it. */
export type LegacyParty = Pick<
  LegacyActive,
  'channelId' | 'type' | 'name' | 'createdAt' | 'signedUp' | 'saved'
>;

export interface CleanupList {
  /** What the cleanup deletes once a person confirms. */
  remove: CleanupEntry[];
  /** What looks like a legacy party channel but is not surely one: for a person to judge. */
  kept: CleanupEntry[];
  /**
   * The channels of the legacy trains, meetups and saved parties, which stay as plain channels:
   * listed for a person to delete the dead ones by hand.
   */
  stays: CleanupEntry[];
  /** Channels the legacy files name that the server no longer has (or never had). */
  gone: number;
}

interface ApiChannel {
  id: string;
  name: string;
  type: ChannelType;
  parent_id?: string | null;
}

/**
 * Who wrote a channel's first message: the bot (`status` when it is the legacy bot's status of
 * a party, `bot` for anything else it wrote), a member, nobody, or it cannot be read.
 */
type FirstAuthor = 'status' | 'bot' | 'member' | 'none' | 'unreadable';

/**
 * The text the legacy bot began a party's channel with, above the party's status
 * (`getSourceChannelMessageHeader` of `app/raid.js`, `app/train.js`, `app/meetup.js`).
 */
const LEGACY_STATUS =
  /^Use <#\d+> to return to this (?:raid|raid train|meetup)'s regional channel\.$/u;

async function firstAuthor(
  discord: DiscordRead,
  channelId: string,
  botId: string,
): Promise<FirstAuthor> {
  try {
    const oldest = (await discord.get(Routes.channelMessages(channelId), {
      query: new URLSearchParams({ after: '0', limit: '1' }),
    })) as { author?: { id?: string }; content?: string }[];
    const author = oldest[0]?.author?.id;
    if (author === undefined) return 'none';
    if (author !== botId) return 'member';
    return LEGACY_STATUS.test((oldest[0]?.content ?? '').trim()) ? 'status' : 'bot';
  } catch (err) {
    if (
      err instanceof DiscordAPIError &&
      (err.code === RESTJSONErrorCodes.MissingAccess ||
        err.code === RESTJSONErrorCodes.MissingPermissions)
    ) {
      return 'unreadable';
    }
    throw err;
  }
}

const KIND_WORD: Readonly<Record<LegacyKind, string>> = {
  raid: 'raid',
  train: 'train',
  meetup: 'meetup',
};

export interface CleanupListOptions {
  /** The server. */
  guildId: string;
  /** The bot's own user id: the author of a legacy party channel's first message. */
  botId: string;
  /** The server's region channels: never listed; their categories are scanned. */
  regionChannelIds: readonly string[];
  /** The forums of its regions: never listed. */
  regionForumIds: readonly string[];
  /** The channels of the server's settings (plan 19A-1: by id): never listed. */
  settingsChannelIds: readonly string[];
  /**
   * The names the settings file gives its channels (`channelNamesOf`): never listed either, as
   * before 2.1, so that a second channel of such a name, or one the fill did not match, stays
   * (review F6).
   */
  settingsChannelNames: readonly string[];
  /**
   * The parties of the legacy `active/` files; undefined when they could not be read, so that a
   * train or meetup found by its name may be an open one and is left to a person.
   */
  legacyParties: readonly LegacyParty[] | undefined;
}

/** What a party that stays is, said without its name. */
function staysWhy(party: LegacyParty): { kind: LegacyKind; why: string } {
  const kind: LegacyKind =
    party.type === 'raid train' ? 'train' : party.type === 'meet-up' ? 'meetup' : 'raid';
  if (party.saved) {
    return { kind, why: `a ${KIND_WORD[kind]} saved with !save-party` };
  }
  return { kind, why: `a legacy ${KIND_WORD[kind]}` };
}

/**
 * The list of the cleanup, read only: the server's channels, and the first message of each text
 * channel in a scanned category (those of the region channels and of the channels the files
 * name; no category where one of them has none) that has a legacy name or is not named by a file.
 */
export async function cleanupList(
  discord: DiscordRead,
  options: CleanupListOptions,
): Promise<CleanupList> {
  const { guildId, botId, regionChannelIds, regionForumIds } = options;
  const filesRead = options.legacyParties !== undefined;
  const legacyParties = options.legacyParties ?? [];
  const legacyChannelIds = legacyParties.map((party) => party.channelId);
  const staying = new Map(
    legacyParties.filter(staysAtCutover).map((party) => [party.channelId, party]),
  );
  const channels = (await discord.get(Routes.guildChannels(guildId))) as ApiChannel[];
  const byId = new Map(channels.map((channel) => [channel.id, channel]));
  const named = new Set(legacyChannelIds);
  // Never listed, whatever a file says: the region channels, their forums, the channels of the
  // server's settings.
  const kept = new Set([...regionChannelIds, ...regionForumIds, ...options.settingsChannelIds]);
  const settingsNames = new Set(options.settingsChannelNames);
  // Orphans are looked for only in categories: a region channel without one sits among the
  // server's own channels, which are never scanned.
  const categories = new Set(
    [...regionChannelIds, ...legacyChannelIds].flatMap((id) => {
      const parent = byId.get(id)?.parent_id;
      return parent ? [parent] : [];
    }),
  );
  const categoryName = (id: string | null | undefined) =>
    id === null || id === undefined ? null : (byId.get(id)?.name ?? null);
  const remove: CleanupEntry[] = [];
  const toJudge: CleanupEntry[] = [];
  const stays: CleanupEntry[] = [];
  for (const channel of channels) {
    if (channel.type !== ChannelType.GuildText || kept.has(channel.id)) continue;
    if (settingsNames.has(channel.name)) continue;
    if (!named.has(channel.id) && !(channel.parent_id && categories.has(channel.parent_id))) {
      continue;
    }
    const legacy = legacyNameOf(channel.name);
    const entry = (why: string): CleanupEntry => ({
      channelId: channel.id,
      name: channel.name,
      category: categoryName(channel.parent_id),
      kind: legacy?.kind,
      why,
    });
    const party = staying.get(channel.id);
    if (party) {
      const { kind, why } = staysWhy(party);
      stays.push({
        ...entry(why),
        kind,
        party: { name: party.name, createdAt: party.createdAt, signedUp: party.signedUp },
      });
      continue;
    }
    if (named.has(channel.id)) {
      remove.push(entry('a legacy file names it'));
      continue;
    }
    const first = await firstAuthor(discord, channel.id, botId);
    const byBot = first === 'bot' || first === 'status';
    // A name of two words without the bot's message first is a chat channel: not listed.
    if (legacy && !legacy.sure && !byBot) continue;
    const like = legacy ? `named like a legacy ${KIND_WORD[legacy.kind]} channel` : undefined;
    if (like && !legacy?.sure && first === 'bot') {
      // Any channel of two words the bot wrote in first: deleted only with the legacy status.
      toJudge.push(entry(`${like} and the bot wrote first, but not a legacy status`));
    } else if (like && first === 'status' && !legacy?.sure) {
      remove.push(entry(`${like}, and its first message is the legacy bot’s status`));
    } else if (like && byBot && !filesRead && legacy?.kind !== 'raid') {
      // Without the files a train or meetup may be an open one, which stays: a person judges.
      toJudge.push(
        entry(
          `${like}, and its first message is the bot’s, but without the legacy files I cannot ` +
            'tell whether it is still open',
        ),
      );
    } else if (like && byBot) {
      remove.push(entry(`${like}, and its first message is the bot’s`));
    } else if (like && legacy?.sure) {
      toJudge.push(
        entry(
          `${like}, but ${
            first === 'none'
              ? 'it has no messages'
              : first === 'unreadable'
                ? 'I may not read its messages'
                : 'its first message is not the bot’s'
          }`,
        ),
      );
    } else if (!like && byBot) {
      toJudge.push(entry('its first message is the bot’s, but its name is no legacy party name'));
    }
  }
  const gone = legacyChannelIds.filter((id) => !byId.has(id)).length;
  return { remove, kept: toJudge, stays, gone };
}

export interface DeleteOptions {
  /** The pause between two deletions, for Discord's rate limits. */
  pauseMs: number;
  /** Waits; a test passes one that does not. */
  wait?: (ms: number) => Promise<void>;
  /** What the server's audit log says of each deletion. */
  reason: string;
  /** Told how many channels are done after each one (deleted, gone or failed). */
  progress?: (done: number) => Promise<void> | void;
}

export interface DeleteOutcome {
  deleted: CleanupEntry[];
  /** Gone already (deleted by hand meanwhile). */
  gone: CleanupEntry[];
  failed: { entry: CleanupEntry; reason: string }[];
}

const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms).unref();
  });

/** Deletes the channels one after the other, with a pause between two; never throws for one. */
export async function deleteListed(
  discord: DiscordDelete,
  entries: readonly CleanupEntry[],
  options: DeleteOptions,
): Promise<DeleteOutcome> {
  const wait = options.wait ?? sleep;
  const outcome: DeleteOutcome = { deleted: [], gone: [], failed: [] };
  for (const [index, entry] of entries.entries()) {
    if (index > 0) await wait(options.pauseMs);
    try {
      await discord.delete(Routes.channel(entry.channelId), { reason: options.reason });
      outcome.deleted.push(entry);
    } catch (err) {
      if (err instanceof DiscordAPIError && err.code === RESTJSONErrorCodes.UnknownChannel) {
        outcome.gone.push(entry);
      } else {
        outcome.failed.push({ entry, reason: failureReason(err) });
      }
    }
    await options.progress?.(index + 1);
  }
  return outcome;
}
