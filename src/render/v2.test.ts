import { ButtonStyle, ComponentType } from 'discord.js';
import { describe, expect, it } from 'vitest';
import { actionRow, container, countComponents, section, textDisplay, thumbnail } from './v2.js';

describe('countComponents', () => {
  it('counts every component as Discord does: nested ones and accessories included', () => {
    const button = {
      type: ComponentType.Button,
      style: ButtonStyle.Secondary,
      label: 'Join',
      custom_id: 'party:1:join',
    } as const;
    const message = container(1, [
      textDisplay('**A heading**'),
      section('Beside a picture', thumbnail('https://lh3.googleusercontent.com/a')),
      actionRow([button, button]),
    ]);
    // The container, the text, the section with its text and its picture, the row and its two.
    expect(countComponents([message])).toBe(1 + 1 + 3 + 3);
    expect(countComponents([])).toBe(0);
  });
});
