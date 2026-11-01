import { ComponentType, type APIActionRowComponent, type APIButtonComponent } from 'discord.js';
import { describe, expect, it } from 'vitest';
import { catalogueFixture } from '../../test/support/game-data.js';
import { testGyms } from '../../test/support/gyms.js';
import {
  allComponents,
  buttonsOf,
  componentCount,
  copiedPost,
  leadOf,
  textDisplays,
  thumbnailOf,
} from '../../test/support/messages.js';
import { PARTY_NOW, PARTY_ZONE, testRaid } from '../../test/support/parties.js';
import type { RaidParty } from '../domain/party/party.js';
import { renderMirror } from './mirrors.js';
import type { V2Message } from '../discord/party-gateway.js';
import { renderRaidPost } from './raid-post.js';

const teams = { instinct: '⚡', mystic: '❄️', valor: '🔥' };
const rendered = renderRaidPost({
  party: testRaid(),
  now: PARTY_NOW,
  gym: testGyms()[0],
  boss: undefined,
  eggPicture: 'https://example.test/egg.png',
  catalogue: catalogueFixture(),
  showUnknownMoves: true,
  zone: PARTY_ZONE,
  emoji: { shiny: '✨', remote: '🛰️', teams },
});
const place = { postId: '900000000000000001', regionChannelId: '100000000000000001' };

describe('renderMirror', () => {
  it('copies the post and its controls, opening with a line that links to the post', () => {
    const remote = renderMirror('remote', rendered, place);
    expect(leadOf(remote)).toBe('A raid in <#100000000000000001>: <#900000000000000001>');
    // Everything, how to set a meeting time too: Meet… works on a copy (plan 8X-1B).
    expect(copiedPost(remote)).toEqual(textDisplays(rendered.message));
    // The line is the first of the post's first text: no component more than the post.
    expect(componentCount(remote)).toBe(componentCount(rendered.message));
    expect(buttonsOf(remote)).toEqual(buttonsOf(rendered.message));
    expect(buttonsOf(remote).length).toBeGreaterThan(0);
    expect(thumbnailOf(remote)).toBe('https://example.test/egg.png');
    expect(leadOf(renderMirror('ex', rendered, place))).toBe(
      'A raid at an elite raid gym in <#100000000000000001>: <#900000000000000001>',
    );
  });

  it('names no region when the region is gone', () => {
    const lost = { ...place, regionChannelId: undefined };
    expect(leadOf(renderMirror('remote', rendered, lost))).toBe('A raid: <#900000000000000001>');
  });

  it('is the message itself for the copy in the post', () => {
    expect(renderMirror('status', rendered, place)).toEqual(rendered.message);
  });

  it("carries the post's icon buttons and its one row below the lists to every copy", () => {
    // Plan 8D-G: legacy Pine's icons where the application has them, by id and name.
    const icons = (name: string) => `<:${name}:1400000000000000001>`;
    const rowsOf = (message: V2Message) =>
      allComponents(message)
        .filter(
          (component): component is APIActionRowComponent<APIButtonComponent> =>
            (component as { type?: unknown }).type === ComponentType.ActionRow,
        )
        .map((row) =>
          row.components.map((button) =>
            'label' in button && button.label !== undefined
              ? button.label
              : 'emoji' in button
                ? button.emoji?.name
                : undefined,
          ),
        );
    const raid = (tier?: RaidParty['raid']['tier']) =>
      renderRaidPost({
        party: testRaid(tier ? { tier } : {}),
        now: PARTY_NOW,
        gym: testGyms()[0],
        boss: undefined,
        catalogue: catalogueFixture(),
        showUnknownMoves: true,
        zone: PARTY_ZONE,
        emoji: { shiny: '✨', remote: '🛰️', teams, controlIcon: icons },
      });
    const egg = raid();
    const elite = raid({ level: 'Elite', shadow: false });
    for (const kind of ['status', 'remote', 'ex'] as const) {
      const statuses = ['🤔', 'pinejoin', 'pinehere', 'pinedone', 'pineleave'];
      expect(rowsOf(renderMirror(kind, egg, place))).toEqual([
        statuses,
        ['⬇️', '⬆️', 'pineremote'],
        ['Group…', 'Set time…'],
      ]);
      expect(rowsOf(renderMirror(kind, elite, place))).toEqual([
        statuses,
        ['⬇️', '⬆️'],
        ['Group…', 'Set time…'],
      ]);
      for (const post of [egg, elite]) {
        const copy = renderMirror(kind, post, place);
        expect(buttonsOf(copy)).toEqual(buttonsOf(post.message));
        expect(buttonsOf(copy).map((button) => button.label ?? button.emoji)).toEqual(
          expect.arrayContaining(['🤔', 'pinejoin', 'pinehere', 'pinedone']),
        );
      }
    }
    expect(
      buttonsOf(egg.message).find((button) => button.customId?.endsWith(':leave'))?.emoji,
    ).toBe('pineleave');
  });

  it('leaves the picture out when asked, for when Discord refuses it', () => {
    for (const kind of ['status', 'remote', 'ex', 'region'] as const) {
      const bare = renderMirror(kind, rendered, place, { picture: false });
      expect(thumbnailOf(bare)).toBeUndefined();
      expect(textDisplays(bare)).toEqual(textDisplays(renderMirror(kind, rendered, place)));
    }
  });
});
