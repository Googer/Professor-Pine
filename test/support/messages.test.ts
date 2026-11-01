import { ButtonStyle, ComponentType } from 'discord.js';
import { describe, expect, it } from 'vitest';
import type { OutgoingMessage } from '../../src/discord/party-gateway.js';
import {
  accentOf,
  buttonLabels,
  buttonsOf,
  classic,
  componentCount,
  customIdsOf,
  textOf,
  thumbnailOf,
  v2,
} from './messages.js';

const MAP = 'https://maps.test/a';
const message: OutgoingMessage = {
  v2: true,
  components: [
    {
      type: ComponentType.Container,
      accent_color: 0x2ecc71,
      components: [
        {
          type: ComponentType.Section,
          components: [{ type: ComponentType.TextDisplay, content: '### Title' }],
          accessory: { type: ComponentType.Thumbnail, media: { url: 'https://x.test/a.png' } },
        },
        {
          type: ComponentType.Section,
          components: [{ type: ComponentType.TextDisplay, content: '**Coming (1)**\nAlice' }],
          accessory: {
            type: ComponentType.Button,
            style: ButtonStyle.Primary,
            label: 'Join',
            emoji: { name: '🏃' },
            custom_id: 'party:1:join',
          },
        },
        {
          type: ComponentType.ActionRow,
          components: [
            { type: ComponentType.Button, style: ButtonStyle.Link, label: 'Map', url: MAP },
          ],
        },
      ],
    },
  ],
};

describe('reading a message in tests', () => {
  it('reads the text, buttons, colour, picture and size of a v2 message', () => {
    expect(textOf(message)).toBe('### Title\n**Coming (1)**\nAlice');
    expect(buttonLabels(message)).toEqual(['Join', 'Map']);
    expect(customIdsOf(message)).toEqual(['party:1:join']);
    expect(buttonsOf(message)[0]).toEqual({
      label: 'Join',
      emoji: '🏃',
      style: ButtonStyle.Primary,
      customId: 'party:1:join',
      url: undefined,
    });
    expect(buttonsOf(message)[1]?.url).toBe(MAP);
    expect(accentOf(message)).toBe(0x2ecc71);
    expect(thumbnailOf(message)).toBe('https://x.test/a.png');
    // The container, two sections with a text and an accessory each, a row with its button.
    expect(componentCount(message)).toBe(9);
  });

  it('reads the buttons of a classic message from its rows, and tells the kinds apart', () => {
    const plain: OutgoingMessage = {
      content: 'hi',
      components: [
        {
          type: ComponentType.ActionRow,
          components: [
            {
              type: ComponentType.Button,
              style: ButtonStyle.Success,
              label: 'Yes',
              custom_id: 'a',
            },
          ],
        },
      ],
    };
    expect(customIdsOf(plain)).toEqual(['a']);
    expect(classic(plain).content).toBe('hi');
    expect(() => v2(plain)).toThrow('classic');
    expect(() => classic(message)).toThrow('components v2');
  });
});
