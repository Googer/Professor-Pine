import { MessageFlags } from 'discord.js';
import { describe, expect, it } from 'vitest';
import {
  fakeAutocomplete,
  fakeChatInput,
  sent,
  type FakeInteraction,
} from '../../../test/support/fake-interactions.js';
import { gymViewOf, said } from '../../../test/support/gym-commands.js';
import { asV2 } from '../../../test/support/fake-interactions.js';
import { expectV2Sendable } from '../../../test/support/post-limits.js';
import { EAST_CHANNEL, WEST_CHANNEL, WEST_FORUM } from '../../../test/support/gyms.js';
import { ALICE } from '../../../test/support/parties.js';
import { reportedRaid } from '../../../test/support/party-service.js';
import { createTestContext } from '../../../test/support/test-context.js';
import { InteractionRouter } from '../../discord/router.js';
import { findGym } from './find-gym.js';

const SERVER = { [WEST_CHANNEL]: 'west', [EAST_CHANNEL]: 'east', '600000000000000001': 'general' };

function setup(overrides: Parameters<typeof createTestContext>[0] = {}) {
  const { ctx } = createTestContext(overrides);
  const router = new InteractionRouter(ctx, [findGym], []);
  const run = async (gym: string, extra: object = {}) => {
    const interaction = fakeChatInput({
      commandName: 'find-gym',
      userId: ALICE,
      guildChannelNames: SERVER,
      options: { gym },
      ...extra,
    });
    await router.handle(interaction as never);
    return interaction;
  };
  const choices = async (focused: string, extra: object = {}) => {
    const interaction = fakeAutocomplete({
      commandName: 'find-gym',
      userId: ALICE,
      guildChannelNames: SERVER,
      focusedName: 'gym',
      focused,
      ...extra,
    });
    await router.handle(interaction as never);
    return (interaction.respond.mock.calls[0]?.[0] ?? []).map((choice) => choice.value);
  };
  return { ctx, run, choices };
}

const shown = (used: FakeInteraction) => gymViewOf(sent(used.editReply));
const refusal = (used: FakeInteraction) => said(sent(used.reply));

describe('/find-gym', () => {
  it('is a member command of servers, private, with a gym option of its own', () => {
    const json = findGym.data.toJSON();
    expect(json.default_member_permissions).toBeUndefined();
    expect(json.contexts).toBeUndefined();
    expect(json.options?.[0]).toMatchObject({ name: 'gym', required: true, autocomplete: true });
    expect(findGym.defer).toBe('ephemeral');
    expect(findGym.throttle).toEqual({ uses: 10, perSeconds: 60 });
    expect(findGym.help.category).toBe('util');
  });

  it('shows a member what they need of a gym, and nothing only staff need', async () => {
    const made = setup({
      maps: {
        enabled: true,
        gym: (asked) => Promise.resolve(`var/images/gyms/${String(asked.id)}-abc.png`),
        region: () => Promise.resolve(undefined),
        place: () => Promise.resolve(undefined),
        clear: () => Promise.resolve(0),
      },
    });
    const used = await made.run('g:1', { channelId: WEST_CHANNEL });
    expect(used.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
    expect(shown(used)).toEqual({
      title: 'Pinewood Public Library (The Stacks)',
      lines: [`It lies in <#${WEST_CHANNEL}>.`],
      facts: {},
      smallPrint: 'Gym #1',
      pictures: ['attachment://1-abc.png'],
    });
    const answer = sent(used.editReply);
    expect(said(answer)).toBe('');
    expect(answer.files).toEqual(['var/images/gyms/1-abc.png']);
    expect(answer.flags).toBe(MessageFlags.IsComponentsV2);
    expectV2Sendable(asV2(answer));
    expect(JSON.stringify(answer)).toContain('Mural of readers beside the front doors');
  });

  it('shows the notice, and no elite mark: members are not told any more', async () => {
    const made = setup();
    const gym = made.ctx.gyms.get(11);
    if (!gym) throw new Error('no gym 11');
    Object.assign(gym, { taggedEx: true });
    const view = shown(await made.run('#11'));
    expect(view.lines).toEqual([`It lies in <#${WEST_CHANNEL}>.`]);
    expect(view.facts).toEqual({ Notice: 'Park closes at dusk' });
    expect(view.pictures).toEqual([]);
  });

  it('lists the raids at the gym now, with links to their posts', async () => {
    const raid = await reportedRaid();
    const made = setup({ parties: raid.store, regions: raid.regions });
    const view = shown(await made.run('g:1'));
    expect(view.facts['Raids now']).toMatch(new RegExp(`^<#${raid.postId}> · `));
    expect(shown(await made.run('g:2')).facts).toEqual({});
  });

  it('acts on text only one gym of the server has every word of', async () => {
    const made = setup();
    expect(shown(await made.run('stone fountain')).title).toBe('Old Stone Fountain');
  });

  it('names the gyms that fit unclear text, with their numbers, instead of guessing', async () => {
    const made = setup();
    expect(refusal(await made.run('starbucks'))).toBe(
      'Several gyms fit "starbucks": **Starbucks** (#5), **Starbucks** (#9). Pick one from the ' +
        'list, or give its number (`#123`).',
    );
  });

  it('shows no gym of another server, nor one in no region', async () => {
    const made = setup();
    expect(refusal(await made.run('#10'))).toBe('This server has no gym #10.');
    expect(refusal(await made.run('g:10'))).toBe(
      'I found no gym of this server for "g:10". Type part of its name and pick it from the list.',
    );
    expect(refusal(await made.run('g:1', { guildId: '499999999999999999' }))).toMatch(
      /^I found no gym of this server/,
    );
  });

  it('is refused in a DM', async () => {
    const made = setup();
    expect(refusal(await made.run('g:1', { isDm: true, guildId: null }))).toBe(
      'This only works in a server.',
    );
  });

  it('offers the gyms of the region first, and those of this server only', async () => {
    const made = setup();
    expect((await made.choices('', { channelId: WEST_CHANNEL })).length).toBeGreaterThan(0);
    const offered = await made.choices('starbucks', { channelId: EAST_CHANNEL });
    expect(offered[0]).toBe('g:9');
    expect(offered).not.toContain('g:10');
    expect(await made.choices('lakeview')).toEqual([]);
  });

  it('works in the post of a raid, for the region of its forum', async () => {
    const raid = await reportedRaid();
    const made = setup({ parties: raid.store, regions: raid.regions });
    const used = await made.run('g:2', {
      channelId: raid.postId,
      thread: { parentId: WEST_FORUM },
    });
    expect(shown(used).title).toBe('Old Stone Fountain');
  });
});
