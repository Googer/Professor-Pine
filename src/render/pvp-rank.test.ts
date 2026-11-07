import { describe, expect, it } from 'vitest';
import { catalogueFixture } from '../../test/support/game-data.js';
import {
  buttonsOf,
  componentCount,
  selectsOf,
  textDisplays,
  thumbnailsOf,
} from '../../test/support/messages.js';
import { expectV2Sendable } from '../../test/support/post-limits.js';
import type { PokemonEntry } from '../domain/pogo/game-master.js';
import { cappedRanks } from '../domain/pvp/rank.js';
import { percentText, pvpivsLink, rankColour, renderRank } from './pvp-rank.js';

const catalogue = catalogueFixture();

function entry(key: string): PokemonEntry {
  const found = catalogue.byKey(key);
  if (!found) throw new Error(`no entry ${key}`);
  return found;
}

describe('pvpivsLink', () => {
  const ivs = { attack: 0, defense: 14, stamina: 15 };

  it('names the Pokémon, the league CP, the IVs, the floor and the levels, always', () => {
    // The site otherwise ranks by the floor and levels the visitor saved in their browser.
    expect(pvpivsLink(entry('azumarill'), 'ultra', ivs, { levelCap: 51 })).toBe(
      'https://pvpivs.com/?mon=Azumarill&cp=2500&IVs=0_14_15&f=0&min=1&max=51',
    );
    expect(pvpivsLink(entry('azumarill'), 'ultra', ivs, { levelCap: 50, floor: 10 })).toBe(
      'https://pvpivs.com/?mon=Azumarill&cp=2500&IVs=0_14_15&f=10&min=1&max=50',
    );
  });

  it('says a shadow, as the site’s own links do', () => {
    expect(
      pvpivsLink(entry('mewtwo'), 'great', ivs, { levelCap: 50, floor: 6, shadow: true }),
    ).toBe('https://pvpivs.com/?mon=Mewtwo&cp=1500&IVs=0_14_15_true&f=6&min=1&max=50');
  });

  it('names the Pokémon as the site’s list does, which the site needs exactly', () => {
    const nameOf = (key: string) =>
      /mon=([^&]*)/.exec(
        pvpivsLink(entry(key), 'great', ivs, {
          levelCap: 51,
          sameDex: catalogue.byDex(entry(key).dex),
        }),
      )?.[1];
    // A form that changes only the looks is the species there.
    expect(nameOf('unown_a')).toBe('Unown');
    expect(nameOf('castform_rainy')).toBe('Castform');
    expect(nameOf('toxtricity_low_key')).toBe('Toxtricity');
    expect(nameOf('giratina_altered')).toBe('Giratina_Altered');
    expect(nameOf('deoxys_attack')).toBe('Deoxys_Attack');
    expect(nameOf('irontreads')).toBe('Iron_Treads');
    expect(nameOf('chienpao')).toBe('Chien_Pao');
    expect(nameOf('wooper_paldea')).toBe('Wooper_Paldean');
    expect(nameOf('zacian_hero')).toBe('Zacian_Hero_of_Many_Battles');
    expect(nameOf('necrozma_ultra')).toBe('Ultra_Necrozma');
    expect(nameOf('giratina_origin')).toBe('Giratina_Origin');
    expect(nameOf('malamar_mega')).toBe('Mega_Malamar');
    expect(nameOf('charizard_mega_x')).toBe('Mega_Charizard_X');
    expect(nameOf('raichu_alola')).toBe('Raichu_Alola');
    expect(nameOf('darmanitan_galarian_standard')).toBe('Darmanitan_Galarian_Standard');
    expect(nameOf('mr_mime')).toBe('Mr_Mime');
    expect(nameOf('ho_oh')).toBe('Ho_Oh');
    expect(nameOf('farfetchd')).toBe('Farfetchd');
    expect(nameOf('nidoran_female')).toBe('Nidoran_Female');
    expect(nameOf('mewtwo_a')).toBe('Mewtwo_Armored');
    expect(nameOf('tauros_paldea_blaze')).toBe('Tauros_Paldean');
    expect(nameOf('calyrex_shadow_rider')).toBe('Shadow_Rider_Calyrex');
  });

  it('marks what the site’s list marks as speculative, released or not', () => {
    const nameOf = (key: string) =>
      /mon=([^&]*)/.exec(
        pvpivsLink(entry(key), 'master', ivs, {
          levelCap: 50,
          sameDex: catalogue.byDex(entry(key).dex),
        }),
      )?.[1];
    expect(nameOf('mewtwo_mega_y')).toBe('Mega_Mewtwo_Y_SPECULATIVE');
    expect(nameOf('mewtwo_mega_x')).toBe('Mega_Mewtwo_X_SPECULATIVE');
    expect(nameOf('raichu_mega_x')).toBe('Mega_Raichu_X_SPECULATIVE');
    expect(nameOf('terapagos')).toBe('Terapagos_Normal_SPECULATIVE');
    // Its own mega has the mark on the site; Mewtwo itself does not.
    expect(nameOf('mewtwo')).toBe('Mewtwo');
    expect(nameOf('charizard_mega_x')).toBe('Mega_Charizard_X');
  });

  it('names the forms the site has under another name', () => {
    const nameOf = (key: string) =>
      /mon=([^&]*)/.exec(
        pvpivsLink(entry(key), 'great', ivs, {
          levelCap: 50,
          sameDex: catalogue.byDex(entry(key).dex),
        }),
      )?.[1];
    expect(nameOf('zygarde')).toBe('Zygarde_Fifty_Percent');
    expect(nameOf('zygarde_complete_fifty_percent')).toBe('Zygarde_Fifty_Percent');
    expect(nameOf('zygarde_complete_ten_percent')).toBe('Zygarde_Ten_Percent');
    expect(nameOf('minior')).toBe('Minior_Meteor');
    for (const colour of ['blue', 'green', 'indigo', 'orange', 'red', 'violet', 'yellow']) {
      expect(nameOf(`minior_${colour}`)).toBe('Minior_Core');
    }
  });
});

describe('rankColour', () => {
  it('is gold, silver and bronze by the share of the best stat product', () => {
    expect(rankColour(100)).toBe(0xffd700);
    expect(rankColour(99)).toBe(0xffd700);
    expect(rankColour(98.99)).toBe(0xc0c0c0);
    expect(rankColour(97)).toBe(0xc0c0c0);
    expect(rankColour(95)).toBe(0xcd7f32);
    expect(rankColour(94.99)).toBe(0x30839f);
  });
});

describe('percentText', () => {
  it('cuts to two places, so only the best shows 100%', () => {
    expect(percentText(100)).toBe('100.00%');
    expect(percentText(99.999)).toBe('99.99%');
    expect(percentText(87.5)).toBe('87.50%');
  });
});

describe('renderRank', () => {
  const mewtwo = catalogue.byKey('mewtwo');
  if (!mewtwo) throw new Error('no mewtwo');
  const view = {
    entry: mewtwo,
    ivs: { attack: 15, defense: 15, stamina: 15 },
    league: 'little',
    filter: 'none',
    floor: { kind: 'picked', filter: 'none' },
    ranks: { level50: undefined },
  } as const;

  it('says of a combination too strong for the league already at level 1 that it is', () => {
    const message = renderRank(view);
    expect(textDisplays(message)).toEqual([
      [
        '### Mewtwo 15/15/15',
        'Little Cup',
        'Too strong for Little Cup already at level 1 (above 500 CP).',
      ].join('\n'),
    ]);
    expectV2Sendable(message);
  });

  it('keeps a name that needs escapes within what a message holds', () => {
    const odd = { ...mewtwo, name: '*_Mr. ~Mime~_* [x](y)' };
    const message = renderRank({ ...view, entry: odd, picture: 'https://example.com/a.png' });
    expect(textDisplays(message)[0]?.split('\n')[0]).toBe(
      String.raw`### \*\_Mr. \~Mime\~\_\* \[x]\(y) 15/15/15`,
    );
    expectV2Sendable(message);
  });

  it('has no controls for a Pokémon whose custom ids would not fit', () => {
    const long = { ...mewtwo, key: 'x'.repeat(70) };
    const message = renderRank({
      ...view,
      entry: long,
      family: { members: [{ entry: long, ranks: view.ranks }], shown: false, marked: long.key },
    });
    expect(buttonsOf(message)).toEqual([]);
    expect(selectsOf(message)).toEqual([]);
  });

  it('names a member too strong for the league so in the menu', () => {
    const member = (key: string) => ({ entry: { ...mewtwo, key, name: key }, ranks: view.ranks });
    const message = renderRank({
      ...view,
      family: { members: [member('mewtwo'), member('other')], shown: false, marked: 'mewtwo' },
    });
    expect(selectsOf(message)[0]?.options.map((option) => option.description)).toEqual([
      'Too strong for this league',
      'Too strong for this league',
    ]);
  });

  describe('the family beside its pictures, while the message holds them', () => {
    // Mega Mewtwo X in Master League: four level caps (a Super Mega).
    const mega = catalogue.byKey('mewtwo_mega_x');
    if (!mega) throw new Error('no mewtwo_mega_x');
    const ranks = cappedRanks(
      mega.stats,
      catalogue.cpMultipliers,
      { attack: 10, defense: 12, stamina: 13 },
      { leagueCp: undefined, floor: 10, superMegaLevels: 2 },
    );
    const members = (count: number) =>
      Array.from({ length: count }, (_, n) => ({
        entry: { ...mega, key: `member_${String(n)}`, name: `Member ${String(n)}` },
        ranks,
        picture: `https://example.com/${String(n)}.png`,
      }));
    const shown = (count: number) =>
      renderRank({
        entry: mega,
        ivs: { attack: 10, defense: 12, stamina: 13 },
        league: 'master',
        filter: 'raid',
        floor: { kind: 'picked', filter: 'raid' },
        ranks,
        picture: 'https://example.com/head.png',
        family: { members: members(count), shown: true, marked: 'member_0' },
      });

    it('shows six members with their pictures beside four levels and a filter', () => {
      expect(ranks.superMegaBuddy).toBeDefined();
      const message = shown(6);
      expect(thumbnailsOf(message)).toHaveLength(7);
      expect(componentCount(message)).toBeLessThanOrEqual(40);
      expectV2Sendable(message);
    });

    it('lists the members as text where pictures would pass 40 components', () => {
      const message = shown(7);
      expect(thumbnailsOf(message)).toEqual(['https://example.com/head.png']);
      const list = textDisplays(message).find((text) => text.startsWith('▸ **Member 0**'));
      expect(list?.split('\n')).toHaveLength(7);
      expectV2Sendable(message);
    });
  });
});
