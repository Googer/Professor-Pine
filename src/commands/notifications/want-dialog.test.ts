import { describe, expect, it } from 'vitest';
import { decodeCustomId } from '../../discord/custom-id.js';
import {
  readRocketDialogId,
  readWantDialogId,
  rocketDialogId,
  wantDialogId,
  type RocketDialogId,
  type WantDialogId,
} from './want-dialog.js';

const SERVER = '100000000000000011';
/** When a dialog opened, and its per-open token (`openToken`, plan 8X-F). */
const OPENED = Date.UTC(2026, 9, 22, 16, 30);
const TOKEN = `~${OPENED.toString(36)}`;
const read = (customId: string): WantDialogId | undefined => {
  const id = decodeCustomId(customId);
  return id && readWantDialogId(id);
};

describe('the custom id of /want’s dialog (plan 8R-4, F6)', () => {
  const corsola: WantDialogId = {
    subject: { kind: 'pokemon', dex: 222 },
    shown: ['raids', 'spawns', 'research', 'shadow'],
    costumes: true,
    remove: true,
    which: 'k3n1x2',
  };

  it('carries the boxes shown, the fields shown, the Which hash, then server, form and page', () => {
    expect(wantDialogId(corsola, OPENED)).toBe(`wantbox:p222:set2:1l:3:k3n1x2:${TOKEN}`);
    expect(wantDialogId({ ...corsola, costumes: false, remove: false, which: '0' }, OPENED)).toBe(
      `wantbox:p222:set2:1l:0:0:${TOKEN}`,
    );
    const letter: WantDialogId = {
      subject: { kind: 'pokemon', dex: 201, form: 'unown_question_mark' },
      shown: ['raids', 'spawns'],
      costumes: false,
      remove: true,
      which: '0',
      server: SERVER,
      page: 2,
    };
    expect(wantDialogId(letter, OPENED)).toBe(
      `wantbox:p201:set2:9:2:0:${SERVER}:unown_question_mark:l2:${TOKEN}`,
    );
    const tier: WantDialogId = {
      subject: { kind: 'tier', level: 'MegaLegendary' },
      shown: ['raids', 'shadow-raids'],
      costumes: false,
      remove: false,
      which: '0',
      page: 0,
    };
    expect(wantDialogId(tier, OPENED)).toBe(`wantbox:tMegaLegendary:set2:3:0:0:l0:${TOKEN}`);
    for (const one of [corsola, letter, tier, { ...corsola, server: SERVER }]) {
      expect(read(wantDialogId(one, OPENED))).toEqual(one);
    }
  });

  // Plan 8X-F, "For 8R-4": Discord's client shows what was last submitted under a custom id in
  // place of what the dialog marks, so every opening has an id of its own.
  it('ends in a token of when it opened, which a Submit leaves out', () => {
    const later = wantDialogId(corsola, OPENED + 1);
    expect(later).not.toBe(wantDialogId(corsola, OPENED));
    expect(read(later)).toEqual(corsola);
    // The longest: the largest Pokédex number and mask, a Which hash of seven, a server, Unown's
    // longest letter and a page of three digits, opened in a far year.
    const longest = wantDialogId(
      {
        subject: { kind: 'pokemon', dex: 1025, form: 'unown_question_mark' },
        shown: ['raids', 'dynamax', 'gigantamax', 'spawns', 'research', 'shadow'],
        costumes: true,
        remove: true,
        which: 'zzzzzzz',
        server: '18446744073709551615',
        page: 999,
      },
      Date.UTC(2999, 11, 31),
    );
    expect(longest.length).toBeLessThanOrEqual(100);
  });

  it('reads any other shape as none: an id of before the deploy, or one of a later version', () => {
    for (const customId of [
      'wantbox:p68:set:1r',
      'wantbox:t:set:T5:3',
      // The shape of the dialog before plan 8R-4 had a token (no released dialog has it).
      'wantbox:p68:set2:1r:0:0',
      `wantbox:p68:set2:1r:0:0:${SERVER}`,
      `wantbox:p68:set3:1r:0:0:${TOKEN}`,
      `wantbox:p68:set2:1r:0:${TOKEN}`,
      `wantbox:p68:set2:0:0:0:${TOKEN}`,
      `wantbox:p68:set2:1r:z:0:${TOKEN}`,
      `wantbox:p0:set2:1r:0:0:${TOKEN}`,
      `wantbox:tT9:set2:3:0:0:${TOKEN}`,
      `wantbox:tT5:set2:3:0:0:unown_a:${TOKEN}`,
      `wantbox:p201:set2:9:2:0:unown_a:${SERVER}:${TOKEN}`,
      `wantbox:p201:set2:9:2:0:l2:unown_a:${TOKEN}`,
      `wantbox:p201:set2:9:2:0:Unown A:${TOKEN}`,
      `wantbox:p201:set2:9:2:0:unown_a:l1:more:${TOKEN}`,
      `wantbox:p201:set2:9:2:0:unown_a:${TOKEN}:l1`,
    ]) {
      expect(read(customId), customId).toBeUndefined();
    }
  });
});

describe('the custom id of the Team GO Rocket dialog (plan 8R-4, S12)', () => {
  const readRocket = (customId: string): RocketDialogId | undefined => {
    const id = decodeCustomId(customId);
    return id && readRocketDialogId(id);
  };

  it('carries Remove shown, the server and the page, then a token of when it opened', () => {
    const dm: RocketDialogId = { remove: true, server: SERVER };
    expect(rocketDialogId(dm, OPENED)).toBe(`wantbox:r:rset1:2:${SERVER}:${TOKEN}`);
    expect(rocketDialogId({ remove: false, page: 3 }, OPENED)).toBe(
      `wantbox:r:rset1:0:l3:${TOKEN}`,
    );
    for (const one of [dm, { remove: false }, { remove: true, page: 0 }]) {
      expect(readRocket(rocketDialogId(one, OPENED))).toEqual(one);
    }
    // Plan 8X-F, "For 8R-4": every opening has an id of its own.
    expect(rocketDialogId(dm, OPENED + 1)).not.toBe(rocketDialogId(dm, OPENED));
    const longest = { remove: true, server: '18446744073709551615', page: 999 };
    expect(rocketDialogId(longest, Date.UTC(2999, 11, 31)).length).toBeLessThanOrEqual(100);
  });

  it('reads an id without its token, or of another shape, as none', () => {
    for (const customId of [
      'wantbox:r:rset1:2',
      `wantbox:r:rset1:2:${SERVER}`,
      `wantbox:r:rset2:2:${TOKEN}`,
      `wantbox:r:rset1:1:${TOKEN}`,
      `wantbox:r:rset1:2:l1:${SERVER}:${TOKEN}`,
      `wantbox:r:rset1:2:${TOKEN}:l1`,
    ]) {
      expect(readRocket(customId), customId).toBeUndefined();
    }
  });
});
