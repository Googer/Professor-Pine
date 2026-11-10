import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  asV2,
  fakeChatInput,
  fakeModal,
  sent,
  type FakeInteraction,
} from '../../../test/support/fake-interactions.js';
import { WEST_CHANNEL, WEST_FORUM } from '../../../test/support/gyms.js';
import { MAKER, MOD, MODERATOR, SAFETY_SERVER } from '../../../test/support/meetup-safety-cases.js';
import {
  MOD_CHANNEL,
  meetupSafetyWith,
  type SafetyOptions,
} from '../../../test/support/meetup-safety-service.js';
import { buttonsOf, textDisplays, textOf } from '../../../test/support/messages.js';
import { BOB } from '../../../test/support/parties.js';
import { createdTrain } from '../../../test/support/party-service.js';
import { createTestContext } from '../../../test/support/test-context.js';
import { DIALOG_READ_MS, SLOW_READ } from '../../discord/dialog.js';
import { InteractionRouter } from '../../discord/router.js';
import type { MeetupParty } from '../../domain/party/party.js';
import { name } from '../parties/name.js';
import { info, INFO_INPUT, infoControls, infoForm } from './info.js';
import { BLOCKED_FROM_CHANGING, NOT_YOUR_MEETUP } from './meetup-changes.js';

const MODERATOR_MEMBER = { id: MODERATOR, name: 'Mod' };

/**
 * Alice's (`MAKER`) book swap, held and then approved once, its post on the fake gateway; the
 * router knows `/name`, `/info` and the form of `/info`.
 */
async function approved(options: SafetyOptions = {}) {
  const made = await meetupSafetyWith(options);
  const request = await made.held();
  await made.safety.decide(request.id, 'approve-once', MODERATOR_MEMBER, SAFETY_SERVER);
  const kept = await made.storage.request(request.id);
  if (kept?.partyId === null || kept?.partyId === undefined) throw new Error('not approved');
  const partyId = kept.partyId;
  return { ...wired(made, partyId), request: kept };
}

type Safe = Awaited<ReturnType<typeof meetupSafetyWith>>;

function wired(made: Safe, partyId: string) {
  const { ctx } = createTestContext({
    partyService: made.service,
    attendance: made.attendance,
    timedParties: made.timed,
    parties: made.store,
    regions: made.regions,
    meetupSafety: made.safety,
  });
  const router = new InteractionRouter(ctx, [name, info], [infoControls]);
  const current = (): MeetupParty => {
    const party = made.store.get(partyId);
    if (party?.type !== 'meetup') throw new Error('the meetup is gone');
    return party;
  };
  const postId = current().forumPostId;
  const where = { channelId: postId ?? '', thread: { parentId: WEST_FORUM } };
  const handle = async (interaction: FakeInteraction) => {
    await router.handle(interaction as never);
    return interaction;
  };
  const rename = (text: string, extra: object = {}) =>
    handle(
      fakeChatInput({
        commandName: 'name',
        ...where,
        userId: MAKER,
        displayName: 'Alice',
        options: { name: text },
        ...extra,
      }),
    );
  const openInfo = (extra: object = {}) =>
    handle(
      fakeChatInput({
        commandName: 'info',
        ...where,
        userId: MAKER,
        displayName: 'Alice',
        ...extra,
      }),
    );
  const submit = (text: string, extra: object = {}) =>
    handle(
      fakeModal({
        customId: infoForm(current()).custom_id,
        userId: MAKER,
        displayName: 'Alice',
        fields: { [INFO_INPUT]: text },
        ...where,
        ...extra,
      }),
    );
  /** What the moderators' channel holds beyond the request's own post. */
  const notices = async (requestPost: string) => {
    await made.safety.flushChanges();
    return made.gateway.messagesIn(MOD_CHANNEL).filter((message) => message.id !== requestPost);
  };
  return { ...made, partyId, postId, current, rename, openInfo, submit, notices };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("who may change a meetup's name and information on Discord", () => {
  it('lets its maker rename it', async () => {
    const made = await approved();
    const used = await made.rename('Paperback swap');
    expect(sent(used.reply).content).toBe('This meetup is now called **Paperback swap**.');
    expect(made.current().timed.name).toBe('Paperback swap');
  });

  it('refuses /name to anybody else in the post, and changes nothing', async () => {
    const made = await approved();
    const used = await made.rename('Mine now', { userId: BOB, displayName: 'Bob' });
    expect(sent(used.reply).content).toBe(NOT_YOUR_MEETUP);
    expect(made.current().timed.name).toBe('Book swap');
  });

  it('lets staff change it, without a sign-up', async () => {
    const made = await approved();
    const used = await made.rename('Staff swap', {
      userId: BOB,
      displayName: 'Bob',
      roleNames: ['Moderator'],
    });
    expect(sent(used.reply).content).toBe('This meetup is now called **Staff swap**.');
    const form = await made.openInfo({ userId: BOB, roleNames: ['Moderator'] });
    expect(form.showModal).toHaveBeenCalledOnce();
  });

  it('opens no form of /info for anybody else', async () => {
    const made = await approved();
    const used = await made.openInfo({ userId: BOB, displayName: 'Bob' });
    expect(used.showModal).not.toHaveBeenCalled();
    expect(sent(used.reply).content).toBe(NOT_YOUR_MEETUP);
  });

  it('refuses the Submit of a form nobody else may send, and gives the text back', async () => {
    const made = await approved();
    const used = await made.submit('Mine now.', { userId: BOB, displayName: 'Bob' });
    expect(sent(used.reply).content).toBe(
      `${NOT_YOUR_MEETUP}\nWhat you wrote:\n\`\`\`\nMine now.\n\`\`\``,
    );
    expect(made.current().meetup.description).toBe('Bring a book.');
  });

  it('refuses a blocked maker /name, and /info with Appeal…, staff never blocked', async () => {
    const made = await approved();
    await made.storage.addBlock(SAFETY_SERVER, MAKER, MOD);
    const renamed = await made.rename('Still mine');
    expect(textOf(asV2(sent(renamed.reply)))).toContain(BLOCKED_FROM_CHANGING);
    expect(buttonsOf(asV2(sent(renamed.reply))).map((button) => button.label)).toEqual(['Appeal…']);
    expect(made.current().timed.name).toBe('Book swap');
    const form = await made.openInfo();
    expect(form.showModal).not.toHaveBeenCalled();
    expect(textOf(asV2(sent(form.reply)))).toContain(BLOCKED_FROM_CHANGING);
    // The block holds at the Submit too: it may have come with the form open.
    const submitted = await made.submit('Still mine.');
    expect(sent(submitted.reply).content).toContain(BLOCKED_FROM_CHANGING);
    expect(sent(submitted.reply).content).toContain('Still mine.');
    expect(made.current().meetup.description).toBe('Bring a book.');
    // Blocked staff is no such thing: nothing is read for them.
    await made.storage.addBlock(SAFETY_SERVER, BOB, MOD);
    const staff = await made.rename('Staff swap', {
      userId: BOB,
      roleNames: ['Moderator'],
    });
    expect(sent(staff.reply).content).toBe('This meetup is now called **Staff swap**.');
  });

  it("answers /info in time when the block's read is slow: no form, and it may be tried again", async () => {
    const made = await approved();
    const asked = Promise.withResolvers<undefined>();
    made.storage.block = () => {
      asked.resolve(undefined);
      return new Promise(() => undefined);
    };
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const used = made.openInfo();
    await asked.promise;
    await vi.advanceTimersByTimeAsync(DIALOG_READ_MS);
    const interaction = await used;
    expect(interaction.showModal).not.toHaveBeenCalled();
    expect(sent(interaction.reply).content).toBe(SLOW_READ);
  });

  it("keeps a train's /name for anybody in the post", async () => {
    const train = await createdTrain();
    const { ctx } = createTestContext({
      partyService: train.service,
      attendance: train.attendance,
      timedParties: train.timed,
      parties: train.store,
      regions: train.regions,
    });
    const router = new InteractionRouter(ctx, [name], []);
    const used = fakeChatInput({
      commandName: 'name',
      channelId: train.postId,
      thread: { parentId: WEST_FORUM },
      userId: BOB,
      displayName: 'Bob',
      options: { name: 'Sunday legendaries' },
    });
    await router.handle(used as never);
    expect(sent(used.reply).content).toBe('This train is now called **Sunday legendaries**.');
  });
});

describe("the moderators told of an approved meetup's changes", () => {
  it('tells them of a new name: who, the name, and links to the post and the request', async () => {
    const made = await approved();
    await made.rename('**Paperback** swap');
    const [notice, more] = await made.notices(made.request.messageId);
    expect(more).toBeUndefined();
    const text = textDisplays(notice?.message).join('\n');
    expect(text).toContain('**Alice**');
    expect(text).toContain('\\*\\*Paperback\\*\\* swap');
    const links = buttonsOf(notice?.message).map((button) => ('url' in button ? button.url : ''));
    expect(links).toEqual([
      `https://discord.com/channels/${SAFETY_SERVER}/${made.postId ?? ''}`,
      `https://discord.com/channels/${SAFETY_SERVER}/${MOD_CHANNEL}/${made.request.messageId}`,
    ]);
  });

  it('tells them of new information, and of information removed', async () => {
    const made = await approved();
    await made.submit('Bring **two** books.');
    await made.submit('  ');
    const [changed, removed] = await made.notices(made.request.messageId);
    expect(textDisplays(changed?.message).join('\n')).toContain('Bring \\*\\*two\\*\\* books.');
    expect(textDisplays(removed?.message).join('\n')).toContain('removed its information');
  });

  it("tells them of staff's own changes too", async () => {
    const made = await approved();
    await made.rename('Staff swap', { userId: BOB, displayName: 'Bob', roleNames: ['Moderator'] });
    const [notice] = await made.notices(made.request.messageId);
    expect(textDisplays(notice?.message).join('\n')).toContain('**Bob**');
  });

  it('tells nobody when nothing changed', async () => {
    const made = await approved();
    await made.rename('Book swap');
    await made.submit('Bring a book.');
    expect(await made.notices(made.request.messageId)).toEqual([]);
  });

  it('tells nobody of a meetup that never needed an approval', async () => {
    const made = await meetupSafetyWith();
    const outcome = await made.service.createMeetup({
      name: 'Picnic',
      creatorId: MAKER,
      regionChannelId: WEST_CHANNEL,
    });
    if (outcome.kind !== 'created') throw new Error(outcome.kind);
    const parts = wired(made, outcome.party.id);
    const used = await parts.rename('Lake picnic');
    expect(sent(used.reply).content).toBe('This meetup is now called **Lake picnic**.');
    expect(await parts.notices('none')).toEqual([]);
  });

  it('never fails the change when the moderators cannot be told: it is logged', async () => {
    const made = await approved();
    made.storage.failing.add('approvedRequestOf');
    const used = await made.rename('Paperback swap');
    expect(sent(used.reply).content).toBe('This meetup is now called **Paperback swap**.');
    await made.safety.flushChanges();
    expect(made.entries.map((entry) => entry.msg)).toContain(
      'could not tell the moderators of a change of an approved meetup',
    );
  });

  it('answers without waiting for the moderators to be told', async () => {
    const made = await approved();
    const held = Promise.withResolvers<undefined>();
    const original = made.storage.approvedRequestOf.bind(made.storage);
    made.storage.approvedRequestOf = async (...args) => {
      await held.promise;
      return original(...args);
    };
    const used = await made.rename('Paperback swap');
    expect(sent(used.reply).content).toBe('This meetup is now called **Paperback swap**.');
    held.resolve(undefined);
    expect(await made.notices(made.request.messageId)).toHaveLength(1);
  });

  it('does nothing while the safety is off', async () => {
    const made = await meetupSafetyWith({ moderation: null });
    const outcome = await made.service.createMeetup({
      name: 'Picnic',
      creatorId: MAKER,
      regionChannelId: WEST_CHANNEL,
    });
    if (outcome.kind !== 'created') throw new Error(outcome.kind);
    const parts = wired(made, outcome.party.id);
    await parts.rename('Lake picnic');
    await made.safety.flushChanges();
    expect(made.storage.requests.size).toBe(0);
    expect(made.entries.map((entry) => entry.msg)).not.toContain(
      'could not tell the moderators of a change of an approved meetup',
    );
  });
});
