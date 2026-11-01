import { describe, expect, it } from 'vitest';
import type { MapRaid, PostView } from '../../domain/web/party-data.js';
import { maxBox } from './max-forms.js';
import { meetupHereBox } from './meetup-forms.js';
import { gymRaidsPopup } from './parties.js';
import { gymPopup, type MapGym, type PageNode } from './popup.js';
import { ALL_RAIDS_HERE, gymWithRaidBoxes, postPopup, raidChoices } from './post-draw.js';
import { reportBox } from './raid-forms.js';
import { researchButton } from './research-forms.js';
import { rocketBox } from './rocket-forms.js';
import { plainStopPopup, stopPopup } from './stop-popup.js';
import { CASE_NOW, CASE_ZONE, caseResearch, caseView } from './stop-report-cases.js';
import { reportsAtStops } from './stop-reports.js';
import { spawnBox } from './spawn-forms.js';
import { trainHereBox } from './train-forms.js';

/**
 * What the rule of `map.css` that hides a place's controls under a form takes for granted
 * (`place-form-look.test.ts`), over the real trees of the popups: the boxes are siblings, directly
 * under the root the rule names, and an idle box holds only its button, so that the rule, which
 * reads a box holding anything else as a form, fires only under one.
 */

/** Every node of a tree, depth first. */
const all = (node: PageNode): PageNode[] => [node, ...(node.children ?? []).flatMap(all)];

const classes = (node: PageNode): string[] => node.className?.split(' ') ?? [];
const isControl = (node: PageNode): boolean => classes(node).includes('place-control');

/** The place's controls of a tree, held to the rule's conditions; `under` is their parent. */
function checked(root: PageNode, rootClass: string, under: PageNode = root): PageNode[] {
  expect(classes(root)).toContain(rootClass);
  const direct = (under.children ?? []).filter(isControl);
  expect(direct.length, rootClass).toBeGreaterThan(1);
  // None anywhere but side by side there: the sibling rules would miss it.
  expect(all(root).filter(isControl), rootClass).toEqual(direct);
  for (const control of direct) {
    if (control.tag === 'button') continue;
    expect(control.children?.length, control.className).toBeGreaterThan(0);
    for (const child of control.children ?? []) {
      expect(child.tag, control.className).toBe('button');
    }
  }
  return direct;
}

/** Each control a rule hides with the separator before it has that separator right before it. */
function separatorsBefore(line: PageNode, isHidden: (node: PageNode) => boolean): number {
  const parts = line.children ?? [];
  let seen = 0;
  parts.forEach((part, index) => {
    if (!isHidden(part) || index === 0) return;
    expect(parts[index - 1]?.className).toBe('sep');
    seen += 1;
  });
  return seen;
}

const GYM: MapGym = {
  id: 1,
  name: 'Pinewood Public Library',
  nickname: null,
  lat: 40.05,
  lon: -80.05,
  regionIds: [],
  address: null,
  description: null,
  notice: null,
};

const RAID: MapRaid = {
  kind: 'raid',
  postKey: 'k',
  id: 'r1',
  gymId: 1,
  picture: null,
  tier: 'Level 5 raid',
  tierGroup: '5',
  heading: 'Level 5 raid',
  boss: null,
  stage: 'egg',
  hatchTime: null,
  endTime: null,
  link: 'https://discord.com/channels/1/2',
  place: null,
  mayChange: true,
  mayReport: true,
  attendance: {
    groups: [{ id: 'A', interested: 0, coming: 1, present: 0 }],
    going: 1,
    mine: null,
    actions: [{ action: 'join' }],
    remote: { offered: false, on: false },
    count: true,
  },
};

const POST: PostView = { key: 'k', accent: 'egg', blocks: [] };

const PLACED = {
  now: CASE_NOW,
  origin: 'https://map.example.test',
  guild: '412345678901234567',
  time: { locale: 'en-US', timeZone: CASE_ZONE },
  stopName: (key: string) => key,
  place: { lat: 40.05, lon: -80.05 },
  located: undefined,
  units: 'imperial' as const,
};

const STOP = { key: 'stop-1', name: 'Yellow Mural 1' };
const STOP_CTX = {
  now: CASE_NOW,
  zone: CASE_ZONE,
  located: undefined,
  units: 'imperial' as const,
  actions: [researchButton(STOP), rocketBox(STOP)],
};

describe("the controls of a place in a popup's tree", () => {
  it('are marked as such, each of them', () => {
    const controls = [
      reportBox(1),
      spawnBox(1),
      meetupHereBox(1),
      trainHereBox('1'),
      maxBox('s'),
      rocketBox(STOP),
      researchButton(STOP),
      ALL_RAIDS_HERE,
    ];
    for (const control of controls) expect(isControl(control), control.className).toBe(true);
  });

  it("are siblings under a gym's own popup, as `gymControls` adds them", () => {
    const popup = gymPopup(GYM, new Map());
    const controls = [reportBox(1), spawnBox(1), meetupHereBox(1), trainHereBox('1')];
    const root = { ...popup, children: [...(popup.children ?? []), ...controls] };
    expect(checked(root, 'gym-popup')).toEqual(controls);
  });

  it("are siblings under a raid's post, its map line's own with their separators", () => {
    const root = postPopup(POST, RAID, PLACED, [ALL_RAIDS_HERE, ...gymWithRaidBoxes(1)]);
    expect(checked(root, 'post-popup')).toHaveLength(4);
    const line = all(root).find((node) => classes(node).includes('map-line'));
    expect(line && separatorsBefore(line, (node) => classes(node).includes('link-button'))).toBe(1);
  });

  it("are siblings under a raid's summary, drawn while its post has not come", () => {
    const root = gymRaidsPopup(1, [RAID], { now: CASE_NOW, zone: CASE_ZONE, gym: () => GYM }, [
      ...gymWithRaidBoxes(1),
    ]);
    expect(checked(root, 'raids')).toHaveLength(3);
    // What the rule hides of it besides them is there to hide.
    for (const name of ['presses', 'change-raid']) {
      expect(
        all(root).some((node) => classes(node).includes(name)),
        name,
      ).toBe(true);
    }
  });

  it('are siblings under the list of the raids at a gym', () => {
    const root = raidChoices('Pinewood', [], gymWithRaidBoxes(1));
    expect(checked(root, 'raid-choices')).toHaveLength(3);
  });

  it("are siblings in a stop's actions, its reports' own with their separators", () => {
    const view = caseView({ research: [caseResearch(1, { mayTakeBack: true })] });
    const [at] = reportsAtStops(view, { on: () => true, now: CASE_NOW, keep: new Set(['stop-1']) });
    if (!at) throw new Error('no stop');
    const root = stopPopup(at, { ...STOP_CTX, more: () => [] });
    const actions = all(root).find((node) => classes(node).includes('stop-actions'));
    expect(checked(root, 'stop-popup', actions)).toHaveLength(2);
    const line = all(root).find((node) => classes(node).includes('report-actions'));
    expect(
      line && separatorsBefore(line, (node) => node.attributes?.['data-take-back'] !== undefined),
    ).toBe(1);
  });

  it("are siblings in a stop's actions without reports", () => {
    const root = plainStopPopup(
      { id: 'stop-1', title: 'Yellow Mural 1', lat: 40, lon: -80 },
      STOP_CTX,
    );
    const actions = all(root).find((node) => classes(node).includes('stop-actions'));
    expect(checked(root, 'stop-popup', actions)).toHaveLength(2);
  });
});
