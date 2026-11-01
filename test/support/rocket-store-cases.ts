import { expect, it } from 'vitest';
import type {
  GruntMessageRow,
  GruntMessageStorage,
} from '../../src/db/repositories/grunt-message-repository.js';
import type { RocketLineupStorage } from '../../src/db/repositories/rocket-lineup-repository.js';
import {
  lineupFingerprint,
  type RocketCatch,
  type RocketChoice,
  type RocketLineupChoice,
} from '../../src/domain/rocket/lineups.js';

/** A choice of the list as the feed of 2026-10-22 has it, made shorter (`overrides` change it). */
export function listedChoice(key: string, overrides: Partial<RocketChoice> = {}): RocketChoice {
  return {
    key,
    name: key === 'leader:arlo' ? 'Arlo' : 'Water-type grunt',
    catches: [
      {
        name: key === 'leader:arlo' ? 'Alolan Grimer' : 'Magikarp',
        key: key === 'leader:arlo' ? 'grimer-alola' : 'magikarp',
        dex: key === 'leader:arlo' ? 88 : 129,
        shiny: true,
        image: 'https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm129.icon.png',
      },
      { name: 'Missingno', key: null, dex: null, shiny: false, image: null },
    ],
    ...overrides,
  };
}

/**
 * The Water-type grunt with its two lineups (plan 8R-4L), made shorter: Mudkip's and Magikarp's,
 * each with its fingerprint as the parser gives it.
 */
export function waterWithLineups(): RocketChoice {
  const [magikarp, missingno] = listedChoice('grunt:water').catches;
  if (!magikarp || !missingno) throw new Error('the listed water grunt has two catches');
  const mudkip: RocketCatch = { ...magikarp, name: 'Mudkip', key: 'mudkip', dex: 258 };
  const lineup = (side: RocketLineupChoice['lineup'], first: string[], catches: RocketCatch[]) => ({
    lineup: side,
    first,
    catches,
    fingerprint: lineupFingerprint({ first, catches }),
  });
  return listedChoice('grunt:water', {
    catches: [mudkip, magikarp, missingno],
    lineups: [
      lineup('female', ['Mudkip', 'Tentacool'], [mudkip]),
      lineup('male', ['Magikarp', 'Feebas'], [magikarp, missingno]),
    ],
  });
}

/** A grunt's message (`n` makes another), of report 1 unless said, due at 1,000 + n. */
export function gruntRow(n: number, overrides: Partial<GruntMessageRow> = {}): GruntMessageRow {
  return {
    messageId: `30000000000000000${String(n)}`,
    channelId: '400000000000000001',
    serverId: '100000000000000001',
    reportId: 1,
    deleteAt: 1_000 + n,
    ...overrides,
  };
}

/** What the grunts' messages do, run against the repository and its twin in memory alike. */
export function gruntMessageCases(made: () => Promise<GruntMessageStorage>): void {
  it('keeps a message until it is forgotten, the one due first at the head', async () => {
    const store = await made();
    await store.add(gruntRow(2));
    await store.add(gruntRow(1, { reportId: 2, channelId: '400000000000000002' }));
    // Kept once.
    await store.add(gruntRow(2));
    expect(await store.all()).toEqual([
      gruntRow(1, { reportId: 2, channelId: '400000000000000002' }),
      gruntRow(2),
    ]);
    await store.remove(gruntRow(1).messageId);
    await store.remove(gruntRow(1).messageId);
    expect(await store.all()).toEqual([gruntRow(2)]);
  });

  it('moves the time a message is due (plan 8R-4L: a grunt refined in place)', async () => {
    const store = await made();
    await store.add(gruntRow(1));
    await store.add(gruntRow(2));
    await store.retime(gruntRow(1).messageId, 5_000);
    // One not recorded: nothing happens.
    await store.retime(gruntRow(9).messageId, 5_000);
    expect(await store.all()).toEqual([gruntRow(2), gruntRow(1, { deleteAt: 5_000 })]);
  });

  it('gives the messages of a report', async () => {
    const store = await made();
    await store.add(gruntRow(1));
    await store.add(gruntRow(2, { channelId: '400000000000000002' }));
    await store.add(gruntRow(3, { reportId: 2 }));
    expect(await store.ofReport(1)).toEqual([
      gruntRow(1),
      gruntRow(2, { channelId: '400000000000000002' }),
    ]);
    expect(await store.ofReport(9)).toEqual([]);
  });

  it('gives the messages of several reports in one read, by report (plan 8R-3)', async () => {
    const store = await made();
    await store.add(gruntRow(3, { reportId: 2 }));
    await store.add(gruntRow(1));
    await store.add(gruntRow(2, { channelId: '400000000000000002' }));
    await store.add(gruntRow(4, { reportId: 3 }));
    expect(await store.ofReports([2, 1, 9])).toEqual([
      gruntRow(1),
      gruntRow(2, { channelId: '400000000000000002' }),
      gruntRow(3, { reportId: 2 }),
    ]);
    expect(await store.ofReports([])).toEqual([]);
  });
}

/** What the kept Rocket lineups do, run against the repository and its twin in memory alike. */
export function rocketLineupCases(made: () => Promise<RocketLineupStorage>): void {
  it('has no list before the first read', async () => {
    const store = await made();
    expect(await store.kept()).toEqual({ choices: [], readAt: undefined });
  });

  it('keeps a grunt type’s two lineups inside its choice (plan 8R-4L)', async () => {
    const store = await made();
    const water = waterWithLineups();
    const arlo = listedChoice('leader:arlo');
    await store.replace([water, arlo], 1_000);
    expect(await store.kept()).toEqual({ choices: [water, arlo], readAt: 1_000 });
    // A later read without them: the type is its merged choice again.
    const merged = listedChoice('grunt:water');
    await store.replace([merged], 2_000);
    expect(await store.kept()).toEqual({ choices: [merged], readAt: 2_000 });
  });

  it('works a lineup’s fingerprint out from its data, never keeping one handed over (L3)', async () => {
    const store = await made();
    const water = waterWithLineups();
    const wrong: RocketChoice = {
      ...water,
      lineups: (water.lineups ?? []).map((one) => ({ ...one, fingerprint: 'wrong' })),
    };
    await store.replace([wrong], 1_000);
    expect(await store.kept()).toEqual({ choices: [water], readAt: 1_000 });
  });

  it('keeps the last list read, in its order, a choice changed by a later read', async () => {
    const store = await made();
    const water = listedChoice('grunt:water');
    const arlo = listedChoice('leader:arlo');
    const decoy = listedChoice('decoy', { name: 'Decoy grunt', catches: [] });
    await store.replace([water, arlo], 1_000);
    await store.replace([decoy, { ...water, catches: water.catches.slice(0, 1) }], 2_000);
    expect(await store.kept()).toEqual({
      choices: [decoy, { ...water, catches: water.catches.slice(0, 1) }],
      readAt: 2_000,
    });
  });
}
