import { describe, expect, it } from 'vitest';
import {
  pokemonTarget,
  type NotificationTarget,
} from '../../src/domain/pogo/notification-target.js';
import { MemoryWants } from './wants.js';

const ALICE = '312345678901234567';
const BOB = '312345678901234568';
const HOME = '412345678901234567';
const AWAY = '412345678901234568';
const species = (dex: number): NotificationTarget => ({ kind: 'pokemon', dex });
const T5: NotificationTarget = { kind: 'tier', tier: { level: 'T5', shadow: false } };

describe('MemoryWants', () => {
  it('keeps wants per member and server, as the repository does', async () => {
    const wants = new MemoryWants();
    expect(await wants.set(ALICE, HOME, species(150), 'raid')).toMatchObject({ kind: 'added' });
    expect(await wants.set(ALICE, HOME, species(150), 'both')).toMatchObject({
      kind: 'changed',
      before: 'raid',
    });
    expect(await wants.set(ALICE, HOME, T5, 'both')).toEqual({
      kind: 'added',
      want: { target: T5, scope: 'raid' },
    });
    await wants.set(ALICE, AWAY, species(1), 'spawn');
    await wants.set(BOB, HOME, species(2), 'spawn');
    expect(await wants.list(ALICE, HOME)).toEqual({
      wants: [
        { target: species(150), scope: 'both' },
        { target: T5, scope: 'raid' },
      ],
      unreadable: 0,
    });
    expect(await wants.remove(ALICE, HOME, species(1))).toBe(false);
    expect(await wants.remove(ALICE, HOME, T5)).toBe(true);
    expect(await wants.count(ALICE, HOME)).toBe(1);
    expect(await wants.count(BOB, HOME)).toBe(1);
  });

  it('holds legacy rows, counts what cannot be read and removes all of a server', async () => {
    const wants = new MemoryWants();
    wants.add(ALICE, HOME, 150, 'Raid');
    wants.add(ALICE, HOME, 150, 'spawn');
    wants.add(ALICE, HOME, -7, 'spawn');
    wants.add(ALICE, AWAY, 151, 'both');
    expect(await wants.list(ALICE, HOME)).toEqual({
      wants: [{ target: species(150), scope: 'both' }],
      unreadable: 1,
    });
    expect(await wants.count(ALICE, HOME)).toBe(2);
    expect(await wants.set(ALICE, HOME, species(150), 'both')).toMatchObject({ kind: 'unchanged' });
    expect(wants.rows.filter((row) => row.guildId === HOME)).toHaveLength(2);
    expect(await wants.removeAll(ALICE, HOME)).toBe(2);
    expect(wants.rows).toHaveLength(1);
  });

  it('keeps a species, one form of it and its shadow raids as wants of their own', async () => {
    const wants = new MemoryWants();
    const origin = pokemonTarget(487, 'giratina_origin');
    const shadow = pokemonTarget(487, undefined, true);
    wants.add(ALICE, HOME, 487, 'spawn', { form: 'Giratina_Origin' });
    wants.add(ALICE, HOME, 487, 'both', { form: 'Origin Forme' });
    expect(await wants.set(ALICE, HOME, species(487), 'both')).toMatchObject({ kind: 'added' });
    expect(await wants.set(ALICE, HOME, origin, 'raid')).toMatchObject({
      kind: 'changed',
      before: 'spawn',
    });
    expect(await wants.set(ALICE, HOME, shadow, 'both')).toEqual({
      kind: 'added',
      want: { target: shadow, scope: 'raid' },
    });
    expect(await wants.list(ALICE, HOME)).toEqual({
      wants: [
        { target: origin, scope: 'raid' },
        { target: species(487), scope: 'both' },
        { target: shadow, scope: 'raid' },
      ],
      unreadable: 1,
    });
    expect(wants.rows.map((row) => [row.pokemon, row.type, row.form, row.shadow])).toEqual([
      [487, 'raid', 'giratina_origin', false],
      [487, 'both', 'Origin Forme', false],
      [487, 'both', null, false],
      [487, 'raid', null, true],
    ]);
    expect(await wants.remove(ALICE, HOME, species(487))).toBe(true);
    expect(await wants.remove(ALICE, HOME, shadow)).toBe(true);
    expect(await wants.count(ALICE, HOME)).toBe(2);
  });

  it('rejects every call while it is failing', async () => {
    const wants = new MemoryWants();
    wants.failing = new Error('the database is away');
    await expect(wants.list(ALICE, HOME)).rejects.toThrow('the database is away');
    await expect(wants.set(ALICE, HOME, T5, 'raid')).rejects.toThrow('the database is away');
  });
});
