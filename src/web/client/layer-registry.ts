import type { ViewStorage } from './view.js';

/**
 * The layers of the live map (plan 8M-7): everything drawn is a layer the member toggles, with a
 * name, whether it is on by default, whether it is live (what happens now) or background (the
 * desktop's row shows the layers in their order as many as fit, the rest under "More"), and how
 * many of its things are in view (the
 * phone's sheet says it). The page's parts register with the registry (one call adds a layer:
 * field research and Team GO Rocket came so with plan 8M-9B) and follow it; the member's choice is
 * kept per browser (`localStorage`, read and written in try/catch).
 */

export interface LayerSpec {
  id: string;
  name: string;
  /**
   * Its words on the desktop's toggle, where the row has no room for its name (plan 8M-9B, B7:
   * "Research", "Rocket"); the name stays in the sheet and the toggle's title.
   */
  short?: string;
  /** On by default. */
  on: boolean;
  /**
   * Live (what happens now) or background. Since 2026-11-07 it no longer places the desktop's
   * toggle: the row shows the layers in `MAP_LAYERS`' order as many as fit, the rest under "More".
   */
  kind: 'live' | 'background';
  /** A line under its name in the phone's sheet. */
  hint?: string;
  /** Offered only to a member (its data is a member's): logged out it is not offered. */
  membersOnly?: boolean;
  /** Offered only once something gives it data (`setOffered`). */
  waits?: boolean;
}

/**
 * The map's layers in the order the row and the sheet show them. A visitor (logged out, or not a
 * member) is given the gyms and the regions' outlines alone (`/api/geo`): every other layer is
 * members-only (plan 8M-13, L1), so that the list offers them nothing empty.
 */
export const MAP_LAYERS: readonly LayerSpec[] = [
  {
    id: 'raids',
    name: 'Raids',
    on: true,
    kind: 'live',
    hint: 'Bosses, eggs and max battles',
    membersOnly: true,
  },
  { id: 'trains', name: 'Trains', on: true, kind: 'live', membersOnly: true },
  { id: 'meetups', name: 'Meetups', on: true, kind: 'live', membersOnly: true },
  // Reports at stops (plan 8M-9B): `/api/stop-reports`, a member's.
  {
    id: 'research',
    name: 'Field research',
    short: 'Research',
    on: true,
    kind: 'live',
    hint: 'Tasks reported at PokéStops today',
    membersOnly: true,
  },
  {
    id: 'rocket',
    name: 'Team GO Rocket',
    short: 'Rocket',
    on: true,
    kind: 'live',
    hint: 'Grunts, leaders and Giovanni at PokéStops',
    membersOnly: true,
  },
  // Wild spawns (Matt, 2026-11-07): `/api/spawns`, a member's; on, under More (the desktop's row
  // holds five live toggles at 1024 pixels).
  {
    id: 'spawns',
    name: 'Wild spawns',
    on: true,
    kind: 'background',
    hint: 'Pokémon reported in the wild, for half an hour',
    membersOnly: true,
  },
  // Off since the Report button (plan 8M-9A): its step 2 draws the gyms to pick from whatever
  // this says (on until then, fix round 1 of 8M-7: "Report raid" was in a gym's popup alone). A
  // browser that kept the layer on keeps it on.
  { id: 'gyms', name: 'Gyms', on: false, kind: 'background', hint: 'Grouped when zoomed out' },
  {
    id: 'stops',
    name: 'PokéStops',
    on: false,
    kind: 'background',
    hint: 'Shown from street level',
    membersOnly: true,
  },
  {
    id: 'spots',
    name: 'Power Spots',
    on: false,
    kind: 'background',
    hint: 'Shown from street level',
    membersOnly: true,
  },
  // The party history as a heatmap (plan 8H-4): `/api/activity`, a member's.
  {
    id: 'activity',
    name: 'Activity',
    on: false,
    kind: 'background',
    // A train's stops count as raids (plan 8H-9, `countedParties`).
    hint: 'Where raids and max battles happen, by the hour (train stops count too)',
    membersOnly: true,
  },
  { id: 'outlines', name: 'Region outlines', on: true, kind: 'background' },
];

/** The regions' names are shown below this zoom (fix round 1). */
export const LABELS_BELOW = 15;

/**
 * Whether the regions' names are shown (the layer Region outlines, with their labels): only zoomed
 * out, below street level, where they help to find a region; closer they would sit under the
 * markers (the controller's ruling, fix round 1).
 */
export function regionLabelsShown(zoom: number): boolean {
  return zoom < LABELS_BELOW;
}

/** Where the choice is kept in the browser: one choice for every server. */
export const LAYERS_KEY = 'pine-map-layers';

export class LayerRegistry {
  private readonly specs: LayerSpec[] = [];
  private readonly state = new Map<string, boolean>();
  private readonly kept: Record<string, boolean>;
  private readonly counts = new Map<string, number>();
  private readonly given = new Set<string>();
  private readonly changeListeners: Array<(id: string, on: boolean) => void> = [];
  private readonly countListeners: Array<(id: string, count: number) => void> = [];

  constructor(private readonly storage: ViewStorage | undefined) {
    this.kept = readKept(storage);
  }

  /** Adds a layer: on by what the browser kept, else by its default. */
  register(spec: LayerSpec): void {
    this.specs.push(spec);
    const kept = this.kept[spec.id];
    this.state.set(spec.id, typeof kept === 'boolean' ? kept : spec.on);
  }

  layers(): readonly LayerSpec[] {
    return this.specs;
  }

  isOn(id: string): boolean {
    return this.state.get(id) ?? false;
  }

  /** The member turned a layer on or off: kept, and told. */
  set(id: string, on: boolean): void {
    if (!this.state.has(id) || this.state.get(id) === on) return;
    this.state.set(id, on);
    this.kept[id] = on;
    try {
      this.storage?.setItem(LAYERS_KEY, JSON.stringify(this.kept));
    } catch {
      // Private mode or a full storage: the choice holds for this visit.
    }
    for (const listener of this.changeListeners) listener(id, on);
  }

  onChange(listener: (id: string, on: boolean) => void): void {
    this.changeListeners.push(listener);
  }

  /** Whether a layer is offered: one of members only to a member, one that waits once given. */
  offered(spec: LayerSpec, member: boolean): boolean {
    return (!spec.membersOnly || member) && (!spec.waits || this.given.has(spec.id));
  }

  /**
   * Whether the layer of this id is registered and offered (`offered`): the members' list's foot
   * line to Campfire's meetups follows the Meetups layer (plan 8V-1).
   */
  isOffered(id: string, member: boolean): boolean {
    const spec = this.specs.find((one) => one.id === id);
    return spec !== undefined && this.offered(spec, member);
  }

  /** Something gives a waiting layer its data (or no longer does). */
  setOffered(id: string, offered: boolean): void {
    if (offered) this.given.add(id);
    else this.given.delete(id);
  }

  /** How many offered layers are on: the phone's "Layers · n". */
  countOn(member: boolean): number {
    return this.specs.filter((spec) => this.offered(spec, member) && this.isOn(spec.id)).length;
  }

  /** How many of a layer's things are in view. */
  setCount(id: string, count: number): void {
    if (this.counts.get(id) === count) return;
    this.counts.set(id, count);
    for (const listener of this.countListeners) listener(id, count);
  }

  count(id: string): number | undefined {
    return this.counts.get(id);
  }

  onCount(listener: (id: string, count: number) => void): void {
    this.countListeners.push(listener);
  }
}

/** The choice kept in the browser: the layers named with a yes or no; nothing else. */
function readKept(storage: ViewStorage | undefined): Record<string, boolean> {
  try {
    const read = JSON.parse(storage?.getItem(LAYERS_KEY) ?? '{}') as unknown;
    if (typeof read !== 'object' || read === null || Array.isArray(read)) return {};
    return Object.fromEntries(
      Object.entries(read).filter(
        (entry): entry is [string, boolean] => typeof entry[1] === 'boolean',
      ),
    );
  } catch {
    return {};
  }
}
