import { describe, expect, it } from 'vitest';
import type { PageNode } from './popup.js';
import {
  CHANGE_TASK,
  formSubject,
  heldStops,
  researchBody,
  researchForm,
  submitResearch,
  taskChanged,
  tasksFound,
  type ResearchBody,
  type ResearchSubmitDeps,
} from './research-forms.js';
import { STOP_GONE } from './rocket-forms.js';
import type { StopAnswered } from './stop-forms.js';
import { caseResearch, caseResearchOptions } from './stop-report-cases.js';

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

const OPTIONS = caseResearchOptions();
const AT = [{ key: 'stop-1', name: 'Yellow Mural 1' }];

/** Deps that answer each report in turn as the test says, and write down what was sent. */
function deps(answers: StopAnswered[], holds = true) {
  const sent: ResearchBody[] = [];
  let asked = 0;
  const made: ResearchSubmitDeps = {
    send: (body) => {
      sent.push(body);
      const answer = answers.shift() ?? { ok: false, status: 500 };
      return Promise.resolve({ text: answer.text ?? '', answer });
    },
    options: () => {
      asked += 1;
      return Promise.resolve(
        caseResearchOptions({ tasks: OPTIONS.tasks.filter((task) => task.key !== 'spin') }),
      );
    },
    holds: () => holds,
  };
  return { made, sent, asked: () => asked };
}

describe('the field research form of the map (plan 8M-9B, goal 7)', () => {
  it('finds tasks by any word of their text or rewards, in the list’s order, grouped by category', () => {
    expect(tasksFound(OPTIONS.tasks, '').map((task) => task.key)).toEqual(['dragon', 'spin']);
    expect(tasksFound(OPTIONS.tasks, 'BAGON').map((task) => task.key)).toEqual(['dragon']);
    expect(tasksFound(OPTIONS.tasks, 'pokestops rare').map((task) => task.key)).toEqual(['spin']);
    const form = researchForm(OPTIONS, AT, { query: '' });
    expect(found(form, (one) => one.tag === 'h4').map((one) => one.text)).toEqual([
      'Catching',
      'Exploring',
    ]);
    expect(
      found(form, (one) => one.attributes?.['data-task'] !== undefined).map(
        (one) => one.attributes?.['data-task'],
      ),
    ).toEqual(['dragon', 'spin']);
  });

  it('asks the version of a task of several, with their pictures, and takes a task of one as it is', () => {
    const picked = researchForm(OPTIONS, AT, { query: '', task: 'dragon' });
    expect(
      found(picked, (one) => one.attributes?.type === 'radio').map((one) => one.attributes?.value),
    ).toEqual(['dragon:aaaa1111', 'dragon:bbbb2222', 'dragon']);
    expect(texts(researchForm(OPTIONS, AT, { query: '', task: 'spin' }))).not.toContain(
      'Its reward',
    );
    expect(researchBody(OPTIONS, AT, { query: '', task: 'dragon' }, { kind: 'new' })).toEqual({
      text: 'Pick its reward first.',
    });
    expect(
      researchBody(OPTIONS, AT, { query: '', task: 'dragon', version: 'dragon' }, { kind: 'new' }),
    ).toEqual({ body: { task: 'dragon', stops: ['stop-1'] } });
    expect(researchBody(OPTIONS, AT, { query: '', task: 'spin' }, { kind: 'new' })).toEqual({
      body: { task: 'spin:cccc3333', stops: ['stop-1'] },
    });
    expect(researchBody(OPTIONS, [], { query: '', task: 'spin' }, { kind: 'new' })).toEqual({
      text: 'Pick the stop first.',
    });
  });

  // Review F2: a version's pictures are the rewards the server says it stands for, never guessed
  // from the task's rewards by their place (a shiny Dratini listed twice is one version).
  it('shows each version with the pictures of the rewards the server gives it', () => {
    const [dragon] = OPTIONS.tasks;
    const [dratini, bagon] = dragon!.rewards;
    const shiny = { ...dratini!, image: `${dratini!.image ?? ''}?shiny` };
    const twice = {
      ...OPTIONS,
      tasks: [{ ...dragon!, rewards: [dratini!, shiny, bagon!] }],
    };
    const pictures = found(
      researchForm(twice, AT, { query: '', task: 'dragon' }),
      (one) => one.className?.includes('choice') === true,
    )
      .filter((one) => one.tag === 'label')
      .map((label) =>
        found(label, (one) => one.tag === 'img').map((img) => img.attributes?.title ?? ''),
      );
    expect(pictures).toEqual([['Dratini'], ['Bagon'], ['Dratini', 'Bagon']]);
  });

  it('types a task the list lacks, its reward offered from the list’s rewards, the list said stale', () => {
    const typing = { query: '', typing: { task: 'Catch 3 Pawniard', reward: 'Rare Candy' } };
    const form = researchForm({ ...OPTIONS, stale: true }, AT, typing);
    expect(texts(form)).toContain(
      'The task list may be out of date: a task missing from it can be typed in full.',
    );
    expect(found(form, (one) => one.tag === 'option').map((one) => one.attributes?.value)).toEqual([
      'Bagon',
      'Dratini',
      'Rare Candy',
      'Stardust',
    ]);
    expect(found(form, (one) => one.attributes?.['data-task'] !== undefined)).toEqual([]);
    expect(researchBody(OPTIONS, AT, typing, { kind: 'new' })).toEqual({
      body: { task: 'Catch 3 Pawniard', reward: 'Rare Candy', stops: ['stop-1'] },
    });
    expect(
      researchBody(OPTIONS, AT, { query: '', typing: { task: ' ', reward: '' } }, { kind: 'new' }),
    ).toEqual({ text: 'Type the task first.' });
  });

  // Branch review W4: as many stops as the server's lists say `/research` takes, not a copy.
  it('names up to the lists’ number of stops as chips with ×, "Add stops…" while there is room', () => {
    const two = caseResearchOptions({ maxStops: 2 });
    const both = [1, 2].map((n) => ({ key: `stop-${String(n)}`, name: `Stop ${String(n)}` }));
    expect(texts(researchForm(two, AT, { query: '' }))).toContain('Add stops…');
    expect(texts(researchForm(two, both, { query: '' }))).not.toContain('Add stops…');
    expect(
      found(
        researchForm(two, both, { query: '' }),
        (one) => one.attributes?.['data-remove-stop'] !== undefined,
      ),
    ).toHaveLength(2);
    const adding = texts(researchForm(two, AT, { query: '', adding: true }));
    expect(adding).toContain('Done adding');
    expect(adding).toContain('Tap PokéStops on the map to add them (up to 2 in all).');
  });

  // Branch review W6: while stops are added, the nearest listed as step 2 lists them (a way
  // without the map, for the keyboard), or what is said while there are none.
  it('lists the nearest stops to add as buttons while it adds, or says to zoom in', () => {
    const near = researchForm(OPTIONS, AT, {
      query: '',
      adding: true,
      nearest: [
        { id: 'stop-9', name: 'Blue Bench', distance: '300 ft' },
        { id: 'stop-10', name: 'Red Bench', distance: '0.2 mi' },
      ],
    });
    expect(
      found(near, (one) => one.attributes?.['data-report-near'] !== undefined).map(
        (one) => one.attributes?.['data-report-near'],
      ),
    ).toEqual(['stop-9', 'stop-10']);
    expect(texts(near)).toEqual(expect.arrayContaining(['Nearest', 'Blue Bench', '300 ft']));
    expect(
      texts(researchForm(OPTIONS, AT, { query: '', adding: true, nearest: 'zoom' })),
    ).toContain('Zoom in to see the PokéStops near here.');
    // Not while it does not add.
    expect(texts(researchForm(OPTIONS, AT, { query: '', nearest: 'zoom' }))).not.toContain(
      'Zoom in to see the PokéStops near here.',
    );
  });

  // Branch review W4: a typed task and reward as long as the server's lists say.
  it('takes a typed task and reward as long as the lists say', () => {
    const lengths = found(
      researchForm(caseResearchOptions({ maxTyped: 80 }), AT, {
        query: '',
        typing: { task: '', reward: '' },
      }),
      (one) => one.tag === 'input' && one.attributes?.type === 'text',
    ).map((one) => [one.attributes?.name, one.attributes?.maxlength]);
    expect(lengths).toEqual([
      ['typedTask', '80'],
      ['typedReward', '80'],
    ]);
  });

  // Review F3: a form drawn again while its report is on its way can send nothing more.
  it('draws every button off while its report is sent', () => {
    const buttons = (sending: boolean) =>
      found(
        researchForm(OPTIONS, AT, { query: '', task: 'dragon', sending }),
        (one) => one.tag === 'button',
      );
    expect(buttons(true).length).toBeGreaterThan(3);
    expect(buttons(true).every((one) => one.attributes?.disabled !== undefined)).toBe(true);
    expect(buttons(false).some((one) => one.attributes?.disabled !== undefined)).toBe(false);
  });

  it('closes when made, and when every stop was reported already', async () => {
    const made = deps([{ ok: true, status: 200, text: 'Reported.' }]);
    expect(
      await submitResearch(OPTIONS, AT, { query: '', task: 'spin' }, { kind: 'new' }, made.made),
    ).toEqual({ kind: 'close', text: 'Reported.' });
    const already = deps([
      { ok: false, status: 409, text: 'Reported already at Yellow Mural 1.', reason: 'already' },
    ]);
    expect(
      (
        await submitResearch(
          OPTIONS,
          AT,
          { query: '', task: 'spin' },
          { kind: 'new' },
          already.made,
        )
      ).kind,
    ).toBe('close');
    // Branch review W2: by `reason` (B4), not by a 409 that names none.
    const other = deps([{ ok: false, status: 409, text: 'Something else.' }]);
    expect(
      (await submitResearch(OPTIONS, AT, { query: '', task: 'spin' }, { kind: 'new' }, other.made))
        .kind,
    ).toBe('draw');
  });

  it('asks the contradiction question, and Report sends it again with the ticked ones (R7)', async () => {
    const contested = caseResearch(2, { text: 'Spin 3 PokéStops', rewardText: 'Rare Candy ×3' });
    const asking = deps([
      {
        ok: false,
        status: 422,
        text: 'Another member’s report stands at a stop you named. Tick it to replace that report…',
        asks: { reports: [contested], hidden: [{ id: 9, stop: 'Hidden Bench' }] },
      },
    ]);
    const after = await submitResearch(
      OPTIONS,
      AT,
      { query: '', task: 'dragon', version: 'dragon' },
      { kind: 'new' },
      asking.made,
    );
    if (after.kind !== 'draw') throw new Error(after.kind);
    const question = researchForm(OPTIONS, AT, after.state);
    expect(texts(question)).toEqual(
      expect.arrayContaining([
        'Another member’s report stands at a stop you named. Tick it to replace that report…',
        'Yellow Mural 2 · Spin 3 PokéStops · Rare Candy ×3 · by Brock',
        'Hidden Bench (a report you cannot see)',
      ]),
    );
    // Unticked, and no task list under the question.
    const boxes = found(question, (one) => one.attributes?.type === 'checkbox');
    expect(boxes.map((one) => [one.attributes?.value, one.attributes?.checked])).toEqual([
      ['2', undefined],
      ['9', undefined],
    ]);
    expect(found(question, (one) => one.attributes?.['data-task'] !== undefined)).toEqual([]);
    // Report with none ticked replaces none: `replacing: []`.
    const again = deps([{ ok: true, status: 200, text: 'Reported.' }]);
    await submitResearch(OPTIONS, AT, after.state, { kind: 'new' }, again.made, []);
    expect(again.sent).toEqual([{ task: 'dragon', stops: ['stop-1'], replacing: [] }]);
  });

  it('asks for the lists again when the list changed, the pick kept where still listed (B4)', async () => {
    const changed = deps([
      {
        ok: false,
        status: 422,
        text: 'The task list just changed: pick the task again.',
        reason: 'list-changed',
      },
    ]);
    const after = await submitResearch(
      OPTIONS,
      AT,
      { query: 'dra', task: 'dragon', version: 'dragon:aaaa1111' },
      { kind: 'new' },
      changed.made,
    );
    expect(changed.asked()).toBe(1);
    expect(after).toMatchObject({
      kind: 'draw',
      state: { query: 'dra', task: 'dragon', version: 'dragon:aaaa1111' },
    });
    const gone = deps([
      {
        ok: false,
        status: 422,
        text: 'The task list just changed: pick the task again.',
        reason: 'list-changed',
      },
    ]);
    const without = await submitResearch(
      OPTIONS,
      AT,
      { query: '', task: 'spin' },
      { kind: 'new' },
      gone.made,
    );
    expect(without).toMatchObject({ kind: 'draw', state: { query: '' } });
    if (without.kind === 'draw') expect(without.state.task).toBeUndefined();
  });

  it('says a stop gone in its own words, the form kept (B6)', async () => {
    const gone = deps([{ ok: false, status: 404, text: 'Not found.' }]);
    expect(
      await submitResearch(OPTIONS, AT, { query: '', task: 'spin' }, { kind: 'new' }, gone.made),
    ).toMatchObject({ kind: 'draw', text: STOP_GONE });
  });
});

describe('"Same task at more stops…" (plan 8M-9B, goal 8)', () => {
  const listed = caseResearch(1, { task: 'dragon:aaaa1111' });

  it('sends the report’s id with the stops picked, and its task with `more` once it is gone', async () => {
    const more = { kind: 'more' as const, report: listed };
    expect(researchBody(OPTIONS, [], { query: '' }, more)).toEqual({
      text: 'Add the stops first.',
    });
    const ended = deps([
      { ok: false, status: 409, text: 'That report has ended.', reason: 'ended' },
      { ok: true, status: 200, text: 'Reported.' },
    ]);
    const after = await submitResearch(OPTIONS, AT, { query: '' }, more, ended.made);
    expect(ended.sent).toEqual([
      { sameAs: 1, stops: ['stop-1'] },
      { task: 'dragon:aaaa1111', more: true, stops: ['stop-1'] },
    ]);
    expect(after).toEqual({ kind: 'close', text: 'Reported.' });
  });

  it('says the server’s words for a typed one gone, its task being no task of the list', async () => {
    const typed = caseResearch(1, {
      task: 'typed:0000000000000001',
      typed: true,
      text: 'Win 3 raids in the rain',
      rewardText: 'Rare Candy',
      rewards: [{ ...OPTIONS.tasks[1]!.rewards[0]!, quantity: 0 }],
    });
    const ended = deps([
      { ok: false, status: 409, text: 'That report has ended.', reason: 'ended' },
    ]);
    const after = await submitResearch(
      OPTIONS,
      AT,
      { query: '' },
      { kind: 'more', report: typed },
      ended.made,
    );
    expect(ended.sent).toHaveLength(1);
    expect(after).toMatchObject({ kind: 'draw', text: 'That report has ended.' });
    // Review F6: a new report's form, its task and reward typed in, never `sameAs` again.
    if (after.kind !== 'draw') throw new Error(after.kind);
    expect(after.mode).toEqual({ kind: 'new' });
    expect(researchBody(after.options, AT, after.state, after.mode ?? { kind: 'new' })).toEqual({
      body: { task: 'Win 3 raids in the rain', reward: 'Rare Candy', stops: ['stop-1'] },
    });
  });

  // Review F6: sent again by its task, the list changed under it: a new report's form.
  it('turns to a new report’s form when the task sent again is no longer listed as it was', async () => {
    const changed = deps([
      { ok: false, status: 409, text: 'That report has ended.', reason: 'ended' },
      {
        ok: false,
        status: 422,
        text: 'The task list just changed: pick the task again.',
        reason: 'list-changed',
      },
    ]);
    const after = await submitResearch(
      OPTIONS,
      AT,
      { query: '' },
      { kind: 'more', report: listed },
      changed.made,
    );
    expect(changed.asked()).toBe(1);
    if (after.kind !== 'draw') throw new Error(after.kind);
    expect(after.mode).toEqual({ kind: 'new' });
    // Its version still listed: picked in the new lists.
    expect(after.state).toMatchObject({ task: 'dragon', version: 'dragon:aaaa1111' });
    expect(after.text).toBe('The task list just changed: pick the task again.');
  });

  it('names the task and its reward in place of the task list', () => {
    const form = researchForm(OPTIONS, [], { query: '' }, { kind: 'more', report: listed });
    expect(texts(form)).toEqual(
      expect.arrayContaining([
        'Same task at more stops',
        'Catch a Dragon-type Pokémon',
        'Dratini',
        'More stops',
      ]),
    );
    expect(found(form, (one) => one.attributes?.['data-task'] !== undefined)).toEqual([]);
  });
});

// Plan 8M-11A (S18): Add stops… and Same task at more stops… leave out the stops that hold the
// task already, by the rule Discord's "Same task at more stops…" uses (`holdsSubject`).
describe('the stops that hold the task of the form already', () => {
  const TASK = '0123456789abcdef';
  const at = (n: number, task: string, more: Parameters<typeof caseResearch>[1] = {}) =>
    caseResearch(n, { task, ...more });
  const NOW = Date.UTC(2026, 9, 27, 18);

  it('are those with the same version, and for "one of" any version of its task, still standing', () => {
    const reports = [
      at(1, `${TASK}:0000000a`),
      at(2, `${TASK}:0000000b`),
      at(3, `fedcba9876543210:0000000a`),
      at(4, `${TASK}:0000000a`, { endsAt: NOW - 1 }),
    ];
    expect([...heldStops(reports, { subjectKey: `${TASK}:0000000a`, oneOf: false }, NOW)]).toEqual([
      'stop-1',
    ]);
    expect([...heldStops(reports, { subjectKey: TASK, oneOf: true }, NOW)]).toEqual([
      'stop-1',
      'stop-2',
    ]);
    expect([...heldStops(reports, undefined, NOW)]).toEqual([]);
  });

  it("is the version picked, or Same task at more stops…'s report's", () => {
    expect(
      formSubject({ query: '', task: 'dragon', version: 'dragon' }, { kind: 'new' }, OPTIONS),
    ).toEqual({
      subjectKey: 'dragon',
      oneOf: true,
    });
    expect(
      formSubject(
        { query: '', task: 'dragon', version: 'dragon:aaaa1111' },
        { kind: 'new' },
        OPTIONS,
      ),
    ).toEqual({ subjectKey: 'dragon:aaaa1111', oneOf: false });
    expect(formSubject({ query: '' }, { kind: 'new' }, OPTIONS)).toBeUndefined();
    const report = caseResearch(1, { oneOf: true, task: TASK });
    expect(formSubject({ query: '' }, { kind: 'more', report }, undefined)).toEqual({
      subjectKey: TASK,
      oneOf: true,
    });
  });
});

// Plan 8M-11A (S26): a picked task stays changeable before Submit; where it is shown alone (the
// contradiction question, "Same task at more stops…"), "Change task" brings the list back with
// the task kept as the selection.
describe('changing the task of a research form', () => {
  const changeTask = (node: PageNode) =>
    found(node, (one) => one.attributes?.['data-change-task'] !== undefined);

  it('offers Change task where the task is shown alone, and not over the list', () => {
    const asks = {
      text: 'Brock reported another task here.',
      reports: [caseResearch(1)],
      hidden: [],
    };
    const asked = researchForm(OPTIONS, AT, { query: '', task: 'dragon', asks });
    expect(changeTask(asked).map((one) => one.text)).toEqual([CHANGE_TASK]);
    const more = researchForm(
      OPTIONS,
      [],
      { query: '' },
      { kind: 'more', report: caseResearch(1) },
    );
    expect(changeTask(more)).toHaveLength(1);
    expect(changeTask(researchForm(OPTIONS, AT, { query: '', task: 'dragon' }))).toEqual([]);
  });

  it('brings the list back from the question, the task and its reward kept', () => {
    const asks = { text: 'Brock reported another task here.', reports: [], hidden: [] };
    const state = { query: '', task: 'dragon', version: 'dragon:bbbb2222', asks };
    const changed = taskChanged(state, { kind: 'new' }, OPTIONS);
    expect(changed).toEqual({
      state: { query: '', task: 'dragon', version: 'dragon:bbbb2222' },
      mode: { kind: 'new' },
    });
    expect(texts(researchForm(OPTIONS, AT, changed.state))).toContain('Bagon');
  });

  it("makes Same task at more stops… a new report of the list, its report's task picked", () => {
    const report = caseResearch(1, { task: 'dragon', oneOf: true });
    expect(taskChanged({ query: '' }, { kind: 'more', report }, OPTIONS)).toEqual({
      state: { query: '', task: 'dragon', version: 'dragon' },
      mode: { kind: 'new' },
    });
    // A typed task is not in the list: nothing picked.
    const typed = caseResearch(1, { task: 'typed:0123456789abcdef', typed: true });
    expect(taskChanged({ query: '' }, { kind: 'more', report: typed }, OPTIONS)).toEqual({
      state: { query: '' },
      mode: { kind: 'new' },
    });
  });
});
