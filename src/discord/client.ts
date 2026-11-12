import {
  Client,
  Options,
  Partials,
  type CacheFactory,
  type GatewayIntentBits,
  type RateLimitData,
} from 'discord.js';
import type { Logger } from '../log.js';
import {
  fallbackCandidates,
  intentsFor,
  isDisallowedIntentsError,
  type IntentFlags,
} from './intents.js';

/** A bucket wait on a channel edit that discord.js waits for; a longer one is rejected. */
const SHORT_WAIT_MS = 5_000;

/**
 * Renaming a thread is limited to two per ten minutes, and by default discord.js sleeps until the
 * limit frees, holding every later request on the same route. A rate limit on `PATCH
 * /channels/:id` that would block for long (a sublimit, or a bucket wait or retry-after of more than
 * five seconds) is rejected instead (a `RateLimitError`), so the caller can try again later. A global
 * limit and a short wait are waited for as usual.
 */
export function rejectsLongChannelPatchWait(
  data: Pick<
    RateLimitData,
    'route' | 'method' | 'global' | 'sublimitTimeout' | 'timeToReset' | 'retryAfter'
  >,
): boolean {
  return (
    data.route === '/channels/:id' &&
    data.method.toUpperCase() === 'PATCH' &&
    !data.global &&
    (data.sublimitTimeout > 0 || Math.max(data.timeToReset, data.retryAfter) > SHORT_WAIT_MS)
  );
}

/**
 * As many members of one server as the client keeps. Without the GuildMembers intent a member
 * comes into the cache only when they use the bot or are looked up (`MemberDirectory`), and is
 * never removed or kept current by Discord; the batch look-ups of plan 4B would let the cache
 * grow to everybody who was ever asked about. Nothing needs a member to stay: whoever is not
 * cached is asked for. The oldest go first; the bot's own member always stays (permission
 * checks read it).
 */
export const MEMBER_CACHE_SIZE = 2_000;

/**
 * What the client keeps in memory, where the defaults of discord.js would grow without bound
 * for this bot.
 *
 * - **Messages of DM channels: none.** A sent message is put into the message cache of its
 *   channel (`TextBasedChannel.send`), up to 200 per channel by default, embed included; a bot
 *   that sends direct messages for months would keep the last 200 of every member. Nothing
 *   reads a message from a cache (posts and messages are edited and deleted by id), and the
 *   message of a pressed button comes with the interaction. discord.js looks a limit up by the
 *   name of the manager's class, so `DMMessageManager` limits DM channels alone.
 * - **Messages of server channels: the default, 200 per channel.** That is bounded by the
 *   number of channels; the posts of ended parties are archived threads, which the default
 *   thread sweeper of discord.js removes from the cache four hours after their archiving,
 *   messages and all.
 * - **Members: `MEMBER_CACHE_SIZE` per server.**
 *
 * DM channels and users stay cached without a limit: each is small, there is one per member
 * who ever got a direct message, and a cached channel makes the next message one request
 * instead of two.
 */
export function cacheFactory(): CacheFactory {
  return Options.cacheWithLimits({
    ...Options.DefaultMakeCacheSettings,
    DMMessageManager: 0,
    GuildMemberManager: {
      maxSize: MEMBER_CACHE_SIZE,
      keepOverLimit: (member) => member.id === member.client.user.id,
    },
  });
}

/**
 * The client Pine logs in with. `shards: 'auto'` (plan 19D): discord.js asks Discord how many
 * gateway connections the bot needs (`GET /gateway/bot`; one up to 2,500 servers) and connects
 * them all in this process, as many at a time as Discord's `max_concurrency` allows, five seconds
 * apart; `ClientReady` comes once every shard is ready (`operations.md`, "Shards").
 */
export function createClient(intents: GatewayIntentBits[]): Client {
  return new Client({
    intents,
    shards: 'auto',
    partials: [Partials.Channel],
    makeCache: cacheFactory(),
    // Mentions are off unless a send opts in with its own allowedMentions.
    allowedMentions: { parse: [] },
    rest: { rejectOnRateLimit: rejectsLongChannelPatchWait },
  });
}

export interface LoginDeps {
  token: string;
  log: Logger;
  create(intents: GatewayIntentBits[]): Client;
  /** Attach event listeners. Called on every client before it logs in. */
  configure(client: Client): void;
}

const FLAG_HELP: Record<keyof IntentFlags, string> = {
  ocrPassive:
    'ocr.passive needs the Message Content intent. Enable it in the Discord Developer Portal ' +
    '(Bot → Privileged Gateway Intents). Passive screenshot OCR is off; /raid screenshot still works.',
  autoAssignRole:
    'autoAssignRole needs the Server Members intent. Enable it in the Discord Developer Portal ' +
    '(Bot → Privileged Gateway Intents). Auto-assigning a role on join is off.',
};

/**
 * Logs in with the requested intents. If Discord rejects a privileged intent, retries
 * with fewer, so the bot always comes online; the returned features say what is on.
 */
export async function loginWithFallback(
  requested: IntentFlags,
  deps: LoginDeps,
): Promise<{ client: Client; features: IntentFlags }> {
  const candidates = fallbackCandidates(requested);
  let refusal: unknown;
  for (const [index, candidate] of candidates.entries()) {
    const client = deps.create(intentsFor(candidate));
    deps.configure(client);
    try {
      await client.login(deps.token);
    } catch (err) {
      await client.destroy();
      if (!isDisallowedIntentsError(err)) throw err;
      refusal = err;
      if (index < candidates.length - 1) {
        deps.log.warn(
          { tried: candidate },
          'Discord rejected a privileged intent; retrying with fewer',
        );
      }
      continue;
    }
    for (const flag of Object.keys(FLAG_HELP) as Array<keyof IntentFlags>) {
      if (requested[flag] && !candidate[flag]) deps.log.warn(FLAG_HELP[flag]);
    }
    return { client, features: candidate };
  }
  throw new Error('Discord rejected the login even without privileged intents', {
    cause: refusal,
  });
}
