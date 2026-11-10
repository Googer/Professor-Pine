import { describe, expect, it } from 'vitest';
import { GAME_ICON_NAMES, LEAGUE_ICON, typeWord, WEATHER_ICON, weatherWord } from './game-icons.js';
import { POKEMON_TYPES, WEATHER_CONDITIONS } from './types.js';

describe('the names of the game icons', () => {
  it('has an emoji for every type, by the legacy names', () => {
    for (const type of POKEMON_TYPES) expect(GAME_ICON_NAMES).toContain(type);
    expect(GAME_ICON_NAMES).toEqual(expect.arrayContaining(['instinct', 'mystic', 'valor']));
  });

  it('shows every weather of the game master by an emoji the upload makes', () => {
    for (const weather of WEATHER_CONDITIONS) {
      expect(GAME_ICON_NAMES).toContain(WEATHER_ICON[weather]);
    }
    expect(WEATHER_ICON.clear).toBe('sunny');
    expect(WEATHER_ICON.partly_cloudy).toBe('partlycloudy');
    expect(WEATHER_ICON.overcast).toBe('cloudy');
  });

  it('has an emoji for each league of Go Battle League', () => {
    expect(LEAGUE_ICON).toEqual({
      little: 'leaguelittle',
      great: 'leaguegreat',
      ultra: 'leagueultra',
      master: 'leaguemaster',
    });
    for (const name of Object.values(LEAGUE_ICON)) expect(GAME_ICON_NAMES).toContain(name);
  });

  it('names types and weather in words where there is no emoji', () => {
    expect(typeWord('rock')).toBe('Rock');
    expect(weatherWord('partly_cloudy')).toBe('Partly cloudy');
    expect(weatherWord('clear')).toBe('Sunny');
  });
});
