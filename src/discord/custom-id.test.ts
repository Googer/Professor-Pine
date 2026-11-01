import { describe, expect, it } from 'vitest';
import {
  decodeCustomId,
  encodeCustomId,
  encodeCustomIdIfFits,
  MAX_CUSTOM_ID_LENGTH,
} from './custom-id.js';

const PARTY = '7f3c2a10-5b6e-4c1d-9a8b-0123456789ab';

describe('custom ids', () => {
  it('round-trips kind, id, action and args', () => {
    const raw = encodeCustomId({ kind: 'p', id: PARTY, action: 'group', args: ['B'] });
    expect(raw).toBe(`p:${PARTY}:group:B`);
    expect(decodeCustomId(raw)).toEqual({ kind: 'p', id: PARTY, action: 'group', args: ['B'] });
  });

  it('decodes an id without args', () => {
    expect(decodeCustomId(`p:${PARTY}:join`)).toEqual({
      kind: 'p',
      id: PARTY,
      action: 'join',
      args: [],
    });
  });

  it('rejects a part containing the separator', () => {
    expect(() => encodeCustomId({ kind: 'p', id: 'a:b', action: 'join' })).toThrow(/":"/);
  });

  it('rejects an empty part', () => {
    expect(() => encodeCustomId({ kind: 'p', id: '', action: 'join' })).toThrow(/empty/);
  });

  it('rejects ids longer than Discord allows', () => {
    expect(() =>
      encodeCustomId({ kind: 'p', id: 'x'.repeat(MAX_CUSTOM_ID_LENGTH), action: 'join' }),
    ).toThrow(/100/);
  });

  it('accepts exactly 100 characters and refuses 101', () => {
    // "p:" + id + ":join" is 7 characters plus the id.
    const fits = encodeCustomId({ kind: 'p', id: 'x'.repeat(93), action: 'join' });
    expect(fits).toHaveLength(MAX_CUSTOM_ID_LENGTH);
    expect(decodeCustomId(fits)?.id).toHaveLength(93);
    expect(() => encodeCustomId({ kind: 'p', id: 'x'.repeat(94), action: 'join' })).toThrow(
      'custom id is 101 characters; Discord allows 100',
    );
  });

  it('rejects an empty argument or one containing the separator', () => {
    expect(() => encodeCustomId({ kind: 'p', id: PARTY, action: 'group', args: [''] })).toThrow(
      /empty/,
    );
    expect(() => encodeCustomId({ kind: 'p', id: PARTY, action: 'group', args: ['a:b'] })).toThrow(
      /":"/,
    );
    expect(() => encodeCustomId({ kind: '', id: PARTY, action: 'join' })).toThrow(/empty/);
    expect(() => encodeCustomId({ kind: 'p', id: PARTY, action: 'jo:in' })).toThrow(/":"/);
  });

  it('keeps several arguments in order', () => {
    const raw = encodeCustomId({
      kind: 'dm',
      id: 'stop',
      action: 'pokemon',
      args: ['150', 'raid'],
    });
    expect(decodeCustomId(raw)?.args).toEqual(['150', 'raid']);
  });

  it('returns undefined for an id with an empty argument', () => {
    expect(decodeCustomId('p:abc:group:')).toBeUndefined();
    expect(decodeCustomId('p:abc:group::B')).toBeUndefined();
    expect(decodeCustomId('')).toBeUndefined();
  });

  it('returns undefined for malformed or legacy ids', () => {
    expect(decodeCustomId('join')).toBeUndefined();
    expect(decodeCustomId('p:only-two')).toBeUndefined();
    expect(decodeCustomId('p::join')).toBeUndefined();
  });
});

describe('encodeCustomIdIfFits', () => {
  it('gives the id when it fits and undefined when it is too long', () => {
    expect(encodeCustomIdIfFits({ kind: 'dm', id: '1', action: 'stop', args: ['g', '4'] })).toBe(
      'dm:1:stop:g:4',
    );
    expect(encodeCustomIdIfFits({ kind: 'p', id: 'x'.repeat(93), action: 'join' })).toHaveLength(
      MAX_CUSTOM_ID_LENGTH,
    );
    expect(encodeCustomIdIfFits({ kind: 'p', id: 'x'.repeat(94), action: 'join' })).toBeUndefined();
  });

  it('still throws for a part that is empty or has the separator', () => {
    expect(() => encodeCustomIdIfFits({ kind: 'p', id: '', action: 'join' })).toThrow(/empty/);
    expect(() => encodeCustomIdIfFits({ kind: 'p', id: 'a:b', action: 'join' })).toThrow(/":"/);
  });
});
