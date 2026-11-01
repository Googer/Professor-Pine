import { describe, expect, it, vi } from 'vitest';
import { WEST_CHANNEL } from '../../test/support/gyms.js';
import {
  LIBRARY,
  MOD,
  MODERATOR,
  newRequest,
  OTHER_SERVER,
  requestId,
  SAFETY_SERVER,
} from '../../test/support/meetup-safety-cases.js';
import { MOD_CHANNEL, meetupSafetyWith } from '../../test/support/meetup-safety-service.js';
import { buttonsOf, textOf } from '../../test/support/messages.js';
import { ALICE, BOB, MINUTE, PARTY_NOW } from '../../test/support/parties.js';

const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const MODERATOR_MEMBER = { id: MODERATOR, name: 'Mod' };

/** Meetup safety with a meetup of Alice's and one of Bob's posted already. */
async function withMeetups() {
  const made = await meetupSafetyWith();
  const make = async (creatorId: string, name: string) => {
    const outcome = await made.service.createMeetup({
      name,
      creatorId,
      regionChannelId: WEST_CHANNEL,
    });
    if (outcome.kind !== 'created') throw new Error(outcome.kind);
    return outcome.party;
  };
  const alices = await make(ALICE, 'Alice’s picnic');
  const bobs = await make(BOB, 'Bob’s picnic');
  await made.service.flush();
  return { ...made, alices, bobs };
}

describe('MeetupSafety: Block member', () => {
  it('refuses the request, blocks its maker, withdraws their others and closes their meetups', async () => {
    const made = await withMeetups();
    const request = await made.held();
    const other = await made.held({ name: 'Second swap' });
    const outcome = await made.safety.decide(
      request.id,
      'block',
      MODERATOR_MEMBER,
      SAFETY_SERVER,
      'Pine Town',
    );
    expect(outcome).toMatchObject({ kind: 'done', closed: 1, withdrawn: 1 });
    expect(await made.storage.block(SAFETY_SERVER, ALICE)).toMatchObject({ blockedBy: MODERATOR });
    expect(made.storage.requests.get(request.id)).toMatchObject({
      status: 'refused',
      decision: 'block',
    });
    expect(made.storage.requests.get(other.id)).toMatchObject({
      status: 'withdrawn',
      decidedBy: MODERATOR,
    });
    expect(textOf(made.postOf(request)?.message)).toContain('and its maker is blocked');
    expect(textOf(made.postOf(other)?.message)).toContain('its maker was blocked');
    expect(buttonsOf(made.postOf(other)?.message)).toEqual([]);
    // Alice's meetup is closed as /delete closes one, with the moderators' line; Bob's stays.
    expect(made.store.get(made.alices.id)).toBeUndefined();
    expect(
      made.gateway.messagesIn(made.alices.forumPostId ?? '').map((one) => one.message.content),
    ).toContain('This meetup was closed by the moderators.');
    expect(made.store.get(made.bobs.id)).toBeDefined();
    // One direct message, about the block; none for each request.
    expect(made.dms.to(ALICE).map((dm) => textOf(dm))).toEqual([
      'A moderator blocked you from creating meetups on **Pine Town**. If you think that is ' +
        'wrong, use `/meetup` there and press "Appeal…".',
    ]);
  });

  it('blocks a member in that server alone, and never a member of staff', async () => {
    const made = await withMeetups();
    const request = await made.held();
    await made.safety.decide(request.id, 'block', MODERATOR_MEMBER, SAFETY_SERVER);
    const place = request.place;
    expect(
      await made.safety.verdict({ serverId: SAFETY_SERVER, place, makerId: ALICE, staff: false }),
    ).toBe('blocked');
    expect(
      await made.safety.verdict({ serverId: OTHER_SERVER, place, makerId: ALICE, staff: false }),
    ).toBe('review');
    // Made staff since, Alice is blocked by nothing.
    expect(
      await made.safety.verdict({ serverId: SAFETY_SERVER, place, makerId: ALICE, staff: true }),
    ).toBe('allowed');
  });

  it('tells a member of their block once, however many Blocks come', async () => {
    const made = await withMeetups();
    const first = await made.held();
    const second = await made.held({ name: 'Second swap' });
    const both = await Promise.all([
      made.safety.decide(first.id, 'block', MODERATOR_MEMBER, SAFETY_SERVER, 'Pine Town'),
      made.safety.decide(second.id, 'block', { id: BOB, name: 'Bob' }, SAFETY_SERVER, 'Pine Town'),
    ]);
    expect(both.map((one) => one.kind)).toEqual(['done', 'done']);
    // A request made before the block, decided after it.
    await made.storage.addRequest(newRequest(7, { serverId: SAFETY_SERVER, makerId: ALICE }));
    await made.safety.decide(requestId(7), 'block', MODERATOR_MEMBER, SAFETY_SERVER, 'Pine Town');
    expect(made.storage.requests.get(requestId(7))).toMatchObject({ status: 'refused' });
    expect(made.dms.to(ALICE)).toHaveLength(1);
  });

  it('blocks and refuses in one step: a second press on the same request does nothing', async () => {
    const made = await withMeetups();
    const request = await made.held();
    await made.safety.decide(request.id, 'block', MODERATOR_MEMBER, SAFETY_SERVER);
    const later = await made.safety.decide(
      request.id,
      'block',
      { id: BOB, name: 'Bob' },
      SAFETY_SERVER,
    );
    expect(later).toMatchObject({
      kind: 'decided-before',
      request: { status: 'refused', decision: 'block', decidedBy: MODERATOR },
    });
    expect(made.dms.to(ALICE)).toHaveLength(1);
  });

  it('closes what meetups it can of a blocked member, and says what it could not', async () => {
    const made = await withMeetups();
    const request = await made.held();
    vi.spyOn(made.service, 'end').mockRejectedValueOnce(new Error('Discord is away'));
    const outcome = await made.safety.decide(request.id, 'block', MODERATOR_MEMBER, SAFETY_SERVER);
    expect(outcome).toMatchObject({ kind: 'done', closed: 0 });
    expect(made.entries.map((entry) => entry.msg)).toContain(
      'could not close a meetup of a blocked member',
    );
    expect(await made.storage.block(SAFETY_SERVER, ALICE)).toBeDefined();
    expect(made.dms.to(ALICE)).toHaveLength(1);
  });

  it('edits the post and tells the maker of a Block whose sweep fails', async () => {
    const made = await withMeetups();
    const request = await made.held();
    made.storage.failing.add('pendingOf');
    const outcome = await made.safety.decide(request.id, 'block', MODERATOR_MEMBER, SAFETY_SERVER);
    expect(outcome.kind).toBe('done');
    expect(textOf(made.postOf(request)?.message)).toContain('and its maker is blocked');
    expect(made.dms.to(ALICE)).toHaveLength(1);
    expect(made.entries.map((entry) => entry.msg)).toContain(
      'could not withdraw the other requests of a blocked member',
    );
  });

  it('approves even when the block cannot be read first: the check after the meetup decides', async () => {
    const made = await withMeetups();
    const request = await made.held();
    vi.spyOn(made.storage, 'block').mockRejectedValueOnce(new Error('the database blinked'));
    const outcome = await made.safety.decide(
      request.id,
      'approve-once',
      MODERATOR_MEMBER,
      SAFETY_SERVER,
    );
    expect(outcome).toMatchObject({ kind: 'done', request: { status: 'approved' } });
    expect(made.dms.to(ALICE)).toHaveLength(1);
  });

  it('finds the meetup of an approval the bot could not record, and settles it without a DM', async () => {
    const made = await withMeetups();
    const request = await made.held();
    made.storage.failing.add('settleApproval');
    await made.safety.decide(request.id, 'approve-once', MODERATOR_MEMBER, SAFETY_SERVER);
    const swap = made.store
      .active()
      .find((one) => one.createdById === ALICE && one.id !== made.alices.id);
    expect(swap).toBeDefined();
    made.storage.failing.clear();
    made.clock.now += 5 * MINUTE;
    await made.safety.expire();
    expect(made.storage.requests.get(request.id)).toMatchObject({
      status: 'approved',
      partyId: swap?.id,
    });
    // The approval's DM alone.
    expect(made.dms.to(ALICE)).toHaveLength(1);
  });

  it('withdraws an unrecorded approval whose maker was blocked since, and closes its meetup', async () => {
    const made = await withMeetups();
    const request = await made.held();
    made.storage.failing.add('settleApproval');
    await made.safety.decide(request.id, 'approve-once', MODERATOR_MEMBER, SAFETY_SERVER);
    made.storage.failing.clear();
    await made.storage.addBlock(SAFETY_SERVER, ALICE, MOD);
    made.clock.now += 5 * MINUTE;
    await made.safety.expire();
    expect(made.storage.requests.get(request.id)).toMatchObject({ status: 'withdrawn' });
    expect(
      made.store.active().filter((one) => one.createdById === ALICE && one.id !== made.alices.id),
    ).toEqual([]);
    expect(made.dms.to(ALICE)).toHaveLength(1);
  });

  it('makes no meetup of an approval when its maker was blocked meanwhile', async () => {
    const made = await withMeetups();
    const request = await made.held();
    // Blocked over another request a moment before the approval.
    await made.storage.addBlock(SAFETY_SERVER, ALICE, MOD);
    const outcome = await made.safety.decide(
      request.id,
      'approve',
      MODERATOR_MEMBER,
      SAFETY_SERVER,
    );
    expect(outcome).toMatchObject({ kind: 'done', request: { status: 'withdrawn' } });
    expect(made.storage.requests.get(request.id)).toMatchObject({
      status: 'withdrawn',
      decision: 'approve',
      partyId: null,
    });
    expect(made.store.active().filter((one) => one.createdById === ALICE)).toHaveLength(1);
    expect(textOf(made.postOf(request)?.message)).toContain(
      'Not posted: its maker was blocked from making meetups here meanwhile.',
    );
    expect(buttonsOf(made.postOf(request)?.message)).toEqual([]);
    expect(
      await made.storage.ruling(SAFETY_SERVER, { kind: 'stop', id: LIBRARY.id }),
    ).toBeUndefined();
    expect(made.dms.to(ALICE)).toEqual([]);
  });

  it('closes the meetup of an approval at once when its maker was blocked while it was made', async () => {
    const made = await withMeetups();
    const request = await made.held();
    const create = made.service.createMeetup.bind(made.service);
    vi.spyOn(made.service, 'createMeetup').mockImplementationOnce(async (asked) => {
      const outcome = await create(asked);
      await made.storage.addBlock(SAFETY_SERVER, ALICE, MOD);
      return outcome;
    });
    const outcome = await made.safety.decide(
      request.id,
      'approve',
      MODERATOR_MEMBER,
      SAFETY_SERVER,
    );
    expect(outcome).toMatchObject({ kind: 'done', request: { status: 'withdrawn' } });
    const swap = [...made.store.active()].find(
      (one) => one.createdById === ALICE && one.id !== made.alices.id,
    );
    expect(swap).toBeUndefined();
    expect(made.dms.to(ALICE)).toEqual([]);
  });

  it('keeps the meetup of an approval whose close failed with it, and says so in the log', async () => {
    const made = await withMeetups();
    const request = await made.held();
    const create = made.service.createMeetup.bind(made.service);
    vi.spyOn(made.service, 'createMeetup').mockImplementationOnce(async (asked) => {
      const outcome = await create(asked);
      await made.storage.addBlock(SAFETY_SERVER, ALICE, MOD);
      return outcome;
    });
    vi.spyOn(made.service, 'end').mockRejectedValueOnce(new Error('Discord is away'));
    const outcome = await made.safety.decide(
      request.id,
      'approve',
      MODERATOR_MEMBER,
      SAFETY_SERVER,
    );
    const swap = made.store
      .active()
      .find((one) => one.createdById === ALICE && one.id !== made.alices.id);
    expect(swap).toBeDefined();
    expect(outcome).toMatchObject({
      kind: 'done',
      request: { status: 'approved', partyId: swap?.id },
    });
    expect(made.storage.requests.get(request.id)).toMatchObject({
      status: 'approved',
      partyId: swap?.id,
    });
    expect(textOf(made.postOf(request)?.message)).not.toContain('Not posted');
    expect(made.entries.map((entry) => entry.msg)).toContain(
      'could not close a meetup of a blocked member',
    );
    // A blocked maker is not told of the approval; the place is allowed, as the post says.
    expect(made.dms.to(ALICE)).toEqual([]);
    expect(await made.storage.ruling(SAFETY_SERVER, { kind: 'stop', id: LIBRARY.id })).toBe(
      'allow',
    );
  });

  it('leaves the meetup of a member of staff alone after it was made, a block of theirs or not', async () => {
    const made = await withMeetups();
    await made.storage.addBlock(SAFETY_SERVER, ALICE, MOD);
    const alices = { serverId: SAFETY_SERVER, makerId: ALICE, partyId: made.alices.id };
    expect(await made.safety.closeIfBlocked({ ...alices, staff: true })).toBe(false);
    expect(made.store.active().map((one) => one.id)).toContain(made.alices.id);
    expect(await made.safety.closeIfBlocked({ ...alices, staff: false })).toBe('closed');
    expect(made.store.active().map((one) => one.id)).not.toContain(made.alices.id);
  });

  it('says a close that failed apart from one that was not needed', async () => {
    const made = await withMeetups();
    const alices = { serverId: SAFETY_SERVER, makerId: ALICE, partyId: made.alices.id };
    expect(await made.safety.closeIfBlocked({ ...alices, staff: false })).toBe(false);
    await made.storage.addBlock(SAFETY_SERVER, ALICE, MOD);
    vi.spyOn(made.service, 'end').mockRejectedValueOnce(new Error('Discord is away'));
    expect(await made.safety.closeIfBlocked({ ...alices, staff: false })).toBe('close-failed');
  });
});

describe('MeetupSafety: appeals', () => {
  async function blocked() {
    const made = await meetupSafetyWith();
    await made.storage.addBlock(SAFETY_SERVER, ALICE, { ...MOD, at: PARTY_NOW - DAY });
    const appeal = (text = 'It was a library box at the church.') =>
      made.safety.appeal({
        serverId: SAFETY_SERVER,
        nearChannelId: WEST_CHANNEL,
        member: { id: ALICE, name: 'Alice' },
        text,
      });
    return { ...made, appeal };
  }

  it('sends an appeal to the moderators with who blocked the member and when', async () => {
    const made = await blocked();
    const outcome = await made.appeal();
    expect(outcome.kind).toBe('sent');
    const [post] = made.gateway.messagesIn(MOD_CHANNEL);
    const text = textOf(post?.message);
    expect(text).toContain('### Appeal of a meetup block');
    expect(text).toContain(`**Alice** (<@${ALICE}>) asks for their block to be lifted.`);
    expect(text).toContain(
      `Blocked by **Mod** (<@${MODERATOR}>) <t:${String((PARTY_NOW - DAY) / 1000)}:F>`,
    );
    expect(text).toContain('It was a library box at the church.');
    const [stored] = made.storage.appeals.values();
    expect(buttonsOf(post?.message).map((button) => [button.label, button.customId])).toEqual([
      ['Lift block', `mappeal:${stored?.id ?? ''}:lift`],
      ['Keep block', `mappeal:${stored?.id ?? ''}:keep`],
    ]);
    expect(stored).toMatchObject({ status: 'open', messageId: post?.id, channelId: MOD_CHANNEL });
  });

  it('takes one open appeal at a time, and none from a member who is not blocked', async () => {
    const made = await blocked();
    await made.appeal();
    expect((await made.appeal()).kind).toBe('open');
    const free = await made.safety.appeal({
      serverId: SAFETY_SERVER,
      nearChannelId: WEST_CHANNEL,
      member: { id: BOB, name: 'Bob' },
      text: 'Why not?',
    });
    expect(free.kind).toBe('not-blocked');
    expect(made.gateway.messagesIn(MOD_CHANNEL)).toHaveLength(1);
  });

  it('lifts a block: the member may make meetups again and is told', async () => {
    const made = await blocked();
    const sent = await made.appeal();
    if (sent.kind !== 'sent') throw new Error(sent.kind);
    const outcome = await made.safety.decideAppeal(
      sent.appeal.id,
      'lift',
      MODERATOR_MEMBER,
      SAFETY_SERVER,
      'Pine Town',
    );
    expect(outcome.kind).toBe('done');
    expect(await made.storage.block(SAFETY_SERVER, ALICE)).toBeUndefined();
    const post = made.gateway.messagesIn(MOD_CHANNEL)[0];
    expect(textOf(post?.message)).toContain('**Lifted** by **Mod**');
    // Who blocked them stays on the post.
    expect(textOf(post?.message)).toContain(`Blocked by **Mod** (<@${MODERATOR}>)`);
    expect(buttonsOf(post?.message)).toEqual([]);
    expect(made.dms.to(ALICE).map((dm) => textOf(dm))).toEqual([
      'A moderator lifted your block on **Pine Town**: you can create meetups there again.',
    ]);
    // The first decision wins.
    expect(
      (await made.safety.decideAppeal(sent.appeal.id, 'keep', MODERATOR_MEMBER, SAFETY_SERVER))
        .kind,
    ).toBe('decided-before');
  });

  it('keeps a block: no new appeal for seven days', async () => {
    const made = await blocked();
    const sent = await made.appeal();
    if (sent.kind !== 'sent') throw new Error(sent.kind);
    await made.safety.decideAppeal(
      sent.appeal.id,
      'keep',
      MODERATOR_MEMBER,
      SAFETY_SERVER,
      'Pine Town',
    );
    expect(await made.storage.block(SAFETY_SERVER, ALICE)).toBeDefined();
    const again = PARTY_NOW + 7 * DAY;
    expect(made.dms.to(ALICE).map((dm) => textOf(dm))).toEqual([
      `A moderator kept your block on creating meetups on **Pine Town**. You can appeal again <t:${String(again / 1000)}:R>.`,
    ]);
    expect(textOf(made.gateway.messagesIn(MOD_CHANNEL)[0]?.message)).toContain(
      `they can appeal again <t:${String(again / 1000)}:R>.`,
    );
    expect(await made.appeal()).toEqual({ kind: 'wait', until: again });
    made.clock.now = again;
    expect((await made.appeal()).kind).toBe('sent');
  });

  it('takes no appeal kept meanwhile within the seven days, and keeps nothing of it', async () => {
    const made = await blocked();
    const sent = await made.appeal();
    if (sent.kind !== 'sent') throw new Error(sent.kind);
    await made.safety.decideAppeal(sent.appeal.id, 'keep', MODERATOR_MEMBER, SAFETY_SERVER);
    // The member's look before the keep saw no kept appeal.
    vi.spyOn(made.storage, 'lastKept').mockResolvedValueOnce(undefined);
    expect(await made.appeal()).toEqual({ kind: 'wait', until: PARTY_NOW + 7 * DAY });
    expect(made.storage.appeals.size).toBe(1);
    expect(made.gateway.messagesIn(MOD_CHANNEL)).toHaveLength(1);
  });

  it('closes an open appeal whose post was never made, when the member appeals again', async () => {
    const made = await blocked();
    // The bot stopped between keeping the appeal and posting it.
    await made.storage.addAppeal({
      id: requestId(150),
      serverId: SAFETY_SERVER,
      memberId: ALICE,
      memberName: 'Alice',
      text: 'Lost.',
      createdAt: PARTY_NOW - 10 * MINUTE,
    });
    expect((await made.appeal()).kind).toBe('sent');
    expect(made.storage.appeals.get(requestId(150))?.status).toBe('expired');
  });

  it('closes an appeal nobody decided in seven days with the sweep, and tells the member', async () => {
    const made = await blocked();
    const sent = await made.appeal();
    if (sent.kind !== 'sent') throw new Error(sent.kind);
    made.clock.now = PARTY_NOW + 7 * DAY - 1;
    await made.safety.expire();
    expect(made.storage.appeals.get(sent.appeal.id)?.status).toBe('open');
    made.clock.now = PARTY_NOW + 7 * DAY;
    await made.safety.expire();
    expect(made.storage.appeals.get(sent.appeal.id)?.status).toBe('expired');
    const post = made.gateway.messagesIn(MOD_CHANNEL)[0];
    expect(textOf(post?.message)).toContain('**Expired**: no moderator decided in time.');
    expect(buttonsOf(post?.message)).toEqual([]);
    expect(made.dms.to(ALICE).map((dm) => textOf(dm))).toEqual([
      'No moderator decided on your appeal of your meetup block on **Test Server** in time. You ' +
        'can appeal again: use `/meetup` there and press "Appeal…".',
    ]);
    expect((await made.appeal()).kind).toBe('sent');
  });

  it('does not wait for the edit of a stale appeal’s post before taking a new one', async () => {
    const made = await blocked();
    const first = await made.appeal();
    if (first.kind !== 'sent') throw new Error(first.kind);
    made.clock.now = PARTY_NOW + 7 * DAY;
    // Discord never answers the edit.
    vi.spyOn(made.gateway, 'editMessage').mockReturnValue(new Promise(() => undefined));
    expect(await made.safety.appealState(SAFETY_SERVER, ALICE)).toMatchObject({ kind: 'may' });
    expect(made.storage.appeals.get(first.appeal.id)?.status).toBe('expired');
  });

  it('lifts the block and decides the appeal in one step', async () => {
    const made = await blocked();
    const sent = await made.appeal();
    if (sent.kind !== 'sent') throw new Error(sent.kind);
    made.storage.failing.add('liftBlock');
    made.storage.failing.add('block');
    const outcome = await made.safety.decideAppeal(
      sent.appeal.id,
      'lift',
      MODERATOR_MEMBER,
      SAFETY_SERVER,
      'Pine Town',
    );
    expect(outcome.kind).toBe('done');
    made.storage.failing.clear();
    expect(await made.storage.block(SAFETY_SERVER, ALICE)).toBeUndefined();
    expect(made.storage.appeals.get(sent.appeal.id)?.status).toBe('lifted');
    // Who blocked them could not be read: the post and the DM come all the same.
    expect(textOf(made.gateway.messagesIn(MOD_CHANNEL)[0]?.message)).toContain('**Lifted** by');
    expect(made.dms.to(ALICE)).toHaveLength(1);
  });

  it('keeps nothing when the appeal cannot be posted', async () => {
    const made = await blocked();
    made.gateway.failing.set('sendMessage', new Error('Missing Access'));
    expect((await made.appeal()).kind).toBe('not-sent');
    expect(made.storage.appeals.size).toBe(0);
  });

  it('knows no appeal of another server', async () => {
    const made = await blocked();
    const sent = await made.appeal();
    if (sent.kind !== 'sent') throw new Error(sent.kind);
    expect(
      (await made.safety.decideAppeal(sent.appeal.id, 'lift', MODERATOR_MEMBER, OTHER_SERVER)).kind,
    ).toBe('gone');
  });
});
