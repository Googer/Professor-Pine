import { describe, expect, it, vi } from 'vitest';
import { heldCall } from '../../test/support/held-call.js';
import { watchEachTest } from '../../test/support/timers.js';
import { missingPermissions } from '../../test/support/fake-gateway.js';
import { TEST_GUILD_ROW, WEST_CHANNEL, WEST_FORUM } from '../../test/support/gyms.js';
import { ALICE, BOB } from '../../test/support/parties.js';
import { reportedRaid } from '../../test/support/party-service.js';
import { gymsFixture } from '../../test/support/providers.js';
import { Tally } from '../../test/support/tally.js';
import { PartyStatus } from '../domain/party/status.js';
import { Coalescer } from './coalescer.js';
import type { Member } from './attendance-service.js';
import { buttonsOf, header, textOf } from '../../test/support/messages.js';

const alice: Member = { id: ALICE, name: 'Alice' };
const bob: Member = { id: BOB, name: 'Bob' };
const yveltal = { boss: { key: 'yveltal' } } as const;
type Made = Awaited<ReturnType<typeof reportedRaid>>;
const background = watchEachTest();

describe('PartyService.end', () => {
  it('ends the party, strips the controls, deletes the link line and archives the post', async () => {
    const made = await reportedRaid(yveltal);
    const { service, store, gateway, postId } = made;
    expect(gateway.messagesIn(WEST_CHANNEL)).toHaveLength(1);
    expect(buttonsOf(gateway.posts.get(postId)?.message).length).toBeGreaterThan(0);

    expect(await service.end(made.party.id)).toBe(true);

    expect(store.get(made.party.id)).toBeUndefined();
    // Recorded in the history, and its row (with its members' ids) deleted.
    expect(made.history.records.map((record) => record.partyId)).toEqual([made.party.id]);
    expect(made.storage.rows.has(made.party.id)).toBe(false);
    const post = gateway.posts.get(postId);
    expect(post).toMatchObject({ archived: true, locked: true, reopened: 0 });
    expect(buttonsOf(post?.message)).toEqual([]);
    // The last showing is the post as it was, without its controls.
    expect(header(post?.message)[0]).toBe('### Level 5 raid against Yveltal ✨');
    expect(textOf(post?.message)).toContain('**Where**\n**The Stacks** · ');
    expect(gateway.messagesIn(WEST_CHANNEL)).toEqual([]);
    // The archiving is the last thing that happens to the post.
    const calls = gateway.calls.filter((call) => call.endsWith(` ${postId}`));
    expect(calls.at(-1)).toBe(`archivePost ${postId}`);
  });

  it('answers false for a party that is not active, and does nothing', async () => {
    const made = await reportedRaid();
    await made.service.end(made.party.id);
    const before = made.gateway.calls.length;
    expect(await made.service.end(made.party.id)).toBe(false);
    expect(await made.service.end('00000000-0000-4000-8000-00000000ffff')).toBe(false);
    expect(made.gateway.calls).toHaveLength(before);
  });

  it('deletes the open questions and the warning, and nothing opens the post again', async () => {
    const made = await reportedRaid(yveltal);
    const { service, attendance, store, gateway, postId } = made;
    const id = made.party.id;
    await attendance.signUp(id, alice, PartyStatus.Present);
    await attendance.signUp(id, bob, PartyStatus.Present);
    await attendance.done(id, alice);
    await attendance.flush();
    const warning = await gateway.sendMessage(postId, { content: 'This post will be archived.' });
    await store.update(id, (party) => ({
      party: { ...party, prompts: { ...party.prompts, warning: warning ?? null } },
    }));
    const [question] = made.current().prompts.completion;
    expect(question).toBeDefined();

    // A change and a line are on their way when the party ends.
    await attendance.changeNumber(id, bob, 1);
    await service.end(id);
    await attendance.flush();
    await service.flush();

    const deleted = gateway.deleted.map((gone) => gone.messageId);
    expect(deleted).toContain(question?.id);
    expect(deleted).toContain(warning);
    expect(gateway.posts.get(postId)).toMatchObject({ archived: true, locked: true, reopened: 0 });
    expect(gateway.calls.filter((call) => call.endsWith(` ${postId}`)).at(-1)).toBe(
      `archivePost ${postId}`,
    );
  });

  it('brings the summary of the region up to date', async () => {
    const made = await reportedRaid();
    const { service, gateway, regions } = made;
    const west = regions.byId(1);
    if (!west) throw new Error('no region');
    await service.ensureSummary(west);
    await service.flush();
    const summary = regions.byId(1)?.summaryMessageId ?? '';
    expect(textOf(gateway.posts.get(summary)?.message)).toContain(made.postId);
    await service.end(made.party.id);
    await service.flush();
    expect(textOf(gateway.posts.get(summary)?.message)).not.toContain(made.postId);
  });

  it('ends the party quietly when its post is gone', async () => {
    const made = await reportedRaid();
    made.gateway.gone.add(made.postId);
    expect(await made.service.end(made.party.id)).toBe(true);
    expect(made.store.get(made.party.id)).toBeUndefined();
    expect(made.gateway.calls.some((call) => call.startsWith('archivePost'))).toBe(false);
    expect(made.entries.filter((entry) => Number(entry.level) >= 40)).toEqual([]);
  });

  it('ends the party although Discord fails, with a warning for each step', async () => {
    const made = await reportedRaid();
    const { service, gateway, postId } = made;
    for (const method of ['deleteMessage', 'editPost', 'archivePost'] as const) {
      gateway.failing.set(method, new Error(`${method} failed`));
    }
    expect(await service.end(made.party.id)).toBe(true);
    expect(made.store.get(made.party.id)).toBeUndefined();
    expect(gateway.posts.get(postId)?.archived).toBe(false);
    expect(made.entries.filter((entry) => entry.level === 40).map((entry) => entry.msg)).toEqual([
      'could not delete the link to an ended party',
      'could not show an ended party one last time',
      'could not archive the post of an ended party',
    ]);

    // The sweep archives what stayed open.
    gateway.failing.clear();
    expect(await service.sweepPosts()).toBe(1);
    expect(gateway.posts.get(postId)).toMatchObject({ archived: true, locked: true });
  });

  it('stays active when the write fails, so that the scheduler tries again', async () => {
    const made = await reportedRaid();
    made.storage.failing = new Error('database down');
    await expect(made.service.end(made.party.id)).rejects.toThrow('database down');
    made.storage.failing = undefined;
    expect(made.store.get(made.party.id)).toBeDefined();
    expect(made.gateway.posts.get(made.postId)?.archived).toBe(false);
    expect(await made.service.end(made.party.id)).toBe(true);
  });

  it('lets a render that is under way finish before it archives', async () => {
    const made = await reportedRaid();
    const { service, attendance, gateway, postId } = made;
    await attendance.signUp(made.party.id, alice, PartyStatus.Coming);
    // The render starts (its edit is on its way) and the party ends in the same moment.
    const rendering = service.flush();
    const ending = service.end(made.party.id);
    await Promise.all([rendering, ending]);
    expect(gateway.posts.get(postId)).toMatchObject({ archived: true, reopened: 0 });
    expect(gateway.calls.filter((call) => call.endsWith(` ${postId}`)).at(-1)).toBe(
      `archivePost ${postId}`,
    );
  });
});

describe('PartyService.end while a message of the bot is on its way into the post', () => {
  /**
   * Holds the first message into the post whose text has `words` until released; the ending of
   * the party meanwhile must not archive the post before that message (and what follows it) is
   * done, or the message would open the archived post again.
   */
  async function endsMeanwhile(words: string, send: (made: Made) => Promise<unknown>) {
    const made = await reportedRaid(yveltal);
    const held = heldCall(`the message "${words}"`);
    const original = made.gateway.sendMessage.bind(made.gateway);
    vi.spyOn(made.gateway, 'sendMessage').mockImplementation(async (channel, message, options) => {
      if (channel === made.postId && !message.v2 && message.content?.includes(words)) {
        held.arrive();
        await held.released;
      }
      return original(channel, message, options);
    });
    const sending = send(made);
    await held.reached;
    const ending = made.service.end(made.party.id);
    await background.settle();
    expect(made.store.get(made.party.id)).toBeUndefined();
    expect(made.gateway.posts.get(made.postId)?.archived).toBe(false);
    held.release();
    await sending;
    expect(await ending).toBe(true);
    expect(made.gateway.posts.get(made.postId)).toMatchObject({ archived: true, reopened: 0 });
  }

  it('waits for a line of what happened', async () => {
    await endsMeanwhile('is coming', async (made) => {
      await made.attendance.signUp(made.party.id, alice, PartyStatus.Coming);
      await made.attendance.flush();
    });
  });

  it('waits for the word that a moderator keeps the post open', async () => {
    await endsMeanwhile('keeps this post open', (made) =>
      made.service.keep(made.party.id, true, alice),
    );
  });

  it('waits for a member’s request to delete it', async () => {
    await endsMeanwhile('asks for this raid to be deleted', (made) =>
      made.service.requestDeletion(made.party.id, alice, 'Twice', []),
    );
  });
});

describe('PartyService.end with an answer that is slow', () => {
  /**
   * A service whose timers a test fires by hand: the ones that wait for an answer (`waits`), and
   * how many of those were started (`waiting`, a count a test can wait for).
   */
  async function withTimers() {
    const timers: { run: () => void; ms: number; cancelled: boolean }[] = [];
    const waiting = new Tally('the waits for an answer');
    const made = await reportedRaid(yveltal, {
      setTimer: (run, ms) => {
        const timer = { run, ms, cancelled: false };
        timers.push(timer);
        if (ms === 3_000) waiting.add();
        return () => {
          timer.cancelled = true;
        };
      },
    });
    const waits = () => timers.filter((timer) => timer.ms === 3_000 && !timer.cancelled);
    return { made, waits, waiting };
  }

  it('archives the post although the answer never settles, after three seconds', async () => {
    const { made, waits, waiting } = await withTimers();
    const ending = made.service.end(made.party.id, undefined, {
      left: () => new Promise(() => {}),
    });
    await waiting.reached(1);
    expect(waits()).toHaveLength(1);
    expect(made.gateway.posts.get(made.postId)?.archived).toBe(false);
    waits()[0]?.run();
    expect(await ending).toBe(true);
    expect(made.gateway.posts.get(made.postId)).toMatchObject({ archived: true, locked: true });
  });

  it('does not wait for the time when the answer comes, and cancels the timer', async () => {
    const { made, waits } = await withTimers();
    expect(
      await made.service.end(made.party.id, undefined, { left: () => Promise.resolve() }),
    ).toBe(true);
    expect(waits()).toEqual([]);
    expect(made.gateway.posts.get(made.postId)?.archived).toBe(true);
  });

  it('logs an answer that fails after the close, and nothing is left unhandled', async () => {
    const { made, waits, waiting } = await withTimers();
    let fail: (err: Error) => void = () => undefined;
    const answer = new Promise<void>((_resolve, reject) => {
      fail = reject;
    });
    const ending = made.service.end(made.party.id, undefined, { left: () => answer });
    await waiting.reached(1);
    expect(waits()).toHaveLength(1);
    waits()[0]?.run();
    await ending;
    expect(made.entries.filter((entry) => entry.level === 40)).toEqual([]);
    fail(new Error('Unknown interaction'));
    await background.settle();
    expect(
      made.entries.filter(
        (entry) => entry.level === 40 && entry.msg === 'could not answer before closing a party',
      ),
    ).toHaveLength(1);
  });
});

describe('PartyService.sweepPosts', () => {
  it('archives the post of an ended party that is open again, and nothing else', async () => {
    const made = await reportedRaid();
    const { service, gateway, regions } = made;
    const west = regions.byId(1);
    if (!west) throw new Error('no region');
    await service.ensureSummary(west);
    const summary = regions.byId(1)?.summaryMessageId ?? '';
    const post = { title: 'T5 egg · Lost', message: { content: 'x' }, tagIds: [] };
    // A post no party ever had, and one a member made.
    const orphan = (await gateway.createPost(WEST_FORUM, post)) ?? '';
    const byMember = (await gateway.createPost(WEST_FORUM, post)) ?? '';
    gateway.foreign.add(byMember);
    // A second raid that has ended, whose post a late message opened again.
    const gym = gymsFixture().get(2);
    if (!gym) throw new Error('no gym');
    const second = await service.reportRaid({
      gym,
      guildRow: TEST_GUILD_ROW,
      reporterId: ALICE,
      anonymous: false,
      autoStatus: PartyStatus.Interested,
      tier: { level: 'T3', shadow: false },
      boss: null,
    });
    if (second.kind !== 'created') throw new Error(second.kind);
    const ended = second.party.forumPostId ?? '';
    await service.end(second.party.id);
    await gateway.sendMessage(ended, { content: 'late' }, { reopen: true });
    expect(gateway.posts.get(ended)).toMatchObject({ archived: false, reopened: 1 });

    expect(await service.sweepPosts()).toBe(1);
    expect(gateway.posts.get(ended)).toMatchObject({ archived: true, locked: true });
    for (const left of [orphan, byMember, summary, made.postId]) {
      expect(gateway.posts.get(left)?.archived, left).toBe(false);
    }
    expect(await service.sweepPosts()).toBe(0);
  });

  it('says a sweep the network failed once, with how many forums, and Discord’s refusals by forum (plan 8X-H)', async () => {
    const made = await reportedRaid();
    const looked = () =>
      made.entries.filter(
        (entry) =>
          entry.msg === 'could not look for open posts of ended parties' ||
          entry.msg === 'could not sweep the posts of ended parties',
      );
    made.gateway.failing.set(
      'openPosts',
      new TypeError('fetch failed', {
        cause: Object.assign(new Error('getaddrinfo ENOTFOUND discord.com'), { code: 'ENOTFOUND' }),
      }),
    );
    expect(await made.service.sweepPosts()).toBe(0);
    expect(looked()).toEqual([
      expect.objectContaining({
        level: 40,
        msg: 'could not sweep the posts of ended parties',
        forums: 2,
        forum: WEST_FORUM,
      }),
    ]);
    // The debug line counts only the forums looked through.
    expect(
      made.entries.filter((entry) => entry.msg === 'swept the posts of ended parties'),
    ).toEqual([expect.objectContaining({ level: 20, forums: 0, failed: 2 })]);
    // A refusal of Discord's is about that forum: said for each.
    made.gateway.failing.set('openPosts', missingPermissions('GET'));
    await made.service.sweepPosts();
    expect(looked().slice(1)).toEqual([
      expect.objectContaining({ level: 40, msg: 'could not look for open posts of ended parties' }),
      expect.objectContaining({ level: 40, msg: 'could not look for open posts of ended parties' }),
    ]);
  });

  it('says at debug what a sweep archived (plan 8X-H)', async () => {
    const made = await reportedRaid();
    await made.service.sweepPosts();
    expect(
      made.entries.filter((entry) => entry.msg === 'swept the posts of ended parties'),
    ).toEqual([expect.objectContaining({ level: 20, archived: 0, forums: 2, failed: 0 })]);
  });

  it('goes on with the other forums when one cannot be listed', async () => {
    const made = await reportedRaid();
    made.gateway.failing.set('openPosts', new Error('no'));
    expect(await made.service.sweepPosts()).toBe(0);
    // Both forums were asked; their failure, no refusal of Discord's, is said once (plan 8X-H).
    expect(
      made.entries.filter((entry) => entry.msg === 'could not sweep the posts of ended parties'),
    ).toEqual([expect.objectContaining({ forums: 2 })]);
  });
});

describe('PartyService.end with a condition', () => {
  it('ends only when the condition holds for the party as it is stored then', async () => {
    const made = await reportedRaid();
    const id = made.party.id;
    expect(await made.service.end(id, () => false)).toBe(false);
    expect(made.store.get(id)).toBeDefined();
    expect(made.gateway.posts.get(made.postId)?.archived).toBe(false);
    expect(await made.service.end(id, (party) => party.id === id)).toBe(true);
    expect(made.store.get(id)).toBeUndefined();
  });

  it('sees a change that was stored between the decision to end and the ending', async () => {
    const made = await reportedRaid();
    const id = made.party.id;
    // Both are queued together: the change is written first, then the ending decides.
    const saved = made.store.update(id, (party) => ({ party: { ...party, saved: true } }));
    const ending = made.service.end(id, (party) => !party.saved);
    await saved;
    expect(await ending).toBe(false);
    expect(made.store.get(id)?.saved).toBe(true);
    expect(made.gateway.posts.get(made.postId)?.archived).toBe(false);
  });
});

describe('Coalescer.idle', () => {
  it('waits for the run that is going on and the one that follows it at once', async () => {
    const started: number[] = [];
    let release: (() => void)[] = [];
    const coalescer = new Coalescer<string>({
      delayMs: 0,
      work: () =>
        new Promise<void>((resolve) => {
          started.push(started.length);
          release.push(resolve);
        }),
      onError: () => undefined,
    });
    await coalescer.idle('a');
    coalescer.request('a');
    coalescer.request('a');
    let idle = false;
    const waiting = coalescer.idle('a').then(() => {
      idle = true;
    });
    release[0]?.();
    await background.settle();
    expect(idle).toBe(false);
    expect(started).toHaveLength(2);
    release[1]?.();
    await waiting;
    expect(idle).toBe(true);
    release = [];
  });
});
