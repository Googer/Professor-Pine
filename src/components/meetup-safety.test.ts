import { MessageFlags } from 'discord.js';
import { describe, expect, it } from 'vitest';
import { fakeButton, sent, type FakeInteraction } from '../../test/support/fake-interactions.js';
import { MODERATOR, requestId, SAFETY_PIN } from '../../test/support/meetup-safety-cases.js';
import { MOD_CHANNEL, meetupSafetyWith } from '../../test/support/meetup-safety-service.js';
import { textOf } from '../../test/support/messages.js';
import { ALICE, BOB } from '../../test/support/parties.js';
import { createTestContext } from '../../test/support/test-context.js';
import { InteractionRouter, STALE_COMPONENT } from '../discord/router.js';
import { meetupSafetyControls, SAFETY_THROTTLE } from './meetup-safety.js';

async function setup() {
  const made = await meetupSafetyWith();
  const { ctx } = createTestContext({
    partyService: made.service,
    attendance: made.attendance,
    parties: made.store,
    regions: made.regions,
    meetupSafety: made.safety,
  });
  const router = new InteractionRouter(ctx, [], [meetupSafetyControls]);
  /** A press of a button of a request's post, by the moderator unless `extra` says otherwise. */
  const press = async (
    id: string,
    action: string,
    extra: object = {},
  ): Promise<FakeInteraction> => {
    const interaction = fakeButton({
      customId: `msafety:${id}:${action}`,
      channelId: MOD_CHANNEL,
      userId: MODERATOR,
      displayName: 'Mod',
      roleNames: ['Moderator'],
      v2Message: true,
      ...extra,
    });
    await router.handle(interaction as never);
    return interaction;
  };
  const meetups = () => made.store.active().filter((party) => party.type === 'meetup');
  return { ...made, ctx, press, meetups };
}

/** What the presser was told, privately. */
function told(used: FakeInteraction): string | undefined {
  for (const responder of [used.editReply, used.reply, used.followUp]) {
    if (responder.mock.calls.length > 0) return sent(responder).content;
  }
  return undefined;
}

describe('the buttons of a moderators’ post', () => {
  it('approves, and tells the moderator privately what came of it', async () => {
    const made = await setup();
    const request = await made.held();
    const used = await made.press(request.id, 'approve');
    expect(used.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
    const [party] = made.meetups();
    expect(told(used)).toBe(
      `Approved: the meetup is posted (<#${party?.forumPostId ?? ''}>), and the place is ` +
        'allowed from now on. Its maker is told.',
    );
  });

  it('says what each decision did', async () => {
    const made = await setup();
    const once = await made.held({ place: SAFETY_PIN });
    const refuse = await made.held({ name: 'Two' });
    const forGood = await made.held({ name: 'Three' });
    const approved = await made.press(once.id, 'approve-once');
    expect(told(approved)).toBe(
      `Approved once: the meetup is posted (<#${made.meetups()[0]?.forumPostId ?? ''}>). ` +
        'Its maker is told.',
    );
    expect(told(await made.press(refuse.id, 'refuse'))).toBe('Refused. Its maker is told.');
    expect(told(await made.press(forGood.id, 'refuse-forever'))).toBe(
      'Refused, and no meetup can be held at this place from now on. Its maker is told.',
    );
  });

  it('blocks the member, and says what went with it', async () => {
    const made = await setup();
    const request = await made.held();
    await made.held({ name: 'Second swap' });
    expect(told(await made.press(request.id, 'block'))).toBe(
      `Refused, and **Alice** (<@${ALICE}>) is blocked from creating meetups here (1 other ` +
        'request withdrawn, no meetup closed). They are told, and may appeal.',
    );
    expect(textOf(made.dms.to(ALICE)[0])).toContain('creating meetups on **Test Server**');
  });

  it('tells a later press who decided what', async () => {
    const made = await setup();
    const request = await made.held();
    await made.press(request.id, 'refuse');
    const later = await made.press(request.id, 'approve', { userId: BOB, displayName: 'Bob' });
    expect(told(later)).toMatch(
      new RegExp(
        `^\\*\\*Mod\\*\\* \\(<@${MODERATOR}>\\) decided this already <t:\\d+:R>: refused\\.$`,
      ),
    );
    expect(made.meetups()).toEqual([]);
  });

  it('refuses anybody but staff, privately and without counting', async () => {
    const made = await setup();
    const request = await made.held();
    for (let n = 0; n < SAFETY_THROTTLE.uses + 1; n++) {
      const used = await made.press(request.id, 'approve', { userId: ALICE, roleNames: [] });
      expect(told(used)).toBe('Only admins and moderators can do that.');
    }
    expect(made.storage.requests.get(request.id)?.status).toBe('pending');
  });

  it('answers a press it does not know as a control no longer active', async () => {
    const made = await setup();
    const request = await made.held();
    expect(told(await made.press(request.id, 'cheer'))).toBe(STALE_COMPONENT);
    expect(told(await made.press(requestId(9), 'approve'))).toBe(STALE_COMPONENT);
    expect(told(await made.press(request.id, 'approve'))).toMatch(/^Approved/);
  });

  it('says that nobody decided in time of a request whose time is up', async () => {
    const made = await setup();
    const request = await made.held();
    made.clock.now = request.expiresAt;
    expect(told(await made.press(request.id, 'approve'))).toBe(
      'This request has expired: nobody decided in time.',
    );
    expect(made.meetups()).toEqual([]);
  });

  it('says that a pin has no ruling', async () => {
    const made = await setup();
    const request = await made.held({ place: SAFETY_PIN });
    expect(told(await made.press(request.id, 'approve'))).toBe(
      'A pin has no ruling: approve it or refuse it for this meetup alone.',
    );
  });
});
