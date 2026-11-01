import { describe, expect, it, vi } from 'vitest';
import {
  FakePartyGateway,
  missingPermissions,
  refusedBody,
} from '../../test/support/fake-gateway.js';
import { EAST_CHANNEL, WEST_CHANNEL } from '../../test/support/gyms.js';
import { heldCall, type HeldCall } from '../../test/support/held-call.js';
import { galleryOf, textOf, thumbnailBeside, thumbnailsOf } from '../../test/support/messages.js';
import { MemoryGruntMessages } from '../../test/support/rocket-store.js';
import {
  MAGIKARP,
  magikarpLineup,
  MUDKIP,
  REPORT_NOW,
  rocketReport,
} from '../../test/support/stop-report-cases.js';
import { createTestLogger } from '../../test/support/test-logger.js';
import { watchForTest } from '../../test/support/timers.js';
import { ENCOUNTER_PICTURE } from '../domain/stops/pictures.js';
import type { RocketReport, StopReport } from '../domain/stops/report.js';
import { GIVE_UP_MS, GruntMessageService } from './grunt-messages.js';
import type { PictureMaker } from './stop-pictures.js';
import type { StopReportListener } from './stop-reports.js';

const HALF_HOUR = 30 * 60_000;

/** A grunt's report as kept, with its id. */
const grunt = (id: number, overrides: Partial<Omit<RocketReport, 'id'>> = {}): RocketReport => ({
  ...rocketReport(overrides),
  id,
});

/** A service over a store and the fake gateway; `again()` is the service of the next process. */
function messagesWith(pictures?: PictureMaker) {
  const gateway = new FakePartyGateway();
  const store = new MemoryGruntMessages();
  const clock = { now: REPORT_NOW };
  const { log, entries } = createTestLogger();
  const listeners: StopReportListener[] = [];
  /** Channels where a send fails with this error (Discord answering 500, say). */
  const failSend = new Map<string, Error>();
  /** Channels where an edit fails with this error (plan 8R-4L). */
  const failEdit = new Map<string, Error>();
  /** Sends and edits held per channel (review R1), each taken by the next call there in turn. */
  const holds = { send: new Map<string, HeldCall[]>(), edit: new Map<string, HeldCall[]>() };
  /** Holds the next send or edit in a channel until `release`; `reached` once it waits. */
  const hold = (kind: keyof typeof holds, channelId: string) => {
    const held = heldCall(`the ${kind} in channel ${channelId}`);
    holds[kind].set(channelId, [...(holds[kind].get(channelId) ?? []), held]);
    return held;
  };
  /** Every edit asked for, in order, as it was asked (F4, F7): its channel and kind. */
  const tried: { channelId: string; v2: boolean }[] = [];
  const waitIn = async (kind: keyof typeof holds, channelId: string) => {
    const held = holds[kind].get(channelId)?.shift();
    if (!held) return;
    held.arrive();
    await held.released;
  };
  const service = () => {
    const timers: { run: () => void; ms: number; cancelled: boolean }[] = [];
    const messages = new GruntMessageService({
      gateway: {
        sendMessage: async (channelId, message) => {
          await waitIn('send', channelId);
          const err = failSend.get(channelId);
          if (err) throw err;
          return gateway.sendMessage(channelId, message);
        },
        editMessage: async (channelId, messageId, message) => {
          tried.push({ channelId, v2: message.v2 === true });
          await waitIn('edit', channelId);
          const err = failEdit.get(channelId);
          if (err) throw err;
          return gateway.editMessage(channelId, messageId, message);
        },
        deleteMessage: (channelId, messageId) => gateway.deleteMessage(channelId, messageId),
        mayPost: (channelId) => gateway.mayPost(channelId),
      },
      store,
      reports: { listen: (listener) => listeners.push(listener) },
      ...(pictures ? { pictures } : {}),
      log,
      now: () => clock.now,
      setTimer: (run, ms) => {
        const timer = { run, ms, cancelled: false };
        timers.push(timer);
        return () => {
          timer.cancelled = true;
        };
      },
    });
    /** Runs the timers that wait (not cancelled), and what follows from them. */
    const fire = async () => {
      for (const timer of timers.splice(0)) if (!timer.cancelled) timer.run();
      await messages.flush();
    };
    return { messages, timers, fire };
  };
  const ended = (reports: readonly StopReport[]) => {
    for (const listener of listeners) listener.ended?.(reports);
  };
  return {
    gateway,
    store,
    clock,
    entries,
    ended,
    failSend,
    failEdit,
    hold,
    tried,
    ...service(),
    again: service,
  };
}

describe('GruntMessageService', () => {
  it('posts a grunt in each region channel, records it, and deletes it when it is due', async () => {
    const made = messagesWith();
    const posted = await made.messages.post(grunt(1), [WEST_CHANNEL, EAST_CHANNEL]);
    expect(posted.map((one) => one.channelId)).toEqual([WEST_CHANNEL, EAST_CHANNEL]);
    const [west] = made.gateway.messagesIn(WEST_CHANNEL);
    expect(textOf(west?.message)).toContain('### Water-type grunt');
    expect(made.store.rows.map((row) => [row.channelId, row.reportId, row.deleteAt])).toEqual([
      [WEST_CHANNEL, 1, REPORT_NOW + HALF_HOUR],
      [EAST_CHANNEL, 1, REPORT_NOW + HALF_HOUR],
    ]);
    expect(made.timers.map((timer) => timer.ms)).toEqual([HALF_HOUR, HALF_HOUR]);
    expect(await made.messages.messagesOf(1)).toEqual(posted);
    made.clock.now += HALF_HOUR;
    await made.fire();
    expect(made.gateway.deleted.map((one) => one.messageId)).toEqual(
      posted.map((one) => one.messageId),
    );
    expect(made.store.rows).toEqual([]);
  });

  it('gives the messages of several reports in one read, by report (plan 8R-3)', async () => {
    const made = messagesWith();
    const first = await made.messages.post(grunt(1), [WEST_CHANNEL, EAST_CHANNEL]);
    const second = await made.messages.post(grunt(2), [EAST_CHANNEL]);
    const read = await made.messages.messagesOfReports([1, 2, 3]);
    expect([...read.entries()]).toEqual([
      [1, first],
      [2, second],
    ]);
    expect((await made.messages.messagesOfReports([])).size).toBe(0);
  });

  it('posts plain text where the bot may not embed', async () => {
    const made = messagesWith();
    made.gateway.noEmbeds.add(WEST_CHANNEL);
    await made.messages.post(grunt(1), [WEST_CHANNEL]);
    expect(made.gateway.messagesIn(WEST_CHANNEL)[0]?.message.content).toContain(
      'A **Water-type grunt** has been reported by **Brock**',
    );
  });

  it('posts in the other channels when one fails for any reason, and says so (fix A1)', async () => {
    const made = messagesWith();
    made.failSend.set(EAST_CHANNEL, new Error('500 Internal Server Error'));
    const posted = await made.messages.post(grunt(1), [EAST_CHANNEL, WEST_CHANNEL]);
    expect(posted.map((one) => one.channelId)).toEqual([WEST_CHANNEL]);
    expect(made.store.rows.map((row) => row.channelId)).toEqual([WEST_CHANNEL]);
    expect(
      made.entries.some((entry) => entry.msg === 'could not post a grunt in a region channel'),
    ).toBe(true);
  });

  it('deletes a message it could not record, and gives it as not posted (fix A1)', async () => {
    const made = messagesWith();
    made.store.failing.set('add', new Error('the database is away'));
    expect(await made.messages.post(grunt(1), [WEST_CHANNEL])).toEqual([]);
    await made.messages.flush();
    // Sent, then deleted: none stands.
    expect(made.gateway.deleted.map((one) => one.channelId)).toEqual([WEST_CHANNEL]);
    expect(made.gateway.messagesIn(WEST_CHANNEL)).toEqual([]);
    expect(made.timers).toEqual([]);
  });

  it('tries the delete of a message it could not record once more a minute later (fix R4)', async () => {
    const made = messagesWith();
    made.store.failing.set('add', new Error('the database is away'));
    made.gateway.failing.set('deleteMessage', new Error('Discord is away'));
    await made.messages.post(grunt(1), [WEST_CHANNEL]);
    await made.messages.flush();
    expect(made.timers.map((timer) => timer.ms)).toEqual([60_000]);
    made.gateway.failing.delete('deleteMessage');
    await made.fire();
    expect(made.gateway.messagesIn(WEST_CHANNEL)).toEqual([]);
  });

  it('tries once more a minute later a delete of a report that ended early (fix A3)', async () => {
    const made = messagesWith();
    await made.messages.post(grunt(1), [WEST_CHANNEL]);
    made.gateway.failing.set('deleteMessage', new Error('Discord is away'));
    made.ended([grunt(1)]);
    await made.messages.flush();
    expect(made.timers.filter((timer) => !timer.cancelled).map((timer) => timer.ms)).toEqual([
      60_000,
    ]);
    made.gateway.failing.delete('deleteMessage');
    await made.fire();
    expect(made.store.rows).toEqual([]);
  });

  it('passes over a channel where it may not post, and says so', async () => {
    const made = messagesWith();
    made.gateway.failing.set('sendMessage', missingPermissions('POST'));
    expect(await made.messages.post(grunt(1), [WEST_CHANNEL])).toEqual([]);
    expect(
      made.entries.some(
        (entry) => entry.msg === 'the bot may not post a grunt in a region channel',
      ),
    ).toBe(true);
  });

  it('deletes at once the messages of a report that ended early, one still on its way too', async () => {
    const made = messagesWith();
    const posted = await made.messages.post(grunt(1), [WEST_CHANNEL]);
    made.ended([grunt(1)]);
    await made.messages.flush();
    expect(made.gateway.deleted.map((one) => one.messageId)).toEqual([posted[0]?.messageId]);
    expect(made.store.rows).toEqual([]);
    // Replaced while its message was being sent: it goes as soon as it is there.
    const send = made.hold('send', WEST_CHANNEL);
    const sending = made.messages.post(grunt(2), [WEST_CHANNEL]);
    await send.reached;
    made.ended([grunt(2)]);
    send.release();
    const late = await sending;
    await made.messages.flush();
    expect(made.gateway.deleted.map((one) => one.messageId)).toContain(late[0]?.messageId);
    expect(made.store.rows).toEqual([]);
    // A research report or a hideout has no message: nothing is asked.
    made.ended([grunt(3, { subjectKey: 'leader:arlo' })]);
    await made.messages.flush();
    expect(made.gateway.deleted).toHaveLength(2);
  });

  it('edits the messages of a grunt refined in place, keeping them, and deletes them at its new end (plan 8R-4L)', async () => {
    const made = messagesWith();
    const posted = await made.messages.post(grunt(1), [WEST_CHANNEL, EAST_CHANNEL]);
    const refined: RocketReport = { ...magikarpLineup(), id: 1 };
    expect(await made.messages.refine(refined)).toEqual({ standing: posted, complete: true });
    // Edited, not deleted and sent anew: every DM's "Go to report" still finds them.
    expect(made.gateway.deleted).toEqual([]);
    for (const channel of [WEST_CHANNEL, EAST_CHANNEL]) {
      const [message, ...more] = made.gateway.messagesIn(channel);
      expect(more).toEqual([]);
      expect(message?.edits).toBe(1);
      expect(textOf(message?.message)).toContain('### Water-type grunt');
      expect(textOf(message?.message)).toContain('**Catch** Magikarp');
      expect(textOf(message?.message)).toContain('Reported by **Misty**');
    }
    // Its delete follows the new end.
    expect(made.store.rows.map((row) => row.deleteAt)).toEqual([refined.endsAt, refined.endsAt]);
    // The deletes of the first end are cancelled; those of the new end wait.
    expect(made.timers.filter((timer) => !timer.cancelled).map((timer) => timer.ms)).toEqual([
      refined.endsAt - REPORT_NOW,
      refined.endsAt - REPORT_NOW,
    ]);
    made.clock.now = refined.endsAt;
    await made.fire();
    expect(made.gateway.deleted.map((one) => one.messageId)).toEqual(
      posted.map((one) => one.messageId),
    );
  });

  it('shows one picture beside the heading, made before it is posted, and a refine’s new one (plan 8R-6)', async () => {
    const prepared: { sources: string[]; sent: number }[] = [];
    const looked = (source: string) =>
      `https://map.example.test/pictures/${String(source.length)}.png`;
    const held: { sent: () => number } = { sent: () => -1 };
    const made = messagesWith({
      prepare: (sources) => {
        prepared.push({ sources: [...sources], sent: held.sent() });
        return Promise.resolve();
      },
      url: looked,
    });
    held.sent = () => made.gateway.messagesIn(WEST_CHANNEL).length;
    // Not sure which: two lineups' catches, the encounter picture.
    const open = grunt(1, { rocket: { name: 'Water-type grunt', catches: [MUDKIP, MAGIKARP] } });
    await made.messages.post(open, [WEST_CHANNEL]);
    const [posted] = made.gateway.messagesIn(WEST_CHANNEL);
    expect(thumbnailBeside(posted?.message, '### Water-type grunt')).toBe(
      looked(ENCOUNTER_PICTURE),
    );
    expect(galleryOf(posted?.message)).toEqual([]);
    // Narrowed to a lineup of one catch: that Pokémon.
    await made.messages.refine({ ...magikarpLineup(), id: 1 });
    const [edited] = made.gateway.messagesIn(WEST_CHANNEL);
    expect(thumbnailBeside(edited?.message, '### Water-type grunt')).toBe(
      looked(MAGIKARP.image ?? ''),
    );
    expect(prepared).toEqual([
      { sources: [ENCOUNTER_PICTURE], sent: 0 },
      { sources: [MAGIKARP.image], sent: 1 },
    ]);
  });

  it('sends a message Discord refused for its pictures once more without the heading’s picture too (plan 8R-6)', async () => {
    const made = messagesWith({
      prepare: () => Promise.resolve(),
      url: (source) => `https://map.example.test/pictures/${String(source.length)}.png`,
    });
    made.gateway.rejectThumbnails = true;
    const open = grunt(1, { rocket: { name: 'Water-type grunt', catches: [MUDKIP, MAGIKARP] } });
    await made.messages.post(open, [WEST_CHANNEL]);
    const [posted] = made.gateway.messagesIn(WEST_CHANNEL);
    expect(textOf(posted?.message)).toContain('### Water-type grunt');
    expect(thumbnailsOf(posted?.message)).toEqual([]);
  });

  describe('one report’s posting and refines in turn (reviews R1, R2, R4)', () => {
    /** The other lineup, by Ash, a minute after Misty's Magikarp lineup. */
    const mudkips: RocketReport = {
      ...magikarpLineup({
        subjectKey: 'grunt:water:female',
        rocket: { name: 'Water-type grunt', catches: [MUDKIP], lineup: 'Mudkip, Tentacool' },
        reporter: { id: '200000000000000061', name: 'Ash' },
        madeAt: REPORT_NOW + 120_000,
        endsAt: REPORT_NOW + 32 * 60_000,
      }),
      id: 1,
    };
    const magikarps: RocketReport = { ...magikarpLineup(), id: 1 };

    it('edits and retimes every message of a post still on its way when it is refined', async () => {
      const made = messagesWith();
      const east = made.hold('send', EAST_CHANNEL);
      const posting = made.messages.post(grunt(1), [WEST_CHANNEL, EAST_CHANNEL]);
      await east.reached;
      const refining = made.messages.refine(magikarps);
      east.release();
      const posted = await posting;
      expect(posted.map((one) => one.channelId)).toEqual([WEST_CHANNEL, EAST_CHANNEL]);
      expect(await refining).toEqual({ standing: posted, complete: true });
      for (const channel of [WEST_CHANNEL, EAST_CHANNEL]) {
        const [message] = made.gateway.messagesIn(channel);
        expect(message?.edits).toBe(1);
        expect(textOf(message?.message)).toContain('Reported by **Misty**');
      }
      expect(made.store.rows.map((row) => row.deleteAt)).toEqual([
        magikarps.endsAt,
        magikarps.endsAt,
      ]);
    });

    it('edits for a newer refine only once the edit on its way is done, and skips an older one after it (F7)', async () => {
      const made = messagesWith();
      const background = watchForTest();
      await made.messages.post(grunt(1), [WEST_CHANNEL]);
      const first = made.hold('edit', WEST_CHANNEL);
      const second = made.hold('edit', WEST_CHANNEL);
      const older = made.messages.refine(magikarps);
      const newer = made.messages.refine(mudkips);
      await first.reached;
      await background.settle();
      // The newer refine waits in the report's queue: it has asked for no edit yet.
      expect(made.tried).toEqual([{ channelId: WEST_CHANNEL, v2: true }]);
      first.release();
      await second.reached;
      second.release();
      await Promise.all([older, newer]);
      const shown = () => textOf(made.gateway.messagesIn(WEST_CHANNEL)[0]?.message);
      expect(shown()).toContain('Reported by **Ash**');
      expect(made.store.rows.map((row) => row.deleteAt)).toEqual([mudkips.endsAt]);
      // Misty's refine coming in after Ash's: it is older than what is shown, and is skipped.
      await made.messages.refine(magikarps);
      expect(shown()).toContain('Reported by **Ash**');
      expect(made.gateway.messagesIn(WEST_CHANNEL)[0]?.edits).toBe(2);
    });

    it('neither retimes nor keeps a message whose report was taken back while its edit was on its way', async () => {
      const made = messagesWith();
      const [posted] = await made.messages.post(grunt(1), [WEST_CHANNEL]);
      const edit = made.hold('edit', WEST_CHANNEL);
      const refining = made.messages.refine(magikarps);
      await edit.reached;
      made.ended([magikarps]);
      edit.release();
      expect(await refining).toEqual({ standing: [], complete: false });
      await made.messages.flush();
      expect(made.gateway.deleted.map((one) => one.messageId)).toEqual([posted?.messageId]);
      expect(made.store.rows).toEqual([]);
      expect(made.timers.filter((timer) => !timer.cancelled)).toEqual([]);
    });

    it('waits at shutdown for an edit on its way, and records its new end without a timer (F5)', async () => {
      const made = messagesWith();
      const background = watchForTest();
      const [posted] = await made.messages.post(grunt(1), [WEST_CHANNEL]);
      const edit = made.hold('edit', WEST_CHANNEL);
      const refining = made.messages.refine(magikarps);
      await edit.reached;
      let closed = false;
      const closing = made.messages.close().then(() => {
        closed = true;
      });
      await background.settle();
      expect(closed).toBe(false);
      edit.release();
      await closing;
      expect(await refining).toEqual({ standing: [posted], complete: true });
      expect(textOf(made.gateway.messagesIn(WEST_CHANNEL)[0]?.message)).toContain(
        'Reported by **Misty**',
      );
      // The next start's sweep deletes it at the refined end; nothing waits in this process.
      expect(made.store.rows.map((row) => row.deleteAt)).toEqual([magikarps.endsAt]);
      expect(made.timers.filter((timer) => !timer.cancelled)).toEqual([]);
    });
  });

  describe('a refine’s edit keeps the message’s kind (review R6)', () => {
    const magikarps: RocketReport = { ...magikarpLineup(), id: 1 };

    it('edits a components-v2 message as one where the bot may no longer embed', async () => {
      const made = messagesWith();
      await made.messages.post(grunt(1), [WEST_CHANNEL]);
      made.gateway.noEmbeds.add(WEST_CHANNEL);
      await made.messages.refine(magikarps);
      const [message] = made.gateway.messagesIn(WEST_CHANNEL);
      expect(message?.edits).toBe(1);
      expect(message?.message.v2).toBe(true);
      expect(textOf(message?.message)).toContain('Reported by **Misty**');
      expect(made.entries.some((entry) => entry.msg === 'could not edit a grunt report')).toBe(
        false,
      );
    });

    it('edits a message sent as plain text as plain text where the bot may embed by now', async () => {
      const made = messagesWith();
      made.gateway.noEmbeds.add(WEST_CHANNEL);
      await made.messages.post(grunt(1), [WEST_CHANNEL]);
      made.gateway.noEmbeds.delete(WEST_CHANNEL);
      await made.messages.refine(magikarps);
      const [message] = made.gateway.messagesIn(WEST_CHANNEL);
      expect(message?.edits).toBe(1);
      expect(made.gateway.converted).toEqual([]);
      expect(message?.message.content).toContain('reported by **Misty**');
    });

    it('never edits a message known to be components v2 as plain text (F4)', async () => {
      const made = messagesWith();
      await made.messages.post(grunt(1), [WEST_CHANNEL]);
      made.failEdit.set(WEST_CHANNEL, refusedBody('the edit is refused'));
      await made.messages.refine(magikarps);
      // Components v2, then without its pictures: never as plain text.
      expect(made.tried).toEqual([
        { channelId: WEST_CHANNEL, v2: true },
        { channelId: WEST_CHANNEL, v2: true },
      ]);
      expect(made.entries.some((entry) => entry.msg === 'could not edit a grunt report')).toBe(
        true,
      );
    });

    it('edits a message of an earlier process as the bot may post in its channel, else as the other kind (F4)', async () => {
      const made = messagesWith();
      made.gateway.noEmbeds.add(WEST_CHANNEL);
      await made.messages.post(grunt(1), [WEST_CHANNEL]);
      const [east] = await made.messages.post(grunt(2), [EAST_CHANNEL]);
      const next = made.again();
      // Sent as plain text where the bot may not embed: edited as plain text, never converted.
      await next.messages.refine(magikarps);
      expect(made.tried).toEqual([{ channelId: WEST_CHANNEL, v2: false }]);
      expect(made.gateway.converted).toEqual([]);
      expect(made.gateway.messagesIn(WEST_CHANNEL)[0]?.message.content).toContain(
        'reported by **Misty**',
      );
      // Sent as components v2 where the bot may no longer embed: plain text is refused, and it
      // is edited as components v2.
      made.gateway.noEmbeds.add(EAST_CHANNEL);
      await next.messages.refine({ ...magikarpLineup(), id: 2 });
      expect(made.tried.slice(1)).toEqual([
        { channelId: EAST_CHANNEL, v2: false },
        { channelId: EAST_CHANNEL, v2: true },
      ]);
      const [message] = made.gateway.messagesIn(EAST_CHANNEL);
      expect(message?.id).toBe(east?.messageId);
      expect(message?.message.v2).toBe(true);
      expect(textOf(message?.message)).toContain('Reported by **Misty**');
    });
  });

  it('tells every message found gone apart from messages it could not find (F2)', async () => {
    const made = messagesWith();
    const refined: RocketReport = { ...magikarpLineup(), id: 1 };
    const [posted] = await made.messages.post(grunt(1), [WEST_CHANNEL]);
    made.store.failing.set('ofReport', new Error('the database is away'));
    // Read twice (L-5), then said to be unread.
    const reads = vi.spyOn(made.store, 'ofReport');
    expect(await made.messages.refine(refined)).toEqual({
      standing: [],
      complete: false,
      unread: true,
    });
    expect(reads).toHaveBeenCalledTimes(2);
    reads.mockRestore();
    expect(made.entries.some((entry) => entry.msg === 'could not find a grunt’s messages')).toBe(
      true,
    );
    made.store.failing.delete('ofReport');
    made.gateway.gone.add(posted?.messageId ?? '');
    expect(await made.messages.refine(refined)).toEqual({ standing: [], complete: true });
    expect(made.store.rows).toEqual([]);
  });

  it('reads a refined grunt’s messages once more when the first read fails, and edits them (L-5)', async () => {
    const made = messagesWith();
    const posted = await made.messages.post(grunt(1), [WEST_CHANNEL]);
    vi.spyOn(made.store, 'ofReport').mockRejectedValueOnce(new Error('the database is away'));
    const refined: RocketReport = { ...magikarpLineup(), id: 1 };
    expect(await made.messages.refine(refined)).toEqual({ standing: posted, complete: true });
    const [west] = made.gateway.messagesIn(WEST_CHANNEL);
    expect(west?.edits).toBe(1);
    expect(textOf(west?.message)).toContain('Magikarp');
  });

  it('leaves a message whose edit fails as it was, says so, and deletes it at the new end', async () => {
    const made = messagesWith();
    const posted = await made.messages.post(grunt(1), [WEST_CHANNEL, EAST_CHANNEL]);
    made.failEdit.set(EAST_CHANNEL, new Error('500 Internal Server Error'));
    const refined: RocketReport = { ...magikarpLineup(), id: 1 };
    expect(await made.messages.refine(refined)).toEqual({ standing: posted, complete: true });
    const [east] = made.gateway.messagesIn(EAST_CHANNEL);
    expect(east?.edits).toBe(0);
    expect(textOf(east?.message)).toContain('Mudkip');
    expect(made.entries.some((entry) => entry.msg === 'could not edit a grunt report')).toBe(true);
    expect(made.store.rows.map((row) => row.deleteAt)).toEqual([refined.endsAt, refined.endsAt]);
  });

  it('posts no more of a report that ended while its first message was on its way (fix F3)', async () => {
    const made = messagesWith();
    const send = made.hold('send', WEST_CHANNEL);
    const sending = made.messages.post(grunt(4), [WEST_CHANNEL, EAST_CHANNEL]);
    await send.reached;
    made.ended([grunt(4)]);
    send.release();
    await sending;
    await made.messages.flush();
    // The first channel's message went out and is deleted; the second is never sent.
    expect(made.gateway.deleted.map((one) => one.channelId)).toEqual([WEST_CHANNEL]);
    expect(made.gateway.messagesIn(WEST_CHANNEL)).toEqual([]);
    expect(made.gateway.messagesIn(EAST_CHANNEL)).toEqual([]);
    expect(made.store.rows).toEqual([]);
  });

  it('leaves its messages at shutdown; the next start deletes what is overdue, the rest when due', async () => {
    const made = messagesWith();
    await made.messages.post(grunt(1), [WEST_CHANNEL]);
    made.clock.now += 20 * 60_000;
    const later = await made.messages.post(grunt(2, { endsAt: made.clock.now + HALF_HOUR }), [
      WEST_CHANNEL,
    ]);
    await made.messages.close();
    expect(made.gateway.deleted).toEqual([]);
    expect(made.store.rows).toHaveLength(2);
    made.clock.now += 15 * 60_000;
    const next = made.again();
    expect(await next.messages.sweep()).toBe(2);
    expect(next.timers.map((timer) => timer.ms)).toEqual([0, 15 * 60_000]);
    await next.fire();
    expect(made.store.rows.map((row) => row.messageId)).toEqual([]);
    expect(made.gateway.deleted.map((one) => one.messageId)).toContain(later[0]?.messageId);
  });

  it('tries a failed delete again, and gives up a day after its time', async () => {
    const made = messagesWith();
    await made.messages.post(grunt(1), [WEST_CHANNEL]);
    made.gateway.failing.set('deleteMessage', new Error('Discord is away'));
    made.clock.now += HALF_HOUR;
    await made.fire();
    // Once more a minute later.
    expect(made.timers.map((timer) => timer.ms)).toEqual([60_000]);
    await made.fire();
    expect(made.store.rows).toHaveLength(1);
    made.clock.now += GIVE_UP_MS;
    expect(await made.messages.sweep()).toBe(0);
    expect(made.store.rows).toEqual([]);
    expect(made.entries.some((entry) => entry.msg === 'gave up deleting a grunt report')).toBe(
      true,
    );
  });
});
