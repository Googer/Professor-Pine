import { describe, expect, it } from 'vitest';
import { catalogueFixture } from '../../../test/support/game-data.js';
import { pageTask } from '../../../test/support/research.js';
import { rewardHash, taskVersions, versionValue, oneOfLabel } from './versions.js';
import type { ResearchTask, TaskReward } from './task.js';

const crop = 'https://cdn.leekduck.com/assets/img/pokemon_icons_crop/';

function encounter(name: string, key: string, dex: number, picture: string): TaskReward {
  return {
    kind: 'encounter',
    name,
    key,
    dex,
    shiny: false,
    cp: null,
    image: `${crop}${picture}`,
  };
}

const candy: TaskReward = {
  kind: 'item',
  item: 'rare-candy',
  name: 'Rare Candy',
  quantity: 3,
  image: null,
};

const task = (rewards: TaskReward[]): ResearchTask => ({
  key: '0123456789abcdef',
  text: 'Make 3 Great Throws in a row',
  category: 'Throwing',
  rewards,
});

describe('the versions of a task (plan 8R-5)', () => {
  const catalogue = catalogueFixture();

  it('offers one per reward in the page’s order, then "one of" its encounters', () => {
    const lileep = pageTask('Make 3 Great Throws in a row');
    const versions = taskVersions(lileep, catalogue);
    expect(versions.map((one) => [one.label, one.oneOf])).toEqual([
      ['Lileep', false],
      ['Anorith', false],
      ['Pinap Berry ×3', false],
      ['Poké Ball ×10', false],
      ['Rare Candy ×1', false],
      ['Razz Berry ×9', false],
      ['Stardust ×1000', false],
      ['Ultra Ball ×5', false],
      ['one of Lileep, Anorith', true],
    ]);
    const [first] = versions;
    expect(first?.value).toBe(`${lileep.key}:${rewardHash(lileep.rewards[0]!, catalogue)}`);
    expect(first?.value).toMatch(/^[0-9a-f]{16}:[0-9a-f]{8}$/);
    expect(first?.rewards).toEqual([lileep.rewards[0]]);
    // "One of" is the task's key alone, with its encounters only (the items left out).
    const oneOf = versions.at(-1);
    expect(oneOf?.value).toBe(lileep.key);
    expect(oneOf?.rewards.map((reward) => reward.name)).toEqual(['Lileep', 'Anorith']);
  });

  it('has no "one of" where one encounter is among items', () => {
    const versions = taskVersions(
      task([encounter('Dratini', 'dratini', 147, 'pm147.icon.png'), candy]),
      catalogue,
    );
    expect(versions.map((one) => [one.label, one.oneOf])).toEqual([
      ['Dratini', false],
      ['Rare Candy ×3', false],
    ]);
  });

  it('keeps a plain and a costumed Pikachu two versions, the costumed one said', () => {
    const versions = taskVersions(
      task([
        encounter('Pikachu', 'pikachu', 25, 'pm25.icon.png'),
        encounter('Pikachu wearing a Cosmog suit', 'pikachu', 25, 'pm25.fPXP_2026.icon.png'),
      ]),
      catalogue,
    );
    // The name says the costume already: no mark (review L9). The flag tells it (L7).
    expect(versions.map((one) => [one.label, one.costumed])).toEqual([
      ['Pikachu', false],
      ['Pikachu wearing a Cosmog suit', true],
      ['one of Pikachu, Pikachu wearing a Cosmog suit', false],
    ]);
    expect(new Set(versions.map((one) => one.value)).size).toBe(3);
  });

  it('marks a costumed version whose name is the plain one', () => {
    const versions = taskVersions(
      task([
        encounter('Pikachu', 'pikachu', 25, 'pm25.icon.png'),
        encounter('Pikachu', 'pikachu', 25, 'pm25.fPXP_2026.icon.png'),
      ]),
      catalogue,
    );
    expect(versions.map((one) => [one.label, one.costumed])).toEqual([
      ['Pikachu', false],
      ['Pikachu (costumed)', true],
      ['one of Pikachu, Pikachu (costumed)', false],
    ]);
  });

  it('makes one version of a reward listed twice, the first kept, and no "one of" (review W4)', () => {
    const shiny = { ...encounter('Gible', 'gible', 443, 'pm443.icon.png'), shiny: true };
    const versions = taskVersions(
      task([shiny, encounter('Gible', 'gible', 443, 'pm443.icon.png'), candy, candy]),
      catalogue,
    );
    expect(versions.map((one) => [one.label, one.oneOf, one.rewards[0]?.name])).toEqual([
      ['Gible', false, 'Gible'],
      ['Rare Candy ×3', false, 'Rare Candy'],
    ]);
    expect(versions[0]?.rewards[0]).toMatchObject({ shiny: true });
  });

  it('marks the costumed reward a version carries, its hash unchanged (review W1)', () => {
    const plain = encounter('Pikachu', 'pikachu', 25, 'pm25.icon.png');
    const costumed = encounter('Pikachu', 'pikachu', 25, 'pm25.fPXP_2026.icon.png');
    const versions = taskVersions(task([plain, costumed]), catalogue);
    expect(versions.map((one) => one.rewards.map((reward) => 'costumed' in reward))).toEqual([
      [false],
      [true],
      [false, true],
    ]);
    const [carried] = versions[1]?.rewards ?? [];
    expect(rewardHash(carried!, catalogue)).toBe(rewardHash(costumed, catalogue));
  });

  it('is the task alone where it has one reward, or none', () => {
    const dratini = pageTask('Make 2 Excellent Throws');
    expect(taskVersions(dratini, catalogue).map((one) => [one.value, one.label])).toEqual([
      [versionValue(dratini.key, rewardHash(dratini.rewards[0]!, catalogue)), 'Dratini'],
    ]);
    expect(taskVersions(task([]), catalogue)).toEqual([
      { value: '0123456789abcdef', label: '', rewards: [], oneOf: false, costumed: false },
    ]);
  });

  it('names the rewards of "one of" with those matched first', () => {
    const rewards = pageTask('Make 3 Excellent Throws in a row').rewards;
    expect(oneOfLabel(rewards)).toBe('one of Larvitar, Beldum, Gible');
    expect(oneOfLabel(rewards, (reward) => reward.name === 'Gible')).toBe(
      'one of Gible, Larvitar, Beldum',
    );
  });
});
