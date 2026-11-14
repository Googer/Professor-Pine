import { describe, expect, it } from 'vitest';
import { heldCall } from '../../test/support/held-call.js';
import { serverRecordRow } from '../../test/support/server-record-cases.js';
import { standingsWith } from '../../test/support/server-standings.js';
import { createTestLogger } from '../../test/support/test-logger.js';
import { PRIVATE_INSTANCE_TEXT } from '../render/server-admission.js';
import { RecordingExits, recordedWaits } from '../../test/support/server-admission.js';
import { ServerAdmission } from './server-admission.js';

/** Recorded at the upgrade: allowed. */
const ALLOWED = '412345678901234567';
/** Never allowed: added Pine while it was down. */
const STRANGER = '412345678901234568';
/** Recorded, then removed Pine while it was down. */
const GONE = '412345678901234569';
/** Recorded, and Discord says it is unavailable (an outage): present all the same. */
const DOWN = '412345678901234570';
const NOW = Date.parse('2026-11-13T18:00:00Z');

/** Every shard ready with these servers present, asked afterwards of `live` (else of them). */
function every(present: readonly string[], live?: Set<string>) {
  const now = live ?? new Set(present);
  return { present: new Set(present), isPresent: (serverId: string) => now.has(serverId) };
}

function admissionWith(
  rows = [serverRecordRow({ serverId: GONE, recordedAt: NOW - 1 })],
  rehearsal = false,
  more: {
    recorded?: () => Promise<readonly string[]>;
    undecided?: (serverId: string) => boolean;
    /** Runs during each wait between tries of a leave, once it is recorded. */
    whileWaiting?: () => Promise<void>;
  } = {},
) {
  const { log, entries } = createTestLogger();
  const { standings, store } = standingsWith({
    recorded: [ALLOWED, DOWN],
    rows,
    log,
    now: () => NOW,
  });
  // Every server Pine was in has its Guild row: the recorded ones.
  store.guilds.add(GONE);
  const exits = new RecordingExits();
  const waits = recordedWaits();
  const admission = new ServerAdmission({
    wait: async (ms) => {
      await waits.wait(ms);
      await more.whileWaiting?.();
    },
    standings,
    exits: rehearsal ? undefined : exits,
    recorded: more.recorded ?? (() => Promise.resolve([...store.guilds])),
    // GONE removed the bot while it was away: no longer among its servers.
    inServer: (serverId) => [ALLOWED, DOWN].includes(serverId) && !standings.isLeft(serverId),
    ...(more.undecided === undefined ? {} : { undecided: more.undecided }),
    log,
  });
  return { admission, standings, store, exits, entries, waited: waits.waited };
}

describe('ServerAdmission (plan 19C-1)', () => {
  it('admits a server that may have this Pine, and no other', () => {
    const { admission } = admissionWith();
    expect(admission.admits(ALLOWED)).toBe(true);
    expect(admission.admits(STRANGER)).toBe(false);
  });

  it('tells a server that may not have it, once, that this Pine is private, and leaves it', async () => {
    const { admission, exits, entries } = admissionWith();
    admission.refuse(STRANGER);
    admission.refuse(STRANGER);
    await admission.idle();
    expect(exits.said).toEqual([{ serverId: STRANGER, text: PRIVATE_INSTANCE_TEXT }]);
    expect(exits.left).toEqual([STRANGER]);
    expect(PRIVATE_INSTANCE_TEXT).toBe(
      'This Pine is private: it serves only the servers its operators allow. To run Pine for ' +
        'your community, see <https://github.com/Googer/Professor-Pine/blob/master/docs/guides/new-instance.md>.',
    );
    const line = entries.find(
      (entry) => entry['msg'] === 'left a server that may not have this Pine',
    );
    expect(line).toMatchObject({ server: STRANGER, told: true });
  });

  it('tells a server that this Pine is private once while it runs, however often it is refused', async () => {
    const { admission, exits } = admissionWith();
    // Refused at a join, then again at the next ready: its staff added Pine back meanwhile.
    admission.refuse(STRANGER);
    await admission.idle();
    admission.refuse(STRANGER);
    await admission.idle();
    expect(exits.left).toEqual([STRANGER, STRANGER]);
    expect(exits.said).toEqual([{ serverId: STRANGER, text: PRIVATE_INSTANCE_TEXT }]);
    // Another server is told for itself.
    admission.refuse(GONE);
    await admission.idle();
    expect(exits.said.map((said) => said.serverId)).toEqual([STRANGER, GONE]);
  });

  it('leaves a server where it may not write all the same, and logs a leave that fails', async () => {
    const { admission, exits, entries } = admissionWith();
    exits.noChannel.add(STRANGER);
    admission.refuse(STRANGER);
    await admission.idle();
    expect(exits.said).toEqual([]);
    expect(exits.left).toEqual([STRANGER]);
    exits.failLeave = new Error('Discord is away');
    // Refused again at the next occasion (a ready, a join).
    admission.refuse(STRANGER);
    await admission.idle();
    const failed = entries.find((entry) => entry['msg'] === 'could not leave a server');
    expect(failed).toMatchObject({ server: STRANGER });
  });

  it('tries a leave that failed again a minute, five and thirty minutes later, telling the server once (J8)', async () => {
    const { admission, exits, waited } = admissionWith();
    exits.failLeaves = 2;
    admission.refuse(STRANGER);
    await admission.idle();
    expect(exits.left).toEqual([STRANGER]);
    expect(exits.leavesAsked).toEqual([STRANGER, STRANGER, STRANGER]);
    expect(waited).toEqual([60_000, 5 * 60_000]);
    expect(exits.said).toHaveLength(1);
  });

  it('gives a leave up after its last try, until the next ready asks again (J8)', async () => {
    const { admission, exits, waited, entries } = admissionWith();
    exits.failLeave = new Error('Discord is away');
    admission.refuse(STRANGER);
    await admission.idle();
    expect(waited).toEqual([60_000, 5 * 60_000, 30 * 60_000]);
    expect(exits.leavesAsked).toHaveLength(4);
    expect(
      entries.find((entry) => entry['msg'] === 'gave up leaving a server until the next ready'),
    ).toMatchObject({ server: STRANGER });
  });

  it('stops trying to leave a server it refused once an operator allows it meanwhile', async () => {
    const OPERATOR = '323456789012345671';
    const hooks: { whileWaiting?: () => Promise<void> } = {};
    const { admission, standings, exits, waited, entries } = admissionWith(undefined, false, {
      whileWaiting: () => hooks.whileWaiting?.() ?? Promise.resolve(),
    });
    exits.failLeave = new Error('Discord is away');
    hooks.whileWaiting = () => standings.allow(STRANGER, OPERATOR);
    admission.refuse(STRANGER);
    await admission.idle();
    // One try, then a wait during which it was allowed: no further try.
    expect(exits.leavesAsked).toEqual([STRANGER]);
    expect(waited).toEqual([60_000]);
    expect(
      entries.find(
        (entry) => entry['msg'] === 'stopped leaving a server that may have this Pine now',
      ),
    ).toMatchObject({ server: STRANGER });
    expect(
      entries.some((entry) => entry['msg'] === 'gave up leaving a server until the next ready'),
    ).toBe(false);
  });

  it('keeps trying to leave a server an operator removes, which stays allowed', async () => {
    const { admission, standings, exits } = admissionWith();
    exits.failLeaves = 2;
    expect(admission.admits(ALLOWED)).toBe(true);
    expect(await admission.remove(ALLOWED)).toBe('trying');
    await admission.idle();
    expect(exits.leavesAsked).toEqual([ALLOWED, ALLOWED, ALLOWED]);
    expect(standings.isLeft(ALLOWED)).toBe(true);
  });

  it('counts a leave Discord answers with Unknown Guild as done: marked left, neither tried again nor logged as an error', async () => {
    const { admission, standings, store, exits, waited, entries } = admissionWith();
    // STRANGER had Pine (a Guild row) and may no longer have it; Pine is in neither it nor
    // ALLOWED any more, though nothing said so.
    store.guilds.add(STRANGER);
    exits.gone.add(STRANGER);
    exits.gone.add(ALLOWED);
    admission.refuse(STRANGER);
    await admission.idle();
    expect(await admission.remove(ALLOWED)).toBe('left');
    await admission.idle();
    expect(standings.isLeft(STRANGER)).toBe(true);
    expect(standings.isLeft(ALLOWED)).toBe(true);
    expect(exits.leavesAsked).toEqual([STRANGER, ALLOWED]);
    expect(waited).toEqual([]);
    expect(entries.some((entry) => entry['level'] === 50)).toBe(false);
  });

  it('tries again in the background to leave a server an operator removes, and says so (J8)', async () => {
    const { admission, standings, exits, waited } = admissionWith();
    exits.failLeaves = 1;
    expect(await admission.remove(ALLOWED)).toBe('trying');
    await admission.idle();
    expect(exits.left).toEqual([ALLOWED]);
    expect(waited).toEqual([60_000]);
    expect(standings.isLeft(ALLOWED)).toBe(true);
    // Nothing is said in the server.
    expect(exits.said).toEqual([]);
  });

  it('at every ready leaves the present servers that may not have it, and marks left the recorded that are gone', async () => {
    const { admission, standings, exits } = admissionWith();
    await admission.everyShardReady(every([ALLOWED, STRANGER, DOWN]));
    await admission.idle();
    expect(exits.left).toEqual([STRANGER]);
    expect(standings.isLeft(GONE)).toBe(true);
    // Unavailable is present; the allowed and the refused are not marked left.
    expect(standings.isLeft(DOWN)).toBe(false);
    expect(standings.isLeft(ALLOWED)).toBe(false);
    expect(standings.isLeft(STRANGER)).toBe(false);
  });

  it('at a ready takes back that a present server left: it came back while Pine was away', async () => {
    const { admission, standings, store } = admissionWith([
      serverRecordRow({ serverId: GONE, recordedAt: NOW - 1, leftAt: NOW - 1 }),
    ]);
    await standings.load();
    expect(standings.isLeft(GONE)).toBe(true);
    await admission.everyShardReady(every([ALLOWED, GONE, DOWN]));
    expect(standings.isLeft(GONE)).toBe(false);
    expect(store.rows.get(GONE)?.leftAt).toBeNull();
  });

  it('marks left no server that joined between the snapshot and the read of the servers Pine was in (J2)', async () => {
    const live = new Set([ALLOWED, DOWN]);
    let release!: () => void;
    const reading = new Promise<void>((resolve) => {
      release = resolve;
    });
    let asked!: () => void;
    const readAsked = new Promise<void>((resolve) => {
      asked = resolve;
    });
    const { admission, standings } = admissionWith(undefined, false, {
      recorded: async () => {
        asked();
        await reading;
        return [ALLOWED, DOWN, GONE];
      },
    });
    const checked = admission.everyShardReady(every([ALLOWED, DOWN], live));
    await readAsked;
    // GONE adds the bot back while its row is read.
    live.add(GONE);
    release();
    await checked;
    expect(standings.isLeft(GONE)).toBe(false);
  });

  it('does not undo a return that came while a ready marked a server left (J2)', async () => {
    const live = new Set([ALLOWED, DOWN]);
    const { admission, standings, store } = admissionWith();
    const marking = heldCall('the mark of the servers gone');
    store.markLeftHeld = marking;
    const checked = admission.everyShardReady(every([ALLOWED, DOWN], live));
    await marking.reached;
    // GONE adds the bot back while the ready's mark of it is being written: its return, asked
    // meanwhile, comes after the mark.
    live.add(GONE);
    const back = standings.cameBack([GONE]);
    marking.release();
    await Promise.all([checked, back]);
    expect(standings.isLeft(GONE)).toBe(false);
    expect(store.rows.get(GONE)?.leftAt).toBeNull();
  });

  it('at the client’s ready refuses the servers no shard covered that may not have it, and takes back that an allowed one left (J2)', async () => {
    const { admission, standings, exits } = admissionWith([
      serverRecordRow({ serverId: GONE, recordedAt: NOW - 1, leftAt: NOW - 1 }),
    ]);
    await standings.load();
    await admission.clientReady([STRANGER, GONE]);
    await admission.idle();
    expect(exits.left).toEqual([STRANGER]);
    expect(standings.isLeft(GONE)).toBe(false);
  });

  it('neither refuses nor marks a server a new install waits on (J1)', async () => {
    const { admission, exits } = admissionWith(undefined, false, {
      undecided: (serverId) => serverId === STRANGER,
    });
    await admission.everyShardReady(every([ALLOWED, STRANGER, DOWN]));
    await admission.clientReady([STRANGER]);
    await admission.idle();
    expect(exits.left).toEqual([]);
  });

  it('in rehearsal mode neither tells nor leaves a server, and says so', async () => {
    const { admission, exits, entries } = admissionWith(undefined, true);
    await admission.everyShardReady(every([ALLOWED, STRANGER]));
    await admission.idle();
    expect(exits.said).toEqual([]);
    expect(exits.left).toEqual([]);
    expect(
      entries.find(
        (entry) =>
          entry['msg'] ===
          'a server may not have this Pine: rehearsal mode neither tells nor leaves it',
      ),
    ).toMatchObject({ server: STRANGER });
  });

  it('leaves a server an operator removes, without a word, and marks it left', async () => {
    const { admission, standings, exits } = admissionWith();
    expect(await admission.remove(ALLOWED)).toBe('left');
    expect(exits.left).toEqual([ALLOWED]);
    expect(exits.said).toEqual([]);
    expect(standings.isLeft(ALLOWED)).toBe(true);
    // Still allowed: its staff may add Pine again.
    expect(admission.admits(ALLOWED)).toBe(true);
    // A server Pine is not in is not left.
    expect(await admission.remove(STRANGER)).toBe('not-in');
    expect(await admission.remove(GONE)).toBe('not-in');
    expect(exits.left).toEqual([ALLOWED]);
  });

  it('logs a check that failed, and throws nothing', async () => {
    const { admission, store, entries } = admissionWith();
    store.failing.set('markLeft', new Error('the database is away'));
    await admission.everyShardReady(every([ALLOWED]));
    expect(
      entries.some((entry) => entry['msg'] === 'could not check which servers the bot is in'),
    ).toBe(true);
  });
});
