import { describe, expect, it } from 'vitest';
import type { PageNode } from './popup.js';
import { REPORT_ICONS } from './report-icons.js';
import { pickAgainNode, REPORT_KINDS, reportMenuNode } from './report-menu.js';

/** Every text of a tree, in order. */
const texts = (node: PageNode): string[] => [
  ...(node.text === undefined ? [] : [node.text]),
  ...(node.children ?? []).flatMap(texts),
];

/** The nodes of a tree with this tag. */
const tagged = (node: PageNode, tag: string): PageNode[] => [
  ...(node.tag === tag ? [node] : []),
  ...(node.children ?? []).flatMap((child) => tagged(child, tag)),
];

describe("the Report button's step 1 (plan 8M-9A)", () => {
  it('offers, in order, raids, max battles, research, Rocket, wild spawns, trains and meetups, each picked its way', () => {
    expect(REPORT_KINDS.map((kind) => [kind.id, kind.label, kind.pick])).toEqual([
      ['raid', 'Raid', 'gyms'],
      ['max', 'Max battle', 'spots'],
      // Plan 8M-9B: reports at stops, a PokéStop tapped.
      ['research', 'Field research', 'stops'],
      ['rocket', 'Team GO Rocket', 'stops'],
      ['spawn', 'Wild spawn', 'point'],
      ['train', 'Train', 'form'],
      ['meetup', 'Meetup', 'form'],
    ]);
    for (const kind of REPORT_KINDS) expect(kind.icon).toBe(REPORT_ICONS[kind.id]);
  });

  // R1-8: each kind's heading in step 2 is written out, not made of its label.
  it("heads each kind's step 2 in words of its own", () => {
    expect(REPORT_KINDS.map((kind) => kind.heading)).toEqual([
      'Report a raid',
      'Report a max battle',
      'Report field research',
      'Report Team GO Rocket',
      'Report a wild spawn',
      'Start a train',
      'Make a meetup',
    ]);
  });

  it('is a dialog of a button per kind, with its icon, and Cancel', () => {
    const menu = reportMenuNode(REPORT_KINDS);
    expect(menu.attributes).toMatchObject({ role: 'dialog', 'aria-label': 'Report' });
    expect(texts(menu)).toEqual([
      'What are you reporting?',
      'Raid',
      'Max battle',
      'Field research',
      'Team GO Rocket',
      'Wild spawn',
      'Train',
      'Meetup',
      'Cancel',
    ]);
    const buttons = tagged(menu, 'button');
    expect(buttons.map((button) => button.attributes?.['data-report-kind'])).toEqual([
      'raid',
      'max',
      'research',
      'rocket',
      'spawn',
      'train',
      'meetup',
      undefined,
    ]);
    expect(buttons.at(-1)?.attributes).toMatchObject({ 'data-cancel': '' });
    // The game's pictures as pictures, Pine's own drawn into a place of their own.
    expect(tagged(menu, 'img').map((img) => img.attributes?.src)).toEqual([
      REPORT_ICONS.raid.kind === 'picture' ? REPORT_ICONS.raid.src : '',
      REPORT_ICONS.rocket.kind === 'picture' ? REPORT_ICONS.rocket.src : '',
    ]);
    // Plan 8M-11A (S14): the white raid head drawn without the outline in dark.
    expect(tagged(menu, 'img')[0]?.className).toBe('report-icon light');
    expect(
      tagged(menu, 'span')
        .filter((span) => span.attributes?.['data-shape'] !== undefined)
        .map((span) => span.attributes?.['data-shape']),
    ).toEqual(['train']);
    // The game's pictures as masks in the color of what they stand for (plan 8M-9B, B17; plan
    // 8M-11A, S14: the Dynamax icon, Campfire's Poké Ball and the calendar).
    expect(
      tagged(menu, 'span')
        .filter((span) => span.attributes?.['data-mask'] !== undefined)
        .map((span) => span.attributes?.['data-mask']),
    ).toEqual(['max', 'research', 'spawn', 'meetup']);
  });
});

describe('"← Another …" on a form step 2 opened (Matt, 2026-11-02)', () => {
  const kind = (id: string) => {
    const found = REPORT_KINDS.find((one) => one.id === id);
    if (!found) throw new Error(id);
    return found;
  };

  it('names what step 2 picked, and carries its kind', () => {
    expect(pickAgainNode(kind('raid'))).toEqual({
      tag: 'button',
      className: 'press',
      text: '← Another gym',
      attributes: { type: 'button', 'data-pick-again': 'raid' },
    });
    expect(pickAgainNode(kind('max'))?.text).toBe('← Another Power Spot');
    expect(pickAgainNode(kind('rocket'))?.text).toBe('← Another PokéStop');
  });

  it('is not offered where a wrong pick costs nothing: research, a pin, or no step 2', () => {
    for (const id of ['research', 'spawn', 'train', 'meetup']) {
      expect(pickAgainNode(kind(id))).toBeUndefined();
    }
  });
});
