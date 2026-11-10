import { MessageFlags } from 'discord.js';
import { describe, expect, it } from 'vitest';
import { fakeChatInput, sent } from '../../../test/support/fake-interactions.js';
import { WEST_CHANNEL, WEST_FORUM } from '../../../test/support/gyms.js';
import { ALICE, BOB, CAROL, REPORTER, withAttendees } from '../../../test/support/parties.js';
import { reportedRaid } from '../../../test/support/party-service.js';
import { createTestContext } from '../../../test/support/test-context.js';
import { InteractionRouter } from '../../discord/router.js';
import { PartyStatus } from '../../domain/party/status.js';
import type { Member } from '../../services/attendance-service.js';
import { shout } from './shout.js';

const bob: Member = { id: BOB, name: 'Bob' };
const carol: Member = { id: CAROL, name: 'Carol' };
const yveltal = { boss: { key: 'yveltal' } } as const;

async function setup() {
  const made = await reportedRaid(yveltal);
  const { ctx } = createTestContext({
    partyService: made.service,
    attendance: made.attendance,
    parties: made.store,
    regions: made.regions,
  });
  // Alice, who shouts in these tests, is signed up: a shout is for those who are.
  await made.store.update(made.party.id, (party) => ({
    party: withAttendees(party, { [ALICE]: {} }),
  }));
  const router = new InteractionRouter(ctx, [shout], []);
  /** `/shout` by Alice, in the raid's post unless `place` says otherwise. */
  const run = async (message: string, place: object = {}) => {
    const interaction = fakeChatInput({
      commandName: 'shout',
      channelId: made.postId,
      thread: { parentId: WEST_FORUM },
      userId: ALICE,
      options: { message },
      ...place,
    });
    await router.handle(interaction as never);
    return interaction;
  };
  return { ...made, ctx, run };
}

describe('/shout', () => {
  it('says the message in the post and pings the others who are signed up and allow it', async () => {
    const made = await setup();
    const id = made.party.id;
    await made.attendance.signUp(id, bob, PartyStatus.Coming);
    await made.attendance.signUp(id, carol, PartyStatus.Present);
    await made.attendance.flush();
    made.userSettings.set(BOB, { mentionsShouts: false });

    const used = await made.run('Lobby in two minutes');
    expect(used.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
    expect(sent(used.editReply).content).toBe('Your message is in the post. I pinged 2 trainers.');
    const said = made.gateway.messagesIn(made.postId).at(-1)?.message;
    expect(said).toEqual({
      content:
        `**Member** (<@${ALICE}>) to everybody in this raid:\n> Lobby in two minutes\n` +
        `<@${REPORTER}> <@${CAROL}>`,
      mention: { users: [REPORTER, CAROL] },
    });
  });

  it('leaves out who is done and who switched all pings off, and never pings the sender', async () => {
    const made = await setup();
    const id = made.party.id;
    await made.attendance.signUp(id, { id: ALICE, name: 'Alice' }, PartyStatus.Present);
    await made.attendance.signUp(id, bob, PartyStatus.Present);
    await made.attendance.done(id, bob);
    await made.attendance.signUp(id, carol, PartyStatus.Interested);
    await made.attendance.flush();
    made.userSettings.set(CAROL, { mentions: false });

    await made.run('Wrong gym, sorry');
    const said = made.gateway.messagesIn(made.postId).at(-1)?.message;
    expect(said?.mention).toEqual({ users: [REPORTER] });
    expect(said?.content).not.toContain(`<@${BOB}>`);
  });

  it('is for members who are signed up for the raid, done or not', async () => {
    const made = await setup();
    await made.attendance.signUp(made.party.id, bob, PartyStatus.Coming);
    await made.attendance.flush();
    const before = made.gateway.calls.length;
    const stranger = await made.run('Hello all', { userId: CAROL });
    expect(stranger.followUp).toHaveBeenCalledWith({
      content: 'You are not signed up for this raid.',
      flags: MessageFlags.Ephemeral,
    });
    expect(made.gateway.calls).toHaveLength(before);

    // Somebody who has done the raid is still part of it.
    await made.store.update(made.party.id, (party) => ({
      party: withAttendees(party, { [CAROL]: { status: PartyStatus.Complete } }),
    }));
    const done = await made.run('Thanks, all', { userId: CAROL });
    expect(sent(done.editReply).content).toMatch(/^Your message is in the post/);
  });

  it('says nothing when nobody else is signed up', async () => {
    const made = await setup();
    await made.store.update(made.party.id, (party) => ({
      party: withAttendees({ ...party, attendees: {} }, { [ALICE]: {} }),
    }));
    const before = made.gateway.calls.length;
    const used = await made.run('Anybody?');
    expect(sent(used.editReply).content).toBe(
      'Nobody else is signed up for this raid, so I said nothing.',
    );
    expect(made.gateway.calls).toHaveLength(before);
  });

  it('shows what the member wrote as text: no Markdown, no mention of everybody', async () => {
    const made = await setup();
    await made.run('**@everyone** come to <#123> now');
    const content = made.gateway.messagesIn(made.postId).at(-1)?.message.content ?? '';
    expect(content).toContain('\\*\\*@\u200beveryone\\*\\*');
    expect(content).not.toContain('<#123>');
  });

  it('pings everybody of a very large raid in as many messages as it takes', async () => {
    const made = await setup();
    const crowd: Record<string, object> = {};
    for (let n = 0; n < 150; n++) crowd[`70000000000000${String(1000 + n)}`] = {};
    await made.store.update(made.party.id, (party) => ({ party: withAttendees(party, crowd) }));
    const used = await made.run('x'.repeat(500));
    const said = made.gateway.messagesIn(made.postId).map((m) => m.message);
    expect(said.length).toBeGreaterThan(1);
    expect(said[0]?.content).toMatch(
      /^\*\*Member\*\* \(<@\d+>\) to everybody in this raid:\n> x{500}\n/,
    );
    for (const message of said) {
      expect((message.content ?? '').length).toBeLessThanOrEqual(2000);
      expect(message.mention?.users?.length ?? 0).toBeLessThanOrEqual(100);
    }
    const users = said.flatMap((message) => message.mention?.users ?? []);
    expect(users).toEqual([REPORTER, ...Object.keys(crowd)]);
    expect(sent(used.editReply).content).toBe(
      'Your message is in the post. I pinged 151 trainers.',
    );
  });

  it('stops pinging when the raid ends between two of its messages', async () => {
    const made = await setup();
    const crowd: Record<string, object> = {};
    for (let n = 0; n < 150; n++) crowd[`70000000000000${String(1000 + n)}`] = {};
    await made.store.update(made.party.id, (party) => ({ party: withAttendees(party, crowd) }));
    const send = made.gateway.sendMessage.bind(made.gateway);
    let sends = 0;
    made.gateway.sendMessage = async (channelId, message) => {
      const id = await send(channelId, message);
      if (++sends === 1) await made.service.end(made.party.id);
      return id;
    };
    const used = await made.run('x'.repeat(500));
    // Only the first message of the shout went (the end's own messages aside).
    const shouts = made.gateway
      .messagesIn(made.postId)
      .filter((m) => (m.message.mention?.users?.length ?? 0) > 0);
    expect(shouts).toHaveLength(1);
    const pinged = shouts[0]?.message.mention?.users?.length ?? 0;
    expect(used.followUp).toHaveBeenCalledWith({
      content: `This raid is over. I pinged ${pinged} trainers before it ended.`,
      flags: MessageFlags.Ephemeral,
    });
    expect(made.gateway.posts.get(made.postId)).toMatchObject({ archived: true, reopened: 0 });
  });

  it('sends nothing more into a post that is no longer the party’s', async () => {
    const made = await setup();
    const crowd: Record<string, object> = {};
    for (let n = 0; n < 150; n++) crowd[`70000000000000${String(1000 + n)}`] = {};
    await made.store.update(made.party.id, (party) => ({ party: withAttendees(party, crowd) }));
    const send = made.gateway.sendMessage.bind(made.gateway);
    let sends = 0;
    made.gateway.sendMessage = async (channelId, message) => {
      const id = await send(channelId, message);
      if (++sends === 1) {
        await made.store.update(made.party.id, (party) => ({
          party: { ...party, forumPostId: '990000000000000001' },
        }));
      }
      return id;
    };
    const used = await made.run('x'.repeat(500));
    expect(sends).toBe(1);
    const pinged = made.gateway.messagesIn(made.postId).at(-1)?.message.mention?.users?.length;
    expect(used.followUp).toHaveBeenCalledWith({
      content: `This raid moved to another post: I pinged ${pinged} trainers before it moved. Shout again there.`,
      flags: MessageFlags.Ephemeral,
    });
  });

  it('says only that the raid moved when it moved before anybody was pinged', async () => {
    const made = await setup();
    await made.attendance.signUp(made.party.id, bob, PartyStatus.Coming);
    await made.attendance.flush();
    // The settings are read before the first message: the raid moves meanwhile.
    const read = made.users.getMany.bind(made.users);
    made.users.getMany = async (snowflakes) => {
      await made.store.update(made.party.id, (party) => ({
        party: { ...party, forumPostId: '990000000000000001' },
      }));
      return read(snowflakes);
    };
    const used = await made.run('Hi');
    expect(used.followUp).toHaveBeenCalledWith({
      content: 'This raid moved to another post. Shout again there.',
      flags: MessageFlags.Ephemeral,
    });
  });

  it('gives the use back when the raid moved before anybody was pinged', async () => {
    const made = await setup();
    await made.attendance.signUp(made.party.id, bob, PartyStatus.Coming);
    await made.attendance.flush();
    const read = made.users.getMany.bind(made.users);
    const movedPost = (postId: string) =>
      made.store.update(made.party.id, (party) => ({ party: { ...party, forumPostId: postId } }));
    let moving = true;
    made.users.getMany = async (snowflakes) => {
      if (moving) await movedPost('990000000000000001');
      return read(snowflakes);
    };
    // Three shouts that pinged nobody, the post put back after each (as if they had not been).
    for (let use = 0; use < 3; use++) {
      await made.run('Hi');
      await movedPost(made.postId);
    }
    moving = false;
    // /shout allows three in three minutes: a fourth goes through only if all three went back.
    const fourth = await made.run('Hi again');
    expect(sent(fourth.editReply).content).toBe(
      'Your message is in the post. I pinged 2 trainers.',
    );
  });

  describe('group:', () => {
    /** Alice and Bob in group B, Carol and the reporter in A. */
    async function inGroups() {
      const made = await setup();
      await made.store.update(made.party.id, (party) => ({
        party: withAttendees(
          { ...party, groups: [{ id: 'A' }, { id: 'B' }], defaultGroupId: 'B' },
          { [ALICE]: { group: 'B' }, [BOB]: { group: 'B' }, [CAROL]: { group: 'A' } },
        ),
      }));
      return made;
    }

    it('pings only the others of the shouter’s own group', async () => {
      const made = await inGroups();
      const used = await made.run('Our lobby is up', {
        options: { message: 'Our lobby is up', group: true },
      });
      expect(sent(used.editReply).content).toBe('Your message is in the post. I pinged 1 trainer.');
      expect(made.gateway.messagesIn(made.postId).at(-1)?.message).toEqual({
        content: `**Member** (<@${ALICE}>) to everybody in group B:\n> Our lobby is up\n<@${BOB}>`,
        mention: { users: [BOB] },
      });
    });

    it('leaves out who in the group is done or switched shout pings off', async () => {
      const made = await inGroups();
      await made.store.update(made.party.id, (party) => ({
        party: withAttendees(party, {
          [CAROL]: { group: 'B', status: PartyStatus.Complete },
          [REPORTER]: { group: 'B' },
          // In group A: not pinged.
          '200000000000000005': { group: 'A' },
        }),
      }));
      made.userSettings.set(BOB, { mentionsShouts: false });
      await made.run('Go', { options: { message: 'Go', group: true } });
      expect(made.gateway.messagesIn(made.postId).at(-1)?.message.mention).toEqual({
        users: [REPORTER],
      });
    });

    it('says nothing when nobody else is in the group', async () => {
      const made = await inGroups();
      await made.store.update(made.party.id, (party) => ({
        party: withAttendees(party, { [BOB]: { group: 'A' } }),
      }));
      const before = made.gateway.calls.length;
      const used = await made.run('Anybody?', { options: { message: 'Anybody?', group: true } });
      expect(sent(used.editReply).content).toBe(
        'Nobody else is in group B of this raid, so I said nothing.',
      );
      expect(made.gateway.calls).toHaveLength(before);
    });

    it('is refused in a party of one group', async () => {
      const made = await setup();
      await made.attendance.signUp(made.party.id, bob, PartyStatus.Coming);
      await made.attendance.flush();
      const before = made.gateway.calls.length;
      const used = await made.run('Hi', { options: { message: 'Hi', group: true } });
      expect(used.followUp).toHaveBeenCalledWith({
        content: 'This raid has one group: `/shout` without `group` pings everybody.',
        flags: MessageFlags.Ephemeral,
      });
      expect(made.gateway.calls).toHaveLength(before);
    });

    it('with group:False pings everybody, as without it', async () => {
      const made = await inGroups();
      await made.run('All', { options: { message: 'All', group: false } });
      expect(made.gateway.messagesIn(made.postId).at(-1)?.message.mention).toEqual({
        users: [REPORTER, BOB, CAROL],
      });
    });
  });

  it('refuses a message of nothing but spaces, and a place that is no raid post', async () => {
    const made = await setup();
    const empty = await made.run('   ');
    expect(empty.followUp).toHaveBeenCalledWith({
      content: 'Say what you want to tell them.',
      flags: MessageFlags.Ephemeral,
    });
    const elsewhere = await made.run('hello', { channelId: WEST_CHANNEL, thread: undefined });
    expect(sent(elsewhere.reply).content).toBe(
      'Use this in the post of a raid, max battle, train or meetup that is still active.',
    );
    expect(made.gateway.messagesIn(made.postId)).toEqual([]);
  });

  it('allows three in three minutes', async () => {
    const made = await setup();
    for (let use = 0; use < 3; use++) await made.run(`message ${use}`);
    const fourth = await made.run('one more');
    expect(sent(fourth.reply).content).toMatch(/^You can use \/shout again in /);
    expect(made.gateway.messagesIn(made.postId)).toHaveLength(3);
  });

  it('says that the raid is over when it ended while the settings were read', async () => {
    const made = await setup();
    await made.attendance.signUp(made.party.id, bob, PartyStatus.Coming);
    await made.attendance.flush();
    const read = made.users.getMany.bind(made.users);
    made.users.getMany = async (snowflakes) => {
      await made.service.end(made.party.id);
      return read(snowflakes);
    };
    const used = await made.run('too late');
    expect(used.followUp).toHaveBeenCalledWith({
      content: 'This raid is over.',
      flags: MessageFlags.Ephemeral,
    });
    expect(made.gateway.posts.get(made.postId)).toMatchObject({ archived: true, reopened: 0 });
  });
});
