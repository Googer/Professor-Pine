import { describe, expect, it } from 'vitest';
import type { MaxEndChoice, MaxOptionsView } from '../../domain/web/max-data.js';
import type { MapMax } from '../../domain/web/party-data.js';
import {
  ANOTHER_BOSS,
  answerFocus,
  fieldToFocus,
  keptPick,
  maxAnswerOf,
  maxBody,
  maxBox,
  maxForm,
  maxFormAfter,
  sendMaxForm,
  submitMax,
  type MaxFormState,
  type MaxValues,
} from './max-forms.js';
import type { PageNode } from './popup.js';

const ZONE = 'America/New_York';
/** Tuesday 13 October 2026, 14:00 in New York. */
const NOW = Date.UTC(2026, 9, 13, 18);
const MINUTE = 60_000;

const OPTIONS: MaxOptionsView = {
  zone: ZONE,
  bosses: [
    { value: 'm:D5:zapdos', name: 'Zapdos', level: 'D5', tier: 'Dynamax 5★', featured: true },
    { value: 'm:D2:machamp', name: 'Machamp', level: 'D2', tier: 'Dynamax 2★', featured: false },
    { value: 'm:D2:onix', name: 'Onix', level: 'D2', tier: 'Dynamax 2★', featured: false },
    { value: 'm:G:gengar', name: 'Gengar', level: 'G', tier: 'Gigantamax', featured: false },
  ],
  tiers: [
    { value: 'D1', tier: 'Dynamax 1★' },
    { value: 'D5', tier: 'Dynamax 5★' },
    { value: 'G', tier: 'Gigantamax' },
  ],
};

const SPOT = { spot: 'spot-1', name: 'Lake Gazebo', lat: 40.44, lon: -79.95 };
const PIN = { lat: 40.44, lon: -79.95 };

const values = (more: Partial<MaxValues> = {}): MaxValues => ({
  boss: '',
  typed: '',
  tier: '',
  end: '',
  region: '',
  soon: '',
  ...more,
});

const state = (more: Partial<MaxFormState> = {}): MaxFormState => ({
  filled: {},
  regions: [],
  ...more,
});

/** Every text of a tree, in order. */
const texts = (node: PageNode): string[] => [
  ...(node.text === undefined ? [] : [node.text]),
  ...(node.children ?? []).flatMap(texts),
];

/** The nodes of a tree with this tag. */
const tagged = (node: PageNode, tag: string): PageNode[] => [
  ...(node.tag === tag ? [node] : []),
  ...(node.children ?? []).flatMap((child) => tagged(child, tag)),
];

const battle = { kind: 'max', id: 'x1' } as unknown as MapMax;

describe('"Report max battle here" (plan 8M-9A)', () => {
  it("is a button in a Power Spot's popup, naming the spot", () => {
    const box = maxBox('spot-1');
    expect(box.className).toBe('max-box place-control');
    expect(tagged(box, 'button').map((button) => [button.text, button.attributes])).toEqual([
      ['Report max battle here', { type: 'button', 'data-report-max': 'spot-1' }],
    ]);
  });
});

describe('the max battle form (plan 8M-9A, A9)', () => {
  it("offers /max's bosses grouped by tier in the list's order, the featured marked", () => {
    const form = maxForm('Lake Gazebo', OPTIONS, state(), ZONE);
    expect(texts(form)[0]).toBe('Lake Gazebo');
    const [boss] = tagged(form, 'select').filter((one) => one.attributes?.name === 'boss');
    expect(boss?.children?.map((child) => child.attributes?.label ?? child.text)).toEqual([
      'Pick the boss',
      'Dynamax 5★',
      'Dynamax 2★',
      'Gigantamax',
      'Not on the list',
    ]);
    expect(texts(boss ?? { tag: 'none' })).toEqual([
      'Pick the boss',
      'Zapdos (featured)',
      'Machamp',
      'Onix',
      'Gengar',
      'Another boss (type its name)',
    ]);
    // The end is optional, and no default end is shown: the server's.
    const [end] = tagged(form, 'input').filter((one) => one.attributes?.name === 'end');
    expect(end?.attributes).not.toHaveProperty('value');
    // A boss typed is asked for with its tier, in rows shown only for it.
    const typedRows = tagged(form, 'label').filter((one) => one.attributes?.['data-typed'] === '');
    expect(typedRows.map((row) => row.attributes)).toEqual([
      { 'data-typed': '', hidden: '' },
      { 'data-typed': '', hidden: '' },
    ]);
    // No region asked of a place in one.
    expect(tagged(form, 'select').map((one) => one.attributes?.name)).toEqual(['boss', 'tier']);
    // In a spot's popup, which names the spot already, it has no heading of its own.
    expect(texts(maxForm(undefined, OPTIONS, state(), ZONE))[0]).toBe('Boss');
  });

  it('keeps what was filled in, shows the typed rows for a boss typed, and asks a region of several', () => {
    const form = maxForm(
      'Unlisted power spot',
      OPTIONS,
      state({
        filled: { boss: ANOTHER_BOSS, typed: 'Mewtwo', tier: 'D5', end: '20', region: '2' },
        regions: [
          { id: 1, name: 'oakland' },
          { id: 2, name: 'shadyside' },
        ],
      }),
      ZONE,
    );
    const typedRows = tagged(form, 'label').filter((one) => one.attributes?.['data-typed'] === '');
    expect(typedRows.map((row) => row.attributes)).toEqual([
      { 'data-typed': '' },
      { 'data-typed': '' },
    ]);
    const inputs = Object.fromEntries(
      tagged(form, 'input').map((one): [string, string | undefined] => [
        one.attributes?.name ?? '',
        one.attributes?.value,
      ]),
    );
    expect(inputs).toEqual({ typed: 'Mewtwo', end: '20' });
    const selected = tagged(form, 'option')
      .filter((one) => one.attributes?.selected === '')
      .map((one) => one.attributes?.value);
    expect(selected).toEqual([ANOTHER_BOSS, 'D5', '2']);
  });

  it('asks the ending-soon question in the server words, with the zone hint (A9)', () => {
    const form = maxForm(
      'Lake Gazebo',
      OPTIONS,
      state({
        soon: {
          text: 'This max battle ends in 3 minutes. Until when?',
          choices: [
            { value: 'next', label: 'Until the next rotation, 3:00 PM', end: NOW + 60 * MINUTE },
            { value: 'soon', label: 'Until 2:03 PM, as it is', end: NOW + 3 * MINUTE },
          ],
        },
      }),
      'Europe/London',
    );
    expect(texts(form)).toEqual(
      expect.arrayContaining([
        'This max battle ends in 3 minutes. Until when?',
        'Until the next rotation, 3:00 PM',
        'Until 2:03 PM, as it is',
      ]),
    );
    const radios = tagged(form, 'input').filter((one) => one.attributes?.type === 'radio');
    expect(radios.map((one) => one.attributes)).toEqual([
      { type: 'radio', name: 'soon', value: `next:${NOW + 60 * MINUTE}`, checked: '' },
      { type: 'radio', name: 'soon', value: `soon:${NOW + 3 * MINUTE}` },
    ]);
    expect(texts(form).join(' ')).toContain('Clock times are read in the server');
    // The typed end is not offered beside the question: the choice is the end.
    expect(tagged(form, 'input').some((one) => one.attributes?.name === 'end')).toBe(false);
  });

  // Review B3: a Submit after the first question may be answered by the question again.
  it('keeps the choice checked when the question is asked again with it, else checks the first', () => {
    const next: MaxEndChoice = { value: 'next', label: 'Until 3:00 PM', end: NOW + 60 * MINUTE };
    const soon: MaxEndChoice = { value: 'soon', label: 'Until 2:03 PM', end: NOW + 3 * MINUTE };
    const later: MaxEndChoice = { value: 'next', label: 'Until 4:00 PM', end: NOW + 120 * MINUTE };
    const checked = (choices: MaxEndChoice[], picked: string) =>
      tagged(
        maxForm(
          'Lake Gazebo',
          OPTIONS,
          state({ filled: { soon: picked }, soon: { text: 'Until when?', choices } }),
          ZONE,
        ),
        'input',
      )
        .filter((one) => one.attributes?.checked === '')
        .map((one) => one.attributes?.value);
    expect(checked([next, soon], `soon:${String(soon.end)}`)).toEqual([`soon:${String(soon.end)}`]);
    // The rotation passed meanwhile: new choices, the old one among none of them.
    expect(checked([later, soon], `next:${String(next.end)}`)).toEqual([
      `next:${String(later.end)}`,
    ]);
  });
});

describe("a max battle report's body (POST /api/maxes)", () => {
  it('sends the spot or the point, the boss picked, the end typed and the region', () => {
    expect(maxBody(SPOT, values({ boss: 'm:D2:machamp', end: ' 20 ', region: '2' }))).toEqual({
      body: { spot: 'spot-1', boss: 'm:D2:machamp', end: '20', region: 2 },
    });
    expect(maxBody(PIN, values({ boss: 'm:G:gengar' }))).toEqual({
      body: { lat: 40.44, lon: -79.95, boss: 'm:G:gengar' },
    });
  });

  it('sends a boss typed with its tier, and says what is missing first', () => {
    expect(maxBody(SPOT, values({ boss: ANOTHER_BOSS, typed: ' Mewtwo ', tier: 'D5' }))).toEqual({
      body: { spot: 'spot-1', boss: 'Mewtwo', tier: 'D5' },
    });
    expect(maxBody(SPOT, values({ boss: ANOTHER_BOSS, typed: 'Mewtwo' }))).toEqual({
      body: { spot: 'spot-1', boss: 'Mewtwo' },
    });
    expect(maxBody(SPOT, values())).toEqual({ text: 'Pick the boss first.' });
    expect(maxBody(SPOT, values({ boss: ANOTHER_BOSS, typed: ' ' }))).toEqual({
      text: 'Type the boss first.',
    });
  });

  // R1-5: the choice checked is sent as it is; whether its end has passed is the server's to say
  // (the dialog's Submit's words), not the browser clock's.
  it('sends the ending-soon choice checked with its end and no typed end, whatever the time', () => {
    const soon = `next:${String(NOW - 60 * MINUTE)}`;
    expect(maxBody(SPOT, values({ boss: 'm:D2:machamp', end: '5', soon }))).toEqual({
      body: {
        spot: 'spot-1',
        boss: 'm:D2:machamp',
        soon: { value: 'next', end: NOW - 60 * MINUTE },
      },
    });
  });
});

describe("a max battle report's answer (A3)", () => {
  it('reads whether it was done, the battle, what it needs, the regions and the question', () => {
    expect(maxAnswerOf(undefined)).toEqual({ ok: false });
    expect(
      maxAnswerOf({
        ok: false,
        text: 'This place lies in several regions: pick the one to report the max battle in.',
        regions: [{ id: 1, name: 'oakland' }, { id: 'x' }],
        needs: 'tier',
        soon: { choices: [{ value: 'next', label: 'Until 3:00 PM', end: 5 }, { value: 'nope' }] },
        max: battle,
      }),
    ).toEqual({
      ok: false,
      text: 'This place lies in several regions: pick the one to report the max battle in.',
      regions: [{ id: 1, name: 'oakland' }],
      needs: 'tier',
      soon: { choices: [{ value: 'next', label: 'Until 3:00 PM', end: 5 }] },
      max: battle,
    });
  });

  it('closes on a battle made, joined or there with another boss; asks again for the rest', () => {
    const filled = values({ boss: 'm:D2:machamp' });
    expect(maxFormAfter({ ok: true, max: battle }, filled, state())).toEqual({
      kind: 'close',
      max: battle,
    });
    // Joined, or another boss's battle there: it is opened instead.
    expect(maxFormAfter({ ok: false, max: battle }, filled, state())).toEqual({
      kind: 'close',
      max: battle,
    });
    // The question: drawn into the form, what was filled kept.
    const choices = [{ value: 'next' as const, label: 'Until 3:00 PM', end: NOW }];
    expect(
      maxFormAfter({ ok: false, text: 'Ends soon.', soon: { choices } }, filled, state()),
    ).toEqual({
      kind: 'redraw',
      state: { filled, regions: [], soon: { text: 'Ends soon.', choices } },
    });
    // Several regions: drawn with them, a region kept only while it is among them.
    const regions = [
      { id: 1, name: 'oakland' },
      { id: 2, name: 'shadyside' },
    ];
    expect(
      maxFormAfter(
        { ok: false, text: 'Pick the region.', regions },
        values({ boss: 'm:D2:machamp', region: '7' }),
        state(),
      ),
    ).toEqual({
      kind: 'redraw',
      state: { filled: values({ boss: 'm:D2:machamp', region: '' }), regions },
    });
    // Any other refusal: the lists asked for again (a boundary may have changed them), the
    // question gone.
    expect(
      maxFormAfter(
        { ok: false, text: 'That boss is no longer on the list: pick it again.' },
        filled,
        state({ soon: { text: 'Ends soon.', choices } }),
      ),
    ).toEqual({ kind: 'refetch', state: { filled, regions: [] } });
  });

  // R1-4: what a refusal needs is acted on, not only said.
  it('acts on what a refusal needs: the field to fill in, or a Power Spot for a pin', () => {
    const typed = values({ boss: ANOTHER_BOSS, typed: 'Mewtwo' });
    expect(maxFormAfter({ ok: false, text: 'Which tier?', needs: 'tier' }, typed, state())).toEqual(
      { kind: 'refetch', state: { filled: typed, regions: [] }, focus: 'tier' },
    );
    expect(
      maxFormAfter(
        { ok: false, text: 'Pick a boss from the list.', needs: 'boss' },
        typed,
        state(),
      ),
    ).toEqual({ kind: 'refetch', state: { filled: typed, regions: [] }, focus: 'boss' });
    // A member blocked from pins: the form says so, its Report off, a way back to the spots.
    const picked = values({ boss: 'm:D2:machamp' });
    const step = maxFormAfter(
      { ok: false, text: 'Pick a Power Spot on the map.', needs: 'listed-spot' },
      picked,
      state(),
    );
    expect(step).toEqual({
      kind: 'redraw',
      state: { filled: picked, regions: [], pinRefused: true },
    });
    if (step.kind !== 'redraw') throw new Error(step.kind);
    const form = maxForm('Unlisted power spot', OPTIONS, step.state, ZONE);
    const buttons = tagged(form, 'button').map((button) => [button.text, button.attributes]);
    expect(buttons).toEqual([
      ['Report', { type: 'button', 'data-submit': 'max', disabled: '' }],
      ['Cancel', { type: 'button', 'data-cancel': '' }],
      ['← Pick a Power Spot', { type: 'button', 'data-pick-spot': '' }],
    ]);
  });

  it('keeps the boss picked when the new lists still have it', () => {
    const picked = values({ boss: 'm:D2:onix', end: '20' });
    expect(keptPick(OPTIONS, picked)).toEqual(picked);
    const gone = { ...OPTIONS, bosses: OPTIONS.bosses.filter((boss) => boss.name !== 'Onix') };
    expect(keptPick(gone, picked)).toEqual(values({ boss: '', end: '20' }));
    // A boss typed is kept whatever the lists say.
    const typed = values({ boss: ANOTHER_BOSS, typed: 'Mewtwo' });
    expect(keptPick(gone, typed)).toEqual(typed);
  });

  // R2-3: "a boss of the list" for a boss typed points at the name typed, not the menu.
  it('focuses the field a refusal points at: the tier, the menu, or the name typed', () => {
    expect(fieldToFocus('tier', values())).toBe('select[name="tier"]');
    expect(fieldToFocus('boss', values({ boss: 'm:D2:machamp' }))).toBe('select[name="boss"]');
    expect(fieldToFocus('boss', values({ boss: ANOTHER_BOSS, typed: 'Mewtwoo' }))).toBe(
      'input[name="typed"]',
    );
  });

  // Review B4: the form drawn anew after an answer keeps the focus in it, the question read out.
  it('focuses the checked choice of the ending-soon question once asked, else Report', () => {
    const choices = [{ value: 'next' as const, label: 'Until 3:00 PM', end: NOW }];
    expect(answerFocus(state({ soon: { text: 'Until when?', choices } }))).toBe(
      'input[name="soon"]:checked',
    );
    expect(answerFocus(state({ regions: [{ id: 1, name: 'oakland' }] }))).toBe(
      'button[data-submit="max"]',
    );
    // Review B4b: a pin refused turns Report off; the way back to the spots takes the focus.
    expect(answerFocus(state({ pinRefused: true }))).toBe('button[data-pick-spot]');
  });

  it('tells what is said under the form as it is said (aria-live)', () => {
    const [answer] = tagged(maxForm('Lake Gazebo', OPTIONS, state(), ZONE), 'div').filter(
      (one) => one.className === 'form-answer',
    );
    expect(answer?.attributes).toMatchObject({ 'aria-live': 'polite' });
  });

  // R1-2: the form's Submit as maxUi runs it (`submitMax`), the lists asked for again (A3).
  it('asks for the lists again after a refusal, keeping the boss while they still offer it', async () => {
    const sent: unknown[] = [];
    let asked = 0;
    const without = { ...OPTIONS, bosses: OPTIONS.bosses.filter((boss) => boss.name !== 'Onix') };
    const deps = (lists: MaxOptionsView | 'fails') => ({
      send: (body: unknown) => {
        sent.push(body);
        return Promise.resolve({
          ok: false,
          text: 'That boss is no longer on the list: pick it again.',
          csrf: 'token',
        });
      },
      options: () => {
        asked += 1;
        return lists === 'fails' ? Promise.reject(new Error('offline')) : Promise.resolve(lists);
      },
      holds: () => true,
    });
    const onix = values({ boss: 'm:D2:onix', end: '20' });
    const after = await submitMax(SPOT, onix, OPTIONS, state(), deps(without));
    expect(sent).toEqual([{ spot: 'spot-1', boss: 'm:D2:onix', end: '20' }]);
    expect(asked).toBe(1);
    expect(after).toEqual({
      kind: 'draw',
      lists: without,
      state: { filled: { ...onix, boss: '' }, regions: [] },
      text: 'That boss is no longer on the list: pick it again.',
    });
    // The lists cannot be had: those it has stay, the pick with them.
    const kept = await submitMax(SPOT, onix, OPTIONS, state(), deps('fails'));
    expect(kept).toMatchObject({ kind: 'draw', lists: OPTIONS, state: { filled: onix } });
    // What is missing is said before anything is sent.
    expect(await submitMax(SPOT, values(), OPTIONS, state(), deps(without))).toEqual({
      kind: 'missing',
      text: 'Pick the boss first.',
    });
    expect(sent).toHaveLength(2);
  });

  it('closes on a battle made, and only says the words of a form gone meanwhile', async () => {
    const made = { ok: true, text: 'Reported.', max: battle, csrf: 'token' };
    const deps = (holds: boolean) => ({
      send: () => Promise.resolve(made),
      options: () => Promise.resolve(OPTIONS),
      holds: () => holds,
    });
    const picked = values({ boss: 'm:D2:machamp' });
    expect(await submitMax(SPOT, picked, OPTIONS, state(), deps(true))).toEqual({
      kind: 'close',
      text: 'Reported.',
      max: battle,
    });
    expect(await submitMax(SPOT, picked, OPTIONS, state(), deps(false))).toEqual({
      kind: 'gone',
      text: 'Reported.',
    });
  });

  it("says the server's words, or its few words where it has no text (a 403)", async () => {
    const barred = await sendMaxForm('token', {
      post: () =>
        Promise.resolve({
          status: 403,
          body: { error: 'You cannot report a max battle here.' },
        }),
      me: () =>
        Promise.resolve({
          loggedIn: true,
          name: 'Ash',
          csrf: 'token',
          member: true,
          readOnly: false,
        }),
    });
    expect(barred).toMatchObject({ ok: false, text: 'You cannot report a max battle here.' });
  });
});
