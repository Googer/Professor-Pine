import { MessageFlags } from 'discord.js';
import { describe, expect, it } from 'vitest';
import {
  answered,
  asV2,
  fakeChatInput,
  FAKE_GUILD_ID,
  sent,
} from '../../../test/support/fake-interactions.js';
import { buttonsOf, textOf } from '../../../test/support/messages.js';
import { createTestContext } from '../../../test/support/test-context.js';
import { TEST_WEB } from '../../../test/support/web.js';
import type { Settings } from '../../config/settings.js';
import { enabledCommands } from '../../discord/command.js';
import { InteractionRouter } from '../../discord/router.js';
import { region } from './index.js';

const BROCK = '700000000000000001';

function setup(web: Settings['web']) {
  const base = createTestContext();
  const { ctx } = createTestContext({
    config: { ...base.ctx.config, settings: { ...base.ctx.config.settings, web } },
  });
  const router = new InteractionRouter(ctx, enabledCommands([region], ctx.config), []);
  const run = async (extra: object = {}) => {
    const interaction = fakeChatInput({
      commandName: 'region',
      subcommand: 'edit',
      userId: BROCK,
      displayName: 'Brock of Pinewood',
      globalName: 'Brock',
      username: 'brock_p',
      roleNames: ['Moderator'],
      ...extra,
    });
    await router.handle(interaction as never);
    return interaction;
  };
  return { ctx, run };
}

describe('/region edit', () => {
  it('is offered only where the web pages are on', () => {
    const subcommands = (web: Settings['web']) => {
      const { ctx } = setup(web);
      const [command] = enabledCommands([region], ctx.config);
      return (command?.data.toJSON().options ?? []).map((option) => option.name);
    };
    expect(subcommands(TEST_WEB)).toContain('edit');
    expect(subcommands(undefined)).not.toContain('edit');
  });

  it("gives staff the editor's address and a link that logs them in, privately", async () => {
    const { ctx, run } = setup(TEST_WEB);
    const payload = answered(await run());
    expect((payload.flags ?? 0) & MessageFlags.Ephemeral).toBe(MessageFlags.Ephemeral);
    const message = asV2(payload);
    // The address only as code, which Discord does not make a link (Matt, 2026-10-25).
    expect(textOf(message)).not.toMatch(/[^`]https:\/\//);
    // The button is the member's own: shared, it would log somebody else in as them.
    expect(textOf(message)).toContain(
      '-# The button works once, within five minutes; do not share it: it logs in whoever ' +
        'opens it as you. Use /region edit again for another. To share the editor, give its ' +
        `address: \`https://map.example.test/s/${FAKE_GUILD_ID}/regions/edit\``,
    );
    const [button] = buttonsOf(message);
    expect(button?.label).toBe('Open the region editor (logs you in)');
    const url = new URL(button?.url ?? '');
    expect(url.origin).toBe('https://map.example.test');
    const match = new RegExp(`^/auth/link/${FAKE_GUILD_ID}/([A-Za-z0-9_-]{43})/edit$`).exec(
      url.pathname,
    );
    expect(match).not.toBeNull();
    expect(ctx.loginLinks.redeem(match?.[1] ?? '', Date.now())).toEqual({
      guildId: FAKE_GUILD_ID,
      userId: BROCK,
      userName: 'Brock',
      page: 'regions/edit',
    });
  });

  it('is for staff alone', async () => {
    const { run } = setup(TEST_WEB);
    const refused = sent((await run({ roleNames: [] })).reply);
    expect(refused.content).toBe('Only admins, moderators and bot developers can do that.');
  });

  it('says in its help what it gives', () => {
    const { ctx } = setup(TEST_WEB);
    const [command] = enabledCommands([region], ctx.config);
    const part = command && 'subcommands' in command ? command.subcommands?.get('edit') : undefined;
    const details = part?.help?.details;
    const text = typeof details === 'function' ? details(ctx.config.settings) : (details ?? '');
    expect(text).toMatch(/in your browser/);
    expect(text).toMatch(/once, within five minutes/);
  });
});
