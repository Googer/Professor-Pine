import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { EDITOR_TOUR_STEPS, tourSteps, type TourFacts } from './client/tour.js';

const MEMBER: TourFacts = {
  audience: 'member',
  finds: true,
  more: 'lacking',
  regions: false,
  history: false,
};
const VISITOR: TourFacts = {
  audience: 'visitor',
  finds: false,
  more: 'discord',
  regions: false,
  history: false,
};

/** The tour's steps are data naming the page's parts: a part renamed must not leave one behind. */
describe("the map's tour (plan 8M-17)", () => {
  it('points only at what the page has', () => {
    const folder = path.join(process.cwd(), 'src/web/client');
    const sources = [
      readFileSync(path.join(process.cwd(), 'src/web/page.ts'), 'utf8'),
      ...readdirSync(folder)
        .filter(
          (name) => name.endsWith('.ts') && !name.startsWith('tour') && !name.includes('.test.'),
        )
        .map((name) => readFileSync(path.join(folder, name), 'utf8')),
    ].join('\n');
    const selectors = [MEMBER, VISITOR, { ...VISITOR, more: 'links' as const }]
      .flatMap((facts) => tourSteps(facts))
      .concat(EDITOR_TOUR_STEPS)
      .flatMap((step) => step.targets)
      .flatMap((target) => target.selectors);
    for (const selector of selectors.filter((one) => !one.includes('leaflet-pm'))) {
      for (const name of selector.match(/[#.][\w-]+/gu) ?? []) {
        const bare = name.slice(1);
        expect(sources, name).toMatch(
          name.startsWith('#')
            ? new RegExp(`id="${bare}"`, 'u')
            : new RegExp(`className[ =:]+['\`][^'\`]*\\b${bare}\\b`, 'u'),
        );
      }
    }
  });
});
