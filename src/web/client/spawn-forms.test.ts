import { describe, expect, it } from 'vitest';
import type { GeoView } from '../../domain/web/geo-data.js';
import type { WildOptionsView } from '../../domain/web/spawn-data.js';
import type { Me } from './notice.js';
import type { PressSteps } from './parties.js';
import type { PageNode } from './popup.js';
import {
  pressedWhere,
  redrawnAfter,
  regionsAt,
  sendSpawnForm,
  spawnAnswerOf,
  spawnBody,
  spawnBox,
  spawnForm,
  spawnPoint,
} from './spawn-forms.js';

const OPTIONS: WildOptionsView = {
  pokemon: [
    ['dratini', 'Dratini'],
    ['rattata_alola', 'Alolan Rattata'],
    ['uxie', 'Uxie'],
  ],
};

/** West and East as `/api/geo` gives them, East reaching 0.05° into West. */
const REGIONS: GeoView['regions'] = [
  {
    id: 1,
    name: 'west',
    outline: [
      [40, -80.1],
      [40.1, -80.1],
      [40.1, -80],
      [40, -80],
      [40, -80.1],
    ],
  },
  {
    id: 2,
    name: 'east',
    outline: [
      [40, -80.05],
      [40.1, -80.05],
      [40.1, -79.9],
      [40, -79.9],
      [40, -80.05],
    ],
  },
];

/** Every node of a tree, depth first. */
function all(node: PageNode): PageNode[] {
  return [node, ...(node.children ?? []).flatMap(all)];
}

const byName = (node: PageNode, name: string) =>
  all(node).find((one) => one.attributes?.name === name);
const optionsOf = (node: PageNode | undefined) =>
  all(node ?? { tag: 'none' })
    .filter((one) => one.tag === 'option')
    .map((one) => [one.attributes?.value, one.text]);

describe('"Report spawn here" in a gym\'s popup (spawnBox)', () => {
  it('is a button that names the gym whose place is the point', () => {
    const box = spawnBox(4);
    expect(box.className).toBe('spawn-box place-control');
    expect(box.children).toEqual([
      {
        tag: 'button',
        className: 'report-spawn',
        text: 'Report spawn here',
        attributes: { type: 'button', 'data-spawn': '4' },
      },
    ]);
  });
});

describe('the regions a point lies in (regionsAt)', () => {
  it('gives every region of the map whose outline holds the point, by id and name', () => {
    expect(regionsAt({ lat: 40.05, lon: -80.08 }, REGIONS)).toEqual([{ id: 1, name: 'west' }]);
    expect(regionsAt({ lat: 40.05, lon: -80.02 }, REGIONS)).toEqual([
      { id: 1, name: 'west' },
      { id: 2, name: 'east' },
    ]);
    expect(regionsAt({ lat: 41, lon: -81 }, REGIONS)).toEqual([]);
  });

  it('keeps a point to six decimals, as the server does', () => {
    expect(spawnPoint(40.123456789, -80.0000004)).toEqual({ lat: 40.123457, lon: -80 });
  });
});

describe('where a press on the map may report (pressedWhere)', () => {
  it('gives the regions of a point in one or several, and says at once that a point outside them is in none', () => {
    expect(pressedWhere({ lat: 40.05, lon: -80.08 }, REGIONS)).toEqual({
      regions: [{ id: 1, name: 'west' }],
    });
    expect(pressedWhere({ lat: 40.05, lon: -80.02 }, REGIONS)).toEqual({
      regions: [
        { id: 1, name: 'west' },
        { id: 2, name: 'east' },
      ],
    });
    expect(pressedWhere({ lat: 41, lon: -81 }, REGIONS)).toEqual({
      text: 'That point is not in a region of this server.',
    });
    expect(pressedWhere({ lat: 40.05, lon: -80.08 }, [])).toEqual({
      text: 'That point is not in a region of this server.',
    });
  });
});

describe('the form of a spawn report (spawnForm)', () => {
  it("offers /wild's Pokémon to pick by name, asks where it is, and the IVs only if checked", () => {
    const form = spawnForm(OPTIONS, []);
    expect(form.attributes).toMatchObject({ 'data-form': 'spawn' });
    expect(byName(form, 'pokemon')?.attributes).toMatchObject({
      list: 'wild-pokemon',
      maxlength: '100',
    });
    const list = all(form).find((one) => one.tag === 'datalist');
    expect(list?.attributes).toEqual({ id: 'wild-pokemon' });
    expect(optionsOf(list)).toEqual([
      ['Dratini', undefined],
      ['Alolan Rattata', undefined],
      ['Uxie', undefined],
    ]);
    expect(byName(form, 'details')?.attributes).toMatchObject({ maxlength: '200' });
    expect(optionsOf(byName(form, 'iv'))).toEqual([
      ['', 'Not checked'],
      ['perfect', 'Perfect (100%)'],
      ['zero', 'Zero (0%)'],
    ]);
    expect(byName(form, 'region')).toBeUndefined();
  });

  it('asks for the region of a point that lies in several, and keeps what was filled in', () => {
    const form = spawnForm(
      OPTIONS,
      [
        { id: 1, name: 'west' },
        { id: 2, name: 'east' },
      ],
      { pokemon: 'Dratini', details: 'by the bench', iv: 'zero', region: '2' },
    );
    expect(optionsOf(byName(form, 'region'))).toEqual([
      ['', 'Pick the region'],
      ['1', 'west'],
      ['2', 'east'],
    ]);
    const selected = all(form).filter((one) => one.attributes?.selected !== undefined);
    expect(selected.map((one) => one.attributes?.value)).toEqual(['zero', '2']);
    expect(byName(form, 'pokemon')?.attributes?.value).toBe('Dratini');
    expect(byName(form, 'details')?.attributes?.value).toBe('by the bench');
  });
});

describe('the body of a spawn report (spawnBody)', () => {
  const point = { lat: 40.05, lon: -80.02 };
  const values = { pokemon: 'Dratini', details: ' by the bench ', iv: '', region: '' };

  it('sends a Pokémon picked by its name as its key, and typed text as it is', () => {
    expect(spawnBody(point, values, OPTIONS)).toEqual({
      body: { pokemon: 'dratini', details: 'by the bench', lat: 40.05, lon: -80.02 },
    });
    expect(spawnBody(point, { ...values, pokemon: ' alolan rattata ' }, OPTIONS)).toEqual({
      body: { pokemon: 'rattata_alola', details: 'by the bench', lat: 40.05, lon: -80.02 },
    });
    expect(spawnBody(point, { ...values, pokemon: 'dratni' }, OPTIONS)).toMatchObject({
      body: { pokemon: 'dratni' },
    });
  });

  it('sends the IVs and the region when they are picked', () => {
    expect(spawnBody(point, { ...values, iv: 'perfect', region: '2' }, OPTIONS)).toEqual({
      body: {
        pokemon: 'dratini',
        details: 'by the bench',
        iv: 'perfect',
        lat: 40.05,
        lon: -80.02,
        region: 2,
      },
    });
  });

  it('says what is missing first', () => {
    expect(spawnBody(point, { ...values, pokemon: ' ' }, OPTIONS)).toEqual({
      text: 'Pick the Pokémon first.',
    });
    expect(spawnBody(point, { ...values, details: '  ' }, OPTIONS)).toEqual({
      text: 'Say where it is first: a street corner, a park, a gym.',
    });
  });
});

describe('sending a spawn report (sendSpawnForm)', () => {
  const steps = (answers: Array<{ status: number; body: unknown }>, me?: Me): PressSteps => ({
    post: () => {
      const next = answers.shift();
      return next ? Promise.resolve(next) : Promise.reject(new Error('no answer'));
    },
    me: () => Promise.resolve(me ?? { loggedIn: false }),
  });

  it('gives the words, whether it was made, and the regions to pick from when asked', async () => {
    expect(
      await sendSpawnForm('token', steps([{ status: 200, body: { ok: true, text: 'Reported.' } }])),
    ).toEqual({ text: 'Reported.', csrf: 'token', ok: true });
    const several = await sendSpawnForm(
      'token',
      steps([
        {
          status: 422,
          body: { ok: false, text: 'Pick one.', regions: [{ id: 1, name: 'west' }] },
        },
      ]),
    );
    expect(several).toEqual({
      ok: false,
      text: 'Pick one.',
      csrf: 'token',
      regions: [{ id: 1, name: 'west' }],
    });
  });

  it('tries once more with a new token after a 403, as a press does', async () => {
    const sent = await sendSpawnForm(
      'old',
      steps(
        [
          { status: 403, body: { error: 'Forbidden' } },
          { status: 200, body: { ok: true, text: 'Done.' } },
        ],
        { loggedIn: true, name: 'Alice', member: true, csrf: 'new', readOnly: false },
      ),
    );
    expect(sent).toMatchObject({ text: 'Done.', csrf: 'new', ok: true });
  });

  it('draws the form again with the regions whenever an answer names them, keeping what was filled in', () => {
    const filled = { pokemon: 'Dratini', details: 'by the bench', iv: 'zero', region: '' };
    const west = { id: 1, name: 'west' };
    const east = { id: 2, name: 'east' };
    // The page saw the point in one region, the server in two.
    expect(redrawnAfter({ ok: false, regions: [west, east] }, filled)).toEqual({
      regions: [west, east],
      filled,
    });
    // The form offered two already: the server's regions are taken all the same, and a region
    // picked that is not among them is picked no more.
    const north = { id: 4, name: 'north' };
    expect(redrawnAfter({ ok: false, regions: [east, north] }, { ...filled, region: '1' })).toEqual(
      { regions: [east, north], filled },
    );
    expect(redrawnAfter({ ok: false, regions: [east, north] }, { ...filled, region: '2' })).toEqual(
      { regions: [east, north], filled: { ...filled, region: '2' } },
    );
    // An answer without regions leaves the form as it is.
    expect(redrawnAfter({ ok: false }, filled)).toBeUndefined();
    expect(redrawnAfter({ ok: true }, filled)).toBeUndefined();
  });

  it('reads what the server answered, and nothing else', () => {
    expect(spawnAnswerOf('nonsense')).toEqual({ ok: false });
    expect(spawnAnswerOf({ ok: true, regions: 'x' })).toEqual({ ok: true });
    expect(spawnAnswerOf({ ok: false, regions: [{ id: '1', name: 2 }] })).toEqual({ ok: false });
    expect(spawnAnswerOf({ ok: false, regions: [{ id: 1, name: 'west' }, 'x'] })).toEqual({
      ok: false,
      regions: [{ id: 1, name: 'west' }],
    });
  });
});

describe('the button that sends the spawn form', () => {
  it('is blue, as in every form; Cancel stays gray', () => {
    const form = spawnForm(OPTIONS, []);
    const classOf = (attribute: string) =>
      all(form).find((node) => node.attributes?.[attribute] !== undefined)?.className;
    expect(classOf('data-submit')).toBe('press primary');
    expect(classOf('data-cancel')).toBe('press');
  });
});
