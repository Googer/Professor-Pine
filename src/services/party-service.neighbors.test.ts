import { describe, expect, it } from 'vitest';
import { FAKE_GUILD_ID } from '../../test/support/fake-interactions.js';
import { FakePartyGateway } from '../../test/support/fake-gateway.js';
import { OTHER_GUILD_ID, testRegions, wideRegion } from '../../test/support/gyms.js';
import { textDisplays, textOf } from '../../test/support/messages.js';
import {
  NEIGHBOR_GYMS,
  neighborGymsWith,
  thirdRegion,
  THIRD_GUILD_ROW,
} from '../../test/support/neighbor-gyms.js';
import {
  ALICE,
  at,
  PARTY_NOW,
  REPORTER,
  testRaidRules,
  withAttendees,
} from '../../test/support/parties.js';
import { TestServers } from '../../test/support/server-values.js';
import { setHatchTime } from '../domain/party/raid.js';
import { partyServiceWith, TestRegions } from '../../test/support/party-service.js';
import { neighborsWith } from '../../test/support/server-neighbors.js';
import { neighborRow } from '../../test/support/server-neighbor-cases.js';
import { watchEachTest } from '../../test/support/timers.js';
import { isRaid, type RaidParty } from '../domain/party/party.js';
import { neighborPair } from '../domain/servers/neighbors.js';
import { PartyStatus } from '../domain/party/status.js';
import { FORUM_TAGS } from '../render/party-post.js';
import { NeighborMatches } from './neighbor-matches.js';
import { NeighborParties } from './neighbor-parties.js';
import { EMOJI_RENDER_GAP_MS, NEIGHBOR_MATCHES_GATHER_MS } from './party-service.js';

/** The test server (row 1) and the second (row 2) are neighbors; the third (row 3) neither's. */
const OURS = FAKE_GUILD_ID;
const THEIRS = OTHER_GUILD_ID;
const THIRD = '412345678901234599';
const SERVERS: Record<number, string> = { 1: OURS, 2: THEIRS, [THIRD_GUILD_ROW]: THIRD };
const ROWS = new Map(Object.entries(SERVERS).map(([row, server]) => [server, Number(row)]));
const WIDE_FORUM = '100000000000000016';
const THIRD_FORUM = '100000000000000036';

const background = watchEachTest();

async function neighborsAt(
  options: { quiet?: Set<string>; neighbors?: boolean; servers?: TestServers } = {},
) {
  const gymsMade = await neighborGymsWith();
  const regions = new TestRegions();
  regions.rows = [
    ...testRegions(),
    { ...wideRegion(), forumChannelId: WIDE_FORUM },
    { ...thirdRegion(), forumChannelId: THIRD_FORUM },
  ];
  const gateway = new FakePartyGateway();
  gateway.addForum(WIDE_FORUM, FORUM_TAGS, 'wide-raids');
  gateway.addForum(THIRD_FORUM, FORUM_TAGS, 'third-raids');
  const timers: { run: () => void; ms: number }[] = [];
  const quiet = options.quiet ?? new Set<string>();
  const serverOfRow = (row: number) => SERVERS[row];
  const made = await partyServiceWith(
    [],
    {
      gyms: gymsMade.directory,
      serverOfRow,
      quiet: { isQuiet: (server) => quiet.has(server) },
      ...(options.servers ? { servers: options.servers } : {}),
      // Each post drawn at once when asked, so that the pace is the queue of redraws alone.
      renderDelayMs: 0,
      setTimer: (run, ms) => {
        timers.push({ run, ms });
        return () => undefined;
      },
    },
    { gateway, regions },
  );
  const pair = neighborPair(OURS, THEIRS);
  const listed = await neighborsWith({
    rows:
      options.neighbors === false
        ? []
        : [{ ...neighborRow({ acceptedAt: 1 }), ...pair, askedBy: OURS }],
    reachable: [OURS, THEIRS, THIRD],
    names: new Map([
      [OURS, 'Test Server'],
      [THEIRS, 'Pewter City'],
      [THIRD, 'Cerulean City'],
    ]),
  });
  gateway.otherServerNames.set(THEIRS, 'Pewter City');
  gateway.otherServerNames.set(THIRD, 'Cerulean City');
  const parties = new NeighborParties({
    neighbors: listed.neighbors,
    quiet: { isQuiet: (server) => quiet.has(server) },
    matches: new NeighborMatches({ gyms: gymsMade.directory }),
    rowOf: (server) => ROWS.get(server),
    serverOfRow,
    parties: made.store,
  });
  made.service.useNeighbors(parties);
  // As the app wires it: a pair that becomes or stops being neighbors redraws their posts.
  listed.neighbors.whenChanged((pair) => {
    made.service.neighborsChanged(pair);
  });
  // And a change of a server's gyms compares its pairs' matches, gathered (review R9).
  gymsMade.directory.whenServersChanged((rows) => {
    made.service.neighborGymsChanged(rows);
  });
  const report = async (gymId: number, guildRow: number): Promise<RaidParty> => {
    const gym = gymsMade.directory.stored(gymId);
    if (!gym) throw new Error(`no gym ${String(gymId)}`);
    const outcome = await made.service.reportRaid({
      gym,
      reporterId: REPORTER,
      anonymous: false,
      autoStatus: PartyStatus.Interested,
      tier: { level: 'T5', shadow: false },
      boss: null,
      guildRow,
    });
    if (outcome.kind !== 'created') throw new Error(`not created: ${outcome.kind}`);
    await made.service.flush();
    return outcome.party;
  };
  const shown = (party: RaidParty) =>
    textOf(made.gateway.posts.get(party.forumPostId ?? '')?.message);
  /** Every post waiting on the paced queue drawn, a gap after another, then the rest flushed. */
  const drawPaced = async () => {
    for (;;) {
      const due = timers.splice(0).filter((timer) => timer.ms === EMOJI_RENDER_GAP_MS);
      if (due.length === 0) break;
      for (const timer of due) timer.run();
    }
    await made.service.flush();
  };
  return { ...made, report, shown, timers, quiet, listed, gymsMade, drawPaced };
}

const link = (server: string, party: RaidParty) =>
  `https://discord.com/channels/${server}/${party.forumPostId ?? ''}`;

describe('a neighbor’s raid in a post (plan 19E)', () => {
  it('shows each neighbor’s raid at the same gym in the other’s post, and nothing of a third server', async () => {
    const made = await neighborsAt();
    const ours = await made.report(1, 1);
    const theirs = await made.report(NEIGHBOR_GYMS.library, 2);
    const third = await made.report(201, THIRD_GUILD_ROW);
    await made.service.flush();
    expect(made.shown(ours)).toContain(
      `**Neighbors at this gym**\n- **Pewter City** · Level 5 raid (egg) · Interested (1) · ` +
        `[Its post](<${link(THEIRS, theirs)}>)`,
    );
    expect(made.shown(theirs)).toContain(
      `- **Test Server** · Level 5 raid (egg) · Interested (1) · [Its post](<${link(OURS, ours)}>)`,
    );
    expect(made.shown(ours)).not.toContain('Cerulean');
    expect(made.shown(third)).not.toContain('Neighbors');
    // Nobody is named in a neighbor's line, nor mentioned.
    const post = made.gateway.posts.get(ours.forumPostId ?? '')?.message;
    const block = textDisplays(post).find((text) => text.startsWith('**Neighbors')) ?? '';
    expect(block).not.toContain(REPORTER);
    expect(block).not.toContain('<@');
  });

  it('redraws the neighbor’s post when a raid changes, in the reading server’s turn, and drops it once ended', async () => {
    const made = await neighborsAt();
    const ours = await made.report(1, 1);
    const theirs = await made.report(NEIGHBOR_GYMS.library, 2);
    await made.service.flush();
    const before = made.gateway.posts.get(ours.forumPostId ?? '')?.edits ?? 0;
    await made.store.update(theirs.id, (party) => ({
      party: withAttendees(party, { [ALICE]: { status: PartyStatus.Coming, number: 2 } }),
    }));
    await made.service.flush();
    expect(made.shown(ours)).toContain('Interested (1), Coming (2)');
    expect(made.gateway.posts.get(ours.forumPostId ?? '')?.edits).toBe(before + 1);
    // The neighbor's raid ends: the line goes at the redraw that follows.
    await made.service.end(theirs.id);
    await made.service.flush();
    expect(made.shown(ours)).not.toContain('Neighbors');
  });

  it('paces the redraws a new pair of neighbors asks for, each server in its turn', async () => {
    const made = await neighborsAt({ neighbors: false });
    const library = await made.report(1, 1);
    const fountain = await made.report(2, 1);
    const theirLibrary = await made.report(NEIGHBOR_GYMS.library, 2);
    const theirFountain = await made.report(NEIGHBOR_GYMS.fountain, 2);
    await made.service.flush();
    expect(made.shown(library)).not.toContain('Neighbors');
    const posts = [library, fountain, theirLibrary, theirFountain];
    const edits = (party: RaidParty) => made.gateway.posts.get(party.forumPostId ?? '')?.edits ?? 0;
    const before = new Map(posts.map((party) => [party.id, edits(party)]));
    /** The posts drawn anew since the pair became neighbors, each with its server's row. */
    const drawn = () =>
      posts
        .filter((party) => edits(party) > (before.get(party.id) ?? 0))
        .map((party) => ({ id: party.id, row: party.guildId }));
    made.timers.length = 0;
    await made.listed.neighbors.ask(OURS, THEIRS);
    await made.listed.neighbors.answer(OURS, THEIRS, true);
    // Four posts wait: the first is drawn at once, each next a gap later, the servers in turns.
    await background.settle();
    const order = drawn();
    expect(order).toHaveLength(1);
    for (let shown = 2; shown <= posts.length; shown += 1) {
      const paced = made.timers.filter((timer) => timer.ms === EMOJI_RENDER_GAP_MS);
      expect(paced).toHaveLength(shown - 1);
      paced.at(-1)?.run();
      await background.settle();
      const now = drawn();
      expect(now).toHaveLength(shown);
      const added = now.find((one) => !order.some((other) => other.id === one.id));
      // The other server's turn each time.
      expect(added?.row).not.toBe(order.at(-1)?.row);
      if (added) order.push(added);
    }
    for (const party of posts) expect(made.shown(party)).toContain('**Neighbors at this gym**');
  });

  it('gathers several changes of a neighbor’s raid within one pace into one edit (review R10)', async () => {
    const made = await neighborsAt();
    const ours = await made.report(1, 1);
    const theirs = await made.report(NEIGHBOR_GYMS.library, 2);
    await made.report(NEIGHBOR_GYMS.fountain, 2);
    await made.service.flush();
    const edits = () => made.gateway.posts.get(ours.forumPostId ?? '')?.edits ?? 0;
    const before = edits();
    // The paced queue is busy: the second server's posts wait their turn.
    made.timers.length = 0;
    made.service.zoneChanged(THEIRS);
    await background.settle();
    for (const number of [2, 3, 4]) {
      await made.store.update(theirs.id, (party) => ({
        party: withAttendees(party, { [ALICE]: { status: PartyStatus.Coming, number } }),
      }));
    }
    expect(edits()).toBe(before);
    await made.drawPaced();
    expect(edits()).toBe(before + 1);
    expect(made.shown(ours)).toContain('Interested (1), Coming (4)');
  });

  it('words each neighbor’s times on the clock of the server whose post shows them (review R10)', async () => {
    const servers = new TestServers();
    servers.changed.set(THEIRS, { ...servers.values, timezone: 'Asia/Kolkata' });
    const made = await neighborsAt({ servers });
    const ours = await made.report(1, 1);
    const theirs = await made.report(NEIGHBOR_GYMS.library, 2);
    // 14:30 in New York is 00:00 the next day in Kolkata.
    const hatch = at('2026-10-13T14:30');
    for (const party of [ours, theirs]) {
      await made.store.update(party.id, (current) => ({
        party: isRaid(current) ? setHatchTime(current, hatch, testRaidRules(), PARTY_NOW) : current,
      }));
    }
    await made.drawPaced();
    const seconds = String(hatch / 1000);
    expect(made.shown(ours)).toContain(
      `- **Pewter City** · Level 5 raid (egg) · hatches <t:${seconds}:t>`,
    );
    const shownTheirs = made.store.get(theirs.id);
    expect(shownTheirs && isRaid(shownTheirs) ? made.shown(shownTheirs) : '').toContain(
      `- **Test Server** · Level 5 raid (egg) · hatches <t:${seconds}:f>`,
    );
  });

  it('redraws both posts when a change of gyms gives a pair a match (review R9)', async () => {
    const made = await neighborsAt();
    // The harbor of each server: another name at the same place, no match yet.
    const ours = await made.report(7, 1);
    const theirs = await made.report(NEIGHBOR_GYMS.harbor, 2);
    await made.drawPaced();
    expect(made.shown(ours)).not.toContain('Neighbors');
    // A Wayfarer import gives both the same Wayfarer id, as its blocks write and read them again.
    made.timers.length = 0;
    const { gyms, directory } = made.gymsMade;
    await gyms.update(7, { pogoId: 'harbor.16' });
    await directory.refreshGyms([7]);
    await gyms.update(NEIGHBOR_GYMS.harbor, { pogoId: 'harbor.16' });
    await directory.refreshGyms([NEIGHBOR_GYMS.harbor]);
    // Gathered: one comparison for both blocks.
    const gathered = made.timers.filter((timer) => timer.ms === NEIGHBOR_MATCHES_GATHER_MS);
    expect(gathered).toHaveLength(1);
    gathered[0]?.run();
    await made.drawPaced();
    expect(made.shown(ours)).toContain('**Neighbors at this gym**\n- **Pewter City**');
    const shownTheirs = made.store.get(theirs.id);
    expect(shownTheirs && isRaid(shownTheirs) ? made.shown(shownTheirs) : '').toContain(
      '- **Test Server**',
    );
  });

  it('shows nothing of a quiet neighbor, nor of a pair that is no longer neighbors', async () => {
    const made = await neighborsAt();
    const ours = await made.report(1, 1);
    const theirs = await made.report(NEIGHBOR_GYMS.library, 2);
    await made.service.flush();
    expect(made.shown(ours)).toContain('Pewter City');
    made.quiet.add(THEIRS);
    made.service.neighborsQuietChanged([THEIRS]);
    await made.service.flush();
    expect(made.shown(ours)).not.toContain('Pewter City');
    // A change of the quiet server's raid reaches nobody.
    const edits = made.gateway.posts.get(ours.forumPostId ?? '')?.edits;
    await made.store.update(theirs.id, (party) => ({
      party: withAttendees(party, { [ALICE]: { status: PartyStatus.Coming } }),
    }));
    await made.service.flush();
    expect(made.gateway.posts.get(ours.forumPostId ?? '')?.edits).toBe(edits);
    made.quiet.delete(THEIRS);
    made.service.neighborsQuietChanged([THEIRS]);
    await made.service.flush();
    expect(made.shown(ours)).toContain('Pewter City');
    // Their staff end it: both posts are drawn without the other's line.
    expect(await made.listed.neighbors.end(THEIRS, OURS)).toBe('ended');
    await made.drawPaced();
    expect(made.shown(ours)).not.toContain('Neighbors');
    const party = made.store.get(theirs.id);
    expect(party && isRaid(party) ? made.shown(party) : '').not.toContain('Neighbors');
  });
});
