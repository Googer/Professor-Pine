import { describe, expect, it } from 'vitest';
import { researchTasksFixture, pageTask } from '../../test/support/research.js';
import { reportedStop } from '../../test/support/stop-report-cases.js';
import { hideoutLine, researchLine } from './stop-lines.js';

const LINK = 'https://discord.com/channels/1/2/3';

describe('the lines of the region channels (plan 8R-9)', () => {
  it('names a task with its reward as first reported, and links its place in the board', () => {
    const task = pageTask('Catch 7 Pokémon');
    const [version] = researchTasksFixture().versions(task);
    if (!version) throw new Error('no version');
    expect(researchLine({ text: task.text, typed: false, rewards: version.rewards }, LINK)).toBe(
      `Research: **Catch 7 Pokémon** (${version.label}) → ${LINK}`,
    );
    // "One of" its encounters, as the task was first reported.
    expect(researchLine({ text: task.text, typed: false, rewards: task.rewards }, LINK)).toBe(
      `Research: **Catch 7 Pokémon** (one of Magikarp, Stufful, Wimpod) → ${LINK}`,
    );
    // A task typed without its reward; its text made plain, without a working address.
    expect(researchLine({ text: 'Win *3* raids', typed: true, rewards: [] }, LINK)).toBe(
      `Research: **Win \\*3\\* raids** → ${LINK}`,
    );
    expect(
      researchLine({ text: 'See https://x.example', typed: true, rewards: [] }, LINK),
    ).not.toContain('https://x.example');
  });

  it('names a leader or Giovanni and the stop, made plain', () => {
    expect(hideoutLine('Arlo', reportedStop(2, { name: 'Yellow *Mural*' }), LINK)).toBe(
      `Team GO Rocket: **Arlo** at **Yellow \\*Mural\\*** → ${LINK}`,
    );
  });
});
