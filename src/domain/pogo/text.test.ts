import { describe, expect, it } from 'vitest';
import { parseTextFile } from './text.js';

describe('parseTextFile', () => {
  it('reads RESOURCE ID / TEXT pairs', () => {
    const texts = parseTextFile(
      'RESOURCE ID: pokemon_name_0003\nTEXT: Venusaur\n\nRESOURCE ID: move_name_0013\nTEXT: Wrap\n',
    );
    expect(texts.get('pokemon_name_0003')).toBe('Venusaur');
    expect(texts.get('move_name_0013')).toBe('Wrap');
    expect(texts.size).toBe(2);
  });

  it('handles Windows line endings', () => {
    const texts = parseTextFile(
      'RESOURCE ID: a\r\nTEXT: one\r\n\r\nRESOURCE ID: b\r\nTEXT: two\r\n',
    );
    expect([...texts]).toEqual([
      ['a', 'one'],
      ['b', 'two'],
    ]);
  });

  it('keeps names that end in r, which the legacy parser truncated', () => {
    const texts = parseTextFile('RESOURCE ID: move_name_0024\nTEXT: Flamethrower\n');
    expect(texts.get('move_name_0024')).toBe('Flamethrower');
  });

  it('keeps colons and leading spaces inside the text', () => {
    const texts = parseTextFile('RESOURCE ID: pokemon_name_0772\nTEXT: Type: Null\n');
    expect(texts.get('pokemon_name_0772')).toBe('Type: Null');
  });

  it('skips a key with no text line and survives junk', () => {
    const texts = parseTextFile('garbage\nRESOURCE ID: lonely\n\nRESOURCE ID: ok\nTEXT: fine');
    expect([...texts]).toEqual([['ok', 'fine']]);
    expect(parseTextFile('').size).toBe(0);
  });
});
