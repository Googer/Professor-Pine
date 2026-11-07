import type { UserSettings, UserSettingsReader } from '../db/repositories/user-repository.js';
import type { PartyGateway } from '../discord/party-gateway.js';
import type { Party, Refusal } from '../domain/party/party.js';
import type { Logger } from '../log.js';
import { inMessages } from '../render/text.js';
import type { ChangeCause, PartyStore } from './party-store.js';

/**
 * The settings of these members, read at once, for a service that wants to know whom it may
 * ping; nothing is read for nobody. When they cannot be read the answer is empty, so that nobody is pinged, and the failure
 * is logged: the message itself still goes out.
 */
export async function settingsOf(
  users: UserSettingsReader,
  snowflakes: readonly string[],
  log: Logger,
): Promise<Map<string, UserSettings>> {
  if (snowflakes.length === 0) return new Map();
  try {
    return await users.getMany(snowflakes);
  } catch (err) {
    log.warn({ err, members: snowflakes.length }, 'could not read the settings of members');
    return new Map();
  }
}

/**
 * Says `text` in a party's post and pings every one of `members`, in as many messages as it
 * takes (`inMessages`), one after the other. Before each message it asks the store whether the
 * party is still active and still has this post (a message into an archived post would open it
 * again; a raid that moved has another): if not, or when Discord says the post is gone, the rest
 * is not sent. `complete` says whether every message went, `stopped` why not (`PingStop`),
 * `pinged` how many were pinged, `sent` how many messages went (the first holds the text).
 */
export async function pingInMessages(
  deps: {
    store: Pick<PartyStore, 'get'>;
    gateway: Pick<PartyGateway, 'sendMessage'>;
  },
  partyId: string,
  postId: string,
  text: string,
  members: readonly string[],
): Promise<
  | { complete: true; pinged: number; sent: number }
  | { complete: false; stopped: PingStop; pinged: number; sent: number }
> {
  let pinged = 0;
  let sent = 0;
  for (const message of inMessages(text, members)) {
    const party = deps.store.get(partyId);
    if (party === undefined) return { complete: false, stopped: 'gone', pinged, sent };
    if (party.forumPostId !== postId) return { complete: false, stopped: 'moved', pinged, sent };
    if ((await deps.gateway.sendMessage(postId, message)) === undefined) {
      return { complete: false, stopped: 'gone', pinged, sent };
    }
    pinged += message.mention.users.length;
    sent += 1;
  }
  return { complete: true, pinged, sent };
}

/**
 * Why `pingInMessages` stopped: the party ended (or its post is gone on Discord), or it is still
 * active with another post (a raid moved to another region's forum).
 */
export type PingStop = 'gone' | 'moved';

/**
 * What came of one change of a party that was decided inside the store. `gone`: there is no
 * such active party of the kind the change is for. `refused`: the party stays as it was;
 * `refusal` is what the change answered (its `reason`, and whatever else it said). `ok`: the
 * party as it is stored now, with what else the change answered (`extra`); `written` is false
 * when the party already was so.
 */
export type StoredChange<P extends Party, Extra, Refused extends Refusal = Refusal> =
  | { kind: 'gone' }
  | { kind: 'refused'; refusal: Refused }
  | { kind: 'ok'; party: P; written: boolean; extra: Extra };

/** For a change that any kind of party can have. */
export function anyParty(_party: Party): _party is Party {
  return true;
}

/**
 * A change made by this member, for the audit log (`ChangeCause`): their id and the name the
 * interaction gave; none for no member (Pine itself).
 */
export function byMember(
  member: { id: string; name?: string | undefined } | undefined,
): ChangeCause | undefined {
  return member === undefined ? undefined : { by: loggedBy(member) };
}

/** A member as the audit log names who made a change: the id, and the name where there is one. */
export function loggedBy(member: { id: string; name?: string | undefined }): {
  id: string;
  name?: string;
} {
  return member.name === undefined ? { id: member.id } : { id: member.id, name: member.name };
}

/**
 * Runs one change of a party inside the store: the skeleton that the services for what members
 * do share (`AttendanceService`, `RaidChangeService`, `TimedPartyService`, `TrainService`).
 * `change` gets the party as it is at that moment, when it `fits` (a party of another kind is
 * `gone`: there is no such party), and decides there; it answers what a function of
 * `src/domain/party` answers. What the caller does about the outcome (the post, the line in it,
 * the private answer) is its own. `cause` says who made it, for the audit log.
 */
export async function storedChange<P extends Party, Extra, Refused extends Refusal = Refusal>(
  store: Pick<PartyStore, 'update'>,
  partyId: string,
  fits: (party: Party) => party is P,
  change: (party: P) => ({ ok: true; party: P } & Extra) | Refused,
  cause?: ChangeCause,
): Promise<StoredChange<P, Extra, Refused>> {
  type Decision =
    ({ ok: true; party: P } & Extra) | Refused | { ok?: undefined; party?: undefined };
  const result = await store.update(
    partyId,
    (party): Decision => (fits(party) ? change(party) : {}),
    cause,
  );
  if (result?.ok === undefined) return { kind: 'gone' };
  if (!result.ok) return { kind: 'refused', refusal: result };
  const { ok: _ok, party, written, ...rest } = result;
  // What is left of the answer is what the change added to it: the one place that says so.
  return { kind: 'ok', party, written, extra: rest as unknown as Extra };
}
