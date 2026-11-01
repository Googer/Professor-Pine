import { readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MessageFlags } from 'discord.js';
import {
  asV2,
  fakeButton,
  fakeChatInput,
  fakeModal,
  sent,
  type FakeInteraction,
  type FakeOptions,
  type SentPayload,
} from '../../../test/support/fake-interactions.js';
import { buttonsOf, textDisplays, textOf, thumbnailOf } from '../../../test/support/messages.js';
import { expectV2Sendable } from '../../../test/support/post-limits.js';
import { WEST_CHANNEL } from '../../../test/support/gyms.js';
import { screenshotsWith } from '../../../test/support/screenshot-service.js';
import { eggReading, readingOf, splitOutcome } from '../../../test/support/screenshots.js';
import { zoned } from '../../domain/time/zoned.js';
import { TWO_SCREENS } from '../../render/screenshot-reading.js';
import { createTestContext } from '../../../test/support/test-context.js';
import { InteractionRouter } from '../../discord/router.js';
import type { ScreenReading } from '../../ocr/screen-reader.js';
import type { OcrOutcome } from '../../services/ocr-service.js';
import { screenshotControls } from './feedback.js';
import { readScreenshot } from './read-screenshot.js';

const MEMBER = '700000000000000001';
const OTHER = '700000000000000002';

function setup() {
  const made = screenshotsWith();
  const { ctx } = createTestContext({ screenshots: made.screenshots });
  const router = new InteractionRouter(ctx, [readScreenshot], [screenshotControls]);
  const handled = async (interaction: FakeInteraction) => {
    await router.handle(interaction as never);
    return interaction;
  };
  const read = (name: string, answer: ScreenReading | OcrOutcome, extra: FakeOptions = {}) =>
    handled(
      fakeChatInput({
        commandName: 'read-screenshot',
        channelId: WEST_CHANNEL,
        userId: MEMBER,
        resolved: { screenshot: made.screenshot(name, answer) },
        ...extra,
      }),
    );
  const record = (id: string) =>
    JSON.parse(readFileSync(path.join(made.dir, 'review', `${id}.json`), 'utf8')) as {
      feedback: unknown[];
      label?: unknown;
    };
  return { ...made, ctx, handled, read, record };
}

/** The id of the screenshot whose buttons are in an answer (a components-v2 message). */
function shownId(payload: SentPayload): string {
  const id = buttonsOf(asV2(payload))[0]?.customId?.split(':')[1];
  if (!id) throw new Error('no buttons');
  return id;
}

/** What an answer says: the texts of a components-v2 one, the content of a plain one. */
function said(payload: SentPayload): string {
  return ((payload.flags ?? 0) & MessageFlags.IsComponentsV2) === 0
    ? (payload.content ?? '')
    : textOf(asV2(payload));
}

afterEach(() => {
  vi.useRealTimers();
});

describe('/read-screenshot', () => {
  it('shows what was read and what it makes of it, and creates nothing', async () => {
    // The clock of the screenshot says 1:39, the egg hatches ten minutes later: read at 1:41 pm,
    // whatever time the test runs (it failed every afternoon from 1:39 + 10 + 45 minutes on).
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(
      zoned(Date.now(), 'America/New_York').with({
        hour: 13,
        minute: 41,
        second: 0,
        millisecond: 0,
      }).epochMilliseconds,
    );
    const { read, files } = setup();
    const used = await read(
      'egg.png',
      eggReading('Old Stone Fountain', 5, { hour: 13, minute: 39 }, 600),
    );
    vi.useRealTimers();
    const answer = sent(used.editReply);
    expect(answer.flags).toBe(MessageFlags.IsComponentsV2);
    const message = asV2(answer);
    expectV2Sendable(message);
    const [reading = '', ...rest] = textDisplays(message);
    expect(reading).toContain('**Gym:** read `Old Stone Fountain` → **Old Stone Fountain**');
    expect(reading).toContain('**Tier:** 5 heads → **T5**');
    expect(reading).not.toContain('Not sure');
    expect(rest.at(-1)).toBe(
      'With a screenshot like this, I report the raid as above.\nDid I read it right?',
    );
    // The member's own upload stands beside what was read of it.
    expect(thumbnailOf(message)).toMatch(/^https:\/\//u);
    const id = shownId(answer);
    expect(buttonsOf(message).map(({ customId, label }) => [customId, label])).toEqual([
      [`shot:${id}:right`, 'All right'],
      [`shot:${id}:wrong`, 'Something is wrong…'],
    ]);
    expect(files('held')).toContain(`${id}.json`);
  });

  it('shows each pane of a split screenshot in a container of its own, named by its place', async () => {
    const { read } = setup();
    const egg = (gym: string) => eggReading(gym, 5, { hour: 13, minute: 39 }, 600);
    const used = await read(
      'split.png',
      splitOutcome([egg('Old Stone Fountain'), egg('Maple Leaf Mosaic')]),
    );
    const message = asV2(sent(used.editReply));
    expectV2Sendable(message);
    expect(message.components).toHaveLength(2);
    // Each container's reading is headed by its pane's place and holds that pane's gym only.
    const firsts = message.components.map(
      (container) => textDisplays({ ...message, components: [container] })[0] ?? '',
    );
    expect(firsts[0]).toMatch(/^\*\*Top\*\*\n/u);
    expect(firsts[0]).toContain('Old Stone Fountain');
    expect(firsts[0]).not.toContain('Maple Leaf Mosaic');
    expect(firsts[1]).toMatch(/^\*\*Bottom\*\*\n/u);
    expect(firsts[1]).toContain('Maple Leaf Mosaic');
    // Each pane has its own feedback.
    const ids = buttonsOf(message).map(({ customId }) => customId?.split(':')[1]);
    expect(new Set(ids).size).toBe(2);
  });

  it('shows a pane’s own reading on its "Screenshot feedback", named by its place', async () => {
    const { read, handled } = setup();
    const egg = (gym: string) => eggReading(gym, 5, { hour: 13, minute: 39 }, 600);
    const used = await read(
      'split.png',
      splitOutcome([egg('Old Stone Fountain'), egg('Maple Leaf Mosaic')]),
    );
    const ids = buttonsOf(asV2(sent(used.editReply))).map(
      ({ customId }) => customId?.split(':')[1],
    );
    const shown = await handled(fakeButton({ customId: `shot:${ids.at(-1) ?? ''}:show` }));
    const reading = textDisplays(asV2(sent(shown.editReply)))[0] ?? '';
    expect(reading).toMatch(/^\*\*Bottom\*\*\n/u);
    expect(reading).toContain('Maple Leaf Mosaic');
    expect(reading).not.toContain('Old Stone Fountain');
  });

  it('refuses two screens it could not tell apart', async () => {
    const { read } = setup();
    const egg = eggReading('Old Stone Fountain', 5, { hour: 13, minute: 39 }, 600);
    const used = await read('mixed.png', { kind: 'read', reading: egg, twoScreens: true });
    expect(said(sent(used.followUp))).toBe(TWO_SCREENS);
  });

  it('says why it could not read one, and refuses what is no raid', async () => {
    const { read } = setup();
    const busy = await read('busy.png', { kind: 'busy' });
    expect(sent(busy.followUp).content).toMatch(/many screenshots/);
    const cat = await read('cat.png', readingOf({ gym: 'Old Stone Fountain' }));
    const refused = asV2(sent(cat.editReply));
    expect(textOf(refused)).toContain('does not look like the screen of a raid');
    // What it was not sure of stands apart, in small print.
    expect(textDisplays(refused)[1]).toMatch(/^-# Not sure: /u);
  });

  it('records "All right" and "Something is wrong" with its form, one per member', async () => {
    const { read, handled, record } = setup();
    const used = await read('egg.png', eggReading('Old Stone Fountain', 5, null, 600));
    const id = shownId(sent(used.editReply));
    const right = await handled(fakeButton({ customId: `shot:${id}:right`, userId: MEMBER }));
    expect(sent(right.reply).content).toMatch(/Thank you/);
    expect(record(id)).toMatchObject({ feedback: [{ verdict: 'right', by: 'reporter' }] });
    expect(record(id).label).toBeDefined();

    const wrong = await handled(fakeButton({ customId: `shot:${id}:wrong`, userId: OTHER }));
    const form = wrong.showModal.mock.calls[0]?.[0] as { custom_id: string };
    expect(form.custom_id).toBe(`shot:${id}:form`);
    const sentForm = await handled(
      fakeModal({
        customId: `shot:${id}:form`,
        userId: OTHER,
        selected: { elements: ['gym', 'nonsense'] },
        fields: { correction: '  It is the Library  ' },
      }),
    );
    expect(sent(sentForm.reply).content).toMatch(/Thank you/);
    expect(record(id).feedback).toMatchObject([
      { verdict: 'right', by: 'reporter' },
      { verdict: 'wrong', by: 'other', elements: ['gym'], correction: 'It is the Library' },
    ]);
    expect(record(id).label).toBeUndefined();
  });

  it('shows a screenshot only in its own server, and says so when its file has gone', async () => {
    const { read, handled, dir } = setup();
    const used = await read('egg.png', eggReading('Old Stone Fountain', 5, null, 600));
    const id = shownId(sent(used.editReply));
    const elsewhere = await handled(
      fakeButton({ customId: `shot:${id}:show`, guildId: '412345678901234599' }),
    );
    expect(sent(elsewhere.editReply).content).toBe('That screenshot is no longer kept.');
    rmSync(path.join(dir, 'held', `${id}.png`));
    const gone = await handled(fakeButton({ customId: `shot:${id}:show` }));
    expect(sent(gone.editReply).content).toBe('That screenshot is no longer kept.');
  });

  it('takes feedback on a screenshot only in its own server', async () => {
    const { read, handled, dir } = setup();
    const used = await read('egg.png', eggReading('Old Stone Fountain', 5, null, 600));
    const id = shownId(sent(used.editReply));
    const elsewhere = '412345678901234599';
    const right = await handled(
      fakeButton({ customId: `shot:${id}:right`, userId: OTHER, guildId: elsewhere }),
    );
    expect(sent(right.reply).content).toBe('That screenshot is no longer kept.');
    const form = await handled(
      fakeModal({
        customId: `shot:${id}:form`,
        userId: OTHER,
        guildId: elsewhere,
        selected: { elements: ['gym'] },
        fields: { correction: 'x' },
      }),
    );
    expect(sent(form.reply).content).toBe('That screenshot is no longer kept.');
    // Nothing was recorded.
    const held = JSON.parse(readFileSync(path.join(dir, 'held', `${id}.json`), 'utf8')) as {
      feedback: unknown[];
    };
    expect(held.feedback).toEqual([]);
  });

  it('shows what was read of a picture whose record alone is kept, without the picture', async () => {
    const { read, handled } = setup();
    const cat = await read('cat.png', readingOf({ gym: 'Old Stone Fountain' }));
    const id = shownId(sent(cat.editReply));
    const show = await handled(fakeButton({ customId: `shot:${id}:show` }));
    const answer = sent(show.editReply);
    expect(said(answer)).toContain('does not look like the screen of a raid');
    expect(answer.files).toEqual([]);
    expect(thumbnailOf(asV2(answer))).toBeUndefined();
  });

  it('gives up a screenshot whose turn would come too late to answer', async () => {
    const { read, reader } = setup();
    reader.lateAfter = Date.now() + 14 * 60_000;
    const used = await read('egg.png', eggReading('Old Stone Fountain', 5, null, 600));
    expect(sent(used.followUp).content).toMatch(/Too many screenshots are waiting/);
  });

  it('says how many wait before the answer, never after it', async () => {
    const { read, reader } = setup();
    reader.ahead = 2;
    const used = await read('egg.png', eggReading('Old Stone Fountain', 5, null, 600));
    const edits = used.editReply.mock.calls.map((call) => said(call[0]));
    expect(edits[0]).toMatch(/2 screenshots are ahead of yours/);
    // As the answer will be: a components-v2 message, which the answer edits.
    expect(sent(used.editReply).flags).toBe(MessageFlags.IsComponentsV2);
    expect(edits.at(-1)).toContain('**Gym:**');
  });

  it('turns the line that it waits into the refusal when the screenshot could not be read', async () => {
    const { read, reader } = setup();
    reader.ahead = 2;
    const used = await read('broken.png', { kind: 'failed' });
    const last = sent(used.editReply, used.editReply.mock.calls.length - 1);
    expect(last.flags).toBe(MessageFlags.IsComponentsV2);
    expect(said(last)).toMatch(/^Reading that screenshot went wrong/);
    expect(used.followUp).not.toHaveBeenCalled();
  });

  it('answers feedback on a screenshot that is no longer kept', async () => {
    const { handled } = setup();
    const right = await handled(fakeButton({ customId: 'shot:AAAAAAAAAAAA:right' }));
    expect(sent(right.reply).content).toBe('That screenshot is no longer kept.');
    const show = await handled(fakeButton({ customId: 'shot:AAAAAAAAAAAA:show' }));
    expect(sent(show.editReply).content).toBe('That screenshot is no longer kept.');
  });

  it('shows the screenshot itself with what was read', async () => {
    const { read, handled } = setup();
    const used = await read('egg.png', eggReading('Old Stone Fountain', 5, null, 600));
    const id = shownId(sent(used.editReply));
    const show = await handled(fakeButton({ customId: `shot:${id}:show`, userId: OTHER }));
    const answer = sent(show.editReply);
    expect(said(answer)).toContain('Is this what the screenshot shows?');
    expect(answer.files).toEqual([expect.objectContaining({ name: `${id}.png` })]);
    expect(thumbnailOf(asV2(answer))).toBe(`attachment://${id}.png`);
    expectV2Sendable(asV2(answer));
    expect(shownId(answer)).toBe(id);
  });

  it('is not offered when screenshots are not read', () => {
    const { ctx } = createTestContext();
    const off = {
      ...ctx.config,
      settings: { ...ctx.config.settings, ocr: { ...ctx.config.settings.ocr, enabled: false } },
    };
    expect(readScreenshot.enabled?.(off)).toBe(false);
    expect(readScreenshot.enabled?.(ctx.config)).toBe(true);
  });
});
