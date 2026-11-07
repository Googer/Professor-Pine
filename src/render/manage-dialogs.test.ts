import { describe, expect, it } from 'vitest';
import { dialogField, dialogText } from '../../test/support/dialogs.js';
import { checkModal } from '../../test/support/fake-interactions.js';
import { at, PARTY_NOW, PARTY_ZONE, testMeetup, testRaid } from '../../test/support/parties.js';
import type { KnownPlace } from '../domain/geo/place.js';
import { clockTime, zoneLabel } from '../domain/web/clock.js';
import { MOVES_LATER } from '../domain/web/raid-manage.js';
import type { RaidOptionsView } from '../domain/web/raid-options-data.js';
import { meetupManageDialog, raidManageDialog } from './manage-dialogs.js';

/** The map's pick lists with `count` bosses of each of three tiers, and an egg of each. */
function options(count: number): RaidOptionsView {
  const tiers = ['Level 1 raid', 'Level 3 raid', 'Level 5 raid'];
  return {
    zone: PARTY_ZONE,
    bosses: tiers.flatMap((tier, t) =>
      Array.from({ length: count }, (_, n) => ({
        value: `b:boss${String(t)}${String(n)}:T${String(t * 2 + 1)}:0`,
        name: `Boss ${String(t)}-${String(n)}`,
        tier,
      })),
    ),
    eggs: tiers.map((tier, t) => ({ value: `e:T${String(t * 2 + 1)}:0`, tier })),
  };
}

describe('raidManageDialog (review M7, M9)', () => {
  it('lists the raid’s own tier first, its egg and then its bosses, then the rest in the map’s order, cut to 25', () => {
    const raid = testRaid();
    const dialog = raidManageDialog({
      party: raid,
      options: options(10),
      moves: undefined,
      now: PARTY_NOW,
    });
    checkModal(dialog);
    const values = (dialogField(dialog, 'Boss').options ?? []).map((option) => option.value);
    expect(values).toHaveLength(25);
    expect(values.slice(0, 11)).toEqual([
      'e:T5:0',
      ...Array.from({ length: 10 }, (_, n) => `b:boss2${String(n)}:T5:0`),
    ]);
    // Then the other tiers' bosses in the map's order, as far as there is room; no other egg fits.
    expect(values.slice(11)).toEqual([
      ...Array.from({ length: 10 }, (_, n) => `b:boss0${String(n)}:T1:0`),
      ...Array.from({ length: 4 }, (_, n) => `b:boss1${String(n)}:T3:0`),
    ]);
    // Short lists keep every boss and every egg, the other eggs last.
    const short = raidManageDialog({
      party: raid,
      options: options(2),
      moves: undefined,
      now: PARTY_NOW,
    });
    expect(
      (dialogField(short, 'Boss').options ?? []).map((option) => option.value).slice(-2),
    ).toEqual(['e:T1:0', 'e:T3:0']);
  });

  it('says under the boss what the map says while a boss is picked, where moves are asked', () => {
    const raid = testRaid();
    const moves = { boss: 'Yveltal', fast: [{ id: 'SNARL_FAST', name: 'Snarl' }], charged: [] };
    const dialog = raidManageDialog({ party: raid, options: options(1), moves, now: PARTY_NOW });
    expect(dialogField(dialog, 'Boss').description).toBe(MOVES_LATER);
  });
});

describe('meetupManageDialog (review M3, M7)', () => {
  const STOP: KnownPlace = {
    kind: 'stop',
    id: '0123456789abcdef0123456789abcdef.16',
    title: 'Fountain Square',
    lat: 40.0601,
    lon: -80.0601,
    address: null,
    image: null,
  };

  it('says its place and its times as the map’s editor does, in the posts’ zone named', () => {
    const start = at('2026-10-13T18:00');
    const meetup = testMeetup({ startTime: start, place: STOP });
    const dialog = meetupManageDialog({
      party: meetup,
      asksStart: true,
      now: PARTY_NOW,
      zone: PARTY_ZONE,
    });
    checkModal(dialog);
    expect(dialogText(dialog)).toBe(
      [
        'At Fountain Square',
        `Starts now: ${clockTime(start, PARTY_ZONE, PARTY_NOW)}${zoneLabel(PARTY_ZONE)}`,
        'Ends now: none',
      ].join('\n'),
    );
    expect(zoneLabel(PARTY_ZONE)).toBe(' (Eastern)');
  });
});
