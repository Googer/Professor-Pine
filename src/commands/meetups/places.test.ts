import { MessageFlags, PermissionFlagsBits } from 'discord.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  answered,
  asV2,
  fakeButton,
  fakeChatInput,
  sent,
  type FakeInteraction,
} from '../../../test/support/fake-interactions.js';
import { WEST_CHANNEL } from '../../../test/support/gyms.js';
import { MOD, MODERATOR, newAppeal } from '../../../test/support/meetup-safety-cases.js';
import { MOD_CHANNEL } from '../../../test/support/meetup-safety-service.js';
import { buttonsOf, textOf } from '../../../test/support/messages.js';
import { BOB, CAROL, PARTY_NOW } from '../../../test/support/parties.js';
import { reportedMeetup } from '../../../test/support/reports-service.js';
import { createTestContext } from '../../../test/support/test-context.js';
import { FakeMemberDirectory } from '../../../test/support/members.js';
import type { V2Message } from '../../discord/party-gateway.js';
import { InteractionRouter } from '../../discord/router.js';
import { places, placesControls } from './places.js';

const KEY = { kind: 'gym' as const, id: '2' };

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(PARTY_NOW);
});
afterEach(() => {
  vi.useRealTimers();
});

async function setup() {
  const made = await reportedMeetup();
  const members = new FakeMemberDirectory();
  const { ctx } = createTestContext({
    members,
    partyService: made.service,
    attendance: made.attendance,
    parties: made.store,
    regions: made.regions,
    reports: made.reports,
    meetupSafety: made.safety,
  });
  const router = new InteractionRouter(ctx, [places], [placesControls]);
  const handle = async <I extends FakeInteraction>(interaction: I) => {
    await router.handle(interaction as never);
    return interaction;
  };
  const run = (options: Record<string, string> = {}, roleNames = ['Moderator']) =>
    handle(
      fakeChatInput({
        commandName: 'places',
        userId: MODERATOR,
        displayName: 'Mod',
        roleNames,
        channelId: WEST_CHANNEL,
        options,
      }),
    );
  const shown = (used: FakeInteraction): V2Message => asV2(answered(used));
  const press = (customId: string) =>
    handle(
      fakeButton({
        customId,
        userId: MODERATOR,
        displayName: 'Mod',
        roleNames: ['Moderator'],
        ephemeralMessage: true,
        v2Message: true,
      }),
    );
  return { ...made, members, run, shown, press };
}

describe('/places', () => {
  it('is for staff alone, hidden from the others by Manage Messages', async () => {
    expect(places.data.toJSON().default_member_permissions).toBe(
      String(PermissionFlagsBits.ManageMessages),
    );
    const made = await setup();
    const used = await made.run({}, ['Valor']);
    expect(sent(used.reply)).toEqual({
      content: 'Only admins and moderators can do that.',
      flags: MessageFlags.Ephemeral,
    });
  });

  it('shows a place’s ruling, who made it, when and from where, and undoes it', async () => {
    const made = await setup();
    const held = await made.held({
      place: {
        kind: 'gym',
        id: '2',
        title: 'Old Stone Fountain',
        lat: 40.06,
        lon: -80.06,
        address: null,
        image: null,
      },
    });
    await made.safety.decide(
      held.id,
      'refuse-forever',
      { id: MODERATOR, name: 'Mod' },
      made.gateway.guildId,
    );
    const page = made.shown(await made.run({ place: 'gym:2' }));
    const text = textOf(page);
    expect(text).toContain('### Old Stone Fountain');
    expect(text).toContain(`Refused by **Mod** (<@${MODERATOR}>)`);
    expect(text).toContain(`[a meetup request](<https://discord.com/channels/`);
    expect(buttonsOf(page).map((button) => [button.label, button.customId])).toEqual([
      ['Undo ruling', 'places:gym:undo:2'],
    ]);
    const undone = await made.press('places:gym:undo:2');
    expect(textOf(asV2(sent(undone.editReply)))).toContain(
      `Undone by **Mod** (<@${MODERATOR}>): a meetup there is checked by its name again.`,
    );
    expect(await made.storage.ruling(made.gateway.guildId, KEY)).toBeUndefined();
    expect(made.entries.some((entry) => entry.msg === 'a ruling of a place was undone')).toBe(true);
    expect(textOf(made.shown(await made.run({ place: 'gym:2' })))).toContain(
      'No ruling: a meetup there is checked by its name.',
    );
  });

  it('lists the rulings and everything open, each with the way to its post', async () => {
    const made = await setup();
    const server = made.gateway.guildId;
    await made.storage.rule(server, KEY, 'refuse', MOD);
    await made.storage.rule(server, { kind: 'gym', id: '3' }, 'allow', MOD);
    await made.held();
    await made.storage.addBlock(server, BOB, MOD);
    await made.storage.addAppeal(newAppeal(1, { serverId: server, memberId: BOB }));
    await made.report();
    const page = made.shown(await made.run());
    const text = textOf(page);
    for (const section of [
      '**Refused places** (1)',
      '**Allowed places** (1)',
      '**Pending requests** (1)',
      '**Blocked members** (1)',
      '**Open appeals** (1)',
      '**Open reports** (1)',
    ]) {
      expect(text).toContain(section);
    }
    expect(text).toContain('**Old Stone Fountain** (gym)');
    expect(text).toContain(`[post](<https://discord.com/channels/${server}/${MOD_CHANNEL}/`);
    expect(buttonsOf(page).map((button) => button.label)).toContain('Lift block');
  });

  it('names a blocked member by the name they had, else as the server knows them now', async () => {
    const made = await setup();
    await made.storage.addBlock(made.gateway.guildId, CAROL, MOD, 'Carol');
    await made.storage.addBlock(made.gateway.guildId, BOB, MOD);
    made.members.add(BOB, 'Bob Now');
    const text = textOf(made.shown(await made.run()));
    expect(text).toContain(`**Carol** (<@${CAROL}>) blocked by`);
    expect(text).toContain(`**Bob Now** (<@${BOB}>) blocked by`);
  });

  it('lifts a block from the list, closes their open appeal, tells the member once', async () => {
    const made = await setup();
    await made.storage.addBlock(made.gateway.guildId, CAROL, MOD);
    const appealed = await made.safety.appeal({
      serverId: made.gateway.guildId,
      nearChannelId: WEST_CHANNEL,
      member: { id: CAROL, name: 'Carol' },
      text: 'Please lift it.',
    });
    if (appealed.kind !== 'sent') throw new Error(appealed.kind);
    const page = made.shown(await made.run());
    const lift = buttonsOf(page).find((button) => button.label === 'Lift block')?.customId ?? '';
    expect(lift).toBe(`places:${CAROL}:lift:0`);
    const lifted = await made.press(lift);
    // Acknowledged before the work, the list shown again in its place.
    expect(lifted.deferUpdate).toHaveBeenCalled();
    expect(textOf(asV2(sent(lifted.editReply)))).not.toContain('**Blocked members**');
    expect(await made.storage.appeal(appealed.appeal.id)).toMatchObject({ status: 'lifted' });
    const appealPost = made.gateway
      .messagesIn(MOD_CHANNEL)
      .find((one) => one.id === appealed.appeal.messageId)?.message;
    expect(textOf(appealPost)).toContain('**Lifted**');
    expect(made.dms.to(CAROL)).toHaveLength(1);
    expect(await made.storage.block(made.gateway.guildId, CAROL)).toBeUndefined();
    expect(textOf(made.dms.to(CAROL)[0])).toContain('A moderator lifted your block');
  });

  it('pages a long list with arrows', async () => {
    const made = await setup();
    for (let id = 1; id <= 12; id++) {
      await made.storage.rule(made.gateway.guildId, { kind: 'gym', id: String(id) }, 'refuse', {
        ...MOD,
        at: MOD.at + id,
      });
    }
    const first = made.shown(await made.run());
    expect(textOf(first)).toContain('Page 1 of 2');
    expect(buttonsOf(first).map((button) => [button.label, button.customId])).toEqual([
      ['Next ▶', 'places:list:page:1'],
    ]);
    const second = asV2(sent((await made.press('places:list:page:1')).editReply));
    expect(textOf(second)).toContain('Page 2 of 2');
    expect(buttonsOf(second).map((button) => [button.label, button.customId])).toEqual([
      ['◀ Previous', 'places:list:page:0'],
    ]);
  });

  it('closes the place’s open ask when its ruling is undone, telling nobody', async () => {
    const made = await setup();
    const server = made.gateway.guildId;
    const KEY = { kind: 'gym' as const, id: '2' };
    await made.storage.rule(server, KEY, 'refuse', { ...MOD, at: PARTY_NOW - 20 * 86_400_000 });
    const asked = await made.safety.askAboutPlace({
      serverId: server,
      nearChannelId: WEST_CHANNEL,
      member: { id: BOB, name: 'Bob' },
      key: KEY,
      text: 'A park.',
    });
    if (asked.kind !== 'sent') throw new Error(asked.kind);
    await made.press('places:gym:undo:2');
    expect(await made.storage.ask(asked.ask.id)).toMatchObject({ status: 'undone' });
    const askPost = made.gateway
      .messagesIn(MOD_CHANNEL)
      .find((one) => one.id === asked.ask.messageId)?.message;
    expect(textOf(askPost)).toContain('**Ruling undone**');
    expect(made.dms.to(BOB)).toEqual([]);
  });

  it('says that the place option names a pin, which has no ruling', async () => {
    const made = await setup();
    const used = await made.run({ place: '40.05,-80.05' });
    expect(textOf(made.shown(used))).toContain('A pin has no ruling');
  });
});
