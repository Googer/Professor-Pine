import { ButtonStyle } from 'discord.js';
import { describe, expect, it } from 'vitest';
import { accentOf, buttonsOf, textDisplays, thumbnailOf } from '../../test/support/messages.js';
import { expectV2Sendable } from '../../test/support/post-limits.js';
import { titleCase, type CounterRow } from '../domain/counters/counters.js';
import type { Counter } from '../domain/counters/pokebattler-answer.js';
import { COUNTERS_COLOUR, renderCounters, type CountersView } from './counters.js';

const tyranitar = (nickname: string | null, cp: number, estimator: number | null): Counter => ({
  pokemonId: 'TYRANITAR',
  cp,
  nickname,
  results: [
    {
      fast: 'BITE_FAST',
      charged: 'BRUTAL_SWING',
      third: 'CRUNCH',
      legacy: false,
      timeMs: 150_400,
      deaths: 3.04,
      estimator,
    },
  ],
});

const rowOf = (counter: Counter): CounterRow => {
  const [result] = counter.results;
  if (!result) throw new Error('no result');
  return { counter, result };
};

function view(overrides: Partial<CountersView> = {}): CountersView {
  return {
    bossName: 'Mewtwo',
    tier: { level: 'T5', shadow: false },
    link: 'https://www.pokebattler.com/raids/x',
    picture: undefined,
    attackers: { kind: 'box' },
    weather: 'FOG',
    friendship: '0',
    bossMoves: undefined,
    rows: [],
    pokemonName: titleCase,
    move: (id) => ({ name: titleCase(id), type: 'dark' }),
    icon: () => undefined,
    shadow: true,
    mega: true,
    single: false,
    ...overrides,
  };
}

describe('renderCounters', () => {
  it('names a Pokémon of a Pokébox with its nickname and CP, plainly, and never the user', () => {
    const counter = tyranitar('*Rocky* https://x.test', 3512, 1.01);
    const message = renderCounters(view({ rows: [rowOf(counter)] }));
    expect(textDisplays(message)).toEqual([
      '### Counters for Mewtwo\nLevel 5 raid · boss moves: the average of all its movesets\n' +
        'About **2 trainers** with your best counters',
      '`#01` **Tyranitar** "\\*Rocky\\* https:​//x.test" · 3,512 CP · 150s · 3.0 deaths · ' +
        '1.1 trainers\n-# Bite (Dark) / Brutal Swing (Dark) / Crunch (Dark)',
      '-# Your Pokébox on Pokebattler · fog weather · not friends · shadow Pokémon and megas ' +
        'listed',
      '-# Data provided by Pokebattler',
    ]);
    expect(accentOf(message)).toBe(COUNTERS_COLOUR);
    expect(thumbnailOf(message)).toBeUndefined();
    expect(buttonsOf(message).map((button) => [button.label, button.style, button.url])).toEqual([
      ['Full results', ButtonStyle.Link, 'https://www.pokebattler.com/raids/x'],
    ]);
  });

  it('shows the types of the moves as emoji where there are some, and the legacy mark', () => {
    const counter = tyranitar(null, 3000, 2.71);
    const [result] = counter.results;
    if (!result) throw new Error('no result');
    const message = renderCounters(
      view({
        attackers: { kind: 'level', level: '50' },
        weather: 'NO_WEATHER',
        friendship: '4',
        shadow: false,
        mega: false,
        single: true,
        bossMoves: 'Confusion / Psystrike',
        picture: 'https://example.com/mewtwo.png',
        rows: [{ counter, result: { ...result, third: null, legacy: true } }],
        icon: (name) => (name === 'dark' ? '<:dark:1>' : undefined),
        optionsId: 'counters:abc:options',
      }),
    );
    expect(textDisplays(message)).toEqual([
      '### Counters for Mewtwo\nLevel 5 raid · boss moves: Confusion / Psystrike\n' +
        'About **3 trainers** with the best counters',
      '`#01` **Tyranitar** · 150s · 3.0 deaths · 2.8 trainers\n' +
        '-# <:dark:1> Bite / <:dark:1> Brutal Swing †',
      '-# Attackers at level 50 · no weather · best friends · no shadow Pokémon or megas · ' +
        'every moveset of a counter · † a legacy move',
      '-# Data provided by Pokebattler',
    ]);
    expect(thumbnailOf(message)).toBe('https://example.com/mewtwo.png');
    expect(
      buttonsOf(message).map((button) => [button.label, button.emoji, button.customId]),
    ).toEqual([
      ['Change options…', '⚙️', 'counters:abc:options'],
      ['Full results', undefined, undefined],
    ]);
  });

  it('leaves out the trainers when Pokebattler gave no estimate, and says when nothing fits', () => {
    const counter = tyranitar(null, 3000, null);
    const one = renderCounters(
      view({ attackers: { kind: 'level', level: '40' }, rows: [rowOf(counter)], shadow: false }),
    );
    expect(textDisplays(one)[0]).not.toContain('About');
    expect(textDisplays(one)[1]).toMatch(/^`#01` \*\*Tyranitar\*\* · 150s · 3\.0 deaths · \? /);
    expect(textDisplays(one)[2]).toContain('megas listed, no shadow Pokémon');
    expect(textDisplays(renderCounters(view()))[1]).toBe('Pokebattler lists no counter that fits.');
  });

  it('keeps the worst case within what a message holds, leaving out what does not fit', () => {
    const message = renderCounters(worstView(() => true));
    expectV2Sendable(message);
    const [, rows = '', settings = ''] = textDisplays(message);
    expect(rows).toMatch(/…and \d+ more$/);
    expect(settings).toContain('† a legacy move');
  });

  it('says what † means only when a counter that is shown has a legacy move', () => {
    const [, rows = '', settings = ''] = textDisplays(renderCounters(worstView((i) => i === 11)));
    expect(rows).not.toContain('#12');
    expect(settings).not.toContain('†');
  });
});

/**
 * The worst case: twelve counters of a Pokébox with long names, nicknames that need escapes all
 * through, a third move, and every move with an emoji; `legacy` says which have a legacy move.
 */
function worstView(legacy: (index: number) => boolean): CountersView {
  const rows = Array.from({ length: 12 }, (_, i): CounterRow => {
    const counter: Counter = {
      pokemonId: `SOME_VERY_LONG_POKEMON_NAME_FORM_${i}`,
      cp: 12_345,
      nickname: '*_~`|>'.repeat(10),
      results: [
        {
          fast: 'A_VERY_LONG_FAST_MOVE_NAME_FAST',
          charged: 'A_VERY_LONG_CHARGED_MOVE_NAME',
          third: 'ANOTHER_VERY_LONG_CHARGED_MOVE',
          legacy: legacy(i),
          timeMs: 999_999,
          deaths: 99.99,
          estimator: 99.99,
        },
      ],
    };
    return rowOf(counter);
  });
  return view({
    bossName: '*_'.repeat(40),
    bossMoves: '*_'.repeat(40),
    picture: 'https://example.com/boss.png',
    rows,
    icon: (name) => `<:${name}:123456789012345678>`,
    single: true,
    shadow: false,
    mega: true,
    optionsId: `counters:${'a'.repeat(16)}:options`,
  });
}
