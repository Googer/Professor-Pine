import type { DmGateway, DmOutcome } from '../../src/discord/dm-gateway.js';
import type { OutgoingMessage } from '../../src/discord/party-gateway.js';
import type {
  DmContacts,
  DmJob,
  DmSender,
  LoopDelayMeter,
  QueuedDmSender,
} from '../../src/services/dm-sender.js';
import { FakePartyGateway } from './fake-gateway.js';
import { watchImmediates } from './timers.js';

/**
 * Throws for a direct message Discord would refuse (`FakePartyGateway.checkMessage`) and for one
 * that names somebody to ping: nothing sent as a DM should try.
 */
export function checkDm(message: OutgoingMessage): void {
  FakePartyGateway.checkMessage(message);
  if (message.mention?.users?.length || message.mention?.roles?.length) {
    throw new Error('A direct message pings nobody');
  }
}

/**
 * A `DmGateway` kept in memory. `sent` holds what went out, in order; a member of `closed`
 * takes no direct messages; a member of `slow` gets `slow-down`; `failing` makes every send
 * reject. It is as strict as Discord about what a message may hold, with the very checks of
 * `FakePartyGateway.checkMessage`: for a classic message content or an embed, the limits of an
 * embed, five rows of five controls; for a components-v2 message (the notifier's) no content or
 * embeds beside the flag, 40 components, the text budget, sections with an accessory, unique
 * custom ids. A DM pings nobody: a message that names somebody to ping is refused, because
 * nothing that is sent as a DM should try.
 *
 * Like Discord it answers in a later turn of the event loop (`setImmediate`), so a test that
 * needs a fixed time fakes only `Date`. `most` is the largest number of sends that were on
 * their way at once.
 */
export class FakeDmGateway implements DmGateway {
  readonly sent: { userId: string; message: OutgoingMessage }[] = [];
  readonly closed = new Set<string>();
  /** A send to one of these is answered `slow-down`, as when Discord opens no more DM channels. */
  readonly slow = new Set<string>();
  /** Every member a send was started for, in order, whatever came of it. */
  readonly asked: string[] = [];
  failing: Error | undefined;
  /** Sends that wait here are answered only when a test calls `release()`. */
  hold = false;
  most = 0;
  private running = 0;
  private readonly held: (() => void)[] = [];

  /** Answers the sends that `hold` kept waiting. */
  release(): void {
    this.hold = false;
    for (const answer of this.held.splice(0)) answer();
  }

  send(userId: string, message: OutgoingMessage): Promise<DmOutcome> {
    this.asked.push(userId);
    this.running += 1;
    this.most = Math.max(this.most, this.running);
    return new Promise((resolve, reject) => {
      const answer = (): void => {
        this.running -= 1;
        try {
          if (this.failing) throw this.failing;
          checkDm(message);
          if (this.slow.has(userId)) {
            resolve('slow-down');
            return;
          }
          if (this.closed.has(userId)) {
            resolve('closed');
            return;
          }
          this.sent.push({ userId, message });
          resolve('sent');
        } catch (err) {
          reject(err instanceof Error ? err : new Error(String(err)));
        }
      };
      if (this.hold) this.held.push(answer);
      else setImmediate(answer);
    });
  }

  /** The messages that went to one member, oldest first. */
  to(userId: string): OutgoingMessage[] {
    return this.sent.filter((sent) => sent.userId === userId).map((sent) => sent.message);
  }
}

/**
 * A `DmSender` that only keeps what was put in line, for tests of what puts it there. Every
 * message is held to what Discord takes of a DM (`checkDm`) as it is put in line.
 */
export class RecordingDms implements DmSender {
  readonly jobs: DmJob[] = [];

  send(job: DmJob): void {
    checkDm(job.message);
    this.jobs.push(job);
  }

  /** The messages for one member, in the order they were put in line. */
  to(userId: string): OutgoingMessage[] {
    return this.jobs.filter((job) => job.userId === userId).map((job) => job.message);
  }

  /** The servers of the messages for one member (null: the instance's), in order. */
  serversOf(userId: string): (string | null)[] {
    return this.jobs.filter((job) => job.userId === userId).map((job) => job.serverId);
  }

  /** The members that have a message in line, each once, in order. */
  get recipients(): string[] {
    return [...new Set(this.jobs.map((job) => job.userId))];
  }
}

/**
 * The members Pine wrote to before (`DmContacts`, the table `DmContact`), kept in memory. `known`
 * answers in a later turn of the event loop, as the database does; `failing` makes it reject,
 * and while `hold` is set it answers only when a test calls `release()`. `addFailing` makes
 * `add` reject (the member is not recorded); while `addHold` is set, `add` never settles (a
 * write the database does not answer). `asked` holds every batch it was asked about, `added`
 * every member it was asked to record, in order.
 */
export class MemoryDmContacts implements DmContacts {
  /** The members written to before, with when they were first. */
  readonly contacts = new Map<string, number>();
  readonly asked: string[][] = [];
  readonly added: string[] = [];
  failing: Error | undefined;
  addFailing: Error | undefined;
  /** Records asked while set never settle. */
  addHold = false;
  /** Reads asked while set are answered only when a test calls `release()`. */
  hold = false;
  private readonly held: (() => void)[] = [];

  constructor(known: readonly string[] = []) {
    for (const userId of known) this.contacts.set(userId, 0);
  }

  /** Answers the reads that `hold` kept waiting. */
  release(): void {
    this.hold = false;
    for (const answer of this.held.splice(0)) setImmediate(answer);
  }

  known(userIds: readonly string[]): Promise<ReadonlySet<string>> {
    this.asked.push([...userIds]);
    return new Promise((resolve, reject) => {
      const answer = (): void => {
        if (this.failing) reject(this.failing);
        else resolve(new Set(userIds.filter((userId) => this.contacts.has(userId))));
      };
      if (this.hold) this.held.push(answer);
      else setImmediate(answer);
    });
  }

  add(userId: string, at: number): Promise<void> {
    this.added.push(userId);
    if (this.addHold) return new Promise<void>(() => undefined);
    if (this.addFailing) return Promise.reject(this.addFailing);
    if (!this.contacts.has(userId)) this.contacts.set(userId, at);
    return Promise.resolve();
  }
}

/** A meter that measures nothing and says what a test sets. */
export class FakeLoopDelay implements LoopDelayMeter {
  running = false;
  starts = 0;
  measured = { meanMs: 0, maxMs: 0 };
  /** While set, reading the measurement throws. */
  failing: Error | undefined;
  start(): void {
    this.running = true;
    this.starts += 1;
  }
  read(): { meanMs: number; maxMs: number } {
    if (this.failing) throw this.failing;
    return this.measured;
  }
  stop(): void {
    this.running = false;
  }
}

/** More pulls than any test needs (the largest sends five thousand): a sender that is still not idle never will be. */
const MAX_PULLS = 100_000;

/**
 * Pulls a sender whose timer a test holds (`startTimer`) until nothing waits and nothing is on
 * its way; after every pull, what it began is done (`settle`) before the next, as with a timer
 * slower than the fakes' answers. Gives the number of pulls it took.
 */
export async function pullUntilIdle(sender: QueuedDmSender): Promise<number> {
  const watch = watchImmediates();
  try {
    let pulls = 0;
    while (!sender.idle) {
      if (pulls >= MAX_PULLS) {
        throw new Error(
          `the sender was not idle after ${String(MAX_PULLS)} pulls: ` +
            `${String(sender.depth)} waiting, ${String(sender.sending)} on their way`,
        );
      }
      sender.pull();
      pulls += 1;
      await watch.settle();
    }
    return pulls;
  } finally {
    watch.restore();
  }
}
