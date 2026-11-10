import { describe, expect, it } from 'vitest';
import type { Me } from './notice.js';
import { PRESS_FAILED } from './parties.js';
import type { PageNode } from './popup.js';
import { CASE_NOW, CASE_ZONE, caseGrunt, caseView } from './stop-report-cases.js';
import { sendStop, stopAnswerOf, takeBackBody, takeBackPath } from './stop-forms.js';
import { stopPopup } from './stop-popup.js';
import { reportsAtStops } from './stop-reports.js';

/** The attributes of every button of a tree. */
const buttonsOf = (node: PageNode): Array<Record<string, string>> => [
  ...(node.tag === 'button' ? [node.attributes ?? {}] : []),
  ...(node.children ?? []).flatMap(buttonsOf),
];

const ME: Me = {
  loggedIn: true,
  name: 'Googer',
  csrf: 'fresh',
  member: true,
  readOnly: false,
};

describe('what the page sends of the reports at stops (plan 8M-9B)', () => {
  it('takes a report back at its address, always with the version its popup showed', () => {
    const grunt = caseGrunt(1);
    expect(takeBackPath('412345678901234567', grunt)).toBe(
      '/s/412345678901234567/api/stop-reports/101/remove',
    );
    // Review F4: the version of the Take back pressed (its `data-made-at`), not the one a poll
    // brought since (a grunt refined in place keeps its id).
    const [at] = reportsAtStops(caseView({ grunts: [grunt] }), { on: () => true, now: CASE_NOW });
    const popup = stopPopup(at!, {
      now: CASE_NOW,
      zone: CASE_ZONE,
      located: undefined,
      units: 'imperial',
    });
    const button = buttonsOf(popup).find((one) => one['data-take-back'] !== undefined);
    const dataset = { madeAt: button?.['data-made-at'] };
    expect(takeBackBody(dataset)).toEqual({ madeAt: grunt.madeAt });
  });

  it('says what the server answered, its refusal’s words, a stale token tried once more', async () => {
    const sent: string[] = [];
    const answers = [
      { status: 403, body: { error: 'Not allowed.' } },
      { status: 409, body: { ok: false, text: 'That report was changed meanwhile.' } },
    ];
    const done = await sendStop('stale', {
      post: (token) => {
        sent.push(token);
        return Promise.resolve(answers.shift() ?? { status: 500, body: undefined });
      },
      me: () => Promise.resolve(ME),
    });
    expect(sent).toEqual(['stale', 'fresh']);
    expect(done.text).toBe('That report was changed meanwhile.');
    expect(done.csrf).toBe('fresh');
    expect(done.answer).toEqual({
      ok: false,
      status: 409,
      text: 'That report was changed meanwhile.',
    });
    // Too many: the limit's words.
    const throttled = await sendStop('fresh', {
      post: () =>
        Promise.resolve({ status: 429, body: { error: 'Slow down: try again in a minute.' } }),
      me: () => Promise.resolve(ME),
    });
    expect(throttled.text).toBe('Slow down: try again in a minute.');
    // A broken connection.
    const broken = await sendStop('fresh', {
      post: () => Promise.reject(new TypeError('fetch failed')),
      me: () => Promise.resolve(ME),
    });
    expect(broken.text).toBe(PRESS_FAILED);
  });

  it('reads only the parts of an answer the page acts on (B4: by `reason`, never the words)', () => {
    expect(
      stopAnswerOf(409, { ok: false, text: 'That report has ended.', reason: 'ended', other: 1 }),
    ).toEqual({ ok: false, status: 409, text: 'That report has ended.', reason: 'ended' });
    expect(stopAnswerOf(409, { ok: false, text: 'Already reported…', reason: 'already' })).toEqual({
      ok: false,
      status: 409,
      text: 'Already reported…',
      reason: 'already',
    });
    expect(stopAnswerOf(422, { ok: false, text: 'x', reason: 'something else' })).toEqual({
      ok: false,
      status: 422,
      text: 'x',
    });
    expect(stopAnswerOf(500, 'not json')).toEqual({ ok: false, status: 500 });
  });
});
