import { describe, expect, it } from 'vitest';
import type { PageNode } from './popup.js';
import {
  CASE_NOW,
  CASE_ZONE,
  caseGrunt,
  caseHideout,
  caseResearch,
  caseView,
} from './stop-report-cases.js';
import {
  plainStopPopup,
  stopPopup,
  takeBackQuestion,
  type StopPopupContext,
} from './stop-popup.js';
import { reportsAtStops } from './stop-reports.js';

const MINUTE = 60_000;

/** Every text of a tree, in order. */
const texts = (node: PageNode): string[] => [
  ...(node.text === undefined ? [] : [node.text]),
  ...(node.children ?? []).flatMap(texts),
];

/** The nodes of a tree that match. */
const found = (node: PageNode, test: (one: PageNode) => boolean): PageNode[] => [
  ...(test(node) ? [node] : []),
  ...(node.children ?? []).flatMap((child) => found(child, test)),
];

const ctx: StopPopupContext = {
  now: CASE_NOW,
  zone: CASE_ZONE,
  located: { lat: 40.44, lon: -79.95 },
  units: 'imperial',
};

/** The one stop of a view of reports, all of them shown. */
const stopOf = (view: ReturnType<typeof caseView>) => {
  const [at] = reportsAtStops(view, { on: () => true, now: CASE_NOW, keep: new Set(['stop-1']) });
  if (!at) throw new Error('no stop');
  return at;
};

describe("a stop's popup (plan 8M-9B)", () => {
  it('names the stop, its address, how far it is and Directions, then its research', () => {
    const node = stopPopup(stopOf(caseView({ research: [caseResearch(1)] })), ctx);
    expect(texts(node)).toEqual([
      'Yellow Mural 1',
      'Market Street',
      '360 ft',
      ' · ',
      'Directions',
      'Field research',
      'Catch a Dragon-type Pokémon',
      'Dratini',
      'until midnight',
      ' · reported by Brock',
      'Open on Discord',
    ]);
    // Brock's: no Take back for this member.
    expect(found(node, (one) => one.attributes?.['data-take-back'] !== undefined)).toEqual([]);
  });

  it('shows "one of" with its rewards’ pictures, and Take back where the member may', () => {
    const oneOf = caseResearch(1, {
      oneOf: true,
      mayTakeBack: true,
      rewardText: 'one of Dratini, Bagon',
      rewards: [
        ...caseResearch(1).rewards,
        { ...caseResearch(1).rewards[0]!, name: 'Bagon', image: 'https://cdn.leekduck.com/b.png' },
      ],
    });
    const node = stopPopup(stopOf(caseView({ research: [oneOf] })), ctx);
    expect(texts(node)).toContain('one of Dratini, Bagon');
    expect(
      found(node, (one) => one.className === 'small-picture').map((one) => one.attributes?.title),
    ).toEqual(['Dratini', 'Bagon']);
    expect(
      found(node, (one) => one.attributes?.['data-take-back'] !== undefined).map(
        (one) => one.attributes,
      ),
    ).toEqual([
      {
        type: 'button',
        'data-take-back': '1',
        'data-made-at': String(oneOf.madeAt),
      },
    ]);
  });

  // Review F7: "one of" is the server's fact (`oneOf`), not the count of the rewards.
  it('shows the pictures of "one of" by what the server says, not by the count of rewards', () => {
    const two = [
      ...caseResearch(1).rewards,
      { ...caseResearch(1).rewards[0]!, name: 'Bagon', image: 'https://cdn.leekduck.com/b.png' },
    ];
    const pictures = (report: ReturnType<typeof caseResearch>) =>
      found(
        stopPopup(stopOf(caseView({ research: [report] })), ctx),
        (one) => one.className === 'small-picture',
      );
    expect(pictures(caseResearch(1, { oneOf: false, rewards: two }))).toEqual([]);
    expect(pictures(caseResearch(1, { oneOf: true, rewards: two }))).toHaveLength(2);
  });

  it('links only a message of Discord, and says nothing of a report without one', () => {
    const elsewhere = caseResearch(1, { link: 'https://example.test/x' });
    const node = stopPopup(stopOf(caseView({ research: [elsewhere] })), ctx);
    expect(texts(node)).not.toContain('Open on Discord');
    const { link: _link, ...without } = caseResearch(1);
    expect(texts(stopPopup(stopOf(caseView({ research: [without] })), ctx))).not.toContain(
      'Open on Discord',
    );
  });

  it('says "Ended" for a report whose end passed while it shows, without Take back (B14)', () => {
    const ended = caseGrunt(1, { endsAt: CASE_NOW - MINUTE });
    const node = stopPopup(stopOf(caseView({ grunts: [ended] })), ctx);
    expect(texts(node)).toContain('Ended');
    expect(found(node, (one) => one.attributes?.['data-take-back'] !== undefined)).toEqual([]);
    expect(texts(node)).toContain('Open on Discord');
  });

  it('shows a grunt by its name and lineup, its catches and minutes, a hideout by its picture', () => {
    const node = stopPopup(
      stopOf(caseView({ grunts: [caseGrunt(1)], hideouts: [caseHideout(1)] })),
      ctx,
    );
    expect(texts(node)).toEqual(
      expect.arrayContaining(['Water-type grunt · Magikarp, Feebas', '25 min left', 'Arlo']),
    );
    const left = found(node, (one) => one.className === 'left')[0];
    expect(left?.attributes?.['data-left']).toBe(String(caseGrunt(1).endsAt));
    expect(
      found(node, (one) => one.className === 'report-picture').map((one) => one.attributes?.src),
    ).toEqual([caseGrunt(1).picture, caseHideout(1).picture]);
    // Each report's section carries its end, for the page to say "Ended" as it passes.
    expect(
      found(node, (one) => one.tag === 'section').map((one) => one.attributes?.['data-ends']),
    ).toEqual([String(caseGrunt(1).endsAt), String(caseHideout(1).endsAt)]);
  });

  it('ends with the stop’s own actions, where offered', () => {
    const action: PageNode = { tag: 'button', text: 'Report research here' };
    const node = stopPopup(stopOf(caseView({ research: [caseResearch(1)] })), {
      ...ctx,
      actions: [action],
    });
    expect(texts(node).at(-1)).toBe('Report research here');
  });
});

describe("a PokéStop's popup without reports (plan 8M-9B, B11)", () => {
  it('names it, how far it is and Directions, no address line, then its actions', () => {
    const node = plainStopPopup(
      { id: 'stop-9', title: 'Blue Bench', lat: 40.441, lon: -79.95 },
      { ...ctx, actions: [{ tag: 'button', text: 'Report Rocket here' }] },
    );
    expect(
      texts(
        plainStopPopup(
          { id: 'stop-9', title: 'Blue Bench', lat: 40.441, lon: -79.95, address: '1 Main St' },
          ctx,
        ),
      ).slice(0, 2),
    ).toEqual(['Blue Bench', '1 Main St']);
    expect(texts(node)).toEqual([
      'Blue Bench',
      '360 ft',
      ' · ',
      'Directions',
      'Report Rocket here',
    ]);
    // Without your location, Directions alone (the parties' rule).
    expect(
      texts(
        plainStopPopup(
          { id: 'stop-9', title: 'Blue Bench', lat: 40.441, lon: -79.95 },
          {
            ...ctx,
            located: undefined,
          },
        ),
      ),
    ).toEqual(['Blue Bench', 'Directions']);
  });
});

describe('taking a report back (plan 8M-9B)', () => {
  it('asks first by the task or name and the stop', () => {
    expect(takeBackQuestion(caseResearch(1))).toBe(
      'Take back Catch a Dragon-type Pokémon at Yellow Mural 1?',
    );
    expect(takeBackQuestion(caseGrunt(2))).toBe('Take back Water-type grunt at Yellow Mural 2?');
  });
});
