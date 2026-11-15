import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeButton, fakeSelect, sent } from '../../../test/support/fake-interactions.js';
import { EAST_CHANNEL, testGym } from '../../../test/support/gyms.js';
import { PARTY_NOW } from '../../../test/support/parties.js';
import { partyServiceWith } from '../../../test/support/party-service.js';
import { AUTHOR, OTHER, posted } from '../../../test/support/posted-message.js';
import { gymsFixture } from '../../../test/support/providers.js';
import { kyuremBossesFixture } from '../../../test/support/raid-bosses.js';
import { screenshotsWith } from '../../../test/support/screenshot-service.js';
import { eggReading, kyuremReading } from '../../../test/support/screenshots.js';
import { createTestContext } from '../../../test/support/test-context.js';
import type { Gym } from '../../db/repositories/gym-repository.js';
import { UserError } from '../../discord/errors.js';
import { InteractionRouter } from '../../discord/router.js';
import { isRaid, type RaidParty } from '../../domain/party/party.js';
import type { ScreenReading } from '../../ocr/screen-reader.js';
import { screenshotControls } from './feedback.js';
import { ScreenshotTrigger, type ReplyPayload } from './mention.js';

/*
 * A screenshot whose CP and name fit more than one boss (Black and White Kyurem, 2026-11-15): the
 * raid is made without its boss, then its member is asked which, and their answer sets it as
 * Manage… does.
 */

const CLOCK = { hour: 13, minute: 59 };

async function setup(options: { gyms?: Gym[]; passive?: boolean; questionMs?: number } = {}) {
  const gyms = gymsFixture(options.gyms ?? []);
  const raidBosses = kyuremBossesFixture();
  const made = await partyServiceWith([], { gyms });
  const shots = screenshotsWith(createTestContext({ gyms, raidBosses }).ctx);
  const { ctx: base } = createTestContext({
    gyms,
    raidBosses,
    partyService: made.service,
    parties: made.store,
    regions: made.regions,
    raids: made.raids,
    attendance: made.attendance,
    screenshots: shots.screenshots,
  });
  const passive = options.passive ?? false;
  const ocr = { ...base.config.settings.ocr, passive, enabled: true };
  const ctx = {
    ...base,
    config: { ...base.config, settings: { ...base.config.settings, ocr } },
    features: { ocrPassive: passive, autoAssignRole: false },
  };
  const trigger = new ScreenshotTrigger({
    ctx,
    replyMs: 20,
    questionMs: options.questionMs ?? 60_000,
  });
  const router = new InteractionRouter(ctx, [], [screenshotControls]);
  const image = (name: string, reading: ScreenReading) => shots.screenshot(name, reading);
  /** The one raid made, as it is stored now. */
  const raid = (): RaidParty => {
    const [party] = made.store.active();
    if (!party || !isRaid(party)) throw new Error('no raid');
    return party;
  };
  return { ...shots, ...made, ctx, trigger, router, image, raid, raidBosses };
}

const kyurem = (gym = 'Old Stone Fountain') => kyuremReading(gym, CLOCK);

/** The buttons of a reply, every row's. */
const buttonsOf = (reply: ReplyPayload | undefined) =>
  (reply?.components ?? []).flatMap(
    (row) => row.components as { custom_id: string; label: string }[],
  );
const press = (
  reply: ReplyPayload | undefined,
  label: string,
  userId = AUTHOR,
  more: { ephemeralMessage?: boolean } = {},
) => {
  const button = buttonsOf(reply).find((b) => b.label === label);
  return fakeButton({ customId: button?.custom_id ?? 'missing', userId, ...more });
};

describe('a screenshot whose CP and name fit more than one boss', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'], now: PARTY_NOW });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('makes the raid without its boss, asks its author which, and sets the one they choose', async () => {
    const { trigger, image, raid, router, screenshots } = await setup();
    const { message, replies, did } = posted([image('a.png', kyurem())]);
    await trigger.handle(message);
    expect(raid()).toMatchObject({ gymId: 2, createdById: AUTHOR });
    expect(raid().raid).toMatchObject({ boss: null, tier: { level: 'T5' } });
    // The raid was made: the message has done its work.
    expect(did).toContain('deleted');
    const [question] = replies;
    expect(question?.content).toBe('Which boss is the raid at Old Stone Fountain?');
    expect(question?.ping).toBeUndefined();
    expect(buttonsOf(question).map((b) => b.label)).toEqual([
      'Black Kyurem',
      'White Kyurem',
      'Cancel',
    ]);
    expect(buttonsOf(question)[1]?.custom_id).toMatch(/^shot:[^:]+:boss:1$/);

    const stranger = press(question, 'White Kyurem', OTHER);
    await router.handle(stranger as never);
    expect(sent(stranger.reply).content).toBe('That is somebody else’s screenshot.');
    expect(raid().raid.boss).toBeNull();

    const author = press(question, 'White Kyurem');
    await router.handle(author as never);
    expect(author.followUp).not.toHaveBeenCalled();
    const answer = sent(author.editReply);
    expect(answer.content).toBe('Set the boss of the raid at Old Stone Fountain to White Kyurem.');
    expect(answer.components).toEqual([]);
    expect(raid().raid.boss).toEqual({ key: 'kyurem_white' });
    // The record keeps the boss chosen, which an "All right" labels.
    const shot = raid().raid.screenshot?.id;
    const kept = shot === null || shot === undefined ? undefined : await screenshots.get(shot);
    expect(kept !== undefined && kept !== 'gone' && kept.record.pickedBossKey).toBe('kyurem_white');
    // A second press is only acknowledged.
    const again = press(question, 'Black Kyurem');
    await router.handle(again as never);
    expect(again.deferUpdate).toHaveBeenCalled();
    expect(raid().raid.boss).toEqual({ key: 'kyurem_white' });
  });

  it('changes nothing when the boss was set meanwhile, and says so', async () => {
    const { trigger, image, raid, router, raids } = await setup();
    const { message, replies } = posted([image('a.png', kyurem())]);
    await trigger.handle(message);
    await raids.setBoss(
      raid().id,
      { id: OTHER, name: 'Ash' },
      { tier: { level: 'T5', shadow: false }, boss: { key: 'kyurem_black' }, label: 'x' },
    );
    const author = press(replies[0], 'White Kyurem');
    await router.handle(author as never);
    expect(sent(author.editReply).content).toBe(
      'The boss of this raid was set meanwhile, so I left it as it is.',
    );
    expect(raid().raid.boss).toEqual({ key: 'kyurem_black' });
  });

  it('leaves the raid without a boss on Cancel, and the question goes', async () => {
    const { trigger, image, raid, router } = await setup();
    const { message, replies } = posted([image('a.png', kyurem())]);
    await trigger.handle(message);
    const cancel = press(replies[0], 'Cancel');
    await router.handle(cancel as never);
    expect(cancel.deleteReply).toHaveBeenCalledTimes(1);
    expect(raid().raid.boss).toBeNull();
  });

  it('refuses a choice that is none of the question’s', async () => {
    const { trigger, image, raid, router } = await setup();
    const { message, replies } = posted([image('a.png', kyurem())]);
    await trigger.handle(message);
    const black = buttonsOf(replies[0])[0]?.custom_id ?? '';
    const forged = fakeButton({ customId: black.replace(/:0$/, ':7'), userId: AUTHOR });
    await router.handle(forged as never);
    expect(sent(forged.reply).content).toMatch(/^That question has expired/);
    expect(raid().raid.boss).toBeNull();
  });

  it('says so when the boss chosen left the list since the question', async () => {
    const { trigger, image, raid, router, raidBosses } = await setup();
    const { message, replies } = posted([image('a.png', kyurem())]);
    await trigger.handle(message);
    raidBosses.rotateOut('kyurem_white');
    const white = press(replies[0], 'White Kyurem');
    await router.handle(white as never);
    expect(sent(white.editReply).content).toBe(
      'That boss is no longer on the list of raid bosses, so I left the raid as it is.',
    );
    expect(raid().raid.boss).toBeNull();
  });

  it('says what refused the change in its own words when it is not the list', async () => {
    const { trigger, image, raid, router, raids } = await setup();
    const { message, replies } = posted([image('a.png', kyurem())]);
    await trigger.handle(message);
    vi.spyOn(raids, 'setBoss').mockRejectedValueOnce(
      new UserError('This raid is being moved just now.'),
    );
    const white = press(replies[0], 'White Kyurem');
    await router.handle(white as never);
    expect(sent(white.editReply).content).toBe('Nothing was changed.');
    expect(sent(white.followUp).content).toBe('This raid is being moved just now.');
    expect(raid().raid.boss).toBeNull();
  });

  it('asks nothing when a raid already stands at the gym', async () => {
    const { trigger, image, store, service } = await setup();
    await trigger.handle(
      posted([image('a.png', eggReading('Old Stone Fountain', 5, CLOCK))]).message,
    );
    await service.flush();
    const again = posted([image('b.png', kyurem())], { authorId: OTHER });
    await trigger.handle(again.message);
    expect(store.active()).toHaveLength(1);
    expect(again.replies).toHaveLength(1);
    expect(again.replies[0]?.content).toMatch(/^There is already a raid at Old Stone Fountain/);
  });

  it('asks once the gym its author picked has made the raid', async () => {
    const twin = testGym(13, 'Old Stone Fountain', 40.061, -80.061, { nickname: 'Bank fountain' });
    const { trigger, image, raid, router } = await setup({ gyms: [twin] });
    const { message, replies } = posted([image('a.png', kyurem())]);
    await trigger.handle(message);
    expect(replies).toHaveLength(1);
    const menu = replies[0]?.components?.[0]?.components[0] as { custom_id: string };
    const picked = fakeSelect({ customId: menu.custom_id, values: ['13'], userId: AUTHOR });
    await router.handle(picked as never);
    expect(raid()).toMatchObject({ gymId: 13 });
    const question = replies[1];
    expect(question?.content).toBe('Which boss is the raid at Bank fountain?');
    const black = press(question, 'Black Kyurem');
    await router.handle(black as never);
    expect(sent(black.editReply).content).toBe(
      'Set the boss of the raid at Bank fountain to Black Kyurem.',
    );
    expect(raid().raid.boss).toEqual({ key: 'kyurem_black' });
  });

  it('asks nothing when the question cannot be sent: the raid stays without its boss', async () => {
    const { trigger, image, raid } = await setup();
    const { message } = posted([image('a.png', kyurem())], {
      reply: () => Promise.reject(new Error('Unknown Message')),
    });
    await trigger.handle(message);
    expect(raid().raid.boss).toBeNull();
  });

  describe('read passively', () => {
    it('asks its author, pinging them', async () => {
      const { trigger, image, raid, router } = await setup({ passive: true });
      const { message, replies } = posted([image('a.png', kyurem())], { mentionsBot: false });
      await trigger.handle(message);
      expect(replies[0]?.content).toBe(
        `<@${AUTHOR}> Which boss is the raid at Old Stone Fountain?`,
      );
      expect(replies[0]?.ping).toBe(AUTHOR);
      const white = press(replies[0], 'White Kyurem');
      await router.handle(white as never);
      expect(raid().raid.boss).toEqual({ key: 'kyurem_white' });
    });

    it('asks once Yes reported it in the other region', async () => {
      const { trigger, image, raid, router } = await setup({ passive: true });
      const { message, replies } = posted([image('a.png', kyurem('Harbor Lighthouse Mural'))], {
        mentionsBot: false,
      });
      await trigger.handle(message);
      expect(replies[0]?.content).toBe(
        `<@${AUTHOR}> Harbor Lighthouse Mural is in <#${EAST_CHANNEL}>. Report it there?`,
      );
      const yes = press(replies[0], 'Yes');
      await router.handle(yes as never);
      expect(raid()).toMatchObject({ gymId: 7 });
      expect(replies[1]?.content).toBe(
        `<@${AUTHOR}> Which boss is the raid at Harbor Lighthouse Mural?`,
      );
      expect(replies[1]?.ping).toBe(AUTHOR);
    });
  });
});
