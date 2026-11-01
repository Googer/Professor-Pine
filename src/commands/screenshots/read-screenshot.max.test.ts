import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  asV2,
  fakeButton,
  fakeChatInput,
  fakeModal,
  sent,
  type FakeInteraction,
} from '../../../test/support/fake-interactions.js';
import { WEST_CHANNEL } from '../../../test/support/gyms.js';
import { maxReportingWith, MAX_THURSDAY } from '../../../test/support/max-reporting.js';
import { buttonsOf, textOf } from '../../../test/support/messages.js';
import { at } from '../../../test/support/parties.js';
import { screenshotsWith } from '../../../test/support/screenshot-service.js';
import { maxReading } from '../../../test/support/screenshots.js';
import { InteractionRouter } from '../../discord/router.js';
import type { ScreenReading } from '../../ocr/screen-reader.js';
import { screenshotControls } from './feedback.js';
import { readScreenshot } from './read-screenshot.js';

/*
 * `/read-screenshot` and the feedback of a max battle's screenshot (plan 8X-S, task 7).
 * `MAX_THURSDAY` is 14:00; `maxReading()` is a Dynamax Machop (2★) at the test spot's Power
 * Spot, its clock read surely at 13:58 and 30 minutes to go.
 */

const END = at('2026-10-22T14:28');

async function setup() {
  const made = await maxReportingWith();
  const shots = screenshotsWith(made.ctx);
  const ctx = { ...made.ctx, screenshots: shots.screenshots };
  const router = new InteractionRouter(ctx, [readScreenshot], [screenshotControls]);
  const handled = async (interaction: FakeInteraction) => {
    await router.handle(interaction as never);
    return interaction;
  };
  const read = (reading: ScreenReading) =>
    handled(
      fakeChatInput({
        commandName: 'read-screenshot',
        channelId: WEST_CHANNEL,
        resolved: { screenshot: shots.screenshot('max.png', reading) },
      }),
    );
  return { ...shots, ...made, handled, read };
}

describe('/read-screenshot of a max battle’s screenshot', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'], now: MAX_THURSDAY });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows what it read and what it would do, with feedback on a max battle’s elements', async () => {
    const made = await setup();
    const used = await made.read(maxReading());
    const answer = asV2(sent(used.editReply));
    const text = textOf(answer);
    expect(text).toContain('**Power Spot:** read `GAZEBO OF THE PARK` → **Gazebo of the Park**');
    expect(text).toContain(
      `**Time:** clock \`13:58\`, countdown \`0:30:00\` → ends at <t:${String(END / 1000)}:t>`,
    );
    expect(text).toContain('**Tier:** 2 heads, Dynamax → **Dynamax 2★**');
    expect(text).toContain('**Boss:** name read `MACHOP` → **Machop**');
    expect(text).toContain('With a screenshot like this, I report the max battle as above.');
    expect(made.store.active()).toEqual([]);
    const [right, wrong] = buttonsOf(answer);
    const id = right?.customId?.split(':')[1] ?? '';
    expect(wrong?.customId).toBe(`shot:${id}:wrong:max`);

    const pressed = await made.handled(fakeButton({ customId: wrong?.customId ?? '' }));
    const form = pressed.showModal.mock.calls[0]?.[0] as {
      custom_id: string;
      components: { component: { options?: { label: string; value: string }[] } }[];
    };
    expect(form.components[0]?.component.options?.map((o) => o.label)).toEqual([
      'Power Spot',
      'Time',
      'Tier',
      'Boss',
    ]);
    await made.handled(
      fakeModal({
        customId: form.custom_id,
        selected: { elements: ['spot', 'gym'] },
        fields: { correction: 'Gazebo of the Pond' },
      }),
    );
    const kept = await made.screenshots.get(id);
    expect(kept).toMatchObject({
      record: { feedback: [{ verdict: 'wrong', elements: ['spot'] }] },
    });
  });

  // Review S-6: outside events `/max`'s default end is the day's last battle, not a rotation's.
  it('says a screen without a countdown ends as `/max` would end it', async () => {
    const made = await setup();
    const used = await made.read(maxReading(undefined, {}, { countdown: null }));
    const text = textOf(asV2(sent(used.editReply)));
    const lastBattle = at('2026-10-22T21:00');
    expect(text).toContain(`ends at <t:${String(lastBattle / 1000)}:t> (as \`/max\` would end it)`);
    expect(text).toContain(
      'I could not read the countdown, so the battle ends as `/max` would end it.',
    );
    expect(text).not.toMatch(/rotation/);
  });

  it('says the refusal or the question it would make', async () => {
    const made = await setup();
    const unknown = await made.read(maxReading('NOWHERE IN PARTICULAR'));
    expect(textOf(asV2(sent(unknown.editReply)))).toContain(
      'I do not know a Power Spot called "NOWHERE IN PARTICULAR" here: use `/max spot:`.',
    );
    const noBoss = await made.read(maxReading(undefined, { species: 'MEWTWO' }));
    expect(textOf(asV2(sent(noBoss.editReply)))).toContain(
      'I could not tell which boss: use `/max`.',
    );
    // Nobody is told of a Power Spot read only to show it.
    await made.reports.flush();
    expect(made.entries.map((entry) => entry.msg)).not.toContain(
      'a screenshot showed a Power Spot Pine does not know',
    );
  });

  it('shows a kept max battle’s screenshot with its own reading', async () => {
    const made = await setup();
    const used = await made.read(maxReading());
    const id = buttonsOf(asV2(sent(used.editReply)))[0]?.customId?.split(':')[1] ?? '';
    const shown = await made.handled(fakeButton({ customId: `shot:${id}:show` }));
    const answer = asV2(sent(shown.editReply));
    expect(textOf(answer)).toContain('**Power Spot:** read `GAZEBO OF THE PARK`');
    expect(buttonsOf(answer)[1]?.customId).toBe(`shot:${id}:wrong:max`);
  });

  // Matt, 2026-10-23 (review r4 B4).
  it('writes Power Spot in its help as the game does', () => {
    const { details } = readScreenshot.help ?? {};
    expect(typeof details === 'string' ? details : '').toContain('of a max battle the Power Spot');
  });
});
