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
import { WEST_CHANNEL } from '../../../test/support/gyms.js';
import { createTestContext } from '../../../test/support/test-context.js';
import { TEST_WEB } from '../../../test/support/web.js';
import { fileDefaults } from '../../config/server-settings.js';
import type { Settings } from '../../config/settings.js';
import { InteractionRouter } from '../../discord/router.js';
import { maps } from './maps.js';
import { TestServers, testServerValues } from '../../../test/support/server-values.js';

const ASH = '700000000000000001';
const LINK = 'https://maps.example.test/regions';

function setup(settings: Partial<Settings>) {
  const base = createTestContext();
  // The link is the server's (plan 19A-1): its values, and in a DM the file's defaults.
  const { regionMapLink, ...instance } = settings;
  const file = { ...base.ctx.config.settings, ...settings };
  const { ctx } = createTestContext({
    config: { ...base.ctx.config, settings: { ...base.ctx.config.settings, ...instance } },
    servers: new TestServers(testServerValues({ regionMapLink }), fileDefaults(file)),
  });
  const router = new InteractionRouter(ctx, [maps], []);
  const run = async (extra: object = {}) => {
    const interaction = fakeChatInput({
      commandName: 'maps',
      userId: ASH,
      // Their name in this server; the link's session (one for every server) takes the account's.
      displayName: 'Ash of Pinewood',
      globalName: 'Ash',
      username: 'ash_k',
      ...extra,
    });
    await router.handle(interaction as never);
    return interaction;
  };
  return { ctx, run };
}

describe('/maps', () => {
  it("is registered everywhere, set up where there is a map: the web pages, or the server's link", () => {
    const { ctx } = createTestContext();
    const { web: _none, ...settings } = ctx.config.settings;
    const without = { ...ctx, config: { ...ctx.config, settings } };
    const withWeb = { ...ctx, config: { ...ctx.config, settings: { ...settings, web: TEST_WEB } } };
    const values = testServerValues();
    const { regionMapLink: _link, ...noLink } = values;
    expect(maps.enabled).toBeUndefined();
    expect(maps.setUpIn?.(noLink, without, FAKE_GUILD_ID)).toBe(
      'Staff set the address of the map of all regions in /admin settings.',
    );
    expect(
      maps.setUpIn?.({ ...values, regionMapLink: LINK }, without, FAKE_GUILD_ID),
    ).toBeUndefined();
    expect(maps.setUpIn?.(noLink, withWeb, FAKE_GUILD_ID)).toBeUndefined();
  });

  it('answers in a server without a map that it is not set up there', async () => {
    const { run } = setup({ web: undefined, regionMapLink: undefined });
    const used = await run();
    expect(sent(used.reply).content).toBe(
      'This is not set up in this server. The server’s staff have not turned this on.',
    );
    const byStaff = await run({ roleNames: ['Admin'] });
    expect(sent(byStaff.reply).content).toBe(
      'This is not set up in this server. Staff set the address of the map of all regions in ' +
        '/admin settings.',
    );
  });

  it("gives the server's map and a link that logs the member in, privately", async () => {
    const { ctx, run } = setup({ web: TEST_WEB, regionMapLink: LINK });
    const used = await run();
    const payload = answered(used);
    expect((payload.flags ?? 0) & MessageFlags.Ephemeral).toBe(MessageFlags.Ephemeral);
    const message = asV2(payload);
    // The address only as code, which Discord does not make a link: tapped, it opened the map
    // logged out (Matt, 2026-10-25). The button is the one way in.
    expect(textOf(message)).not.toMatch(/[^`]https:\/\//);
    // The button is the member's own: shared, it would log somebody else in as them.
    expect(textOf(message)).toContain(
      '-# The button works once, within five minutes; do not share it: it logs in whoever ' +
        'opens it as you. Use /maps again for another. To share the map, give its address: ' +
        `\`https://map.example.test/s/${FAKE_GUILD_ID}/map\``,
    );
    const [button] = buttonsOf(message);
    expect(button?.label).toBe('Open the map (logs you in)');
    const url = new URL(button?.url ?? '');
    const prefix = `/auth/link/${FAKE_GUILD_ID}/`;
    expect(url.origin).toBe('https://map.example.test');
    expect(url.pathname.startsWith(prefix)).toBe(true);
    const token = url.pathname.slice(prefix.length);
    expect(ctx.loginLinks.redeem(token, Date.now())).toEqual({
      guildId: FAKE_GUILD_ID,
      userId: ASH,
      userName: 'Ash',
      page: 'map',
    });
  });

  it('opens the map on the region of the channel it was used in (plan 8M-7)', async () => {
    const { ctx, run } = setup({ web: TEST_WEB });
    const region = ctx.regions.byChannel(WEST_CHANNEL)?.id;
    expect(region).toBeDefined();
    const message = asV2(answered(await run({ channelId: WEST_CHANNEL })));
    expect(textOf(message)).toContain(
      `\`https://map.example.test/s/${FAKE_GUILD_ID}/map?region=${region}\``,
    );
    const url = new URL(buttonsOf(message)[0]?.url ?? '');
    const token = url.pathname.split('/').at(-1) ?? '';
    expect(ctx.loginLinks.redeem(token, Date.now())).toMatchObject({ page: 'map', region });
    // Anywhere else in the server: the whole map, no region named.
    const elsewhere = asV2(answered(await run()));
    expect(textOf(elsewhere)).toContain(`\`https://map.example.test/s/${FAKE_GUILD_ID}/map\``);
    expect(textOf(elsewhere)).not.toContain('?region=');
    const plain = new URL(buttonsOf(elsewhere)[0]?.url ?? '');
    expect(ctx.loginLinks.peek(plain.pathname.split('/').at(-1) ?? '', Date.now())).toEqual({
      guildId: FAKE_GUILD_ID,
      userId: ASH,
      userName: 'Ash',
      page: 'map',
    });
  });

  it("names the link's member by their username when they have no display name", async () => {
    const { ctx, run } = setup({ web: TEST_WEB });
    const url = new URL(buttonsOf(asV2(answered(await run({ globalName: null }))))[0]?.url ?? '');
    const token = url.pathname.split('/').at(-1) ?? '';
    expect(ctx.loginLinks.redeem(token, Date.now())?.userName).toBe('ash_k');
  });

  it('gives a new link each time', async () => {
    const { run } = setup({ web: TEST_WEB });
    const first = buttonsOf(asV2(answered(await run())))[0]?.url;
    const second = buttonsOf(asV2(answered(await run())))[0]?.url;
    expect(first).not.toBe(second);
  });

  it('sends a member who asks in a DM to their server, or to the map of all regions', async () => {
    const onlyWeb = setup({ web: TEST_WEB, regionMapLink: undefined });
    expect(sent((await onlyWeb.run({ isDm: true })).reply).content).toBe(
      'Use /maps in your server.',
    );
    const both = setup({ web: TEST_WEB, regionMapLink: LINK });
    expect(sent((await both.run({ isDm: true })).reply).content).toBe(
      `The map of all regions: ${LINK}`,
    );
  });

  it('gives the address of the map of all regions without the web pages', async () => {
    const { run } = setup({ web: undefined, regionMapLink: LINK });
    for (const extra of [{}, { isDm: true }]) {
      const reply = sent((await run(extra)).reply);
      expect(reply.content).toBe(`The map of all regions: ${LINK}`);
      expect((reply.flags ?? 0) & MessageFlags.Ephemeral).toBe(MessageFlags.Ephemeral);
    }
  });

  it('says in its help what it gives', () => {
    const { ctx } = createTestContext();
    const details = (settings: Settings) => {
      const help = maps.help.details;
      return typeof help === 'function' ? help(settings) : (help ?? '');
    };
    expect(details({ ...ctx.config.settings, web: TEST_WEB })).toMatch(/logs you in/);
    expect(details({ ...ctx.config.settings, regionMapLink: LINK, web: undefined })).not.toMatch(
      /logs you in/,
    );
  });
});
