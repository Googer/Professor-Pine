import type { HistoryStorage, UnrecordedParty } from '../db/repositories/history-repository.js';
import {
  historyBoss,
  historyMembers,
  historyOfParty,
  partySteps,
  splitPending,
  type HistoryBoss,
  type HistoryNote,
  type HistoryNoteEnd,
  type PartyEnd,
  type PartyWrite,
} from '../domain/history/party-history.js';
import {
  isMax,
  isRaid,
  type Party,
  type RaidBossRef,
  type StopRef,
} from '../domain/party/party.js';
import { listedMaxBoss } from '../domain/pogo/max-boss-list.js';
import type { Logger } from '../log.js';
import type { GameDataProvider } from './game-data-service.js';
import type { MaxBossProvider } from './max-boss-service.js';
import type { RaidBossProvider } from './raid-boss-service.js';

/** How long the tries of a note that failed wait, one after the other: then it is given up. */
export const HISTORY_RETRY_DELAYS_MS: readonly number[] = [60_000, 10 * 60_000, 60 * 60_000];

export interface PartyHistoryOptions {
  /** Where a note that could not be written with its party is written later. */
  storage: HistoryStorage;
  gameData: GameDataProvider;
  raidBosses: RaidBossProvider;
  /** The max bosses, for whether a max battle's boss could be shiny (as its post says). */
  maxBosses: Pick<MaxBossProvider, 'bosses'>;
  log: Logger;
  retryDelaysMs?: readonly number[];
  setTimer?: (run: () => void, ms: number) => () => void;
  /**
   * A party's stored row, for the sweep: the party, `unreadable` for a row that cannot be read,
   * undefined for one that is gone.
   */
  readParty: (partyId: string) => Promise<Party | 'unreadable' | undefined>;
  /** How many parties the sweep records between two lines of progress; 1,000 by default. */
  sweepProgressEvery?: number;
  /**
   * The regions of a server (its row id) a stop of a train lies in now, by `Region.id`, in the
   * directory's order (`stopRegionsInGuild`; plan 8H-7A): asked when a train's record is made, in
   * the ending transaction, and kept with each of its stops. Without it no stop keeps its regions.
   */
  stopRegions?: (guildId: number, stop: StopRef) => readonly number[];
}

/** How often the sweep says how far it got, in parties recorded. */
const SWEEP_PROGRESS_EVERY = 1_000;

/**
 * The party history of live parties (plan 8H, docs/architecture/history.md). The store asks it
 * for what each write of a party adds (`noteOf`): the steps the party's model does not keep (who
 * reached which status when, who left, where a train was, a group's meeting time), and when the
 * write ended the party, its record, which the storage writes in the same transaction. A note
 * the storage could not write is tried again later (`failed`), a few times, then given up and
 * logged; it never keeps a party from ending. Members are named only with their opt-in, as it is
 * when the record is written.
 */
export class PartyHistory {
  private readonly setTimer: (run: () => void, ms: number) => () => void;
  private readonly delays: readonly number[];
  /** The tries that wait, with what cancels their timer. */
  private readonly waiting = new Map<
    () => Promise<void>,
    { cancel: () => void; note: HistoryNote }
  >();

  constructor(private readonly options: PartyHistoryOptions) {
    this.delays = options.retryDelaysMs ?? HISTORY_RETRY_DELAYS_MS;
    this.setTimer =
      options.setTimer ??
      ((run, ms) => {
        const timer = setTimeout(run, ms);
        timer.unref();
        return () => {
          clearTimeout(timer);
        };
      });
  }

  noteOf(write: PartyWrite): HistoryNote | undefined {
    const { before, after, movedFrom } = write;
    const steps = partySteps(before, after, after.updatedAt);
    // A raid that moved goes on as this party: its record takes the old one along.
    if (movedFrom !== undefined) {
      steps.push({
        partyId: after.id,
        at: after.updatedAt,
        kind: 'from',
        subject: movedFrom,
        value: null,
      });
    }
    const ends = after.status === 'ended' && before?.status !== 'ended';
    const end = ends ? this.endOf(after, write.ended) : undefined;
    if (steps.length === 0 && end === undefined) return undefined;
    return { partyId: after.id, guildId: after.guildId, steps, ...(end ? { end } : {}) };
  }

  private endOf(party: Party, ended: PartyEnd | undefined): HistoryNoteEnd {
    if (ended?.how === 'moved') return { kind: 'move', to: ended.to };
    if (ended?.how === 'failed') return { kind: 'drop' };
    // The new train of a split that ended before the split was settled never was one (plan 8T).
    if (splitPending(party)) return { kind: 'drop' };
    // Decided now, from the boss list as it is when the party ends.
    const shiny = this.shinyOf(party);
    const { stopRegions } = this.options;
    return {
      kind: 'record',
      members: (steps) => historyMembers(party, steps),
      build: (steps, optedIn) =>
        historyOfParty(party, {
          end: ended,
          steps,
          optedIn,
          describeBoss: (ref) => this.describeBoss(ref),
          shiny,
          // Where its stops lie when the record is made, in the ending transaction.
          ...(stopRegions === undefined
            ? {}
            : { stopRegions: (stop: StopRef) => stopRegions(party.guildId, stop) }),
        }),
    };
  }

  /** A boss by the catalogue's ids; one it does not know (any more) by its name or key. */
  private describeBoss(ref: RaidBossRef): HistoryBoss {
    if ('name' in ref) return { name: ref.name };
    const entry = this.options.gameData.catalogue.byKey(ref.key);
    if (!entry) return { name: ref.key };
    return historyBoss(entry);
  }

  /**
   * Whether the boss list says a raid's or a max battle's boss can be shiny; null where it does
   * not know. A max battle's boss is looked up as its post shows it (`listedMaxBoss`): in its
   * tier, by its catalogue entry or the name it was reported by.
   */
  private shinyOf(party: Party): boolean | null {
    if (isMax(party)) {
      const { boss, tier } = party.max;
      const { catalogue } = this.options.gameData;
      return (
        listedMaxBoss(boss, tier, catalogue, this.options.maxBosses.bosses()).listed?.shiny ?? null
      );
    }
    if (!isRaid(party) || party.raid.boss === null || !('key' in party.raid.boss)) return null;
    const { key } = party.raid.boss;
    const boss = this.options.raidBosses.bossesOf(party.raid.tier).find((b) => b.key === key);
    return boss?.shiny ?? null;
  }

  /**
   * A note could not be written with its party (the storage says so once the party's write has
   * committed): it is tried again later, alone.
   */
  failed(note: HistoryNote, err: unknown): void {
    this.options.log.warn(
      { err, party: note.partyId },
      'could not write the party history; trying again later',
    );
    this.later(note, 0);
  }

  private later(note: HistoryNote, attempt: number): void {
    const delay = this.delays[attempt];
    if (delay === undefined) {
      this.options.log.error(
        { party: note.partyId, steps: note.steps.length, ends: note.end?.kind },
        'gave up writing the party history of a party',
      );
      return;
    }
    const run = async (): Promise<void> => {
      this.waiting.delete(run);
      try {
        await this.options.storage.write(note, { retry: true });
      } catch (err) {
        this.options.log.warn({ err, party: note.partyId }, 'could not write the party history');
        this.later(note, attempt + 1);
      }
    };
    this.waiting.set(run, { cancel: this.setTimer(() => void run(), delay), note });
  }

  /** Runs the tries that wait now, and waits for them (for tests). */
  async flush(): Promise<void> {
    const runs = [...this.waiting];
    for (const [, { cancel }] of runs) cancel();
    await Promise.all(runs.map(([run]) => run()));
  }

  /**
   * Whether a note that waits for its next try is about this party: its own (its end, which
   * knows how it ended), or the step of a raid that went on from it (whose record takes it
   * along). The sweep leaves such a party to that try.
   */
  private pending(partyId: string): boolean {
    for (const { note } of this.waiting.values()) {
      if (note.partyId === partyId) return true;
      if (note.steps.some((step) => step.kind === 'from' && step.subject === partyId)) return true;
    }
    return false;
  }

  /**
   * With the forums' upkeep, at start and hourly (`PartyScheduler`): every party that ended and
   * still has its row (its record failed every try, the bot stopped before them, or it ended
   * before the history existed, with or without steps) is recorded now from that row, as ended
   * for a reason not known, and its row and steps go. A raid that moved is left to the party it
   * goes on as; a party whose note waits for its next try is left to that try; a party without a
   * post (it never was one) is dropped; a row that cannot be read is logged and left, as the
   * store leaves one. Active parties are left alone. Says how many it is about to record and how
   * far it got (a first start over many old rows takes a while), nothing when there are none.
   * `isStopped` is asked before each party: once it says yes, the sweep ends there (the
   * scheduler's stop, at shutdown). Answers how many were recorded; never rejects.
   */
  async sweep(options: { isStopped?: () => boolean } = {}): Promise<number> {
    const { storage, log, readParty } = this.options;
    const isStopped = options.isStopped ?? (() => false);
    const every = this.options.sweepProgressEvery ?? SWEEP_PROGRESS_EVERY;
    let parties: UnrecordedParty[];
    try {
      parties = await storage.unrecorded();
    } catch (err) {
      log.error({ err }, 'could not look for parties left without their history');
      return 0;
    }
    // First what is to be written, so that the count is of those alone.
    const notes: HistoryNote[] = [];
    for (const { partyId, movedTo } of parties) {
      if (isStopped()) return 0;
      if (movedTo !== null || this.pending(partyId)) continue;
      try {
        const party = await readParty(partyId);
        if (party === undefined) continue;
        if (party === 'unreadable') {
          log.warn({ party: partyId }, 'could not read a party left without its history; it stays');
          continue;
        }
        notes.push(
          party.forumPostId !== null
            ? { partyId, guildId: party.guildId, steps: [], end: this.endOf(party, undefined) }
            : { partyId, guildId: party.guildId, steps: [], end: { kind: 'drop' } },
        );
      } catch (err) {
        log.warn({ err, party: partyId }, 'could not record a party left without its history');
      }
    }
    if (notes.length === 0) return 0;
    log.info({ parties: notes.length }, 'recording parties left without their history');
    let recorded = 0;
    let written = 0;
    for (const note of notes) {
      if (isStopped()) break;
      // A try that began to wait meanwhile (the party went on as another) has it.
      if (this.pending(note.partyId)) continue;
      try {
        await storage.write(note, { retry: true });
        written += 1;
        if (note.end?.kind === 'record') recorded += 1;
        if (written % every === 0 && written < notes.length) {
          log.info(
            { written, parties: notes.length },
            `recorded ${String(written)} of the parties left without their history`,
          );
        }
      } catch (err) {
        log.warn({ err, party: note.partyId }, 'could not record a party left without its history');
      }
    }
    log.info({ parties: recorded }, 'recorded parties left without their history');
    return recorded;
  }

  /** Cancels the tries that wait (at shutdown: what was not written is lost, as logged). */
  close(): void {
    for (const { cancel, note } of this.waiting.values()) {
      cancel();
      this.options.log.warn(
        { party: note.partyId },
        'a write of the party history was given up at shutdown',
      );
    }
    this.waiting.clear();
  }
}
