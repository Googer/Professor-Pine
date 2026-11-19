import { describe, expect, it } from 'vitest';
import type { MaxOptionsView } from '../../domain/web/max-data.js';
import { maxForm, maxMissing, PIN_REFUSED_LINE, type MaxValues } from './max-forms.js';
import { newMeetupForm } from './meetup-forms.js';
import type { PageNode } from './popup.js';
import { researchForm, researchMissing, LOADING_LINE } from './research-forms.js';
import { rocketForm, rocketMissing } from './rocket-forms.js';
import { spawnForm, spawnMissing } from './spawn-forms.js';
import { caseResearchOptions, caseRocketOptions } from './stop-report-cases.js';
import { startForm, startMissing } from './train-forms.js';

/**
 * The missing line of every form of the map (plan 8M-22): each form's pure check, and the form
 * drawn with its sending button off and the line saying what is missing, on once nothing is.
 */

function all(node: PageNode): PageNode[] {
  return [node, ...(node.children ?? []).flatMap(all)];
}

/** The sending button's `aria-disabled` and the line's text, as drawn. */
function shown(form: PageNode): { off: boolean; line: string | undefined } {
  const nodes = all(form);
  const send = nodes.find((node) => node.attributes?.['data-submit'] !== undefined);
  const line = nodes.find((node) => node.className === 'form-answer');
  return { off: send?.attributes?.['aria-disabled'] === 'true', line: line?.text };
}

const MAX_OPTIONS: MaxOptionsView = {
  zone: 'America/New_York',
  bosses: [
    { value: 'm:D5:zapdos', name: 'Zapdos', level: 'D5', tier: 'Dynamax 5★', featured: true },
  ],
  tiers: [{ value: 'D5', tier: 'Dynamax 5★' }],
};

const maxValues = (more: Partial<MaxValues> = {}): MaxValues => ({
  boss: '',
  typed: '',
  tier: '',
  end: '',
  region: '',
  soon: '',
  ...more,
});

describe('a max battle’s form', () => {
  it('is off until a boss is picked', () => {
    expect(maxMissing(maxValues(), {})).toBe('Pick the boss first.');
    expect(maxMissing(maxValues({ boss: 'm:D5:zapdos' }), {})).toBeUndefined();
    expect(shown(maxForm(undefined, MAX_OPTIONS, { filled: {}, regions: [] }))).toEqual({
      off: true,
      line: 'Pick the boss first.',
    });
    expect(
      shown(maxForm(undefined, MAX_OPTIONS, { filled: { boss: 'm:D5:zapdos' }, regions: [] })),
    ).toEqual({ off: false, line: undefined });
  });

  it('is off at a pin refused, its line pointing to "← Pick a Power Spot"', () => {
    const state = { filled: { boss: 'm:D5:zapdos' }, regions: [], pinRefused: true as const };
    expect(maxMissing(maxValues({ boss: 'm:D5:zapdos' }), state)).toBe(PIN_REFUSED_LINE);
    expect(PIN_REFUSED_LINE).toContain('← Pick a Power Spot');
    const form = maxForm(undefined, MAX_OPTIONS, state);
    expect(shown(form)).toEqual({ off: true, line: PIN_REFUSED_LINE });
    // Off, not disabled: it keeps the focus, and a press says why.
    const send = all(form).find((node) => node.attributes?.['data-submit'] !== undefined);
    expect(send?.attributes?.disabled).toBeUndefined();
  });
});

describe('a spawn’s form', () => {
  it('is off until the Pokémon and where it is are given', () => {
    const values = { pokemon: '', details: '', iv: '', region: '' };
    expect(spawnMissing(values)).toBe('Pick the Pokémon first.');
    expect(spawnMissing({ ...values, pokemon: 'Dratini' })).toBe(
      'Say where it is first: a street corner, a park, a gym.',
    );
    expect(spawnMissing({ ...values, pokemon: 'Dratini', details: 'park' })).toBeUndefined();
    expect(shown(spawnForm({ pokemon: [] }, []))).toEqual({
      off: true,
      line: 'Pick the Pokémon first.',
    });
  });
});

describe('a Rocket report’s form', () => {
  it('is off until who was met is picked, and its lineup where it has several', () => {
    const options = caseRocketOptions();
    expect(rocketMissing(options, {})).toBe('Pick who you met first.');
    expect(rocketMissing(options, { who: 'grunt:water' })).toBe(
      'Pick the lineup, or Not sure which.',
    );
    expect(rocketMissing(options, { who: 'grunt:fire' })).toBeUndefined();
    expect(shown(rocketForm(options, { filled: {} }))).toEqual({
      off: true,
      line: 'Pick who you met first.',
    });
    expect(shown(rocketForm(options, { filled: { who: 'grunt:fire' } }))).toEqual({
      off: false,
      line: undefined,
    });
  });
});

describe('a field research report’s form', () => {
  const stop = { key: 's1', name: 'East Fountain' };

  it('says "Loading…" with Report off until its lists come', () => {
    expect(researchMissing(undefined, [stop], { query: '' }, { kind: 'new' })).toBe(LOADING_LINE);
    expect(shown(researchForm(undefined, [stop], { query: '' }))).toEqual({
      off: true,
      line: LOADING_LINE,
    });
  });

  it('is off until a task and its reward are picked', () => {
    const options = caseResearchOptions();
    expect(researchMissing(options, [stop], { query: '' }, { kind: 'new' })).toBe(
      'Pick the task first.',
    );
    expect(researchMissing(options, [stop], { query: '', task: 'dragon' }, { kind: 'new' })).toBe(
      'Pick its reward first.',
    );
    const ready = { query: '', task: 'spin' };
    expect(researchMissing(options, [stop], ready, { kind: 'new' })).toBeUndefined();
    expect(shown(researchForm(options, [stop], ready))).toEqual({ off: false, line: undefined });
  });
});

describe('a new meetup’s form', () => {
  it('is off until its name is given, the line saying what comes first', () => {
    expect(shown(newMeetupForm([{ id: 1, name: 'west' }], undefined))).toEqual({
      off: true,
      line: 'Give the meetup a name first.',
    });
  });
});

describe('a new train’s form', () => {
  it('is off until its name and region are given', () => {
    const values = { name: '', region: '', time: '', atEnd: 'finish' };
    expect(startMissing(values)).toBe('Give the train a name first.');
    expect(startMissing({ ...values, name: 'Legends' })).toBe('Pick the region first.');
    expect(startMissing({ ...values, name: 'Legends', region: '1' })).toBeUndefined();
    expect(shown(startForm([{ id: 1, name: 'west' }]))).toEqual({
      off: true,
      line: 'Give the train a name first.',
    });
  });
});
