import { describe, expect, it } from 'vitest';
import { rowFits, rowRoom } from './row-fit.js';

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
