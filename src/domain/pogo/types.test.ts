import { describe, expect, it } from 'vitest';
import { POKEMON_TYPES, WEATHER_CONDITIONS, parseType, parseWeather } from './types.js';

describe('pokemon types', () => {
  it('lists the 18 types in the game master defender order', () => {
    expect(POKEMON_TYPES).toEqual([
      'normal',
      'fighting',
      'flying',
      'poison',
      'ground',
      'rock',
      'bug',
      'ghost',
      'steel',
      'fire',
      'water',
      'grass',
      'electric',
      'psychic',
      'ice',
      'dragon',
      'dark',
      'fairy',
    ]);
  });

  it('parses game-master type ids', () => {
    expect(parseType('POKEMON_TYPE_GRASS')).toBe('grass');
    expect(parseType('POKEMON_TYPE_FAIRY')).toBe('fairy');
  });

  it('rejects anything that is not a type', () => {
    expect(parseType('POKEMON_TYPE_SHADOW')).toBeUndefined();
    expect(parseType(undefined)).toBeUndefined();
    expect(parseType(7)).toBeUndefined();
  });
});

describe('weather', () => {
  it('lists the seven conditions', () => {
    expect(WEATHER_CONDITIONS).toHaveLength(7);
  });

  it('parses game-master weather ids', () => {
    expect(parseWeather('PARTLY_CLOUDY')).toBe('partly_cloudy');
    expect(parseWeather('RAINY')).toBe('rainy');
    expect(parseWeather('HAIL')).toBeUndefined();
    expect(parseWeather(null)).toBeUndefined();
  });
});
