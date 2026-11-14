import { describe, expect, it } from 'vitest';
import { watchEachTest } from '../../test/support/timers.js';
import { ALICE, at, MINUTE } from '../../test/support/parties.js';
import { partyServiceWith, reportedRaid } from '../../test/support/party-service.js';
import { pokemonTarget } from '../domain/pogo/notification-target.js';
import { PartyStatus } from '../domain/party/status.js';
import { NORTH_CHANNEL, northRegion, WEST_CHANNEL, WEST_FORUM } from '../../test/support/gyms.js';
import { EMOJI_RENDER_GAP_MS } from './party-service.js';
import { FAKE_GUILD_ID } from '../../test/support/fake-interactions.js';
import { TestServers } from '../../test/support/server-values.js';
import type { MemoryAccessGrants } from '../../test/support/party-service.js';
import { MODERATOR, SAFETY_SERVER } from '../../test/support/meetup-safety-cases.js';
import { meetupSafetyWith } from '../../test/support/meetup-safety-service.js';
import { quietServers, type QuietServers } from './quiet-servers.js';

const DAY = 24 * 3_600_000;
/** A member blocked from meetups, who appeals. */
const BLOCKED = '200000000000000003';
/** North's forum (`northRegion` has none). */
const NORTH_FORUM = '100000000000000014';

async function settledAccess(made: Made): Promise<void> {
  await made.attendance.flush();
  await made.access.flush();
  await made.service.flush();
}

/**
 * What stops for a server Pine left (plan 19C-1; spec "Joining, the setup state, leaving"): its
 * parties are not advanced, posted, edited or announced, and nothing of it is ended or deleted;
 * once it is back, the clock takes them up again.
 */
const HATCH = at('2026-10-13T14:30');
const END = at('2026-10-13T15:15');

/** The servers Pine left, as `ServerStandings` keeps them. */
function leftSet(): QuietServers & { servers: Set<string> } {
  const servers = new Set<string>();
  return { servers, isQuiet: (serverId) => servers.has(serverId) };
}

type Made = Awaited<ReturnType<typeof reportedRaid>>;

async function tickAt(made: Made, time: number): Promise<void> {
  made.clock.now = time;
  await made.scheduler.tick();
  await made.scheduler.whenIdle();
  await made.attendance.flush();
  await made.service.flush();
}

watchEachTest();

describe('a server Pine left (plan 19C-1)', () => {
  it('has its parties neither advanced nor ended by the clock, nor its posts touched, until it is back', async () => {
    const left = leftSet();
    const made = await reportedRaid({ time: { hatch: HATCH } }, { quiet: left });
    // The clock's first look at every post is done.
    await tickAt(made, made.clock.now);
    left.servers.add(made.gateway.guildId);
    const before = made.gateway.calls.length;
    const stored = made.current();
    await tickAt(made, END + 30 * MINUTE);
    // Past its end, and still as it was: nothing asked of Discord.
    expect(made.current()).toBe(stored);
    expect(made.gateway.calls).toHaveLength(before);
    // A change asked for draws nothing either: a draw would find the post gone and end it.
    made.service.changed(stored.id);
    await made.service.flush();
    await made.service.checkSummaries();
    await made.service.sweepPosts();
    expect(made.gateway.calls).toHaveLength(before);
    expect(made.store.get(stored.id)).toBe(stored);
    // Back within 30 days: the clock takes it up, and ends it by its own time.
    left.servers.delete(made.gateway.guildId);
    await tickAt(made, END + 31 * MINUTE);
    expect(made.current().raid).toMatchObject({ stageSeen: 'ended' });
    await tickAt(made, END + 41 * MINUTE);
    expect(made.store.get(stored.id)).toBeUndefined();
  });

  it('leaves the parties of a server that is still in alone', async () => {
    const left = leftSet();
    const made = await reportedRaid({ time: { hatch: HATCH } }, { quiet: left });
    left.servers.add('412345678901234599');
    const id = made.current().id;
    await tickAt(made, END + 30 * MINUTE);
    await tickAt(made, END + 40 * MINUTE);
    expect(made.store.get(id)).toBeUndefined();
  });

  it('keeps the grants of its forums through the sweep until it is back (J3)', async () => {
    const left = leftSet();
    const made = await reportedRaid({ boss: { key: 'yveltal' } }, { quiet: left });
    made.gateway.shutOut(WEST_FORUM, ALICE);
    await made.attendance.signUp(made.party.id, { id: ALICE, name: 'Alice' }, PartyStatus.Coming);
    await settledAccess(made);
    // Her grant is left over: its row could not be removed when she left.
    const grants = made.grants as MemoryAccessGrants;
    grants.failing = new Error('the database is away');
    await made.attendance.leave(made.party.id, { id: ALICE, name: 'Alice' });
    await settledAccess(made);
    grants.failing = undefined;
    left.servers.add(made.gateway.guildId);
    const before = made.gateway.calls.length;
    expect(await made.access.sweep()).toBe(0);
    expect(made.access.has(WEST_FORUM, ALICE)).toBe(true);
    expect(made.gateway.calls).toHaveLength(before);
    // Back: the sweep finishes the job.
    left.servers.delete(made.gateway.guildId);
    expect(await made.access.sweep()).toBe(1);
  });

  it('neither expires its meetup requests and appeals nor tells their members, until it is back (J3)', async () => {
    const left = leftSet();
    const made = await meetupSafetyWith({ quiet: left });
    const request = await made.held();
    await made.storage.addBlock(SAFETY_SERVER, BLOCKED, { id: MODERATOR, name: 'Mod', at: 1 });
    const appealed = await made.safety.appeal({
      serverId: SAFETY_SERVER,
      nearChannelId: '100000000000000001',
      member: { id: BLOCKED, name: 'Bea' },
      text: 'Please.',
    });
    if (appealed.kind !== 'sent') throw new Error(appealed.kind);
    left.servers.add(SAFETY_SERVER);
    made.clock.now += 8 * DAY;
    const told = made.dms.jobs.length;
    expect(await made.safety.expire()).toBe(0);
    expect(made.storage.requests.get(request.id)).toMatchObject({ status: 'pending' });
    expect(made.storage.appeals.get(appealed.appeal.id)).toMatchObject({ status: 'open' });
    expect(made.dms.jobs).toHaveLength(told);
    left.servers.delete(SAFETY_SERVER);
    expect(await made.safety.expire()).toBe(1);
    expect(made.storage.appeals.get(appealed.appeal.id)).toMatchObject({ status: 'expired' });
  });

  it('gives its posts no turn in the paced redraws: the catch-up’s, the emoji’s, its zone’s (M-1)', async () => {
    const left = leftSet();
    /** The paced redraws' timers that wait: one per post after the first. */
    const paced: { ms: number; cancelled: boolean }[] = [];
    const made = await partyServiceWith([], {
      quiet: left,
      setTimer: (_run, ms) => {
        const timer = { ms, cancelled: false };
        if (ms === EMOJI_RENDER_GAP_MS) paced.push(timer);
        return () => {
          timer.cancelled = true;
        };
      },
    });
    // North, of a server Pine is still in, with a forum of its own.
    made.regions.rows.push({ ...northRegion(), forumChannelId: NORTH_FORUM });
    made.gateway.addForum(NORTH_FORUM);
    const posts: string[] = [];
    for (const [name, regionChannelId] of [
      ['Picnic', WEST_CHANNEL],
      ['Walk', WEST_CHANNEL],
      ['Swim', NORTH_CHANNEL],
    ] as const) {
      const outcome = await made.service.createMeetup({ name, creatorId: ALICE, regionChannelId });
      if (outcome.kind !== 'created') throw new Error(outcome.kind);
      posts.push(outcome.party.forumPostId ?? '');
    }
    const [picnic, walk, swim] = posts;
    await made.service.flush();
    left.servers.add(made.gateway.guildId);
    // Long enough that a post drawn again, the same as before, is looked at.
    made.clock.now += 11 * MINUTE;
    const before = made.gateway.calls.length;
    made.service.redrawPosts();
    made.service.emojiChanged();
    made.service.zoneChanged(made.gateway.guildId);
    // Its two posts would hold the line a gap each: none is queued.
    expect(paced.filter((timer) => !timer.cancelled)).toEqual([]);
    await made.service.flush();
    const calls = made.gateway.calls.slice(before);
    expect(
      calls.filter((call) => call.endsWith(` ${picnic}`) || call.endsWith(` ${walk}`)),
    ).toEqual([]);
    // The present server's post is drawn again.
    expect(calls).toContain(`postInfo ${swim}`);
  });

  it('tells no member of its parties', async () => {
    const left = leftSet();
    const kept = await partyServiceWith([], { quiet: left, notifying: { quiet: left } });
    await kept.wants.set(ALICE, kept.gateway.guildId, pokemonTarget(717), 'both');
    left.servers.add(kept.gateway.guildId);
    // A party of the left server that changes (here reported, which cannot happen there, so
    // that the notifier is asked): nobody is told.
    const made = await reportedRaid(
      { boss: { key: 'yveltal' } },
      { quiet: left, notifying: { quiet: left } },
      {
        storage: kept.storage,
        gateway: kept.gateway,
        regions: kept.regions,
        clock: kept.clock,
        tags: kept.tags,
        wants: kept.wants,
        userSettings: kept.userSettings,
      },
    );
    await made.notify.flush();
    expect(made.dms.recipients).toEqual([]);
  });
});

describe('a server in setup (plan 19C-2)', () => {
  const LEFT = '412345678901234598';
  const NEW = '412345678901234599';

  it('is quiet, as a server Pine left is, and a server set up is not', () => {
    const left = leftSet();
    left.servers.add(LEFT);
    const servers = new TestServers();
    servers.settingUp.add(NEW);
    const quiet = quietServers({ isLeft: (serverId) => left.isQuiet(serverId) }, servers);
    expect(quiet.isQuiet(LEFT)).toBe(true);
    expect(quiet.isQuiet(NEW)).toBe(true);
    expect(quiet.isQuiet(FAKE_GUILD_ID)).toBe(false);
  });

  it('has no summary made in its regions until it is set up', async () => {
    const servers = new TestServers();
    const made = await partyServiceWith([], {
      quiet: quietServers({ isLeft: () => false }, servers),
    });
    servers.settingUp.add(made.gateway.guildId);
    const before = made.gateway.calls.length;
    await made.service.checkSummaries();
    expect(made.gateway.calls).toHaveLength(before);
    servers.settingUp.delete(made.gateway.guildId);
    await made.service.checkSummaries();
    expect(made.gateway.calls.length).toBeGreaterThan(before);
  });
});
