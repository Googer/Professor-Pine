import { describe, expect, it } from 'vitest';
import { WEST_CHANNEL, WEST_FORUM } from '../../test/support/gyms.js';
import { partyServiceWith } from '../../test/support/party-service.js';
import { BoardKeeper } from './board-keeper.js';
import { at } from '../../test/support/parties.js';
import { TestServers, withZones } from '../../test/support/server-values.js';
import type { LeftServers } from './server-standings.js';

const MEMBER = '300000000000000001';
const OTHER = '300000000000000002';
const MODERATOR = '300000000000000003';
const DAY = 24 * 60 * 60 * 1000;
/** The fakes' server (`FakePartyGateway.guildId`), the guild of row 1. */
const SERVER = '412345678901234567';

/**
 * A board on the fake gateway (the west region's, made by the party service) and its keeper,
 * which tells the regions whose board it deleted in (`changed`).
 */
async function keeping(servers?: TestServers, left?: LeftServers) {
  const made = await partyServiceWith([], {
    ...(servers === undefined ? {} : { servers }),
    ...(left === undefined ? {} : { left }),
  });
  const west = made.regions.rows[0]!;
  await made.service.ensureSummary(west);
  const board = west.summaryMessageId ?? '';
  const changed: number[] = [];
  const keeper = new BoardKeeper({
    regions: made.regions,
    gateway: made.gateway,
    dms: made.dms,
    zoneOfRow: (row) => made.service.zoneOfRow(row),
    serverOfRow: (row) => (row === 1 ? made.gateway.guildId : undefined),
    // As `app.ts` asks it (plan 19C-1).
    ofLeftServer: (region) => made.service.ofLeftServer(region),
    log: made.log,
    changed: (regionId) => changed.push(regionId),
    now: () => made.clock.now,
  });
  /** A message written in a channel, as `MessageCreate` gives it to the keeper. */
  const posted = (
    channelId: string,
    authorId: string,
    more: { by?: 'me' | 'bot' | 'member'; system?: boolean } = {},
  ) => {
    const id = made.gateway.write(channelId, authorId, { ...more, createdAt: made.clock.now });
    return {
      id,
      outcome: keeper.posted({
        id,
        channelId,
        guildId: made.gateway.guildId,
        authorId,
        by: more.by ?? 'member',
        system: more.system === true,
        createdAt: made.clock.now,
      }),
    };
  };
  const deletedIn = (channelId: string) =>
    made.gateway.deleted.filter((one) => one.channelId === channelId).map((one) => one.messageId);
  return { ...made, west, board, keeper, changed, posted, deletedIn };
}

describe('BoardKeeper: what members write in the board (plan 8R-9F)', () => {
  it('deletes a member’s message in the board and tells them once a day by DM (Q2)', async () => {
    const { keeper, board, posted, deletedIn, dms, changed, clock, west } = await keeping();
    const first = posted(board, MEMBER);
    expect(first.outcome).toBe('taken');
    await keeper.flush();
    expect(deletedIn(board)).toEqual([first.id]);
    // The pin check, for a member's message reopens an archived board unpinned (B7).
    expect(changed).toEqual([west.id]);
    expect(dms.recipients).toEqual([MEMBER]);
    expect(dms.serversOf(MEMBER)).toEqual([SERVER]);
    expect(dms.to(MEMBER)[0]?.content).toBe(
      `I deleted your message in <#${board}>: the board keeps only my lists of what is on. ` +
        `Chat in <#${WEST_CHANNEL}>, or report with a command such as \`/raid\`, \`/research\` ` +
        'or `/rocket`, there or in the board.',
    );
    // Again the same day: deleted, no second DM; the next day, told again.
    const second = posted(board, MEMBER);
    await keeper.flush();
    expect(deletedIn(board)).toEqual([first.id, second.id]);
    expect(dms.to(MEMBER)).toHaveLength(1);
    clock.now += DAY;
    posted(board, MEMBER);
    await keeper.flush();
    expect(dms.to(MEMBER)).toHaveLength(2);
  });

  it('tells a member once a day on their server’s clock (plan 19A-2)', async () => {
    // The fakes' server in Berlin: 14:00 in New York is 20:00 there.
    const made = await keeping(withZones({ [SERVER]: 'Europe/Berlin' }));
    const { keeper, board, posted, dms, clock } = made;
    posted(board, MEMBER);
    await keeper.flush();
    expect(dms.to(MEMBER)).toHaveLength(1);
    // 18:30 in New York, the same day here, is 00:30 the next day in Berlin: told again.
    clock.now = at('2026-10-13T18:30');
    posted(board, MEMBER);
    await keeper.flush();
    expect(dms.to(MEMBER)).toHaveLength(2);
  });

  it('keeps its own messages, Discord’s, and a moderator’s; deletes another app’s untold (Q1, B3)', async () => {
    const { keeper, board, posted, deletedIn, dms, gateway, changed, west } = await keeping();
    gateway.managers.add(MODERATOR);
    expect(posted(board, 'bot-self', { by: 'me' }).outcome).toBe('kept');
    expect(posted(board, MEMBER, { system: true }).outcome).toBe('kept');
    const moderator = posted(board, MODERATOR);
    const app = posted(board, '400000000000000001', { by: 'bot' });
    expect(app.outcome).toBe('taken');
    await keeper.flush();
    expect(moderator.outcome).toBe('taken');
    expect(deletedIn(board)).toEqual([app.id]);
    // The moderator's kept message and the app's opened an archived board as well: both checked
    // the pin (review W6); its own and Discord's did not.
    expect(changed).toEqual([west.id, west.id]);
    // The moderator asked for from the cache: the message just put them there.
    expect(gateway.memberAsks).toEqual([{ memberId: MODERATOR, fresh: false }]);
    expect(dms.jobs).toEqual([]);
  });

  it('leaves to the screenshot reader a message it takes, and deletes one it does not (plan 8R-9F, B2)', async () => {
    const { keeper, board, gateway, dms, changed, west } = await keeping();
    const message = (id: string) => ({
      id,
      channelId: board,
      guildId: gateway.guildId,
      authorId: MEMBER,
      by: 'member' as const,
      system: false,
      createdAt: 0,
    });
    const asked: string[] = [];
    keeper.posted(message(gateway.write(board, MEMBER)), () => {
      asked.push('read');
      return Promise.resolve(true);
    });
    await keeper.flush();
    expect(asked).toEqual(['read']);
    expect(gateway.deleted).toEqual([]);
    // The reader's message opened the board too: the pin is checked whatever it did (W6).
    expect(changed).toEqual([west.id]);
    const plain = gateway.write(board, MEMBER);
    keeper.posted(message(plain), () => Promise.resolve(false));
    await keeper.flush();
    expect(gateway.deleted.map((one) => one.messageId)).toEqual([plain]);
    expect(dms.recipients).toEqual([MEMBER]);
  });

  it('says what came of a message it was asked to take: deleted, kept, failed (review F1)', async () => {
    const { keeper, board, gateway, west } = await keeping();
    gateway.managers.add(MODERATOR);
    const message = (authorId: string) => ({
      id: gateway.write(board, authorId),
      authorId,
      by: 'member' as const,
      system: false,
      createdAt: 0,
    });
    await expect(keeper.take(west, message(MEMBER), false)).resolves.toBe('deleted');
    await expect(keeper.take(west, message(MODERATOR), false)).resolves.toBe('kept');
    gateway.noManaging.add(WEST_FORUM);
    await expect(keeper.take(west, message(OTHER), false)).resolves.toBe('failed');
  });

  it('leaves alone what is written outside a board', async () => {
    const { keeper, posted, gateway } = await keeping();
    expect(posted(WEST_CHANNEL, MEMBER).outcome).toBe('elsewhere');
    expect(posted(WEST_FORUM, MEMBER).outcome).toBe('elsewhere');
    await keeper.flush();
    expect(gateway.deleted).toEqual([]);
  });

  it('says once per board that it may not delete there, and counts a message gone as deleted', async () => {
    const { keeper, board, posted, gateway, entries, dms, changed } = await keeping();
    gateway.noManaging.add(WEST_FORUM);
    posted(board, MEMBER);
    posted(board, OTHER);
    await keeper.flush();
    expect(gateway.deleted).toEqual([]);
    expect(
      entries.filter((entry) => entry.msg === 'could not delete a message in the board'),
    ).toHaveLength(1);
    expect(dms.jobs).toEqual([]);
    // Nothing deleted, but each message opened the board all the same: the pin is checked (W6).
    expect(changed).toHaveLength(2);
    // Allowed again, then a message somebody deleted already (Discord's 10008): no word, no DM.
    gateway.noManaging.delete(WEST_FORUM);
    const gone = posted(board, MEMBER);
    gateway.gone.add(gone.id);
    await keeper.flush();
    expect(dms.jobs).toEqual([]);
    gateway.failing.set('deleteReported', new Error('Discord is away'));
    posted(board, MEMBER);
    posted(board, OTHER);
    await keeper.flush();
    expect(
      entries.filter((entry) => entry.msg === 'could not delete a message in the board'),
    ).toHaveLength(2);
  });
});

describe('BoardKeeper in rehearsal mode (review W2)', () => {
  it('is off, as the screenshot trigger is: nothing deleted or read, nobody told', async () => {
    const made = await keeping();
    const { board, gateway, dms, west, clock } = made;
    const changed: number[] = [];
    const keeper = new BoardKeeper({
      regions: made.regions,
      gateway,
      dms,
      zoneOfRow: (row) => made.service.zoneOfRow(row),
      serverOfRow: (row) => (row === 1 ? made.gateway.guildId : undefined),
      log: made.log,
      changed: (regionId) => changed.push(regionId),
      now: () => clock.now,
      inRehearsal: true,
    });
    const id = gateway.write(board, MEMBER);
    // Nothing of the board's message goes further, and nothing is done with it.
    expect(
      keeper.posted({
        id,
        channelId: board,
        guildId: gateway.guildId,
        authorId: MEMBER,
        by: 'member',
        system: false,
        createdAt: clock.now,
      }),
    ).toBe('kept');
    await keeper.flush();
    gateway.write(board, OTHER, { createdAt: clock.now - 60_000 });
    gateway.write(board, OTHER, { createdAt: clock.now - 60_000 });
    // The board post's reactions stay too (plan 8R-9G).
    gateway.react(board);
    await keeper.sweep();
    expect(gateway.reactionsCleared).toEqual([]);
    await expect(
      keeper.take(west, { id, authorId: MEMBER, by: 'member', system: false, createdAt: 0 }),
    ).resolves.toBe('kept');
    expect(gateway.deleted).toEqual([]);
    expect(gateway.bulkDeleted).toEqual([]);
    expect(gateway.calls.filter((call) => call.startsWith('boardMessages'))).toEqual([]);
    expect(dms.jobs).toEqual([]);
    expect(changed).toEqual([]);
  });
});

describe('BoardKeeper: the catch-up (plan 8R-9F, B6)', () => {
  it('passes over the boards of a server Pine left, and sweeps them once it is back (plan 19C-1)', async () => {
    const left = new Set<string>();
    const { keeper, board, gateway, deletedIn, clock } = await keeping(undefined, {
      isLeft: (serverId) => left.has(serverId),
    });
    const written = gateway.write(board, MEMBER, { createdAt: clock.now - 60_000 });
    left.add(SERVER);
    await keeper.sweep();
    expect(gateway.calls.filter((call) => call.startsWith('boardMessages'))).toEqual([]);
    expect(deletedIn(board)).toEqual([]);
    left.delete(SERVER);
    await keeper.sweep();
    expect(deletedIn(board)).toEqual([written]);
  });

  it('deletes what members wrote while it was away in one request, each author asked once afresh', async () => {
    const { keeper, board, gateway, deletedIn, dms, changed, west, clock } = await keeping();
    gateway.managers.add(MODERATOR);
    const at = { createdAt: clock.now - 60_000 };
    const one = gateway.write(board, MEMBER, at);
    const two = gateway.write(board, MEMBER, at);
    gateway.write(board, MODERATOR, at);
    const app = gateway.write(board, '400000000000000001', { ...at, by: 'bot' });
    gateway.write(board, 'bot-self', { ...at, system: true });
    await keeper.sweep();
    expect(gateway.bulkDeleted).toEqual([[app, two, one]]);
    expect(deletedIn(board)).toEqual([app, two, one]);
    expect(gateway.memberAsks).toEqual([
      { memberId: MODERATOR, fresh: true },
      { memberId: MEMBER, fresh: true },
    ]);
    expect(dms.recipients).toEqual([MEMBER]);
    expect(changed).toEqual([west.id]);
    // Nothing left: nothing more is asked or deleted.
    await keeper.sweep();
    expect(gateway.bulkDeleted).toHaveLength(1);
    expect(changed).toEqual([west.id]);
  });

  it('deletes one at a time a single message, and one older than 14 days', async () => {
    const { keeper, board, gateway, deletedIn, clock } = await keeping();
    const old = gateway.write(board, MEMBER, { createdAt: clock.now - 15 * DAY });
    const fresh = gateway.write(board, OTHER, { createdAt: clock.now - DAY });
    await keeper.sweep();
    expect(gateway.bulkDeleted).toEqual([]);
    expect(deletedIn(board)).toEqual([fresh, old]);
  });

  it('opens an archived board for its deletes and leaves it open (review W3)', async () => {
    const { keeper, board, gateway, deletedIn, clock, west } = await keeping();
    const at = { createdAt: clock.now - 60_000 };
    const one = gateway.write(board, MEMBER, at);
    const two = gateway.write(board, OTHER, at);
    // A week without messages archived it after they were written (the bot was away).
    const post = gateway.posts.get(board)!;
    post.archived = true;
    await keeper.sweep();
    expect(gateway.bulkDeleted).toEqual([[two, one]]);
    expect(post.archived).toBe(false);
    // One message alone, deleted live in an archived board: the board is left open too.
    const three = gateway.write(board, MEMBER);
    post.archived = true;
    await expect(
      keeper.take(west, { id: three, authorId: MEMBER, by: 'member', system: false, createdAt: 0 }),
    ).resolves.toBe('deleted');
    expect(deletedIn(board)).toContain(three);
    expect(post.archived).toBe(false);
  });

  it('reads at most a hundred messages of each board', async () => {
    const { keeper, board, gateway } = await keeping();
    for (let n = 0; n < 120; n++) gateway.write(board, MEMBER, { createdAt: 0 });
    await keeper.sweep();
    expect(gateway.deleted).toHaveLength(100);
  });

  it('removes the reactions on its own messages, and leaves a moderator’s (plan 8R-9G)', async () => {
    const { keeper, board, gateway, deletedIn, clock } = await keeping();
    gateway.managers.add(MODERATOR);
    // The board post itself and a message of the stops below it, both the bot's.
    const stops = (await gateway.sendMessage(board, { content: 'Today’s Stops' })) ?? '';
    const quiet = (await gateway.sendMessage(board, { content: 'More stops' })) ?? '';
    const moderator = gateway.write(board, MODERATOR, { createdAt: clock.now - 60_000 });
    const member = gateway.write(board, MEMBER, { createdAt: clock.now - 60_000 });
    gateway.react(board, 3);
    gateway.react(stops);
    gateway.react(moderator);
    gateway.react(member);
    await keeper.sweep();
    expect(gateway.reactionsCleared).toEqual([stops, board]);
    expect(gateway.reactions.get(moderator)).toBe(1);
    expect(gateway.reactionsCleared).not.toContain(quiet);
    // A member's message is deleted, reactions and all.
    expect(deletedIn(board)).toEqual([member]);
  });

  it('checks the pin after removing reactions in an archived board with nothing to delete (review R-F1)', async () => {
    const { keeper, board, gateway, changed, west } = await keeping();
    const stops = (await gateway.sendMessage(board, { content: 'Today’s Stops' })) ?? '';
    gateway.react(stops);
    // A week without messages archived it: the removal opens it, and it comes back unpinned.
    const post = gateway.posts.get(board)!;
    post.archived = true;
    await keeper.sweep();
    expect(gateway.reactionsCleared).toEqual([stops]);
    expect(post.archived).toBe(false);
    expect(changed).toEqual([west.id]);
    // Nothing removed, nothing deleted: no check.
    await keeper.sweep();
    expect(changed).toEqual([west.id]);
  });

  it('leaves Discord’s own messages’ reactions alone, the bot’s included (review R-F5)', async () => {
    const { keeper, board, gateway } = await keeping();
    const title = gateway.write(board, 'bot', { by: 'me', system: true });
    gateway.react(title);
    await keeper.sweep();
    expect(gateway.reactionsCleared).toEqual([]);
    expect(gateway.reactions.get(title)).toBe(1);
  });

  it('says once per board that it may not remove reactions, and goes on with the sweep (plan 8R-9G)', async () => {
    const { keeper, board, gateway, deletedIn, entries, service, regions, clock, west } =
      await keeping();
    const east = regions.rows[1]!;
    await service.ensureSummary(east);
    const eastBoard = east.summaryMessageId ?? '';
    const stops = (await gateway.sendMessage(board, { content: 'Today’s Stops' })) ?? '';
    gateway.react(board);
    gateway.react(stops);
    gateway.react(eastBoard);
    const member = gateway.write(board, MEMBER, { createdAt: clock.now - 60_000 });
    // Removing reactions fails in West's board (and so would deleting); East's works.
    const clear = gateway.clearReactions.bind(gateway);
    gateway.clearReactions = (channelId, messageId) =>
      channelId === board ? Promise.resolve('not-allowed') : clear(channelId, messageId);
    await keeper.sweep();
    const said = () =>
      entries.filter(
        (entry) => entry.msg === 'could not remove the reactions on a message in the board',
      );
    expect(said()).toHaveLength(1);
    expect(said()[0]).toMatchObject({ region: west.id, board });
    expect(deletedIn(board)).toEqual([member]);
    expect(gateway.reactionsCleared).toEqual([eastBoard]);
    // A failure thrown is said the same way, once.
    gateway.clearReactions = (channelId) =>
      channelId === board ? Promise.reject(new Error('Discord is away')) : Promise.resolve('gone');
    await keeper.sweep();
    expect(said()).toHaveLength(1);
  });

  it('goes on with the next board after one it cannot read (review F5)', async () => {
    const { keeper, board, gateway, entries, service, regions, deletedIn } = await keeping();
    const east = regions.rows[1]!;
    await service.ensureSummary(east);
    const eastBoard = east.summaryMessageId ?? '';
    gateway.write(board, MEMBER, { createdAt: 0 });
    const there = gateway.write(eastBoard, MEMBER, { createdAt: 0 });
    // West's board, read first, cannot be read; East's can.
    const read = gateway.boardMessages.bind(gateway);
    gateway.boardMessages = (postId, limit) =>
      postId === board ? Promise.reject(new Error('Discord is away')) : read(postId, limit);
    await keeper.sweep();
    expect(entries.filter((entry) => entry.msg === 'could not read the board')).toHaveLength(1);
    expect(deletedIn(board)).toEqual([]);
    expect(deletedIn(eastBoard)).toEqual([there]);
  });
});
