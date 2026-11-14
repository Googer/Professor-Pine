import { PermissionFlagsBits } from 'discord.js';
import { describe, expect, it } from 'vitest';
import { writeKml } from '@pine/wayspot-core/kml';
import { shownDialog } from '../../../test/support/dialogs.js';
import {
  answered,
  asV2,
  FAKE_GUILD_ID,
  fakeButton,
  fakeChatInput,
  fakeModal,
  fakeSelect,
  sent,
  type FakeInteraction,
  type FakeOptions,
} from '../../../test/support/fake-interactions.js';
import { answerOf, buttonsOf } from '../../../test/support/gym-commands.js';
import { textDisplays } from '../../../test/support/messages.js';
import { SOUTH_CHANNEL, SOUTH_RING } from '../../../test/support/region-admin.js';
import { regionCommandsWith } from '../../../test/support/region-commands.js';
import { TestServers, testServerValues } from '../../../test/support/server-values.js';
import { createTestLogger } from '../../../test/support/test-logger.js';
import { SERVER_ADMIN_ONLY } from '../../discord/guards.js';
import { ServerSetup } from '../../services/server-setup.js';

/** The fakes' server, which just added Pine (plan 19C-2), and its Discord owner. */
const SERVER = FAKE_GUILD_ID;
const SERVER_OWNER = '700000000000000050';
const MEMBER = '700000000000000051';
const LAB = '300000000000000091';
const MOD_LAB = '300000000000000092';

/**
 * `/admin setup`, the settings panel and `/region import` over the fakes of `regionCommandsWith`,
 * the fakes' server in setup with no channel and no zone of its own. The fakes' server has regions
 * of its own already: its setup counts only the region its staff make here (`SOUTH_CHANNEL`).
 */
async function serverInSetup() {
  const servers = new TestServers();
  servers.settingUp.add(SERVER);
  servers.changed.set(SERVER, testServerValues({ channels: {}, timezone: undefined }));
  const told: string[] = [];
  let outlined = (): boolean => false;
  const setup = new ServerSetup({
    servers,
    counts: () => Promise.resolve({ regions: outlined() ? 1 : 0, gyms: 0 }),
    send: (_channelId, text) => {
      told.push(text);
      return Promise.resolve();
    },
    log: createTestLogger().log,
  });
  const made = await regionCommandsWith([], { servers, setup });
  outlined = () => (made.regions.byChannel(SOUTH_CHANNEL)?.bounds ?? null) !== null;
  /** Somebody of the server, with no staff role, who may create channels. */
  const who = (userId: string, more: FakeOptions = {}): FakeOptions => ({
    userId,
    roleNames: [],
    permissions: PermissionFlagsBits.ManageChannels,
    guildId: SERVER,
    guildChannelNames: { [LAB]: 'bot-lab', [MOD_LAB]: 'mod-bot-lab' },
    ...more,
  });
  const handled = async <T extends FakeInteraction>(interaction: T): Promise<T> => {
    await made.router.handle(interaction as never);
    return interaction;
  };
  const onPanel = { ephemeralMessage: true, v2Message: true };
  return {
    servers,
    told,
    made,
    who,
    admin: (subcommand: string, as: FakeOptions) =>
      handled(fakeChatInput({ commandName: 'admin', subcommand, ...as })),
    press: (customId: string, as: FakeOptions) =>
      handled(fakeButton({ customId, ...onPanel, ...as })),
    pickChannel: (customId: string, channelId: string, as: FakeOptions) =>
      handled(
        fakeSelect({
          customId,
          values: [channelId],
          pickedChannels: [{ id: channelId, type: 0, guildId: SERVER }],
          ...onPanel,
          ...as,
        }),
      ),
    submit: (form: { custom_id: string }, fields: Record<string, string>, as: FakeOptions) =>
      handled(fakeModal({ customId: form.custom_id, form, fields, ...onPanel, ...as })),
  };
}

describe('setting a server up, by whom (plan 19C-2)', () => {
  it('lets the server’s owner without a staff role set it up: zone, both bot labs, a region', async () => {
    const made = await serverInSetup();
    const owner = made.who(SERVER_OWNER, { guildOwnerId: SERVER_OWNER });
    const first = await made.admin('setup', owner);
    expect(textDisplays(asV2(answered(first)))[0]).toContain('Pine works here once');
    const form = shownDialog(await made.press('server:timezone:ask', owner));
    await made.submit(form, { zone: 'America/Chicago' }, owner);
    await made.pickChannel('server:channels.bot-lab:set', LAB, owner);
    await made.pickChannel('server:channels.mod-bot-lab:set', MOD_LAB, owner);
    expect(made.servers.of(SERVER)).toMatchObject({
      timezone: 'America/Chicago',
      channels: { 'bot-lab': LAB, 'mod-bot-lab': MOD_LAB },
    });
    const file = writeKml([{ name: 'South', description: null, outline: SOUTH_RING }]);
    const imported = await made.made.use(
      'import',
      {},
      { ...owner, resolved: { file: made.made.file('regions.kml', file) } },
    );
    const [label, importId] = buttonsOf(answerOf(imported))[0] ?? [];
    expect(label).toBe('Import and create 1 forum');
    await made.made.press(importId ?? '', owner);
    expect(made.made.regions.byChannel(SOUTH_CHANNEL)?.bounds).toEqual(SOUTH_RING);
    const last = await made.admin('setup', owner);
    expect(textDisplays(asV2(answered(last)))[0]).toContain('Pine is set up in this server');
    expect(made.servers.inSetup(SERVER)).toBe(false);
    expect(made.told).toHaveLength(1);
  });

  it('lets a member who may manage the server, without a staff role, open the checklist and the panel', async () => {
    const made = await serverInSetup();
    const manager = made.who(MEMBER, {
      permissions: PermissionFlagsBits.ManageGuild | PermissionFlagsBits.ManageChannels,
    });
    expect(textDisplays(asV2(answered(await made.admin('setup', manager))))[0]).toContain(
      'Setting up Pine',
    );
    expect(textDisplays(asV2(answered(await made.admin('settings', manager))))[0]).toBe(
      '### This server’s settings',
    );
  });

  it('refuses a member who may not manage the server, the checklist, the panel and the import alike', async () => {
    const made = await serverInSetup();
    const member = made.who(MEMBER);
    for (const subcommand of ['setup', 'settings']) {
      expect(sent((await made.admin(subcommand, member)).reply).content).toBe(SERVER_ADMIN_ONLY);
    }
    for (const customId of ['setup:list:show', 'server:timezone:ask']) {
      expect(sent((await made.press(customId, member)).reply).content).toBe(SERVER_ADMIN_ONLY);
    }
    const imported = await made.made.use('import', {}, member);
    expect(sent(imported.reply).content).toBe(SERVER_ADMIN_ONLY);
    expect(made.servers.inSetup(SERVER)).toBe(true);
  });
});
