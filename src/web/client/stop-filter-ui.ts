import * as L from 'leaflet';
import type {
  ResearchOptionsView,
  RocketOptionsView,
  StopReportsView,
} from '../../domain/web/stop-report-data.js';
import { getJson } from './common.js';
import { renderNode, type PageNode } from './popup.js';
import {
  FILTER_LEGENDS,
  filterChoices,
  filterWords,
  hiddenCount,
  readFilters,
  shownBy,
  writeFilters,
  type StopFilters,
} from './stop-filter.js';
import type { StopLayer, StopReport } from './stop-reports.js';
import type { ViewStorage } from './view.js';

/*
 * The filters of the reports at stops in the page (plan 8M-9B, goal 5): chosen in the list's group
 * of each layer ("Filter…" beside its heading opens its choices under it, the pick lists asked for
 * then, B12), and always in sight while one is on: the group's heading says it with a clear ×
 * ("Field research · 2 · Rare Candy ×") and how many it hides, a line over the map says it with
 * its × (`.filter-line`, on a phone too), and the layer's toggle says it (`filtered`). Kept per
 * browser (`readFilters`).
 */

/** The layers' names as the filter's line over the map says them. */
const LAYER_NAMES: Readonly<Record<StopLayer, string>> = {
  research: 'Field research',
  rocket: 'Team GO Rocket',
};

export interface StopFilterUiDeps {
  map: L.Map;
  guild: string;
  storage: ViewStorage | undefined;
  /** The reports as the page has them now. */
  view(): StopReportsView | undefined;
  /** The filters changed: the reports drawn anew (the map and the list). */
  changed(): void;
  /** The list drawn anew without a new list (the choices came, the panel opened or closed). */
  render(): void;
  /** The layer's toggle says the filter (its title, its row in the sheet), or none. */
  filtered?(layer: StopLayer, words: string | undefined): void;
}

const isLayer = (kind: string): kind is StopLayer => kind === 'research' || kind === 'rocket';

export function stopFilterUi(deps: StopFilterUiDeps) {
  let filters: StopFilters = readFilters(deps.storage);
  let open: StopLayer | undefined;
  const lists: { research?: ResearchOptionsView; rocket?: RocketOptionsView } = {};
  let asking: Promise<void> | undefined;

  const choices = () => filterChoices(deps.view(), lists.research, lists.rocket);
  const names = (): Map<string, string> => {
    const all = choices();
    return new Map([...all.research, ...all.rocket].map((choice) => [choice.value, choice.name]));
  };
  const words = (layer: StopLayer): string | undefined => filterWords(filters[layer], names());

  /** The line over the map while a filter is on: each layer's words with its ×. */
  const line = document.createElement('div');
  line.className = 'filter-line';
  line.hidden = true;
  L.DomEvent.disableClickPropagation(line);
  const control = new L.Control({ position: 'topright' });
  control.onAdd = () => line;
  control.addTo(deps.map);

  const set = (layer: StopLayer, values: readonly string[]): void => {
    filters = { ...filters, [layer]: values };
    writeFilters(deps.storage, filters);
    deps.changed();
  };

  const clearButton = (layer: StopLayer): PageNode => ({
    tag: 'button',
    className: 'clear-filter',
    text: '×',
    attributes: {
      type: 'button',
      'data-clear-filter': layer,
      'aria-label': `Clear the filter of ${LAYER_NAMES[layer]}`,
      title: 'Clear the filter',
    },
  });

  /** The words in sight drawn anew: the map's line and the toggles. */
  const shown = (): void => {
    const parts: PageNode[] = [];
    for (const layer of ['research', 'rocket'] as const) {
      const said = words(layer);
      deps.filtered?.(layer, said);
      if (said === undefined) continue;
      parts.push({
        tag: 'span',
        className: `filter-chip ${layer}`,
        children: [{ tag: 'span', text: `${LAYER_NAMES[layer]} · ${said}` }, clearButton(layer)],
      });
    }
    line.replaceChildren(...parts.map((part) => renderNode(part, document)));
    line.hidden = parts.length === 0;
  };
  line.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target.closest('button') : null;
    const layer = target instanceof HTMLButtonElement ? target.dataset.clearFilter : undefined;
    if (layer !== undefined && isLayer(layer)) set(layer, []);
  });

  /**
   * The pick lists, asked for as a filter opens (B12), each time (review F10: the browser asks
   * again by their ETag, a 304 costing nothing; a failed answer is not kept), not twice at once;
   * a list that fails keeps the one it had. The list drawn once they came.
   */
  const askLists = (): void => {
    if (asking) return;
    asking = Promise.allSettled([
      getJson<ResearchOptionsView>(`/s/${deps.guild}/api/research-options`).then((view) => {
        lists.research = view;
      }),
      getJson<RocketOptionsView>(`/s/${deps.guild}/api/rocket-options`).then((view) => {
        lists.rocket = view;
      }),
    ]).then(() => {
      asking = undefined;
      deps.render();
    });
  };

  return {
    /** Whether a report passes the filters (the draw and the list). */
    shows(report: StopReport, layer: StopLayer): boolean {
      return shownBy(filters)(report, layer);
    },

    /** The words in sight, drawn anew with each draw of the reports. */
    shown,

    /**
     * A layer's filter lifted, as its × lifts it: Find's pick of a report the filter hides (plan
     * 8M-12), so that its marker is drawn to open.
     */
    clear(layer: StopLayer): void {
      set(layer, []);
    },

    /** What a group's note adds: how many its filter hides. */
    hiddenNote(layer: StopLayer, now: number): string | undefined {
      const hidden = hiddenCount(deps.view(), filters, layer, now);
      if (filters[layer].length === 0) return undefined;
      return hidden === 1 ? '1 hidden by the filter.' : `${String(hidden)} hidden by the filter.`;
    },

    /** Beside a group's heading: its filter in words with its ×, and "Filter…". */
    head(kind: string): HTMLElement[] {
      if (!isLayer(kind)) return [];
      const said = words(kind);
      const parts: PageNode[] = [
        ...(said === undefined
          ? []
          : [{ tag: 'span', className: 'filter-words', text: ` · ${said}` }, clearButton(kind)]),
        {
          tag: 'button',
          className: 'filter-open',
          text: 'Filter…',
          attributes: {
            type: 'button',
            'data-filter-open': kind,
            'aria-expanded': String(open === kind),
          },
        },
      ];
      return parts.map((part) => renderNode(part, document));
    },

    /** Under a group's heading while its filter is open: its choices, then Done. */
    body(kind: string): HTMLElement[] {
      if (!isLayer(kind) || open !== kind) return [];
      const offered = choices()[kind];
      const chosen = new Set(filters[kind]);
      const node: PageNode = {
        tag: 'fieldset',
        className: 'filter-panel',
        children: [
          {
            tag: 'legend',
            text: FILTER_LEGENDS[kind],
          },
          ...(offered.length === 0
            ? [{ tag: 'p', className: 'hint', text: 'Nothing to filter by yet.' }]
            : offered.map((choice): PageNode => ({
                tag: 'label',
                className: 'filter-choice',
                children: [
                  {
                    tag: 'input',
                    attributes: {
                      type: 'checkbox',
                      'data-filter-kind': kind,
                      'data-filter-value': choice.value,
                      ...(chosen.has(choice.value) ? { checked: '' } : {}),
                    },
                  },
                  { tag: 'span', text: choice.name },
                ],
              }))),
          {
            tag: 'button',
            className: 'press',
            text: 'Done',
            attributes: { type: 'button', 'data-filter-done': kind },
          },
        ],
      };
      return [renderNode(node, document)];
    },

    /** A click or a change in the list that is the filters': true when taken. */
    handled(target: EventTarget | null): boolean {
      if (target instanceof HTMLInputElement) {
        const { filterKind, filterValue } = target.dataset;
        if (filterKind === undefined || filterValue === undefined || !isLayer(filterKind)) {
          return false;
        }
        const rest = filters[filterKind].filter((value) => value !== filterValue);
        set(filterKind, target.checked ? [...rest, filterValue] : rest);
        return true;
      }
      const button = target instanceof Element ? target.closest('button') : null;
      if (!(button instanceof HTMLButtonElement)) return false;
      const { filterOpen, filterDone, clearFilter } = button.dataset;
      if (filterOpen !== undefined && isLayer(filterOpen)) {
        open = open === filterOpen ? undefined : filterOpen;
        if (open !== undefined) askLists();
        deps.render();
        return true;
      }
      if (filterDone !== undefined) {
        open = undefined;
        deps.render();
        return true;
      }
      if (clearFilter !== undefined && isLayer(clearFilter)) {
        set(clearFilter, []);
        return true;
      }
      return false;
    },
  };
}

export type StopFilterUi = ReturnType<typeof stopFilterUi>;
