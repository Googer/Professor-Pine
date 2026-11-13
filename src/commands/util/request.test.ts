import { MessageFlags } from 'discord.js';
import { describe, expect, it } from 'vitest';
import {
  FAKE_GUILD_ID,
  fakeAutocomplete,
  fakeChatInput,
  sent,
  type FakeInteraction,
} from '../../../test/support/fake-interactions.js';
import { EAST_CHANNEL, WEST_CHANNEL, WEST_FORUM } from '../../../test/support/gyms.js';
import { FakePartyGateway } from '../../../test/support/fake-gateway.js';
import { textOf, v2 } from '../../../test/support/messages.js';
import { instanceConfig } from '../../../test/support/operators.js';
import {
  TEST_SERVER_CHANNELS,
  TestServers,
  testServerValues,
} from '../../../test/support/server-values.js';
import type { Settings } from '../../config/settings.js';
import { ModeratorsLab } from '../../services/moderators-lab.js';
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

/** The moderators' bot lab of the test servers (`TEST_SERVER_CHANNELS`). */
const LAB = TEST_SERVER_CHANNELS['mod-bot-lab'];

/** The test servers' channels without a moderators' bot lab. */
function withoutLab() {
  const { 'mod-bot-lab': _lab, ...others } = TEST_SERVER_CHANNELS;
  return others;
}

/**
 * The context's configuration with the instance's GitHub repository set (`GITHUB_TOKEN`,
 * `GITHUB_REPO`) unless `repository` is false, and the instance's `servers` where given.
 */
function configWith(repository: boolean, servers?: Settings['servers']) {
  const base = createTestContext().ctx;
  const config = servers === undefined ? base.config : instanceConfig(base, { servers });
  const env = repository
    ? { ...config.env, GITHUB_TOKEN: 'token', GITHUB_REPO: 'owner/repo' }
    : { ...config.env, GITHUB_TOKEN: undefined, GITHUB_REPO: undefined };
  return { ...config, env };
}

function setup(
  overrides: Parameters<typeof createTestContext>[0] = {},
  where: { repository?: boolean; servers?: Settings['servers']; lab?: boolean } = {},
) {
  const issues = new FakeIssues();
  // The moderators' bot lab of the server, where requests go without the repository.
  const gateway = new FakePartyGateway();
  gateway.addChannel(LAB, 'mod-bot-only', { guildId: FAKE_GUILD_ID });
  const servers = new TestServers(
    where.lab === false ? testServerValues({ channels: withoutLab() }) : testServerValues(),
  );
  const { ctx, entries } = createTestContext({
    issues,
    config: configWith(where.repository ?? true, where.servers),
    servers,
    moderatorsLab: new ModeratorsLab({ gateway, servers }),
    ...overrides,
  });
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
  return { ctx, entries, issues, router, run, gateway };
}

/** What the member was told: the answer after the deferral, or a refusal before it. */
function told(used: FakeInteraction): string | undefined {
  for (const mock of [used.editReply, used.followUp, used.reply]) {
    if (mock.mock.calls.length > 0) return sent(mock).content;
  }
  throw new Error('nothing was answered');
}

describe('/request: the command', () => {
  // Plan 19B-4: offered wherever a request can go somewhere, not only where GitHub is set up.
  it('exists for members of servers, three in half an hour, with GitHub or without', () => {
    expect(request.enabled).toBeUndefined();
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

// Plan 19B-4: the instance's repository serves a server only where the instance is not open,
// and lists that server or none (the shared-data tier's rule); otherwise the server's own
// moderators' bot lab; neither, and the command is not set up there.
describe('/request per server (plan 19B-4)', () => {
  it('goes to the instance’s repository from a server it lists', async () => {
    const made = setup({}, { servers: [FAKE_GUILD_ID] });
    await made.run({ text: 'Gone', gym: 'g:2' });
    expect(made.issues.opened).toHaveLength(1);
    expect(made.gateway.messagesIn(LAB)).toEqual([]);
  });

  it('is posted in the server’s moderators’ bot lab on an open instance, pinging nobody', async () => {
    const made = setup({}, { servers: 'open' });
    const used = await made.run({ text: 'The gym is now the Town Hall Fountain', gym: 'g:2' });
    expect(made.issues.opened).toEqual([]);
    const [posted, ...more] = made.gateway.messagesIn(LAB);
    expect(more).toEqual([]);
    expect(textOf(v2(posted?.message))).toBe(
      '### Gym request: Old Stone Fountain (#2)\n' +
        `From **Alice** (<@${ALICE}>):\n` +
        '> The gym is now the Town Hall Fountain',
    );
    expect(posted?.message.mention).toBeUndefined();
    expect(told(used)).toBe(
      'Thank you: your request about **Old Stone Fountain** (#2) was sent to this server’s ' +
        'moderators.',
    );
  });

  it('is posted in the bot lab from a server the instance does not list, and without GitHub', async () => {
    const ways: { servers?: string[]; repository?: boolean }[] = [
      { servers: ['412345678901234599'] },
      { repository: false },
    ];
    for (const where of ways) {
      const made = setup({}, where);
      await made.run({ text: 'Gone', gym: 'g:2' });
      expect(made.issues.opened, JSON.stringify(where)).toEqual([]);
      expect(made.gateway.messagesIn(LAB), JSON.stringify(where)).toHaveLength(1);
    }
  });

  it('keeps the member’s words as text in the bot lab, and their name', async () => {
    const made = setup({}, { repository: false });
    await made.run(
      { text: '**bold** @everyone <@123> `code`', gym: 'g:2' },
      {
        displayName: 'Al*ice',
      },
    );
    const [posted] = made.gateway.messagesIn(LAB);
    expect(textOf(v2(posted?.message))).toBe(
      '### Gym request: Old Stone Fountain (#2)\n' +
        `From **Al\\*ice** (<@${ALICE}>):\n` +
        '> \\*\\*bold\\*\\* @\u200beveryone <\u200b@123> \\`code\\`',
    );
  });

  it('is not set up where it can go nowhere: staff are told to choose the moderators’ bot lab', async () => {
    const made = setup({}, { repository: false, lab: false });
    const member = await made.run({ text: 'Gone', gym: 'g:2' });
    expect(told(member)).toBe(
      'This is not set up in this server. The server’s staff have not turned this on.',
    );
    const staff = await made.run({ text: 'Gone', gym: 'g:2' }, { roleNames: ['Moderator'] });
    expect(told(staff)).toBe(
      'This is not set up in this server. Staff choose the moderators’ bot lab in ' +
        '/admin settings: gym requests go there.',
    );
    expect(made.issues.opened).toEqual([]);
  });

  it('says so when the bot may not post in the bot lab, and gives the use back', async () => {
    const made = setup({}, { repository: false });
    made.gateway.noSharing.add(LAB);
    const used = await made.run({ text: 'Gone', gym: 'g:2' });
    expect(told(used)).toBe(
      'Your request could not be sent: I may not post in this server’s moderators’ bot lab. ' +
        'Please tell a moderator.',
    );
    expect(made.gateway.messagesIn(LAB)).toEqual([]);
    // Not counted: three more go through.
    made.gateway.noSharing.delete(LAB);
    for (let i = 0; i < 3; i += 1) await made.run({ text: 'Gone', gym: 'g:2' });
    expect(made.gateway.messagesIn(LAB)).toHaveLength(3);
  });

  it('is refused in rehearsal mode where it would go to the bot lab too, posting nothing', async () => {
    const rehearsal = new Rehearsal({ allowlist: [ALICE], regions: ['west'], staffRoles: [] });
    const made = setup({ rehearsal }, { repository: false });
    const used = await made.run({ text: 'Gone', gym: 'g:2' });
    expect(told(used)).toBe(REQUEST_IN_REHEARSAL);
    expect(made.gateway.messagesIn(LAB)).toEqual([]);
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
