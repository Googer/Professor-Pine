import { describe, expect, it } from 'vitest';
import { fitOutcome, rowFits, rowRoom } from './row-fit.js';

// Matt, 2026-11-07: the desktop's row shows the layers' toggles that fit, the rest under More.
describe('rowFits', () => {
  const chips = [70, 70, 80, 90, 80];

  it('shows every toggle, and no More, when they all fit', () => {
    // 390 of toggles and four gaps of 6 between them: 414.
    expect(rowFits({ room: 414, chips, more: 60, gap: 6 })).toBe(5);
    expect(rowFits({ room: 1000, chips, more: 60, gap: 6 })).toBe(5);
  });

  it('keeps room for More beside the toggles that fit, in their order', () => {
    // Just short of all five: three toggles (220 and two gaps), a gap and More (60) are 298.
    expect(rowFits({ room: 413, chips, more: 60, gap: 6 })).toBe(4);
    expect(rowFits({ room: 298, chips, more: 60, gap: 6 })).toBe(3);
    expect(rowFits({ room: 297, chips, more: 60, gap: 6 })).toBe(2);
  });

  it('never skips a toggle to show a narrower one after it', () => {
    // Room for Raids and More, and for the narrow fourth too, but not for the third.
    expect(rowFits({ room: 200, chips: [70, 200, 20], more: 60, gap: 6 })).toBe(1);
  });

  it('puts every toggle under More when there is room for none', () => {
    expect(rowFits({ room: 100, chips, more: 60, gap: 6 })).toBe(0);
    expect(rowFits({ room: -40, chips, more: 60, gap: 6 })).toBe(0);
  });

  it('shows nothing when no layer is offered', () => {
    expect(rowFits({ room: 0, chips: [], more: 60, gap: 6 })).toBe(0);
  });
});

describe('rowRoom', () => {
  it("is the header's inner width less the other controls and a gap beside each", () => {
    // Title 120, Report 80, "Find a gym" 180 and the account 160, each with a gap of 12.
    expect(rowRoom(1000, [120, 80, 180, 160], 12)).toBe(1000 - 540 - 48);
  });

  it('is the whole width when nothing else is shown', () => {
    expect(rowRoom(800, [], 12)).toBe(800);
  });
});

// Review T5: what a measure hides, and where a focus on what moved goes.
describe('fitOutcome', () => {
  it('shows the first toggles in the row and the others under More', () => {
    const outcome = fitOutcome({ count: 4, shown: 2, focused: undefined, moreOpen: false });
    expect(outcome.toggleHidden).toEqual([false, false, true, true]);
    expect(outcome.entryHidden).toEqual([true, true, false, false]);
    expect(outcome.rowHidden).toBe(false);
    expect(outcome.moreHidden).toBe(false);
    expect(outcome.focus).toBeUndefined();
  });

  it('hides More when every toggle fits, and the row when none does', () => {
    expect(fitOutcome({ count: 3, shown: 3, focused: undefined, moreOpen: false })).toMatchObject({
      rowHidden: false,
      moreHidden: true,
    });
    expect(fitOutcome({ count: 3, shown: 0, focused: undefined, moreOpen: false })).toMatchObject({
      rowHidden: true,
      moreHidden: false,
    });
  });

  it("hands a focused toggle that moved under More to its checkbox while More is open, else to More's button", () => {
    const toggle = { where: 'toggle', at: 2 } as const;
    expect(fitOutcome({ count: 4, shown: 2, focused: toggle, moreOpen: true }).focus).toEqual({
      where: 'entry',
      at: 2,
    });
    expect(fitOutcome({ count: 4, shown: 2, focused: toggle, moreOpen: false }).focus).toEqual({
      where: 'more',
    });
  });

  it('hands a focused checkbox that moved into the row to its toggle', () => {
    const entry = { where: 'entry', at: 1 } as const;
    expect(fitOutcome({ count: 4, shown: 3, focused: entry, moreOpen: true }).focus).toEqual({
      where: 'toggle',
      at: 1,
    });
  });

  it("hands More's focused button to the row's last toggle when More goes", () => {
    const more = { where: 'more' } as const;
    expect(fitOutcome({ count: 4, shown: 4, focused: more, moreOpen: false }).focus).toEqual({
      where: 'toggle',
      at: 3,
    });
    // More stays: its button keeps the focus.
    expect(
      fitOutcome({ count: 4, shown: 3, focused: more, moreOpen: false }).focus,
    ).toBeUndefined();
  });

  it('leaves the focus where it is when what holds it stays shown', () => {
    expect(
      fitOutcome({ count: 4, shown: 2, focused: { where: 'toggle', at: 1 }, moreOpen: false })
        .focus,
    ).toBeUndefined();
    expect(
      fitOutcome({ count: 4, shown: 2, focused: { where: 'entry', at: 3 }, moreOpen: true }).focus,
    ).toBeUndefined();
  });
});
