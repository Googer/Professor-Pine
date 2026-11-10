import { describe, expect, it } from 'vitest';
import {
  LiveSignals,
  LIVE_LIFETIME_MS,
  LIVE_LIFETIME_JITTER_MS,
  LIVE_PENDING_MS,
  LIVE_PING_MS,
  MAX_LIVE_PER_ADDRESS,
  MAX_LIVE_PER_MEMBER,
  MAX_LIVE_STREAMS,
  type LiveSink,
} from './live-signals.js';

const SERVER = '100000000000000001';
const OTHER_SERVER = '100000000000000002';
const ROW = 1;
const OTHER_ROW = 2;
const PARTIES = 'event: changed\ndata: parties 1000\n\n';
const REPORTS = 'event: changed\ndata: stop-reports 1000\n\n';
const SPAWNS = 'event: changed\ndata: spawns 1000\n\n';
const PING = 'event: ping\ndata: 1000\n\n';

/** Timers and a clock a test runs by hand. */
class Clock {
  now = 1_000_000;
  private readonly timers = new Set<{ at: number; run: () => void }>();

  setTimer = (run: () => void, ms: number): (() => void) => {
    const timer = { at: this.now + ms, run };
    this.timers.add(timer);
    return () => {
      this.timers.delete(timer);
    };
  };

  get waiting(): number {
    return this.timers.size;
  }

  /** Moves on, running what comes due in its order. */
  pass(ms: number): void {
    const until = this.now + ms;
    for (;;) {
      const next = [...this.timers]
        .filter((timer) => timer.at <= until)
        .sort((a, b) => a.at - b.at)[0];
      if (!next) break;
      this.timers.delete(next);
      this.now = next.at;
      next.run();
    }
    this.now = until;
  }
}

/** The member directory's answer for somebody who is a member still. */
const STILL_A_MEMBER = (): Promise<boolean> => Promise.resolve(true);

/** A stream's session and member for a test that is about neither. */
const ITS_SESSION = { session: 'a session', stillMember: STILL_A_MEMBER };

/** A stream as the hub sees it: what was written, whether it takes more, how it ended. */
class FakeSink implements LiveSink {
  readonly written: string[] = [];
  takes = true;
  ended = false;
  destroyed = false;
  throws = false;
  private tellEnded: () => void = () => undefined;
  /** Settles once the hub ended it politely: what a test of an ask's answer waits for. */
  readonly ending = new Promise<void>((resolve) => {
    this.tellEnded = resolve;
  });

  write(text: string): boolean {
    if (this.throws) throw new Error('the stream broke');
    this.written.push(text);
    return this.takes;
  }

  end(): void {
    this.ended = true;
    this.tellEnded();
  }

  destroy(): void {
    if (this.throws) throw new Error('the stream broke');
    this.destroyed = true;
  }

  /** What it was told after the first ping, without the pings. */
  get signals(): string[] {
    return this.written.filter((text) => !text.startsWith('event: ping'));
  }
}

function hubWith(random = 0) {
  const clock = new Clock();
  const hub = new LiveSignals({
    now: () => clock.now,
    setTimer: clock.setTimer,
    random: () => random,
  });
  let next = 0;
  const open = (
    who: {
      server?: string;
      row?: number;
      address?: string;
      member?: string;
      session?: string;
      stillMember?: () => Promise<boolean>;
    } = {},
  ): FakeSink => {
    next += 1;
    const sink = new FakeSink();
    const answer = hub.open({
      server: who.server ?? SERVER,
      row: who.row ?? ROW,
      address: who.address ?? `address-${next}`,
      member: who.member ?? `member-${next}`,
      session: who.session ?? `session-${next}`,
      stillMember: who.stillMember ?? STILL_A_MEMBER,
      sink,
    });
    if (answer.kind !== 'open') throw new Error(`the stream was refused: ${answer.kind}`);
    return sink;
  };
  return { clock, hub, open };
}

const party = (id: string, status = 'active', guildId = ROW) => ({ id, guildId, status });

describe('LiveSignals: the window', () => {
  it('signals the first change after a quiet spell at once, and merges later ones to the window’s end', () => {
    const { clock, hub, open } = hubWith();
    const sink = open();
    hub.reportsChanged(SERVER);
    expect(sink.signals).toEqual([REPORTS]);
    hub.reportsChanged(SERVER);
    hub.reportsChanged(SERVER);
    clock.pass(4_999);
    expect(sink.signals).toEqual([REPORTS]);
    clock.pass(1);
    expect(sink.signals).toEqual([REPORTS, REPORTS]);
    // The merged one opened a window of its own.
    hub.reportsChanged(SERVER);
    clock.pass(4_999);
    expect(sink.signals).toEqual([REPORTS, REPORTS]);
    clock.pass(1);
    expect(sink.signals).toEqual([REPORTS, REPORTS, REPORTS]);
    // Quiet for a window: at once again.
    clock.pass(5_000);
    hub.reportsChanged(SERVER);
    expect(sink.signals).toHaveLength(4);
  });

  it('keeps a window per list', () => {
    const { hub, open } = hubWith();
    const sink = open();
    hub.reportsChanged(SERVER);
    hub.partyChanged(party('ended', 'ended'));
    hub.spawnsChanged(SERVER);
    expect(sink.signals).toEqual([REPORTS, PARTIES, SPAWNS]);
  });

  it('tells of the spawns of the server named alone, a window at a time', () => {
    const { clock, hub, open } = hubWith();
    const sink = open();
    const other = open({ server: OTHER_SERVER, row: OTHER_ROW });
    hub.spawnsChanged(SERVER);
    hub.spawnsChanged(SERVER);
    expect(sink.signals).toEqual([SPAWNS]);
    clock.pass(5_000);
    expect(sink.signals).toEqual([SPAWNS, SPAWNS]);
    expect(other.signals).toEqual([]);
  });

  it('holds 5 seconds up to 50 maps, grows a second per 10 past them, and stops at 20 seconds', () => {
    const windowAt = (streams: number): number => {
      const { clock, hub, open } = hubWith();
      const first = open();
      for (let n = 1; n < streams; n++) open();
      hub.reportsChanged(SERVER);
      hub.reportsChanged(SERVER);
      const before = first.signals.length;
      let passed = 0;
      while (first.signals.length === before) {
        clock.pass(1_000);
        passed += 1_000;
      }
      return passed;
    };
    expect(windowAt(1)).toBe(5_000);
    expect(windowAt(50)).toBe(5_000);
    expect(windowAt(60)).toBe(6_000);
    expect(windowAt(100)).toBe(10_000);
    expect(windowAt(200)).toBe(20_000);
    expect(windowAt(300)).toBe(20_000);
  });

  it('counts the open streams of that server alone', () => {
    const { clock, hub, open } = hubWith();
    for (let n = 0; n < 100; n++) open({ server: OTHER_SERVER, row: OTHER_ROW });
    const sink = open();
    hub.reportsChanged(SERVER);
    hub.reportsChanged(SERVER);
    clock.pass(5_000);
    expect(sink.signals).toHaveLength(2);
  });

  it('never tells a server of another’s change', () => {
    const { hub, open } = hubWith();
    const sink = open();
    const other = open({ server: OTHER_SERVER, row: OTHER_ROW });
    hub.reportsChanged(SERVER);
    hub.partyChanged(party('there', 'ended', OTHER_ROW));
    expect(sink.signals).toEqual([REPORTS]);
    expect(other.signals).toEqual([PARTIES]);
  });

  it('tells every stream of the server', () => {
    const { hub, open } = hubWith();
    const [one, two] = [open(), open()];
    hub.reportsChanged(SERVER);
    expect(one.signals).toEqual([REPORTS]);
    expect(two.signals).toEqual([REPORTS]);
  });
});

describe('LiveSignals: the spread', () => {
  const spreadAt = (streams: number) => {
    const { hub, open } = hubWith();
    const first = open();
    for (let n = 1; n < streams; n++) open();
    hub.reportsChanged(SERVER);
    return first.signals[0];
  };

  it('is sent with every signal: a second up to 20 maps, a second per 20 past them, 20 at most', () => {
    expect(spreadAt(1)).toBe('event: changed\ndata: stop-reports 1000\n\n');
    expect(spreadAt(20)).toBe('event: changed\ndata: stop-reports 1000\n\n');
    expect(spreadAt(50)).toBe('event: changed\ndata: stop-reports 2500\n\n');
    expect(spreadAt(200)).toBe('event: changed\ndata: stop-reports 10000\n\n');
    expect(spreadAt(400)).toBe('event: changed\ndata: stop-reports 20000\n\n');
    expect(spreadAt(1_000)).toBe('event: changed\ndata: stop-reports 20000\n\n');
  });

  it('is sent with every ping, as the crowd is by then', () => {
    const { clock, open } = hubWith();
    const first = open();
    for (let n = 1; n < 200; n++) open();
    clock.pass(LIVE_PING_MS);
    expect(first.written).toEqual(['event: ping\ndata: 1000\n\n', 'event: ping\ndata: 10000\n\n']);
  });

  it('counts the streams of the whole process, one bot for all its servers', () => {
    const { hub, open } = hubWith();
    for (let n = 0; n < 100; n++) open({ server: OTHER_SERVER, row: OTHER_ROW });
    const first = open();
    for (let n = 1; n < 100; n++) open();
    hub.reportsChanged(SERVER);
    expect(first.signals).toEqual(['event: changed\ndata: stop-reports 10000\n\n']);
  });

  it('counts them in a ping too', () => {
    const { clock, open } = hubWith();
    const first = open();
    for (let n = 0; n < 199; n++) open({ server: OTHER_SERVER, row: OTHER_ROW });
    clock.pass(LIVE_PING_MS);
    expect(first.written.at(-1)).toBe('event: ping\ndata: 10000\n\n');
  });
});

describe('LiveSignals: a party’s change', () => {
  it('waits for its post, which flushes it at once', () => {
    const { clock, hub, open } = hubWith();
    const sink = open();
    hub.partyChanged(party('raid'));
    expect(sink.signals).toEqual([]);
    clock.pass(1_000);
    hub.postShown('raid', ROW, false);
    expect(sink.signals).toEqual([PARTIES]);
    // The timer went with it.
    clock.pass(5_000);
    expect(sink.signals).toEqual([PARTIES]);
  });

  it('is flushed by its timer when no draw comes', () => {
    const { clock, hub, open } = hubWith();
    const sink = open();
    hub.partyChanged(party('raid'));
    clock.pass(LIVE_PENDING_MS - 1);
    expect(sink.signals).toEqual([]);
    clock.pass(1);
    expect(sink.signals).toEqual([PARTIES]);
  });

  it('is not put off by further changes of the party', () => {
    const { clock, hub, open } = hubWith();
    const sink = open();
    hub.partyChanged(party('raid'));
    clock.pass(1_000);
    hub.partyChanged(party('raid'));
    clock.pass(LIVE_PENDING_MS - 1_000);
    expect(sink.signals).toEqual([PARTIES]);
  });

  it('signals at once when the party ended, and forgets what it waited for', () => {
    const { clock, hub, open } = hubWith();
    const sink = open();
    hub.partyChanged(party('raid'));
    hub.partyChanged(party('raid', 'ended'));
    expect(sink.signals).toEqual([PARTIES]);
    clock.pass(60_000);
    expect(sink.signals).toEqual([PARTIES]);
  });

  it('passes through the window as any signal', () => {
    const { clock, hub, open } = hubWith();
    const sink = open();
    hub.partyChanged(party('one', 'ended'));
    hub.partyChanged(party('two'));
    hub.postShown('two', ROW, false);
    expect(sink.signals).toEqual([PARTIES]);
    clock.pass(5_000);
    expect(sink.signals).toEqual([PARTIES, PARTIES]);
  });

  it('signals a post that changed by itself, with nothing pending', () => {
    const { hub, open } = hubWith();
    const sink = open();
    hub.postShown('raid', ROW, true);
    expect(sink.signals).toEqual([PARTIES]);
  });

  it('says nothing of a draw that sent nothing new', () => {
    const { clock, hub, open } = hubWith();
    const sink = open();
    hub.postShown('raid', ROW, false);
    clock.pass(60_000);
    expect(sink.signals).toEqual([]);
  });

  it('keeps nothing and sets no timer for a server with no stream open', () => {
    const { clock, hub } = hubWith();
    hub.partyChanged(party('raid'));
    hub.partyChanged(party('over', 'ended'));
    hub.postShown('raid', ROW, true);
    hub.reportsChanged(SERVER);
    expect(clock.waiting).toBe(0);
  });

  it('forgets a row once its server’s last stream went', () => {
    const { clock, hub, open } = hubWith();
    const gone = hub.open({
      server: SERVER,
      row: ROW,
      address: 'a',
      member: 'm',
      ...ITS_SESSION,
      sink: new FakeSink(),
    });
    if (gone.kind !== 'open') throw new Error('refused');
    hub.partyChanged(party('raid'));
    hub.reportsChanged(SERVER);
    hub.reportsChanged(SERVER);
    gone.gone();
    expect(clock.waiting).toBe(0);
    hub.partyChanged(party('raid'));
    expect(clock.waiting).toBe(0);
    // A new stream starts with a quiet spell.
    const sink = open();
    hub.reportsChanged(SERVER);
    expect(sink.signals).toEqual([REPORTS]);
  });

  it('takes a server without its row yet, for its reports', () => {
    const { hub } = hubWith();
    const sink = new FakeSink();
    hub.open({ server: SERVER, row: undefined, address: 'a', member: 'm', ...ITS_SESSION, sink });
    hub.partyChanged(party('raid', 'ended'));
    hub.reportsChanged(SERVER);
    expect(sink.signals).toEqual([REPORTS]);
  });
});

describe('LiveSignals: a stream’s life', () => {
  it('pings at once and every 25 seconds', () => {
    const { clock, open } = hubWith();
    const sink = open();
    expect(sink.written).toEqual([PING]);
    clock.pass(LIVE_PING_MS - 1);
    expect(sink.written).toEqual([PING]);
    clock.pass(1);
    clock.pass(LIVE_PING_MS);
    expect(sink.written).toEqual([PING, PING, PING]);
  });

  it('ends a stream after its lifetime, with up to 5 minutes of jitter', () => {
    const early = hubWith(0);
    const first = early.open();
    early.clock.pass(LIVE_LIFETIME_MS - 1);
    expect(first.ended).toBe(false);
    early.clock.pass(1);
    expect(first.ended).toBe(true);
    expect(first.destroyed).toBe(false);
    expect(early.clock.waiting).toBe(0);

    const late = hubWith(0.5);
    const second = late.open();
    late.clock.pass(LIVE_LIFETIME_MS + LIVE_LIFETIME_JITTER_MS / 2 - 1);
    expect(second.ended).toBe(false);
    late.clock.pass(1);
    expect(second.ended).toBe(true);
  });

  it('drops a stream whose write was refused: a slow reader reconnects', () => {
    const { clock, hub, open } = hubWith();
    const slow = open();
    const quick = open();
    slow.takes = false;
    hub.reportsChanged(SERVER);
    expect(slow.destroyed).toBe(true);
    expect(quick.destroyed).toBe(false);
    clock.pass(LIVE_PING_MS * 2);
    // Told nothing more, and its timers gone with it.
    expect(slow.written.length).toBe(2);
    expect(quick.written.length).toBeGreaterThan(2);
  });

  it('never throws for a stream that breaks, and the others are still told', () => {
    const { hub, open } = hubWith();
    const broken = open();
    const whole = open();
    broken.throws = true;
    expect(() => {
      hub.reportsChanged(SERVER);
    }).not.toThrow();
    expect(whole.signals).toEqual([REPORTS]);
    // It is gone: a later change writes nothing to it.
    broken.throws = false;
    hub.partyChanged(party('over', 'ended'));
    expect(broken.written).toEqual([PING]);
  });

  it('forgets a stream whose client went, once only', () => {
    const { clock, hub } = hubWith();
    const sink = new FakeSink();
    const open = hub.open({
      server: SERVER,
      row: ROW,
      address: 'a',
      member: 'm',
      ...ITS_SESSION,
      sink,
    });
    if (open.kind !== 'open') throw new Error('refused');
    open.gone();
    open.gone();
    expect(clock.waiting).toBe(0);
    hub.reportsChanged(SERVER);
    expect(sink.signals).toEqual([]);
    // Its place is free, and not freed twice.
    for (let n = 0; n < MAX_LIVE_PER_ADDRESS; n++) {
      expect(
        hub.open({
          server: SERVER,
          row: ROW,
          address: 'a',
          member: `m${n}`,
          ...ITS_SESSION,
          sink: new FakeSink(),
        }).kind,
      ).toBe('open');
    }
    expect(
      hub.open({
        server: SERVER,
        row: ROW,
        address: 'a',
        member: 'x',
        ...ITS_SESSION,
        sink: new FakeSink(),
      }).kind,
    ).toBe('full');
  });
});

describe('LiveSignals: a session’s streams (plan 8Z-2)', () => {
  it('ends the streams of a session that logged out, and no other’s', () => {
    const { clock, hub, open } = hubWith();
    const tabs = [
      open({ member: 'ash', session: 'laptop' }),
      open({ member: 'ash', session: 'laptop' }),
    ];
    const phone = open({ member: 'ash', session: 'phone' });
    const other = open({ member: 'misty', session: 'hers' });
    hub.endSession('laptop');
    // Politely, as at a lifetime's end: the page finds itself logged out when it asks again.
    expect(tabs.map((sink) => [sink.ended, sink.destroyed])).toEqual([
      [true, false],
      [true, false],
    ]);
    expect([phone.ended, other.ended]).toEqual([false, false]);
    // Forgotten: told of nothing more, and the member's count is free again.
    hub.reportsChanged(SERVER);
    expect(tabs.map((sink) => sink.signals)).toEqual([[], []]);
    expect(phone.signals).toEqual([REPORTS]);
    clock.pass(LIVE_PING_MS);
    expect(tabs.map((sink) => sink.written)).toEqual([[PING], [PING]]);
    for (let n = 1; n < MAX_LIVE_PER_MEMBER; n++) open({ member: 'ash', session: 'phone' });
    expect(() => open({ member: 'ash', session: 'phone' })).toThrow('full');
  });

  it('takes a session without a stream, or one ended twice, without a word', () => {
    const { clock, hub, open } = hubWith();
    const sink = open({ session: 'laptop' });
    expect(() => {
      hub.endSession('nobody');
      hub.endSession('laptop');
      hub.endSession('laptop');
    }).not.toThrow();
    expect(sink.ended).toBe(true);
    expect(clock.waiting).toBe(0);
  });
});

describe('LiveSignals: who is a member still (plan 8Z-2)', () => {
  it('asks at each keep-alive, never at the opening, and ends the stream of who is none', async () => {
    const { clock, open } = hubWith();
    const member = { still: true, asked: 0 };
    let last: Promise<boolean> = Promise.resolve(true);
    const stillMember = () => {
      member.asked += 1;
      last = Promise.resolve(member.still);
      return last;
    };
    // Opened first, so asked first at each keep-alive: its answer is in before the other's.
    const staying = open({ stillMember: STILL_A_MEMBER });
    const leaving = open({ stillMember });
    expect(member.asked).toBe(0);
    clock.pass(LIVE_PING_MS);
    // The hub heard the answer before whoever asks for it after: then it may ask again.
    await last;
    clock.pass(LIVE_PING_MS);
    await last;
    expect(member.asked).toBe(2);
    // They left the server (or lost the map's role): the next keep-alive finds it.
    member.still = false;
    clock.pass(LIVE_PING_MS);
    await leaving.ending;
    expect([leaving.ended, leaving.destroyed]).toEqual([true, false]);
    expect(staying.ended).toBe(false);
    // Forgotten: no more pings, no more asks.
    const written = leaving.written.length;
    clock.pass(LIVE_PING_MS);
    expect(leaving.written).toHaveLength(written);
    expect(member.asked).toBe(3);
    expect(staying.written.at(-1)).toBe(PING);
  });

  it('keeps a stream while the directory cannot say, and asks again at the next keep-alive', async () => {
    const { clock, open } = hubWith();
    const answers: Array<() => Promise<boolean>> = [
      () => Promise.reject(new Error('Discord is away')),
      () => {
        throw new Error('the directory broke');
      },
      () => Promise.resolve(false),
    ];
    let asked = 0;
    let last: Promise<boolean> = Promise.resolve(true);
    const sink = open({
      stillMember: () => {
        asked += 1;
        last = (answers.shift() ?? STILL_A_MEMBER)();
        return last;
      },
    });
    clock.pass(LIVE_PING_MS);
    // The hub heard the failure before whoever asks for it after.
    await last.catch(() => undefined);
    clock.pass(LIVE_PING_MS);
    expect([asked, sink.ended]).toEqual([2, false]);
    clock.pass(LIVE_PING_MS);
    await sink.ending;
    expect(asked).toBe(3);
  });

  it('asks once at a time: an answer still on its way is waited for, not asked for again', async () => {
    const { clock, open } = hubWith();
    let asked = 0;
    let answer: (still: boolean) => void = () => undefined;
    const sink = open({
      stillMember: () => {
        asked += 1;
        return new Promise<boolean>((resolve) => {
          answer = resolve;
        });
      },
    });
    clock.pass(LIVE_PING_MS);
    clock.pass(LIVE_PING_MS);
    clock.pass(LIVE_PING_MS);
    expect(asked).toBe(1);
    answer(false);
    await sink.ending;
    expect(asked).toBe(1);
  });

  it('ends nothing for an answer that comes after the stream went', async () => {
    const { clock, hub, open } = hubWith();
    let answer: (still: boolean) => void = () => undefined;
    const late = open({
      session: 'laptop',
      stillMember: () =>
        new Promise<boolean>((resolve) => {
          answer = resolve;
        }),
    });
    // Asked after it at the same keep-alive, so answered after it.
    const next = open({ stillMember: () => Promise.resolve(false) });
    clock.pass(LIVE_PING_MS);
    late.takes = false;
    hub.reportsChanged(SERVER);
    expect(late.destroyed).toBe(true);
    answer(false);
    await next.ending;
    expect(late.ended).toBe(false);
  });
});

describe('LiveSignals: the caps', () => {
  const opening = (address: string, member: string) => ({
    server: SERVER,
    row: ROW,
    address,
    member,
    session: `session of ${member} at ${address}`,
    stillMember: STILL_A_MEMBER,
    sink: new FakeSink(),
  });

  it('holds an address to its streams', () => {
    const { hub } = hubWith();
    for (let n = 0; n < MAX_LIVE_PER_ADDRESS; n++) {
      expect(hub.open(opening('shared', `member-${n}`)).kind).toBe('open');
    }
    expect(hub.open(opening('shared', 'one-more')).kind).toBe('full');
    expect(hub.open(opening('elsewhere', 'one-more')).kind).toBe('open');
  });

  it('holds a member to their streams', () => {
    const { hub } = hubWith();
    const held = [];
    for (let n = 0; n < MAX_LIVE_PER_MEMBER; n++) {
      held.push(hub.open(opening(`address-${n}`, 'tabs')));
    }
    expect(held.every((one) => one.kind === 'open')).toBe(true);
    expect(hub.open(opening('elsewhere', 'tabs')).kind).toBe('full');
    const first = held[0];
    if (first?.kind !== 'open') throw new Error('refused');
    first.gone();
    expect(hub.open(opening('elsewhere', 'tabs')).kind).toBe('open');
  });

  it('holds the server’s process to its streams overall', () => {
    const { hub } = hubWith();
    for (let n = 0; n < MAX_LIVE_STREAMS; n++) {
      expect(hub.open(opening(`address-${n}`, `member-${n}`)).kind).toBe('open');
    }
    expect(hub.open(opening('one-more', 'one-more')).kind).toBe('full');
  });

  it('writes nothing to a stream it refused', () => {
    const { hub } = hubWith();
    for (let n = 0; n < MAX_LIVE_PER_MEMBER; n++) hub.open(opening(`a${n}`, 'tabs'));
    const sink = new FakeSink();
    hub.open({ ...opening('elsewhere', 'tabs'), sink });
    expect(sink.written).toEqual([]);
  });
});

describe('LiveSignals: closing', () => {
  it('ends every stream and leaves no timer', () => {
    const { clock, hub, open } = hubWith();
    const [one, two] = [open(), open()];
    hub.partyChanged(party('raid'));
    hub.close();
    expect(one.destroyed).toBe(true);
    expect(two.destroyed).toBe(true);
    expect(clock.waiting).toBe(0);
  });

  it('refuses a stream asked for after it, and takes signals without a word', () => {
    const { hub } = hubWith();
    hub.close();
    const sink = new FakeSink();
    expect(
      hub.open({
        server: SERVER,
        row: ROW,
        address: 'a',
        member: 'm',
        session: 's',
        stillMember: STILL_A_MEMBER,
        sink,
      }).kind,
    ).toBe('closed');
    expect(sink.written).toEqual([]);
    expect(() => {
      hub.reportsChanged(SERVER);
      hub.partyChanged(party('raid'));
      hub.postShown('raid', ROW, true);
    }).not.toThrow();
  });
});
