import { describe, expect, it } from 'vitest';
import type { PageNode } from './popup.js';
import {
  rocketBody,
  rocketForm,
  STOP_GONE,
  submitRocket,
  type RocketSubmitDeps,
} from './rocket-forms.js';
import type { StopAnswered } from './stop-forms.js';
import { caseGrunt, caseRocketOptions } from './stop-report-cases.js';

/** Every text of a tree, in order. */
const texts = (node: PageNode): string[] => [
  ...(node.text === undefined ? [] : [node.text]),
  ...(node.children ?? []).flatMap(texts),
];

/** The nodes of a tree that match. */
const found = (node: PageNode, test: (one: PageNode) => boolean): PageNode[] => [
  ...(test(node) ? [node] : []),
  ...(node.children ?? []).flatMap((child) => found(child, test)),
];

const OPTIONS = caseRocketOptions();

/** Deps that answer the report as the test says, and write down what was sent. */
function deps(answer: StopAnswered, text = answer.text ?? '', holds = true) {
  const sent: Array<Record<string, unknown>> = [];
  let asked = 0;
  const made: RocketSubmitDeps = {
    send: (body) => {
      sent.push(body);
      return Promise.resolve({ text, answer });
    },
    options: () => {
      asked += 1;
      return Promise.resolve(
        caseRocketOptions({
          choices: OPTIONS.choices.map((choice) =>
            choice.key === 'grunt:water' ? { ...choice, lineups: [] } : choice,
          ),
        }),
      );
    },
    holds: () => holds,
  };
  return { made, sent, asked: () => asked };
}

describe('the Team GO Rocket form of the map (plan 8M-9B, goal 9)', () => {
  it("offers who in /rocket's order, a type's lineups with Not sure which, Giovanni's note", () => {
    const empty = rocketForm(OPTIONS, { filled: {} });
    expect(found(empty, (one) => one.tag === 'option').map((one) => one.text)).toEqual([
      'Pick who you met',
      'Water-type grunt',
      'Fire-type grunt',
      'Arlo',
      'Giovanni',
    ]);
    expect(texts(empty)).not.toContain('Which lineup?');
    const water = rocketForm(OPTIONS, { filled: { who: 'grunt:water' } });
    expect(texts(water)).toEqual(
      expect.arrayContaining([
        'Which lineup?',
        'Mudkip, Tentacool, Krabby',
        'Magikarp, Feebas',
        'Not sure which',
      ]),
    );
    expect(
      found(water, (one) => one.attributes?.type === 'radio').map((one) => one.attributes?.value),
    ).toEqual(['grunt:water:female#f1', 'grunt:water:male#m1', 'grunt:water']);
    // The catches of the choice, by their pictures.
    expect(
      found(water, (one) => one.className === 'small-picture').map((one) => one.attributes?.title),
    ).toEqual(['Magikarp', 'Mudkip', 'Mudkip', 'Magikarp']);
    expect(texts(rocketForm(OPTIONS, { filled: { who: 'giovanni' } }))).toContain(
      'Report Giovanni only when you are sure.',
    );
    expect(texts(rocketForm({ ...OPTIONS, stale: true }, { filled: {} }))).toContain(
      'The lineups may be out of date: Pine could not read them lately.',
    );
  });

  // Branch review W3: a form drawn again while its report is on its way (a change of who) can
  // send nothing more: every control off, the menu and the lineups too.
  it('draws every control off while its report is sent', () => {
    const controls = (state: Parameters<typeof rocketForm>[1]) =>
      found(rocketForm(OPTIONS, state), (one) => ['button', 'select', 'input'].includes(one.tag));
    const filled = { who: 'grunt:water', lineup: 'grunt:water' };
    const off = controls({ filled, sending: true });
    expect(off.map((one) => one.tag)).toEqual(
      expect.arrayContaining(['select', 'input', 'button']),
    );
    expect(off.every((one) => one.attributes?.disabled !== undefined)).toBe(true);
    const asked = controls({ filled, replacing: { text: 'Replace?', id: 3 }, sending: true });
    expect(asked.every((one) => one.attributes?.disabled !== undefined)).toBe(true);
    expect(controls({ filled }).some((one) => one.attributes?.disabled !== undefined)).toBe(false);
  });

  it('sends who as /rocket takes it: a lineup by its value, Not sure which by the type', () => {
    expect(rocketBody('stop-1', OPTIONS, {})).toEqual({ text: 'Pick who you met first.' });
    expect(rocketBody('stop-1', OPTIONS, { who: 'grunt:water' })).toEqual({
      text: 'Pick the lineup, or Not sure which.',
    });
    expect(
      rocketBody('stop-1', OPTIONS, { who: 'grunt:water', lineup: 'grunt:water:male#m1' }),
    ).toEqual({ body: { who: 'grunt:water:male#m1', stop: 'stop-1' } });
    expect(rocketBody('stop-1', OPTIONS, { who: 'grunt:water', lineup: 'grunt:water' })).toEqual({
      body: { who: 'grunt:water', stop: 'stop-1' },
    });
    expect(rocketBody('stop-1', OPTIONS, { who: 'leader:arlo' }, 7)).toEqual({
      body: { who: 'leader:arlo', stop: 'stop-1', replacing: 7 },
    });
  });

  it('closes when made, and when the same grunt stands there already', async () => {
    const made = deps({ ok: true, status: 200, text: 'Reported a Fire-type grunt.' });
    expect(await submitRocket('stop-1', OPTIONS, { who: 'grunt:fire' }, made.made)).toEqual({
      kind: 'close',
      text: 'Reported a Fire-type grunt.',
    });
    const already = deps({
      ok: false,
      status: 409,
      text: 'Already reported…',
      reason: 'already',
      grunt: caseGrunt(1),
    });
    expect((await submitRocket('stop-1', OPTIONS, { who: 'grunt:fire' }, already.made)).kind).toBe(
      'close',
    );
    // Branch review W2: by `reason` alone, also for a grunt the map does not show the member (in
    // a region they are kept out of), which the answer leaves out.
    const unseen = deps({ ok: false, status: 409, text: 'Already reported…', reason: 'already' });
    expect((await submitRocket('stop-1', OPTIONS, { who: 'grunt:fire' }, unseen.made)).kind).toBe(
      'close',
    );
    // Another refusal of the same status (a report overtaken): the form stays with its words.
    const overtaken = deps({ ok: false, status: 409, text: 'Overtaken.' });
    expect(
      (await submitRocket('stop-1', OPTIONS, { who: 'grunt:fire' }, overtaken.made)).kind,
    ).toBe('draw');
  });

  it('asks the hideout question as a confirm, and Replace sends it again with the hideout', async () => {
    const asked = deps({
      ok: false,
      status: 422,
      text: 'Arlo stands at this PokéStop today. Replace Arlo with a Fire-type grunt?',
      asks: { replacing: 21 },
    });
    const after = await submitRocket('stop-1', OPTIONS, { who: 'grunt:fire' }, asked.made);
    expect(after).toMatchObject({
      kind: 'draw',
      state: {
        filled: { who: 'grunt:fire' },
        replacing: {
          id: 21,
          text: 'Arlo stands at this PokéStop today. Replace Arlo with a Fire-type grunt?',
        },
      },
    });
    if (after.kind !== 'draw') throw new Error(after.kind);
    const question = rocketForm(OPTIONS, after.state);
    expect(texts(question)).toEqual(
      expect.arrayContaining([
        'Arlo stands at this PokéStop today. Replace Arlo with a Fire-type grunt?',
        'Replace',
        'Cancel',
      ]),
    );
    expect(texts(question)).not.toContain('Report');
    const replaced = deps({ ok: true, status: 200, text: 'Reported.' });
    await submitRocket('stop-1', OPTIONS, { who: 'grunt:fire' }, replaced.made, 21);
    expect(replaced.sent).toEqual([{ who: 'grunt:fire', stop: 'stop-1', replacing: 21 }]);
  });

  it('asks for the lists again when the lineups changed, keeping the type, by `reason` alone', async () => {
    const changed = deps({
      ok: false,
      status: 422,
      text: 'The lineups just changed: pick again.',
      reason: 'list-changed',
    });
    const after = await submitRocket(
      'stop-1',
      OPTIONS,
      { who: 'grunt:water', lineup: 'grunt:water:male#m1' },
      changed.made,
    );
    expect(changed.asked()).toBe(1);
    expect(after).toMatchObject({ kind: 'draw', state: { filled: { who: 'grunt:water' } } });
    // The same words without the reason: drawn again as they are, the lists not asked.
    const other = deps({ ok: false, status: 422, text: 'The lineups just changed: pick again.' });
    await submitRocket('stop-1', OPTIONS, { who: 'grunt:fire' }, other.made);
    expect(other.asked()).toBe(0);
  });

  it('says a stop gone in its own words, and the rest as the server words them', async () => {
    const gone = deps({ ok: false, status: 404, text: 'Not found.' });
    expect(await submitRocket('stop-1', OPTIONS, { who: 'grunt:fire' }, gone.made)).toEqual({
      kind: 'close',
      text: STOP_GONE,
    });
    const unposted = deps({ ok: false, status: 503, text: 'I could not post it in #west.' });
    expect(
      await submitRocket('stop-1', OPTIONS, { who: 'grunt:fire' }, unposted.made),
    ).toMatchObject({
      kind: 'draw',
      text: 'I could not post it in #west.',
      state: { filled: { who: 'grunt:fire' } },
    });
    // Its popup closed meanwhile: only the words.
    const late = deps({ ok: true, status: 200, text: 'Reported.' }, 'Reported.', false);
    expect(await submitRocket('stop-1', OPTIONS, { who: 'grunt:fire' }, late.made)).toEqual({
      kind: 'gone',
      text: 'Reported.',
    });
  });
});
