import { describe, expect, it } from 'vitest';
import type { RecordingDms } from '../../../test/support/dms.js';
import {
  asV2,
  fakeChatInput,
  sent,
  type FakeOptions,
} from '../../../test/support/fake-interactions.js';
import { textOf } from '../../../test/support/messages.js';
import { instanceConfig, OPERATOR_ID } from '../../../test/support/operators.js';
import { admissionWith } from '../../../test/support/server-admission.js';
import { TestServers } from '../../../test/support/server-values.js';
import { createTestContext } from '../../../test/support/test-context.js';
import { TEST_ENV } from '../../../test/support/test-env.js';
import { components } from '../../components/index.js';
import { ONLY_OPERATORS } from '../../discord/guards.js';
import { InteractionRouter } from '../../discord/router.js';
import { operator } from './index.js';
import { listServers, NOT_A_SERVER_ID, NOT_IN_THAT_SERVER } from './servers.js';

const OWNER = TEST_ENV.OWNER_ID ?? '';
const MODERATOR = '700000000000000001';
/** Recorded at the upgrade, set up, Pine in it. */
const HOME = '412345678901234567';
/** Recorded at the upgrade, Pine in it, not set up. */
const NEIGHBOR = '412345678901234568';
/** Pine left it. */
const GONE = '412345678901234569';
/** Never in it: no standing. */
const STRANGER = '412345678901234570';
const NOW = Date.parse('2026-11-13T18:00:00Z');
const DAY = 24 * 3_600_000;

function setup() {
  const made = admissionWith({
    recorded: [HOME, NEIGHBOR, GONE],
    present: [HOME, NEIGHBOR],
    rows: [],
    now: () => NOW,
  });
  const servers = new TestServers();
  servers.setUp.set(HOME, NOW - 10 * DAY);
  servers.settingUp.add(NEIGHBOR);
  const base = createTestContext().ctx;
  const { ctx } = createTestContext({
    config: instanceConfig(base, { operators: [OPERATOR_ID] }),
    servers,
    standings: made.standings,
    admission: made.admission,
    lastParties: {
      lastPartyAt: (ids) =>
        Promise.resolve(new Map(ids.filter((id) => id === HOME).map((id) => [id, NOW - DAY]))),
    },
  });
  const router = new InteractionRouter(ctx, [operator], components);
  /** `/operator servers <subcommand>` as the owner unless `by` says. */
  const run = async (
    subcommand: string,
    options: Record<string, string | number> = {},
    by: FakeOptions = { userId: OWNER },
  ) => {
    const interaction = fakeChatInput({
      commandName: 'operator',
      subcommandGroup: 'servers',
      subcommand,
      options,
      serverNames: { [HOME]: 'Pittsburgh', [NEIGHBOR]: 'Neighbors', [GONE]: 'Old Friends' },
      serverMembers: { [HOME]: 1_234, [NEIGHBOR]: 56, [GONE]: 7 },
      ...by,
    });
    await router.handle(interaction as never);
    return interaction;
  };
  const toldOwner = () => (ctx.dms as RecordingDms).jobs;
  return { ...made, ctx, run, toldOwner };
}

const answerOf = (interaction: { editReply: Parameters<typeof sent>[0] }) =>
  textOf(asV2(sent(interaction.editReply)));
const refusalOf = (interaction: { reply: Parameters<typeof sent>[0] }) =>
  (sent(interaction.reply) as { content?: string } | undefined)?.content;

describe('/operator servers (plan 19C-1)', () => {
  it('is the instance operators’ alone', async () => {
    const made = setup();
    const moderator = await made.run('list', {}, { userId: MODERATOR, roleNames: ['Moderator'] });
    expect(refusalOf(moderator)).toBe(ONLY_OPERATORS);
    const block = await made.run(
      'block',
      { server: HOME },
      {
        userId: MODERATOR,
        roleNames: ['Moderator'],
      },
    );
    expect(refusalOf(block)).toBe(ONLY_OPERATORS);
    expect(made.standings.mayHave(HOME)).toBe(true);
    expect(made.exits.left).toEqual([]);
    // An operator of the file, who holds no role.
    const listed = await made.run('list', {}, { userId: OPERATOR_ID });
    expect(answerOf(listed)).toContain('Pittsburgh');
  });

  it('lists the servers Pine is in by name, then those it left, with their members, setup and last party; never a member', async () => {
    const made = setup();
    await made.standings.markLeft([GONE]);
    const listed = await made.run('list');
    expect(answerOf(listed)).toBe(
      '### This Pine’s servers\nIn 2 servers; 1 more left, blocked or allowed.\n' +
        `**Neighbors** \`${NEIGHBOR}\` · 56 members · not set up · no party yet\n` +
        `**Pittsburgh** \`${HOME}\` · 1,234 members · set up · last party <t:${String((NOW - DAY) / 1000)}:R>\n` +
        `**Old Friends** \`${GONE}\` · left <t:${String(NOW / 1000)}:R> · no party yet`,
    );
  });

  it('says in its help where a server’s share of Google is shown, which the list does not show (M-3)', () => {
    const details = listServers.help?.details;
    expect(typeof details === 'string' ? details : '').toContain(
      'A server’s share of Google’s month is shown in that server by `/gym google`',
    );
  });

  it('allows a server, which then may add this Pine, and tells the owner of another operator’s change', async () => {
    const made = setup();
    expect(made.standings.mayHave(STRANGER)).toBe(false);
    const allowed = await made.run('allow', { server: STRANGER }, { userId: OPERATOR_ID });
    expect(answerOf(allowed)).toBe(`Allowed \`${STRANGER}\`: its staff may add this Pine.`);
    expect(made.standings.mayHave(STRANGER)).toBe(true);
    expect(made.store.rows.get(STRANGER)).toMatchObject({ allowedAt: NOW, allowedBy: OPERATOR_ID });
    expect(made.toldOwner()).toHaveLength(1);
    // The owner's own change is not told to the owner.
    await made.run('allow', { server: GONE });
    expect(made.toldOwner()).toHaveLength(1);
  });

  it('has Pine leave a server it removes, kept as left and still allowed', async () => {
    const made = setup();
    const removed = await made.run('remove', { server: NEIGHBOR });
    expect(answerOf(removed)).toBe(
      `I left **Neighbors** (\`${NEIGHBOR}\`). Its staff may add me again; ` +
        '`/operator servers block` keeps it from coming back.',
    );
    expect(made.exits.left).toEqual([NEIGHBOR]);
    expect(made.exits.said).toEqual([]);
    expect(made.standings.isLeft(NEIGHBOR)).toBe(true);
    // Pine is in HOME still; not in STRANGER.
    expect(made.exits.left).not.toContain(HOME);
    const nowhere = await made.run('remove', { server: STRANGER });
    expect(sent(nowhere.followUp)).toMatchObject({ content: NOT_IN_THAT_SERVER });
  });

  it('blocks a server, leaving it where Pine is in it, and unblocks it', async () => {
    const made = setup();
    const blocked = await made.run('block', { server: HOME });
    expect(answerOf(blocked)).toBe(
      `Blocked **Pittsburgh** (\`${HOME}\`): it may not have this Pine. I left it.`,
    );
    expect(made.exits.left).toEqual([HOME]);
    expect(made.standings.mayHave(HOME)).toBe(false);
    const unblocked = await made.run('unblock', { server: HOME });
    expect(answerOf(unblocked)).toBe(
      `Unblocked **Pittsburgh** (\`${HOME}\`). Its staff may add this Pine again.`,
    );
    expect(made.standings.mayHave(HOME)).toBe(true);
    // A server nothing allows stays out after its block is taken back.
    await made.run('block', { server: STRANGER });
    expect(made.exits.left).toEqual([HOME]);
    const still = await made.run('unblock', { server: STRANGER });
    expect(answerOf(still)).toContain('It may still not add this Pine: nothing allows it');
  });

  it('keeps a block whose leave failed, says so, and has told the owner (J8)', async () => {
    const made = setup();
    made.exits.failLeave = new Error('Discord is away');
    const blocked = await made.run('block', { server: HOME }, { userId: OPERATOR_ID });
    expect(answerOf(blocked)).toBe(
      `Blocked **Pittsburgh** (\`${HOME}\`): it may not have this Pine. I could not leave it ` +
        'just now: I try again over the next forty minutes, and at my next start.',
    );
    expect(made.standings.mayHave(HOME)).toBe(false);
    expect(made.toldOwner()).toHaveLength(1);
  });

  it('says that it tries again where it could not leave a server it removes (J8)', async () => {
    const made = setup();
    made.exits.failLeaves = 1;
    const removed = await made.run('remove', { server: NEIGHBOR });
    expect(answerOf(removed)).toBe(
      `I could not leave **Neighbors** (\`${NEIGHBOR}\`) just now: I try again over the next ` +
        'forty minutes.',
    );
    await made.admission.idle();
    expect(made.exits.left).toEqual([NEIGHBOR]);
  });

  it('refuses what is no server’s ID, writing nothing', async () => {
    const made = setup();
    const typed = await made.run('allow', { server: '4123456789012345x7' });
    expect(sent(typed.followUp)).toMatchObject({ content: NOT_A_SERVER_ID });
    expect(made.standings.all().map((row) => row.serverId)).toEqual([HOME, NEIGHBOR, GONE]);
  });

  it('shows twenty servers a page, and says how to see the next', async () => {
    const made = setup();
    for (let n = 0; n < 25; n += 1)
      await made.standings.allow(`5123456789012345${String(n).padStart(2, '0')}`, OWNER);
    const first = answerOf(await made.run('list'));
    expect(first).toContain('-# Page 1 of 2. The next: `/operator servers list page:2`.');
    const second = answerOf(await made.run('list', { page: 2 }));
    expect(second).toContain('-# Page 2 of 2.');
    expect(second).toContain('allowed, not added yet');
  });

  it('keeps every page within what Discord takes, however long the servers’ names (J5)', async () => {
    const made = setup();
    const ids = Array.from(
      { length: 20 },
      (_, n) => `6123456789012345${String(n).padStart(2, '0')}`,
    );
    // A hundred characters each, every one of them escaped where shown.
    const long = '*_~`|'.repeat(20);
    const serverNames = Object.fromEntries(ids.map((id) => [id, long]));
    const serverMembers = Object.fromEntries(ids.map((id) => [id, 1_234_567]));
    for (const id of ids) await made.standings.allow(id, OWNER);
    const pages: string[] = [];
    for (let page = 1; page <= 5; page += 1) {
      const interaction = await made.run(
        'list',
        { page },
        { userId: OWNER, serverNames, serverMembers },
      );
      const text = answerOf(interaction);
      expect(text.length).toBeLessThanOrEqual(3_500);
      pages.push(text);
    }
    // Every server is on a page, its name cut short.
    for (const id of ids) expect(pages.join('\n')).toContain(id);
    expect(pages.join('\n')).not.toContain(long);
  });
});
