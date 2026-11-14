import { InteractionContextType, PermissionFlagsBits } from 'discord.js';
import { describe, expect, it } from 'vitest';
import { bossCommandsWith, choicesOf, textsOf } from '../../../test/support/boss-commands.js';
import { instanceConfig, OPERATOR_ID } from '../../../test/support/operators.js';
import { createTestContext } from '../../../test/support/test-context.js';
import { declaredSubcommands } from '../../discord/command.js';
import { buildCommandPayload } from '../../discord/deploy.js';
import { ONLY_OPERATORS, ONLY_OPERATORS_IN_A_DM } from '../../discord/guards.js';
import { admin } from '../admin/index.js';
import { operator } from './index.js';

/** What every server shares, as plan 19B-1 moved it out of `/admin`. */
const SHARED = [
  'clear-image-cache',
  'boss list',
  'boss add',
  'boss hide',
  'boss autoset',
  'boss shiny',
  'boss remove',
  'boss sync',
  'forget',
  'event-window set',
  'event-window end',
  'google share',
];

/** `/operator` on an instance with an operator of the file, listed (unset) or `open`. */
async function onInstance(servers?: 'open') {
  const config = instanceConfig(createTestContext().ctx, {
    operators: [OPERATOR_ID],
    ...(servers === undefined ? {} : { servers }),
  });
  return bossCommandsWith({ context: { config } });
}

describe('/operator (plan 19B-1)', () => {
  it('holds what every server shares, which /admin no longer has', () => {
    expect([...operator.subcommands.keys()]).toEqual(SHARED);
    const adminPaths = [...admin.subcommands.keys()];
    for (const path of SHARED) expect(adminPaths, path).not.toContain(path);
    expect(adminPaths).toContain('nickname add');
  });

  it('is offered in servers to those who may manage them, and in a DM with the bot', () => {
    const [json] = buildCommandPayload([operator]);
    expect(json?.contexts).toEqual([InteractionContextType.Guild, InteractionContextType.BotDM]);
    expect(json?.default_member_permissions).toBe(String(PermissionFlagsBits.ManageGuild));
    expect(declaredSubcommands(operator.data.toJSON().options).sort()).toEqual([...SHARED].sort());
  });

  it('says in its help who may use it, also where the instance lists no servers', () => {
    const { details } = operator.help;
    expect(details).toContain(
      'Its operators change them, from any server or a direct message with me. Unless this Pine ' +
        'is open to every server, the admins, moderators and bot developers of its servers may ' +
        'too, from their server (where it lists its servers, those of the listed ones only).',
    );
  });

  it('runs for an operator of the file in a DM, on the instance’s clock', async () => {
    const made = await onInstance('open');
    const used = await made.use('boss', 'list', {}, { userId: OPERATOR_ID, isDm: true });
    expect(textsOf(used).join('\n')).toMatch(/T5/u);
  });

  it('is refused to a server’s staff on an open instance, and in a DM on any', async () => {
    const open = await onInstance('open');
    expect(textsOf(await open.use('boss', 'list'))).toEqual([ONLY_OPERATORS]);
    const listed = await onInstance();
    expect(textsOf(await listed.use('boss', 'list', {}, { isDm: true }))).toEqual([
      ONLY_OPERATORS_IN_A_DM,
    ]);
    // One refusal in a DM, whatever the instance.
    expect(textsOf(await open.use('boss', 'list', {}, { isDm: true }))).toEqual([
      ONLY_OPERATORS_IN_A_DM,
    ]);
    // On a listed instance the staff of the server it is used in may, as with /admin before.
    expect(textsOf(await listed.use('boss', 'list')).join('\n')).toMatch(/T5/u);
  });

  it('offers nothing while typing to somebody the guard would refuse, in a DM too', async () => {
    const listed = await onInstance();
    const typing = (extra: object) =>
      listed.typing('boss', 'add', 'pokemon', 'zek', { tier: 'T5' }, extra);
    expect(choicesOf(await typing({}))).not.toEqual([]);
    expect(choicesOf(await typing({ isDm: true }))).toEqual([]);
    expect(
      choicesOf(await typing({ isDm: true, roleNames: [], userId: '700000000000000009' })),
    ).toEqual([]);
    expect(choicesOf(await typing({ isDm: true, userId: OPERATOR_ID }))).not.toEqual([]);
    const open = await onInstance('open');
    expect(choicesOf(await open.typing('boss', 'add', 'pokemon', 'zek', { tier: 'T5' }))).toEqual(
      [],
    );
  });
});
