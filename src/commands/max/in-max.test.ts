import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dialogChoices, shownDialog } from '../../../test/support/dialogs.js';
import {
  fakeAutocomplete,
  fakeButton,
  fakeChatInput,
  sent,
  type FakeInteraction,
} from '../../../test/support/fake-interactions.js';
import { WEST_FORUM } from '../../../test/support/gyms.js';
import { maxBossServiceWith } from '../../../test/support/max-boss-service.js';
import { buttonNames } from '../../../test/support/messages.js';
import {
  ALICE,
  at,
  PARTY_NOW,
  REPORTER,
  TEST_PIN,
  TEST_SPOT,
  withAttendees,
} from '../../../test/support/parties.js';
import { reportedMax, type ServiceOverrides } from '../../../test/support/party-service.js';
import { keptRow } from '../../../test/support/wayspot-cases.js';
import { wayspotsWith } from '../../../test/support/wayspots.js';
import type { MaxReport } from '../../services/party-service.js';
import { createTestContext } from '../../../test/support/test-context.js';
import { partyButtons } from '../../components/party.js';
import type { AppContext } from '../../app-context.js';
import type { CommandModule } from '../../discord/command.js';
import { encodeCustomId } from '../../discord/custom-id.js';
import { InteractionRouter } from '../../discord/router.js';
import { PartyStatus } from '../../domain/party/status.js';
import { done, join } from '../parties/attendance.js';
import { meetControls } from '../parties/meet-dialog.js';
import { meet } from '../parties/meet.js';
import { deleteParty } from '../parties/delete.js';
import { where } from '../parties/status.js';
import { boss } from '../raids/boss.js';
import { CHANGE_THROTTLE, end, hatch } from '../raids/change.js';

/** The zone of the test settings, every server's here. */
const ZONE = 'America/New_York';

const all: CommandModule[] = [join, done, meet, end, hatch, boss, where, deleteParty];
const stamp = (time: number, style = 't') => `<t:${time / 1000}:${style}>`;

/** A Dynamax Machamp (2★) battle at the gazebo until 21:00 of the test day, and its commands. */
async function setup(
  report: Partial<MaxReport> = {},
  more: Partial<AppContext> = {},
  service: ServiceOverrides = {},
) {
  const made = await reportedMax(report, service);
  const bosses = await maxBossServiceWith();
  await bosses.service.sync();
  bosses.state.now = at('2026-10-22T14:00');
  const { ctx } = createTestContext({
    partyService: made.service,
    attendance: made.attendance,
    maxBattles: made.maxes,
    parties: made.store,
    regions: made.regions,
    maxBosses: bosses.service,
    maxBossAdmin: bosses.service,
    ...more,
  });
  const router = new InteractionRouter(ctx, all, [partyButtons, meetControls]);
  const handle = async (interaction: FakeInteraction) => {
    await router.handle(interaction as never);
    return interaction;
  };
  const place = { channelId: made.postId, thread: { parentId: WEST_FORUM } };
  const answer = async (
    commandName: string,
    options: Record<string, string> = {},
    user = REPORTER,
  ): Promise<string | undefined> => {
    const used = await handle(fakeChatInput({ commandName, ...place, userId: user, options }));
    for (const responder of [used.reply, used.editReply, used.followUp]) {
      if (responder.mock.calls.length > 0) return sent(responder).content;
    }
    return undefined;
  };
  return { ...made, ctx, handle, answer, place, bosses: bosses.service };
}

describe('the commands in the post of a max battle (plan 8X-3)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'], now: PARTY_NOW });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('/end sets its end within the day, never past the last battle time', async () => {
    const made = await setup();
    expect(await made.answer('end', { time: '3pm' })).toBe(
      `This max battle now ends at ${stamp(at('2026-10-13T15:00'))}.`,
    );
    expect(made.current().endTime).toBe(at('2026-10-13T15:00'));
    expect(await made.answer('end', { time: '10pm' })).toMatch(
      /^"10pm" cannot be the time the battle ends/,
    );
    expect(await made.answer('end', { time: 'none' })).toBe(
      'A max battle always has an end: give the time it ends.',
    );
  });

  it('/boss changes its boss within Dynamax, the tier with it, and refuses Gigantamax', async () => {
    const made = await setup();
    expect(await made.answer('boss', { pokemon: 'Sneasel' })).toBe(
      'The boss of this max battle is now Dynamax Sneasel (1★).',
    );
    expect(made.current().max).toMatchObject({ boss: { key: 'sneasel' }, tier: 'D1' });
    expect(await made.answer('boss', { pokemon: 'Gigantamax Machamp' })).toBe(
      'A Dynamax battle cannot become a Gigantamax one, nor the other way round (the lobby size ' +
        'would change). Report the new battle with `/max`.',
    );
  });

  it('/boss asks the tier of a boss on no list, as /max does, and takes `tier:` (plan 8X-F)', async () => {
    const made = await setup();
    expect(made.bosses.bosses(ZONE).some((listed) => listed.entry?.key === 'alakazam')).toBe(false);
    // Never the battle's own tier in silence (staging of 8X: Machamp became "(2★)").
    expect(await made.answer('boss', { pokemon: 'Alakazam' })).toBe('Which tier? Add `tier:`.');
    expect(made.current().max).toMatchObject({ boss: { key: 'machamp' }, tier: 'D2' });
    expect(await made.answer('boss', { pokemon: 'Alakazam', tier: 'D4' })).toBe(
      'The boss of this max battle is now Dynamax Alakazam (4★).',
    );
    expect(made.current().max).toMatchObject({ boss: { key: 'alakazam' }, tier: 'D4' });
    // A listed boss needs none, and a tier of the other kind is refused by the battle.
    expect(await made.answer('boss', { pokemon: 'Sneasel' })).toBe(
      'The boss of this max battle is now Dynamax Sneasel (1★).',
    );
    expect(await made.answer('boss', { pokemon: 'Alakazam', tier: 'G' })).toBe(
      'Alakazam is no Gigantamax boss.',
    );
  });

  // Review r0, F-A1: listed only as Gigantamax, it would be read at G and refused by the battle.
  // Final review of 8X-F, F6: asking the tier uses up nothing of /boss's window.
  it('/boss gives back the use when it asks the tier', async () => {
    const made = await setup();
    for (let ask = 0; ask <= CHANGE_THROTTLE.uses; ask++) {
      expect(await made.answer('boss', { pokemon: 'Alakazam' })).toBe('Which tier? Add `tier:`.');
    }
    expect(await made.answer('boss', { pokemon: 'Sneasel' })).toBe(
      'The boss of this max battle is now Dynamax Sneasel (1★).',
    );
  });

  it('/boss asks the tier in a Dynamax battle of a boss listed only as Gigantamax', async () => {
    const made = await setup();
    const ids = { pokemonId: 'BLASTOISE', form: null, createdBy: REPORTER, expiresAt: null };
    await made.bosses.addOverride({ ...ids, action: 'add', tier: 'G', shiny: null });
    expect(await made.answer('boss', { pokemon: 'Blastoise' })).toBe('Which tier? Add `tier:`.');
    expect(await made.answer('boss', { pokemon: 'Blastoise', tier: 'D3' })).toBe(
      'The boss of this max battle is now Dynamax Blastoise (3★).',
    );
  });

  it('/boss in a Gigantamax battle takes a Gigantamax boss on no list without asking', async () => {
    // A Gigantamax battle has one tier: there are no stars to ask about.
    const made = await setup({ tier: 'G' });
    expect(await made.answer('boss', { pokemon: 'Gengar' })).toBe(
      'The boss of this max battle is now Gigantamax Gengar.',
    );
  });

  it('/meet sets the meeting time of the group, until the battle ends', async () => {
    const made = await setup();
    expect(await made.answer('meet', { time: '2:45pm' })).toBe(
      `The meeting time of your group is ${stamp(at('2026-10-13T14:45'))} (${stamp(at('2026-10-13T14:45'), 'R')}).`,
    );
    expect(await made.answer('meet', { time: '9:30pm' })).toMatch(
      /^"9:30pm" cannot be a meeting time/,
    );
    expect(await made.answer('hatch', { time: '20' })).toMatch(/only works in the post of a raid/);
  });

  it('Meet… offers the round five-minute times of the next hour, up to its end', async () => {
    const made = await setup();
    await made.service.flush();
    expect(buttonNames(made.gateway.posts.get(made.postId)?.message)).toContain('⏰');
    const press = await made.handle(
      fakeButton({
        customId: encodeCustomId({ kind: 'party', id: made.party.id, action: 'meet', args: [] }),
        channelId: made.postId,
        userId: REPORTER,
      }),
    );
    const times = dialogChoices(shownDialog(press)).map((choice) => choice.value);
    expect(times).toHaveLength(12);
    expect(times[0]).toBe(String(at('2026-10-13T14:05')));
    expect(times.at(-1)).toBe(String(at('2026-10-13T15:00')));
  });

  it('Done completes the battle and asks the others of the group who are here', async () => {
    const made = await setup();
    await made.store.update(made.party.id, (party) => ({
      party: withAttendees(party, {
        [REPORTER]: { status: PartyStatus.Coming },
        [ALICE]: { status: PartyStatus.Present },
      }),
    }));
    expect(await made.answer('done')).toMatch(/done/i);
    expect(made.current().attendees[REPORTER]?.status).toBe(PartyStatus.Complete);
    expect(made.current().attendees[ALICE]?.status).toBe(PartyStatus.CompletePending);
    // The question in the post names a max battle, not a raid.
    await made.attendance.flush();
    expect(made.said().some((text) => text.includes('have you completed this max battle?'))).toBe(
      true,
    );
  });

  it('/where shows the Power Spot with its map', async () => {
    const made = await setup();
    expect(await made.answer('where')).toBe(
      '**Gazebo of the Park** (Power Spot)\n' +
        '[Open in Google Maps](<https://www.google.com/maps/search/?api=1&query=40.0005%2C-80.0005>)',
    );
  });

  // Final review, X3-F3: as the post names it (`spotNow`), not as it was reported.
  it('/where names the Power Spot as it is now while it is the same place', async () => {
    const renamed = keptRow(1, {
      id: TEST_SPOT.id,
      kind: 'powerspot',
      title: 'Gazebo of the Old Park',
      lat: TEST_SPOT.lat,
      lon: TEST_SPOT.lon,
    });
    const { wayspots } = await wayspotsWith([renamed]);
    // The post's service names the spot (`spotOf`), as the bot's does.
    const made = await setup({}, { wayspots }, { wayspots });
    expect(await made.answer('where')).toBe(
      '**Gazebo of the Old Park** (Power Spot)\n' +
        '[Open in Google Maps](<https://www.google.com/maps/search/?api=1&query=40.0005%2C-80.0005>)',
    );
  });

  // Review B, B11: a pin is no power spot Pine knows.
  it('/where shows a pin as an unlisted power spot with its map', async () => {
    const made = await setup({ spot: TEST_PIN });
    expect(await made.answer('where')).toBe(
      '📍 **Unlisted power spot**\n' +
        '[Open in Google Maps](<https://www.google.com/maps/search/?api=1&query=40.002%2C-80.002>)',
    );
  });

  // Review B, B7: a Gigantamax battle's boss is a Gigantamax boss.
  it('/boss in a Gigantamax battle takes and offers bosses of its own kind', async () => {
    const made = await setup({ tier: 'G' });
    const ids = { pokemonId: 'MACHAMP', form: null, createdBy: REPORTER, expiresAt: null };
    await made.bosses.addOverride({ ...ids, action: 'add', tier: 'D3', shiny: null });
    await made.bosses.addOverride({ ...ids, action: 'add', tier: 'G', shiny: null });
    expect(await made.answer('boss', { pokemon: 'Machamp' })).toBe(
      'The boss of this max battle is Gigantamax Machamp already.',
    );
    const typing = await made.handle(
      fakeAutocomplete({
        commandName: 'boss',
        ...made.place,
        focusedName: 'pokemon',
        focused: 'mach',
      }),
    );
    const names = (typing.respond.mock.calls[0]?.[0] ?? []).map((choice) => choice.name);
    expect(names.length).toBeGreaterThan(0);
    expect(names.every((name) => name.includes('Gigantamax'))).toBe(true);
  });

  // Review B, B6: Done, its answers and Meet… are a battle's, not a raid's alone.
  it('answers Done and Meet… of a battle that has ended without calling it a raid', async () => {
    const made = await setup();
    await made.service.end(made.party.id);
    for (const action of ['done', 'meet']) {
      const press = await made.handle(
        fakeButton({
          customId: encodeCustomId({ kind: 'party', id: made.party.id, action, args: [] }),
          channelId: made.postId,
          userId: REPORTER,
        }),
      );
      expect(sent(press.reply).content).toBe('This has ended.');
    }
  });
});
