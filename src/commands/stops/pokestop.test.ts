import { describe, expect, it } from 'vitest';
import { choicesOf } from '../../../test/support/boss-commands.js';
import { answerOf, buttonId, buttonsOf, said } from '../../../test/support/gym-commands.js';
import { gymAdminWith } from '../../../test/support/gym-admin.js';
import {
  fakeAutocomplete,
  fakeButton,
  fakeChatInput,
  FAKE_GUILD_ID,
  type FakeInteraction,
  type FakeOptions,
} from '../../../test/support/fake-interactions.js';
import { WEST_CHANNEL } from '../../../test/support/gyms.js';
import { MemoryPineStops } from '../../../test/support/pine-stops.js';
import { createTestContext } from '../../../test/support/test-context.js';
import { keptRow } from '../../../test/support/wayspot-cases.js';
import { wayspotsWith } from '../../../test/support/wayspots.js';
import { InteractionRouter } from '../../discord/router.js';
import { PineStopService } from '../../services/pine-stops.js';
import { PlaceFinder } from '../../services/place-finder.js';
import { NO_SUCH_STOP, pokestop, pokestopControls, STOP_NOT_HERE } from './pokestop.js';

const MODERATOR = '200000000000000009';

/** `/pokestop` routed as in the bot, used by a moderator in West, with a kept stop in West. */
async function setup() {
  const { admin } = await gymAdminWith();
  const { wayspots } = await wayspotsWith([
    keptRow(1, { title: 'Yellow Mural', lat: 40.06, lon: -80.06 }),
  ]);
  const stored = new MemoryPineStops();
  const { ctx } = createTestContext({ gymAdmin: admin, wayspots });
  const pineStops = new PineStopService({
    storage: stored,
    wayspots,
    guilds: ctx.guilds,
    log: ctx.log,
  });
  Object.assign(ctx, {
    pineStops,
    placeFinder: new PlaceFinder({ gyms: ctx.gyms, wayspots, regions: ctx.regions, log: ctx.log }),
  });
  await pineStops.load();
  const router = new InteractionRouter(ctx, [pokestop], [pokestopControls]);
  const staff: FakeOptions = {
    userId: MODERATOR,
    roleNames: ['Moderator'],
    channelId: WEST_CHANNEL,
    guildId: FAKE_GUILD_ID,
  };
  const handled = async (interaction: FakeInteraction) => {
    await router.handle(interaction as never);
    return interaction;
  };
  return {
    ctx,
    stored,
    pineStops,
    use: (subcommand: string, options: Record<string, string>, extra: FakeOptions = {}) =>
      handled(fakeChatInput({ commandName: 'pokestop', subcommand, options, ...staff, ...extra })),
    press: (customId: string, extra: FakeOptions = {}) =>
      handled(
        fakeButton({ customId, v2Message: true, ephemeralMessage: true, ...staff, ...extra }),
      ),
    typing: (subcommand: string, focused: string) =>
      handled(
        fakeAutocomplete({
          commandName: 'pokestop',
          subcommand,
          focused,
          focusedName: 'stop',
          ...staff,
        }),
      ),
  };
}

describe('/pokestop', () => {
  it('adds a stop in the server’s regions at once where no PokéStop is near', async () => {
    const { use, stored, ctx } = await setup();
    const answered = answerOf(
      await use('add', {
        name: '  Coffee   Corner ',
        at: '40.0701, -80.0701',
        address: '12 Market Street',
      }),
    );
    expect(said(answered)).toContain('Added the PokéStop **Coffee Corner** (`pine-1`)');
    expect(said(answered)).toContain(`It lies in <#${WEST_CHANNEL}>.`);
    expect([...stored.rows.values()]).toMatchObject([
      { name: 'Coffee Corner', address: '12 Market Street', lat: 40.0701, lon: -80.0701 },
    ]);
    await ctx.placeFinder.built();
    expect(
      ctx.placeFinder.find(1, WEST_CHANNEL, 'coffee corner', ['stop']).map((one) => one.id),
    ).toEqual(['pine-1']);
  });

  it('names the PokéStop nearby in the settings’ units, feet where they are imperial (round 2)', async () => {
    const { use, ctx } = await setup();
    Object.assign(ctx, {
      config: { ...ctx.config, settings: { ...ctx.config.settings, distanceUnits: 'imperial' } },
    });
    const question = answerOf(await use('add', { name: 'Mural Café', at: '40.0601, -80.0601' }));
    expect(said(question)).toContain('A PokéStop lies within 98 ft of that place:');
    expect(said(question)).toContain('**Yellow Mural**, 46 ft away');
  });

  it('asks before adding a stop within 30 m of a PokéStop, and adds it on Add anyway', async () => {
    const { use, press, stored } = await setup();
    const question = answerOf(await use('add', { name: 'Mural Café', at: '40.0601, -80.0601' }));
    expect(said(question)).toContain('Add the PokéStop **Mural Café**');
    expect(said(question)).toContain('A PokéStop lies within 30 m of that place:');
    expect(said(question)).toContain('**Yellow Mural**, 14 m away');
    expect(buttonsOf(question).map(([label]) => label)).toEqual(['Add anyway', 'Cancel']);
    expect(stored.rows.size).toBe(0);

    const added = answerOf(await press(buttonId(question, 'Add anyway')));
    expect(said(added)).toContain('Added the PokéStop **Mural Café** (`pine-1`)');
    expect(stored.rows.size).toBe(1);
    // Answered once.
    const again = await press(buttonId(question, 'Add anyway'));
    expect(said(answerOf(again))).toContain('expired');
    expect(stored.rows.size).toBe(1);
  });

  it('adds nothing on Cancel', async () => {
    const { use, press, stored } = await setup();
    const question = answerOf(await use('add', { name: 'Mural Café', at: '40.0601, -80.0601' }));
    expect(said(answerOf(await press(buttonId(question, 'Cancel'))))).toBe(
      'Canceled: nothing was added.',
    );
    expect(stored.rows.size).toBe(0);
  });

  it('refuses a place in no region of the server, and a blank name', async () => {
    const { use, stored } = await setup();
    expect(said(answerOf(await use('add', { name: 'Far', at: '40.9, -80.9' })))).toBe(
      STOP_NOT_HERE,
    );
    expect(said(answerOf(await use('add', { name: '  ', at: '40.07, -80.07' })))).toBe(
      'A PokéStop needs a name.',
    );
    expect(stored.rows.size).toBe(0);
  });

  it('offers, changes and removes the server’s own stops', async () => {
    const { use, typing, stored, ctx } = await setup();
    await use('add', { name: 'Coffee Corner', at: '40.0701, -80.0701' });
    await use('add', { name: 'Tea House', at: '40.075, -80.075', address: 'Elm Street' });
    expect(choicesOf(await typing('edit', 'tea'))).toEqual([
      { name: 'Tea House · Elm Street', value: 'pine-2' },
    ]);
    const changed = answerOf(await use('edit', { stop: 'pine-2', name: 'Tea Room', address: '-' }));
    expect(said(changed)).toContain('Changed the PokéStop **Tea Room** (`pine-2`)');
    expect(stored.rows.get(2)).toMatchObject({ name: 'Tea Room', address: null });
    // Review r0 of 8X-F, X5-4: an address that ends in a period ends the sentence once.
    const dotted = answerOf(await use('edit', { stop: 'pine-2', address: '12 Elm St.' }));
    expect(said(dotted)).toMatch(/, 12 Elm St\.$/);
    expect(said(answerOf(await use('remove', { stop: 'coffee corner' })))).toContain(
      'Removed the PokéStop **Coffee Corner** (`pine-1`)',
    );
    expect(said(answerOf(await use('remove', { stop: 'pine-1' })))).toBe(NO_SUCH_STOP);
    expect([...stored.rows.keys()]).toEqual([2]);
    await ctx.placeFinder.built();
    expect(ctx.placeFinder.find(1, WEST_CHANNEL, 'coffee')).toEqual([]);
  });
});
