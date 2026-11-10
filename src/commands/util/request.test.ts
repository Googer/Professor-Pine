import { MessageFlags } from 'discord.js';
import { describe, expect, it } from 'vitest';
import {
  fakeAutocomplete,
  fakeChatInput,
  sent,
  type FakeInteraction,
} from '../../../test/support/fake-interactions.js';
import { EAST_CHANNEL, WEST_CHANNEL, WEST_FORUM } from '../../../test/support/gyms.js';
import { FakeIssues } from '../../../test/support/issues.js';
import { ALICE, REPORTER } from '../../../test/support/parties.js';
import {
  createdMeetup,
  createdTrain,
  reportedMax,
  reportedRaid,
} from '../../../test/support/party-service.js';
import { createTestContext } from '../../../test/support/test-context.js';
import { Rehearsal } from '../../services/rehearsal.js';
import { REQUEST_IN_REHEARSAL } from './request.js';
import { InteractionRouter } from '../../discord/router.js';
import { request } from './request.js';

const SERVER = { [WEST_CHANNEL]: 'west', [EAST_CHANNEL]: 'east' };

function setup(overrides: Parameters<typeof createTestContext>[0] = {}) {
  const issues = new FakeIssues();
  const { ctx, entries } = createTestContext({ issues, ...overrides });
  const router = new InteractionRouter(ctx, [request], []);
  const run = async (options: Record<string, string>, extra: object = {}) => {
    const interaction = fakeChatInput({
      commandName: 'request',
      userId: ALICE,
      displayName: 'Alice',
      guildName: 'Pinewood Raids',
      guildChannelNames: SERVER,
      options,
      ...extra,
    });
    await router.handle(interaction as never);
    return interaction;
  };
  return { ctx, entries, issues, router, run };
}

/** What the member was told: the answer after the deferral, or a refusal before it. */
function told(used: FakeInteraction): string | undefined {
  for (const mock of [used.editReply, used.followUp, used.reply]) {
    if (mock.mock.calls.length > 0) return sent(mock).content;
  }
  throw new Error('nothing was answered');
}

describe('/request: the command', () => {
  it('exists only where GitHub is set up, for members of servers, three in half an hour', () => {
    const { ctx } = createTestContext();
    expect(request.enabled?.(ctx.config)).toBe(false);
    const env = { ...ctx.config.env, GITHUB_TOKEN: 'token', GITHUB_REPO: 'owner/repo' };
    expect(request.enabled?.({ ...ctx.config, env })).toBe(true);
    const json = request.data.toJSON();
    expect(json.default_member_permissions).toBeUndefined();
    expect(json.contexts).toBeUndefined();
    expect(json.options?.map((option) => [option.name, option.required])).toEqual([
      ['text', true],
      ['gym', false],
    ]);
    expect(request.throttle).toEqual({ uses: 3, perSeconds: 1800 });
    expect(request.defer).toBe('ephemeral');
  });
});

describe('/request: an issue', () => {
  it('is opened for the gym named, with who asked from where, and the member is thanked', async () => {
    const made = setup();
    const used = await made.run({ text: 'The gym is now the Town Hall Fountain', gym: 'g:2' });
    expect(used.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
    expect(made.issues.opened).toEqual([
      {
        title: 'Gym request: Old Stone Fountain (#2)',
        body:
          'Request from `Alice` in `Pinewood Raids`:\n\n' +
          '```text\nThe gym is now the Town Hall Fountain\n```',
        labels: ['2'],
      },
    ]);
    expect(told(used)).toBe(
      'Thank you: your request about **Old Stone Fountain** (#2) was sent to the people who ' +
        'keep the gym list.',
    );
  });

  it('is about the gym of the raid whose post it is made in', async () => {
    const raid = await reportedRaid();
    const made = setup({ parties: raid.store, regions: raid.regions });
    await made.run(
      { text: 'Wrong name' },
      { channelId: raid.postId, thread: { parentId: WEST_FORUM } },
    );
    expect(made.issues.opened[0]?.title).toBe('Gym request: Pinewood Public Library (#1)');
  });

  it('is about the stop of the train whose post it is made in, and none once it finished', async () => {
    const train = await createdTrain({ route: [2, 3] });
    const made = setup({ parties: train.store, regions: train.regions });
    const inPost = { channelId: train.postId, thread: { parentId: WEST_FORUM } };
    await made.run({ text: 'Wrong name' }, inPost);
    expect(made.issues.opened[0]?.title).toBe('Gym request: Old Stone Fountain (#2)');
    await train.trains.move(train.party.id, { id: REPORTER }, 'finish', false);
    expect(told(await made.run({ text: 'Wrong name' }, inPost))).toBe(
      'This train is at no gym right now. Say which gym with the `gym` option.',
    );
    expect(made.issues.opened).toHaveLength(1);
  });

  it('pings nobody on GitHub, links no issue, and keeps the text as typed', async () => {
    const made = setup();
    await made.run(
      { text: '@everyone look: **gone** since @pine-team moved it, see #12', gym: 'g:2' },
      { displayName: '@Alice `x`', guildName: 'Pinewood `Raids`' },
    );
    expect(made.issues.opened[0]?.body).toBe(
      'Request from `@\u200bAlice x` in `Pinewood Raids`:\n\n```text\n' +
        '@\u200beveryone look: **gone** since @\u200bpine-team moved it, see #\u200b12\n```',
    );
  });

  it('says so when GitHub did not take it', async () => {
    const made = setup();
    made.issues.failing = { ok: false, reason: 'refused', status: 401 };
    expect(told(await made.run({ text: 'Gone', gym: 'g:2' }))).toBe(
      'Your request could not be sent: GitHub refused it. Please tell a moderator, who can ' +
        'look into the log of the bot.',
    );
    made.issues.failing = { ok: false, reason: 'unreachable' };
    expect(told(await made.run({ text: 'Gone', gym: 'g:2' }))).toBe(
      'Your request could not be sent: GitHub could not be reached. Please try again later.',
    );
  });

  it('says of a request GitHub did not answer in time that it may have arrived', async () => {
    const made = setup();
    made.issues.failing = { ok: false, reason: 'timeout' };
    expect(told(await made.run({ text: 'Gone', gym: 'g:2' }))).toBe(
      'GitHub did not answer in time, so I cannot tell whether your request arrived. Please ' +
        'ask a moderator before you send it again.',
    );
  });
});

describe('/request: refused before anything is sent', () => {
  it('in rehearsal mode, which must not file a real issue', async () => {
    const rehearsal = new Rehearsal({ allowlist: [ALICE], regions: ['west'], staffRoles: [] });
    const made = setup({ rehearsal });
    const used = await made.run({ text: 'Gone', gym: 'id:1' });
    expect(told(used)).toBe(REQUEST_IN_REHEARSAL);
    expect(made.issues.opened).toEqual([]);
  });

  it('without a gym outside a post, naming how to say which', async () => {
    const made = setup();
    const used = await made.run({ text: 'Gone' });
    expect(used.reply).toHaveBeenCalledWith({
      content:
        'Say which gym the request is about with the `gym` option, or use this in the post of ' +
        'a raid or train at that gym.',
      flags: MessageFlags.Ephemeral,
    });
    expect(used.deferReply).not.toHaveBeenCalled();
    expect(made.issues.opened).toEqual([]);
  });

  it('in the post of a raid that has ended, saying so', async () => {
    const raid = await reportedRaid();
    await raid.service.end(raid.party.id);
    const made = setup({ parties: raid.store, regions: raid.regions });
    const used = await made.run(
      { text: 'Wrong name' },
      { channelId: raid.postId, thread: { parentId: WEST_FORUM } },
    );
    expect(told(used)).toBe(
      'What this post was for has ended. Say which gym the request is about with the `gym` ' +
        'option.',
    );
    expect(made.issues.opened).toEqual([]);
  });

  it('in the summary post of a forum, naming how to say which', async () => {
    const raid = await reportedRaid();
    const summaryId = '900000000000000001';
    // The region as the database has it once its summary post was made.
    const regions = Object.assign(Object.create(raid.regions) as typeof raid.regions, {
      byForum: (forumId: string) => {
        const region = raid.regions.byForum(forumId);
        return region && { ...region, summaryMessageId: summaryId };
      },
    });
    const made = setup({ parties: raid.store, regions });
    const used = await made.run(
      { text: 'Wrong name' },
      { channelId: summaryId, thread: { parentId: WEST_FORUM } },
    );
    expect(told(used)).toBe(
      'Say which gym the request is about with the `gym` option, or use this in the post of ' +
        'a raid or train at that gym.',
    );
  });

  // Final review, X3-F6: a max battle is at a power spot, which is no gym.
  it('in the post of a max battle, which is at a Power Spot', async () => {
    const max = await reportedMax();
    const made = setup({ parties: max.store, regions: max.regions });
    const used = await made.run(
      { text: 'Gone' },
      { channelId: max.postId, thread: { parentId: WEST_FORUM } },
    );
    expect(told(used)).toBe('A max battle is at a Power Spot, not a gym: name the gym with `gym`.');
  });

  it('in the post of a meetup, which is at no gym', async () => {
    const meetup = await createdMeetup();
    const made = setup({ parties: meetup.store, regions: meetup.regions });
    const used = await made.run(
      { text: 'Gone' },
      { channelId: meetup.postId, thread: { parentId: WEST_FORUM } },
    );
    expect(told(used)).toBe(
      'This meetup is at no gym right now. Say which gym with the `gym` option.',
    );
  });

  it('for a gym of no region of this server, or text that fits several', async () => {
    const made = setup();
    expect(told(await made.run({ text: 'Gone', gym: '#10' }))).toBe('This server has no gym #10.');
    expect(told(await made.run({ text: 'Gone', gym: 'starbucks' }))).toMatch(
      /^Several gyms fit "starbucks": /,
    );
    expect(made.issues.opened).toEqual([]);
  });

  it('for blank text', async () => {
    const made = setup();
    expect(told(await made.run({ text: '   ', gym: 'g:2' }))).toBe(
      'Say what should change about the gym.',
    );
  });

  it('without using up one of the three requests', async () => {
    const made = setup();
    for (let i = 0; i < 4; i += 1) await made.run({ text: 'Gone' });
    for (let i = 0; i < 3; i += 1) await made.run({ text: 'Gone', gym: 'g:2' });
    expect(made.issues.opened).toHaveLength(3);
    const fourth = await made.run({ text: 'Gone', gym: 'g:2' });
    expect(told(fourth)).toMatch(/^You can use \/request again in 30 minutes/);
    expect(made.issues.opened).toHaveLength(3);
  });

  it('in a DM', async () => {
    const made = setup();
    expect(told(await made.run({ text: 'Gone', gym: 'g:2' }, { isDm: true, guildId: null }))).toBe(
      'This only works in a server.',
    );
  });
});

describe('/request: the gym option', () => {
  it('offers the gyms of this server, those of the region first', async () => {
    const made = setup();
    const interaction = fakeAutocomplete({
      commandName: 'request',
      focusedName: 'gym',
      focused: 'starbucks',
      channelId: EAST_CHANNEL,
      guildChannelNames: SERVER,
    });
    await made.router.handle(interaction as never);
    const offered = (interaction.respond.mock.calls[0]?.[0] ?? []).map((choice) => choice.value);
    expect(offered).toEqual(['g:9']);
  });
});
