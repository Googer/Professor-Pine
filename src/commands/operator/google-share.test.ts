import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RecordingDms } from '../../../test/support/dms.js';
import {
  fakeChatInput,
  type FakeInteraction,
  type FakeOptions,
} from '../../../test/support/fake-interactions.js';
import { answerOf, gymCommandsWith } from '../../../test/support/gym-commands.js';
import { OTHER_GUILD_ID, OTHER_GUILD_ROW, TEST_GUILD_ROW } from '../../../test/support/gyms.js';
import { textDisplays } from '../../../test/support/messages.js';
import { instanceConfig, OPERATOR_ID } from '../../../test/support/operators.js';
import { TEST_ENV } from '../../../test/support/test-env.js';
import { ONLY_OPERATORS } from '../../discord/guards.js';
import { InteractionRouter } from '../../discord/router.js';
import { operator } from './index.js';

const OWNER = TEST_ENV.OWNER_ID ?? '';
/** Noon in California on October 11: the month resets on November 1. */
const NOW = new Date('2026-10-11T12:00:00-07:00').getTime();
const RESET = Math.floor(new Date('2026-11-01T00:00:00-07:00').getTime() / 1000);

/** `/operator google share` over the gym fakes, with an operator of the file beside the owner. */
async function setup() {
  const made = await gymCommandsWith();
  const ctx = { ...made.ctx, config: instanceConfig(made.ctx, { operators: [OPERATOR_ID] }) };
  const router = new InteractionRouter(ctx, [operator], []);
  /** The other server's gym and the test server's wait: both have a need, and a share. */
  await made.lookups.add([{ guildId: TEST_GUILD_ROW, gymId: 1, address: true, rank: 1 }], 1);
  const share = async (
    options: Record<string, string | number>,
    by: FakeOptions = { userId: OWNER },
  ) => {
    const interaction = fakeChatInput({
      commandName: 'operator',
      subcommandGroup: 'google',
      subcommand: 'share',
      options,
      guildId: made.gateway.guildId,
      ...by,
    });
    await router.handle(interaction as never);
    return interaction;
  };
  const toldOwner = () => (ctx.dms as RecordingDms).jobs;
  return { ...made, share, toldOwner };
}

/** The text of the answer, a plain one or a refusal. */
function said(interaction: FakeInteraction): string | undefined {
  return answerOf(interaction).content;
}

describe('/operator google share (plan 19B-5)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('is in /operator’s group google, for the instance operators alone', async () => {
    expect([...operator.subcommands.keys()]).toContain('google share');
    const made = await setup();
    const refused = await made.share(
      { server: OTHER_GUILD_ID, extra: 100 },
      { userId: '700000000000000001', roleNames: ['Moderator'] },
    );
    expect(said(refused)).toBe(ONLY_OPERATORS);
    expect(made.shareRaises.rows.size).toBe(0);
  });

  it('raises a server’s share for this month and says what it is now; the owner raising it is not told', async () => {
    const made = await setup();
    const asked = await made.share({ server: OTHER_GUILD_ID, extra: 300 });
    expect(said(asked)).toBe(
      `The share of Google of the server ${OTHER_GUILD_ID} this month is now 300 places ` +
        'searches and 300 addresses, 300 of each added by an operator; the line used 0 and 0 ' +
        `of it. A raise lasts until the month starts again, <t:${String(RESET)}:f>.`,
    );
    expect(made.shares.of(OTHER_GUILD_ROW)).toMatchObject({ raise: 300 });
    expect(made.toldOwner()).toEqual([]);
    // Set again: it replaces the raise, 0 takes it back.
    await made.share({ server: OTHER_GUILD_ID, extra: 0 });
    expect(made.shares.of(OTHER_GUILD_ROW)?.raise ?? 0).toBe(0);
  });

  it('says a raise is written and worked out at the line’s next turn when the shares cannot be worked out now (fix round 3, T10)', async () => {
    const made = await setup();
    vi.spyOn(made.lookups, 'needs').mockRejectedValue(new Error('the database is away'));
    const asked = await made.share({ server: OTHER_GUILD_ID, extra: 300 });
    expect(said(asked)).toBe(
      `Set what is added to the share of Google of the server ${OTHER_GUILD_ID} this month to ` +
        '300. It is worked out at the line’s next turn. A raise lasts until the month starts ' +
        `again, <t:${String(RESET)}:f>.`,
    );
    expect(made.shareRaises.rows.size).toBe(1);
  });

  it('tells the owner when another operator raises a share, who and from where', async () => {
    const made = await setup();
    await made.share({ server: OTHER_GUILD_ID, extra: 50 }, { userId: OPERATOR_ID });
    const [job] = made.toldOwner();
    expect(job).toMatchObject({ userId: OWNER, serverId: null });
    const text = textDisplays(job?.message).join('\n');
    expect(text).toContain(`the server ${OTHER_GUILD_ID}`);
    expect(text).toContain('50');
    expect(text).toContain(OPERATOR_ID);
  });

  it('refuses what is not a server’s id, and a server Pine is not in', async () => {
    const made = await setup();
    expect(said(await made.share({ server: 'Pittsburgh', extra: 5 }))).toBe(
      'That is not a server’s id: give the number Discord shows with Copy Server ID.',
    );
    expect(said(await made.share({ server: '412345678901234599', extra: 5 }))).toBe(
      'I am not in a server with that id.',
    );
    expect(made.shareRaises.rows.size).toBe(0);
  });
});
