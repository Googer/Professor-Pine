import { MessageFlags } from 'discord.js';
import { describe, expect, it } from 'vitest';
import {
  answered,
  asV2,
  FAKE_GUILD_ID,
  fakeButton,
  fakeChatInput,
  sent,
} from '../../../test/support/fake-interactions.js';
import { buttonsOf, textDisplays, textOf } from '../../../test/support/messages.js';
import { expectV2Sendable } from '../../../test/support/post-limits.js';
import { TestServers, testServerValues } from '../../../test/support/server-values.js';
import { createTestContext } from '../../../test/support/test-context.js';
import { createTestLogger } from '../../../test/support/test-logger.js';
import { SERVER_ADMIN_ONLY } from '../../discord/guards.js';
import type { V2Message } from '../../discord/party-gateway.js';
import { InteractionRouter } from '../../discord/router.js';
import { ServerSetup } from '../../services/server-setup.js';
import { admin } from './index.js';
import { serverSettingsControls } from './server-settings.js';
import { setupControls } from './setup.js';

/** A server set up long ago (the fakes' own) and one in setup (plan 19C-2). */
const SET_UP = FAKE_GUILD_ID;
const NEW = '412345678901234599';
const STAFF = '200000000000000001';
const LAB = '300000000000000091';
const MOD_LAB = '300000000000000092';

function setupWith() {
  const servers = new TestServers();
  servers.settingUp.add(NEW);
  servers.changed.set(NEW, testServerValues({ channels: {}, timezone: undefined }));
  const counts = new Map([[NEW, { regions: 0, gyms: 0 }]]);
  const told: string[] = [];
  const setup = new ServerSetup({
    servers,
    counts: (serverId) => Promise.resolve(counts.get(serverId) ?? { regions: 2, gyms: 40 }),
    send: (_channelId, text) => {
      told.push(text);
      return Promise.resolve();
    },
    log: createTestLogger().log,
  });
  const { ctx } = createTestContext({ servers, setup });
  const router = new InteractionRouter(ctx, [admin], [serverSettingsControls, setupControls]);
  const staff = (guildId: string) => ({ userId: STAFF, roleNames: ['Admin'], guildId });
  const open = async (guildId = NEW, who: object = staff(guildId)) => {
    const interaction = fakeChatInput({ commandName: 'admin', subcommand: 'setup', ...who });
    await router.handle(interaction as never);
    return interaction;
  };
  const checklist = async (guildId = NEW): Promise<V2Message> =>
    asV2(answered(await open(guildId)));
  const press = async (customId: string, guildId = NEW) => {
    const interaction = fakeButton({
      customId,
      ephemeralMessage: true,
      v2Message: true,
      ...staff(guildId),
    });
    await router.handle(interaction as never);
    return interaction;
  };
  const finish = () => {
    servers.changed.set(NEW, {
      ...servers.of(NEW),
      timezone: 'Europe/Berlin',
      channels: { 'bot-lab': LAB, 'mod-bot-lab': MOD_LAB },
    });
    counts.set(NEW, { regions: 1, gyms: 0 });
  };
  return { servers, router, open, checklist, press, finish, told };
}

/** The line of each item: its name, then required and done or not. */
const itemLines = (message: V2Message) =>
  textDisplays(message)
    .slice(1)
    .map((text) => text.split('\n')[0]);

describe('/admin setup (plan 19C-2)', () => {
  it('shows staff of a server in setup its checklist, privately, each item done or not', async () => {
    const made = setupWith();
    const interaction = await made.open();
    const payload = answered(interaction);
    expect((payload.flags ?? 0) & MessageFlags.Ephemeral).toBe(MessageFlags.Ephemeral);
    const shown = asV2(payload);
    expectV2Sendable(shown);
    expect(textDisplays(shown)[0]).toBe(
      '### Setting up Pine in this server\n' +
        'Pine works here once the four required items are done; the rest can follow.',
    );
    expect(itemLines(shown)).toEqual([
      '**Time zone and units** · required · not yet',
      '**Bot lab** · required · not yet',
      '**Moderators’ bot lab** · required · not yet',
      '**The first region** · required · not yet',
      '**Moderators’ channel** · not yet',
      '**Events forum** · not yet',
      '**Other channels** · not yet',
      '**Gyms** · not yet',
    ]);
    const text = textOf(shown);
    // Until its staff choose one, the instance's zone stands in.
    expect(text).toContain('Until you choose one, Pine uses `America/New_York`.');
    expect(text).toContain('`/region import`');
    // The test settings have no web pages, and so no region editor to name.
    expect(text).not.toContain('/region edit');
    // The way to ask for the Wayfarer tool, in words; the import once Pine is set up (S7).
    expect(text).toContain('https://profpine.com/userscript');
    expect(text).toContain(
      'Once Pine is set up, import your gyms from Wayfarer with `/gym import`',
    );
    expect(buttonsOf(shown).map((button) => button.label)).toEqual([
      'Text and numbers…',
      'Channels…',
      'Channels…',
      'Channels…',
      'Channels…',
      'Channels…',
      'Check again',
    ]);
  });

  it('opens the settings panel at the section an item names, apart from the checklist', async () => {
    const made = setupWith();
    const [, channels] = buttonsOf(await made.checklist());
    const pressed = await made.press(channels?.customId ?? '');
    const panel = asV2(sent(pressed.reply));
    expect(textDisplays(panel)[0]).toBe('### This server’s settings');
    expect(pressed.update).not.toHaveBeenCalled();
  });

  it('takes the server out of setup at Check again once the required items are done', async () => {
    const made = setupWith();
    made.finish();
    const again = buttonsOf(await made.checklist()).at(-1)?.customId ?? '';
    // Shown already set up: the command checks first.
    expect(made.servers.inSetup(NEW)).toBe(false);
    expect(made.told).toHaveLength(1);
    const pressed = await made.press(again);
    const shown = asV2(pressed.update.mock.calls[0]?.[0] as never);
    expect(textDisplays(shown)[0]).toBe(
      '### Setting up Pine in this server\nPine is set up in this server; the rest can follow ' +
        'whenever you like.',
    );
    expect(itemLines(shown).slice(0, 4)).toEqual([
      '**Time zone and units** · required · done',
      '**Bot lab** · required · done',
      '**Moderators’ bot lab** · required · done',
      '**The first region** · required · done',
    ]);
    expect(made.told).toHaveLength(1);
  });

  it('shows a server set up long ago what it has', async () => {
    const made = setupWith();
    const shown = await made.checklist(SET_UP);
    expect(itemLines(shown)).toContain('**Gyms** · done');
    expect(textOf(shown)).toContain('40 gyms');
  });

  it('is for whoever may set the server up alone, its buttons too', async () => {
    const made = setupWith();
    const member = await made.open(NEW, { userId: '200000000000000002', guildId: NEW });
    // It works in setup, for whoever may set it up: its guard refuses anybody else there too.
    expect(sent(member.reply).content).toBe(SERVER_ADMIN_ONLY);
    const memberThere = await made.open(SET_UP, { userId: '200000000000000002', guildId: SET_UP });
    expect(sent(memberThere.reply).content).toBe(SERVER_ADMIN_ONLY);
    const pressed = fakeButton({
      customId: 'setup:list:show',
      userId: '200000000000000002',
      guildId: SET_UP,
      ephemeralMessage: true,
      v2Message: true,
    });
    await made.router.handle(pressed as never);
    expect(sent(pressed.reply).content).toBe(SERVER_ADMIN_ONLY);
  });
});
