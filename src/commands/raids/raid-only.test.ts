import { describe, expect, it } from 'vitest';
import {
  fakeAutocomplete,
  fakeButton,
  fakeChatInput,
  fakeModal,
  sent,
  type FakeInteraction,
} from '../../../test/support/fake-interactions.js';
import { WEST_FORUM } from '../../../test/support/gyms.js';
import { ALICE, testMeetup } from '../../../test/support/parties.js';
import { partyServiceWith } from '../../../test/support/party-service.js';
import { createTestContext } from '../../../test/support/test-context.js';
import { partyButtons } from '../../components/party.js';
import type { CommandModule } from '../../discord/command.js';
import { InteractionRouter } from '../../discord/router.js';
import { TIME_INPUT } from '../../render/party-controls.js';
import { boss, moveset } from './boss.js';
import { duration, hatch } from './change.js';
import { location } from './location.js';

const POST = '300000000000000077';
const NOT_A_RAID = 'This is the post of a meetup: that only works in the post of a raid.';
const all: CommandModule[] = [hatch, duration, boss, moveset, location];

/** A meetup with a post, and the commands that are about a raid as such. */
async function inMeetup() {
  const meetup = { ...testMeetup(), forumChannelId: WEST_FORUM, forumPostId: POST };
  const made = await partyServiceWith([meetup]);
  const { ctx } = createTestContext({
    partyService: made.service,
    attendance: made.attendance,
    raids: made.raids,
    parties: made.store,
    regions: made.regions,
  });
  const router = new InteractionRouter(ctx, all, [partyButtons]);
  const handle = async (interaction: FakeInteraction) => {
    await router.handle(interaction as never);
    return interaction;
  };
  const where = { channelId: POST, thread: { parentId: WEST_FORUM }, userId: ALICE };
  const answer = async (commandName: string, options: Record<string, string | number>) =>
    sent((await handle(fakeChatInput({ commandName, ...where, options }))).reply).content;
  return { ...made, meetup, handle, answer, where };
}

describe('what is only for raids, in the post of a meetup', () => {
  it('refuses every command about a raid as such, naming the kind of post', async () => {
    const made = await inMeetup();
    expect(await made.answer('hatch', { time: '30' })).toBe(NOT_A_RAID);
    expect(await made.answer('duration', { minutes: 30 })).toBe(NOT_A_RAID);
    // A train has a boss too: `/boss` says so.
    expect(await made.answer('boss', { pokemon: 'yveltal' })).toBe(
      'This is the post of a meetup: that only works in the post of a raid, max battle or train.',
    );
    expect(await made.answer('moveset', { quick: 'snarl' })).toBe(NOT_A_RAID);
    expect(await made.answer('location', { gym: 'Library' })).toBe(NOT_A_RAID);
    // Nothing was written and nothing said.
    expect(made.store.get(made.meetup.id)).toBe(made.meetup);
    await made.attendance.flush();
    expect(made.gateway.messagesIn(POST)).toEqual([]);
  });

  it('offers no moves there', async () => {
    const made = await inMeetup();
    const typing = await made.handle(
      fakeAutocomplete({
        commandName: 'moveset',
        ...made.where,
        focused: '',
        focusedName: 'quick',
      }),
    );
    expect(typing.respond).toHaveBeenCalledWith([]);
  });

  it('refuses the "Set time" button and its form, which only a raid has', async () => {
    const made = await inMeetup();
    const click = await made.handle(
      fakeButton({ customId: `party:${made.meetup.id}:time`, ...made.where }),
    );
    expect(click.showModal).not.toHaveBeenCalled();
    expect(sent(click.reply).content).toBe(NOT_A_RAID);
    const form = await made.handle(
      fakeModal({
        customId: `party:${made.meetup.id}:time:hatch`,
        ...made.where,
        fields: { [TIME_INPUT]: '30' },
      }),
    );
    expect(sent(form.reply).content).toBe(NOT_A_RAID);
    expect(made.store.get(made.meetup.id)).toBe(made.meetup);
  });
});
