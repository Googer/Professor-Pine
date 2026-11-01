import { describe, expect, it } from 'vitest';
import {
  eventTasksFirst,
  foldTaskText,
  isEventCategory,
  isItemKey,
  isTaskKey,
  itemKey,
  rewardsInShort,
  taskKeyOf,
  type TaskReward,
} from './task.js';

describe('a task’s text and key', () => {
  it('folds case, accents, signs and gaps', () => {
    expect(foldTaskText('Catch 7 Pokémon!')).toBe('catch 7 pokemon');
    expect(foldTaskText('  make 2   EXCELLENT throws ')).toBe('make 2 excellent throws');
    expect(foldTaskText('Win a three-star raid or higher')).toBe('win a three star raid or higher');
  });

  it('gives one text one key of 16 hex digits, another text another', () => {
    const key = taskKeyOf('Make 2 Excellent Throws');
    expect(isTaskKey(key)).toBe(true);
    expect(taskKeyOf('make 2 excellent throws!')).toBe(key);
    expect(taskKeyOf('Make 3 Excellent Throws')).not.toBe(key);
  });
});

describe('an item’s key', () => {
  it('is its folded name with hyphens', () => {
    expect(itemKey('Golden Razz Berry')).toBe('golden-razz-berry');
    expect(itemKey('Poké Ball')).toBe('poke-ball');
    expect(isItemKey(itemKey('Silver Pinap Berry'))).toBe(true);
    expect(isItemKey('Rare Candy')).toBe(false);
    expect(itemKey('×')).toBe('');
  });
});

describe('rewards in short', () => {
  const candy: TaskReward = {
    kind: 'item',
    item: 'rare-candy',
    name: 'Rare Candy',
    quantity: 3,
    image: null,
  };
  const mon = (name: string): TaskReward => ({
    kind: 'encounter',
    name,
    key: null,
    dex: null,
    shiny: false,
    cp: null,
    image: null,
  });

  it('names the first three and counts the rest', () => {
    expect(rewardsInShort([mon('Dratini'), mon('Bagon'), mon('Axew'), candy])).toBe(
      'Dratini, Bagon, Axew +1',
    );
    expect(rewardsInShort([candy])).toBe('Rare Candy ×3');
    expect(rewardsInShort([])).toBe('');
  });
});

describe('an event’s tasks (plan 8R-8)', () => {
  const STANDING = [
    'Catching',
    'Throwing',
    'Battling',
    'Exploring',
    'Training',
    'Buddy & Friendship',
    'Team GO Rocket',
    'Sponsored',
    'AR Scanning',
    'Other',
  ];

  it('are those of any category but the standing ones, whatever the case', () => {
    for (const category of STANDING) {
      expect(isEventCategory(category)).toBe(false);
      expect(isEventCategory(category.toUpperCase())).toBe(false);
      expect(isEventCategory(category.toLowerCase())).toBe(false);
    }
    expect(isEventCategory('Candela’s Quest for Victory')).toBe(true);
    expect(isEventCategory('Ultra Unlock: Water Festival')).toBe(true);
    expect(isEventCategory('Catching Spree')).toBe(true);
  });

  const task = (text: string, category: string) => ({
    key: taskKeyOf(text),
    text,
    category,
    rewards: [],
  });

  it('come first, each part in the page’s order', () => {
    const list = [
      task('Catch 5 Pokémon', 'Catching'),
      task('Make 3 Great Throws', 'Throwing'),
      task('Win a raid', 'Spark’s Caretaking Quest'),
      task('Power up 3 times', 'Training'),
      task('Hatch an Egg', 'Candela’s Quest for Victory'),
    ];
    expect(eventTasksFirst(list).map((one) => one.text)).toEqual([
      'Win a raid',
      'Hatch an Egg',
      'Catch 5 Pokémon',
      'Make 3 Great Throws',
      'Power up 3 times',
    ]);
  });

  it('leave a list without an event as it is', () => {
    const list = [task('Catch 5 Pokémon', 'Catching'), task('Make 3 Great Throws', 'Throwing')];
    expect(eventTasksFirst(list)).toBe(list);
  });
});
