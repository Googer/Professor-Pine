import { describe, expect, it, vi } from 'vitest';
import { textOf } from '../../test/support/messages.js';
import { BOB, CAROL } from '../../test/support/parties.js';
import { reportedRaid } from '../../test/support/party-service.js';
import { PartyStatus } from '../domain/party/status.js';
import { postMessage } from '../render/party-post.js';

/** The timers the service set, which a test runs by hand. */
function heldTimers() {
  const timers: { run: () => void; ms: number; cancelled: boolean }[] = [];
  const setTimer = (run: () => void, ms: number) => {
    const timer = { run, ms, cancelled: false };
    timers.push(timer);
    return () => {
      timer.cancelled = true;
    };
  };
  return { timers, setTimer };
}

/** The post's edit held until `release` (only the first): `asked` once it was asked. */
function holdFirstEdit(made: Awaited<ReturnType<typeof reportedRaid>>) {
  const edit = made.gateway.editPost.bind(made.gateway);
  let release: () => void = () => undefined;
  let tell: () => void = () => undefined;
  const asked = new Promise<void>((resolve) => {
    tell = resolve;
  });
  let first = true;
  vi.spyOn(made.gateway, 'editPost').mockImplementation(async (...args) => {
    if (first) {
      first = false;
      tell();
      await new Promise<void>((resolve) => {
        release = resolve;
      });
    }
    return edit(...args);
  });
  return { asked, release: () => release() };
}

/** The post's first two edits held, each until its `release`: `asked` once each was asked. */
function holdTwoEdits(made: Awaited<ReturnType<typeof reportedRaid>>) {
  const edit = made.gateway.editPost.bind(made.gateway);
  const holds = [0, 1].map(() => {
    let tell: () => void = () => undefined;
    let release: () => void = () => undefined;
    const asked = new Promise<void>((resolve) => {
      tell = resolve;
    });
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });
    return { asked, released, tell: () => tell(), release: () => release() };
  });
  let count = 0;
  vi.spyOn(made.gateway, 'editPost').mockImplementation(async (...args) => {
    const hold = holds[count];
    count += 1;
    if (hold) {
      hold.tell();
      await hold.released;
    }
    return edit(...args);
  });
  return holds;
}

/** What the map would draw of the party's post now (`layoutOf`), as text. */
function layoutText(made: Awaited<ReturnType<typeof reportedRaid>>): string {
  const layout = made.service.layoutOf(made.party.id);
  return layout === undefined ? '' : textOf(postMessage(layout));
}

describe('PartyService.drawTicket and shown: a press waits for its post (plan 8M-11A, S1)', () => {
  it('waits for the draw a change asked for, also one that waits out its delay', async () => {
    // A long delay: the change's draw waits (a burst), until the flush starts it. The cap never
    // runs by itself: only the draw answers.
    const made = await reportedRaid({}, { setTimer: heldTimers().setTimer });
    const held = holdFirstEdit(made);
    await made.attendance.signUp(made.party.id, { id: BOB, name: 'Bob' }, PartyStatus.Coming);
    // Review fix R1: the ticket after the change, its count with the press's own change.
    const ticket = made.service.drawTicket(made.party.id);
    let settled = false;
    const shown = made.service.shown(made.party.id, ticket, 5_000).then(() => {
      settled = true;
    });
    const flushed = made.service.flush();
    await held.asked;
    // The edit is on its way: the post does not show Bob yet, and the press still waits.
    expect(settled).toBe(false);
    expect(layoutText(made)).not.toContain('Bob');
    held.release();
    await shown;
    expect(layoutText(made)).toContain('Bob');
    await flushed;
  });

  it('waits for a draw that the change started at once, on a quiet party', async () => {
    const made = await reportedRaid({}, { renderDelayMs: 0, setTimer: heldTimers().setTimer });
    const held = holdFirstEdit(made);
    await made.attendance.signUp(made.party.id, { id: CAROL, name: 'Carol' }, PartyStatus.Coming);
    // The draw the change started at once read the party with it: its count is the ticket's.
    const ticket = made.service.drawTicket(made.party.id);
    let settled = false;
    const shown = made.service.shown(made.party.id, ticket, 5_000).then(() => {
      settled = true;
    });
    await held.asked;
    expect(settled).toBe(false);
    held.release();
    await shown;
    expect(layoutText(made)).toContain('Carol');
    await made.service.flush();
  });

  // Review fixes F2 and R1: another member's change stored between the press's start and its
  // change, and a draw that read it (not the press's change) on its way: the wait lasts until a
  // draw that read the press's change.
  it('waits past a draw that read the party before the change, until one that read it', async () => {
    const made = await reportedRaid({}, { setTimer: heldTimers().setTimer });
    const [first, second] = holdTwoEdits(made);
    if (!first || !second) throw new Error('no holds');
    // The press starts; another member's change is stored, and the draw that read it starts.
    await made.attendance.signUp(made.party.id, { id: BOB, name: 'Bob' }, PartyStatus.Coming);
    const flushed = made.service.flush();
    await first.asked;
    // The change of the press, stored while that draw is on its way; the ticket after it.
    await made.attendance.signUp(made.party.id, { id: CAROL, name: 'Carol' }, PartyStatus.Coming);
    const ticket = made.service.drawTicket(made.party.id);
    let settled = false;
    const shown = made.service.shown(made.party.id, ticket, 5_000).then(() => {
      settled = true;
    });
    first.release();
    await second.asked;
    // The first draw kept its layout (Bob, not Carol): the press still waits.
    expect(layoutText(made)).toContain('Bob');
    expect(layoutText(made)).not.toContain('Carol');
    expect(settled).toBe(false);
    second.release();
    await shown;
    expect(layoutText(made)).toContain('Carol');
    await flushed;
  });

  it('resolves at once when no draw is pending or running for the party', async () => {
    const made = await reportedRaid();
    const ticket = made.service.drawTicket(made.party.id);
    // Nothing changed: no draw is asked for, and nothing is waited for.
    await made.service.shown(made.party.id, ticket, 5_000);
    expect(layoutText(made)).not.toBe('');
  });

  it('resolves at once when the draw after the ticket has already kept its layout', async () => {
    const made = await reportedRaid({}, { renderDelayMs: 0 });
    await made.attendance.signUp(made.party.id, { id: BOB, name: 'Bob' }, PartyStatus.Coming);
    const ticket = made.service.drawTicket(made.party.id);
    await made.service.flush();
    await made.service.shown(made.party.id, ticket, 5_000);
    expect(layoutText(made)).toContain('Bob');
  });

  it('resolves at once for a party whose post is not drawn any more', async () => {
    const made = await reportedRaid();
    const ticket = made.service.drawTicket(made.party.id);
    await made.service.end(made.party.id);
    await made.service.shown(made.party.id, ticket, 5_000);
    await made.service.shown('no such party', 0, 5_000);
    expect(made.service.layoutOf(made.party.id)).toBeUndefined();
  });

  it('resolves after the cap when the draw does not come, and the draw still goes on', async () => {
    const timers = heldTimers();
    const made = await reportedRaid({}, { setTimer: timers.setTimer });
    await made.attendance.signUp(made.party.id, { id: BOB, name: 'Bob' }, PartyStatus.Coming);
    const ticket = made.service.drawTicket(made.party.id);
    const shown = made.service.shown(made.party.id, ticket, 5_000);
    const cap = timers.timers.find((timer) => timer.ms === 5_000 && !timer.cancelled);
    if (cap === undefined) throw new Error('no timer of the cap');
    cap.run();
    await shown;
    // The post is not drawn yet: the answer goes out anyway, and the draw follows.
    expect(layoutText(made)).not.toContain('Bob');
    await made.service.flush();
    expect(layoutText(made)).toContain('Bob');
  });

  it('cancels the cap once the draw kept its layout', async () => {
    const timers = heldTimers();
    const made = await reportedRaid({}, { setTimer: timers.setTimer });
    await made.attendance.signUp(made.party.id, { id: BOB, name: 'Bob' }, PartyStatus.Coming);
    const ticket = made.service.drawTicket(made.party.id);
    const shown = made.service.shown(made.party.id, ticket, 5_000);
    await made.service.flush();
    await shown;
    const cap = timers.timers.find((timer) => timer.ms === 5_000);
    expect(cap?.cancelled).toBe(true);
  });
});
