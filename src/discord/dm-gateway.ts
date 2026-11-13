import { ChannelType, DiscordAPIError, RESTJSONErrorCodes, type Client } from 'discord.js';
import { ServerBoundedMap } from '../bounded-map.js';
import { discordPayload, type OutgoingMessage } from './party-gateway.js';

/**
 * What became of a direct message: `sent` when it went out; `closed` when Discord says this
 * member cannot be written to (they take no direct messages from the server's members, they
 * blocked the bot, they share no server with it any more, or the account is gone); `slow-down`
 * when Discord refused to open another DM channel because the bot opened too many too fast
 * (error 40003): the message did not go out, and whoever sends should pause.
 */
export type DmOutcome = 'sent' | 'closed' | 'slow-down';

/**
 * The one thing direct messages ask of Discord, so that the sender can be tested without it:
 * send this message to this user, for this server (`serverId`, the job's: null for what is the
 * instance's). Throws for any failure that `DmOutcome` does not name.
 */
export interface DmGateway {
  send(userId: string, message: OutgoingMessage, serverId: string | null): Promise<DmOutcome>;
}

/** Discord's answers that mean "nobody can write to this member", which no retry changes. */
const CLOSED: ReadonlySet<number | string> = new Set([
  RESTJSONErrorCodes.CannotSendMessagesToThisUser,
  RESTJSONErrorCodes.CannotSendMessagesToThisUserDueToHavingNoMutualGuilds,
  RESTJSONErrorCodes.UnknownUser,
]);

/** Whether Discord refused a direct message because the member takes none (50007 and its kin). */
export function isClosedDm(err: unknown): boolean {
  return err instanceof DiscordAPIError && CLOSED.has(err.code);
}

/** Whether Discord refused to open a DM channel because too many were opened too fast (40003). */
export function isSlowDown(err: unknown): boolean {
  return (
    err instanceof DiscordAPIError && err.code === RESTJSONErrorCodes.OpeningDirectMessagesTooFast
  );
}

/**
 * As many members as the gateway remembers the DM channel of, over every server; the one
 * remembered longest of the server remembering the most goes first (`ServerBoundedMap`, plan
 * 19B-5: one server's burst of first messages pushes out its own). A forgotten one only costs
 * the look-up again.
 */
const KNOWN_CHANNELS = 10_000;
/** The key in `channels` of what is the instance's (the owner's DMs): no snowflake is empty. */
const INSTANCE = '';

/**
 * The gateway over a discord.js client: thin, and like the party gateway mostly tested by the
 * staging run (`dm-gateway.test.ts` checks what it remembers, over a fake client). The client is
 * handed over once it exists; anything asked before that fails.
 *
 * The first message to a member opens their DM channel (`users.createDM`: one REST call, `POST
 * /users/@me/channels`, unless the client has the channel cached) and sends into it (a second
 * call). The channel and its recipient stay cached, so a member's next message is one call; the
 * message itself is not kept (`createClient` gives the message cache of DM channels a limit of
 * zero). discord.js finds a member's cached channel by going through every cached channel
 * (`UserManager.dmChannel`), which with thousands of DM channels would be a walk per message:
 * so the id of a member's channel is remembered here, under the server of the message (a member
 * written to for two servers is remembered twice), and the channel taken from the cache by id;
 * only a member's first message of a run walks. A send that fails forgets the member's
 * channel, whatever the failure was (also the channel this very send opened and remembered): the
 * member's next message asks for their channel anew. A 429 is waited out by discord.js itself: nothing here tries again.
 */
export class DiscordDmGateway implements DmGateway {
  private current: Client | undefined;
  /** The DM channel of a member, by server and user id (see the class comment). */
  private readonly channels: ServerBoundedMap<string, string>;

  /** `maxKnown`: as many channels as are remembered; `KNOWN_CHANNELS` unless set (tests). */
  constructor(maxKnown = KNOWN_CHANNELS) {
    this.channels = new ServerBoundedMap(maxKnown);
  }

  /** The client to talk through from now on. */
  use(client: Client): void {
    this.current = client;
  }

  async send(
    userId: string,
    message: OutgoingMessage,
    serverId: string | null,
  ): Promise<DmOutcome> {
    const client = this.current;
    if (!client) throw new Error('Discord is not connected yet');
    const server = serverId ?? INSTANCE;
    const known = this.channels.get(server, userId);
    try {
      const cached = known === undefined ? undefined : client.channels.cache.get(known);
      const channel =
        cached?.type === ChannelType.DM ? cached : await client.users.createDM(userId);
      // A channel that is remembered already keeps its place: the one remembered longest goes.
      if (known !== channel.id) this.channels.set(server, userId, channel.id);
      await channel.send(discordPayload(message));
      return 'sent';
    } catch (err) {
      // Forgotten before the failure is looked at, whatever it was and whether the channel was
      // remembered before this send or by it: the next message asks for the channel anew.
      this.channels.delete(server, userId);
      if (isClosedDm(err)) return 'closed';
      if (isSlowDown(err)) return 'slow-down';
      throw err;
    }
  }
}
