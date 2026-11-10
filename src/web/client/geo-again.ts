import type { GeoView } from '../../domain/web/geo-data.js';
import type { Me } from './notice.js';
import type { MapGym } from './popup.js';

/**
 * The regions and gyms the map shows, held by the parties' layer and its forms: changed in place
 * when another view of the map is taken (`takeGeo`).
 */
export interface ShownGeo {
  gyms: Map<number, MapGym>;
  names: Map<number, string>;
  regions: GeoView['regions'];
}

/**
 * The map's regions and gyms asked again once Discord says who is asking (8Z-2 final fix F2).
 * `/api/geo` answers somebody Discord cannot say of (`unconfirmed`: the first minute after a
 * restart, the member directory failing) with the visitors' view, so that the map starts; on a
 * server with regions only its members see, a member would then miss those regions and their gyms
 * for the life of the page while the list of parties names raids there. The page's way back is
 * the list of parties: asked again until Discord answers (`/api/parties`' 503 `UNCONFIRMED`), its
 * first list says the server counts the asker a member. So where `/api/me` did not confirm a
 * member at load, the first list drawn asks `/api/geo` again (`ask`) and the page takes its view
 * (`grow`); a list after an ask that failed asks once more. A member confirmed at load, a visitor
 * and a non-member (who gets no list) ask nothing more.
 */
export function geoAgain(
  me: Me,
  ask: () => Promise<GeoView>,
  grow: (view: GeoView) => void,
): { listDrawn(): Promise<void> } {
  let due = me.loggedIn && !me.member;
  let asking: Promise<void> | undefined;
  return {
    listDrawn: () => {
      if (!due) return Promise.resolve();
      asking ??= ask()
        .then(
          (view) => {
            due = false;
            grow(view);
          },
          () => undefined,
        )
        .finally(() => {
          asking = undefined;
        });
      return asking;
    },
  };
}

/**
 * Another view of the map taken in place of the one shown (8Z-2 final fix F2): the same maps and
 * list, which the parties' layer and its forms hold, now the view's; the regions that are new to
 * the map, to be drawn, and those it no longer has, to be taken off.
 */
export function takeGeo(
  shown: ShownGeo,
  view: GeoView,
): { added: GeoView['regions']; removed: number[] } {
  const before = new Set(shown.regions.map((region) => region.id));
  const after = new Set(view.regions.map((region) => region.id));
  const added = view.regions.filter((region) => !before.has(region.id));
  const removed = shown.regions.filter((region) => !after.has(region.id)).map((r) => r.id);
  shown.regions.splice(0, shown.regions.length, ...view.regions);
  shown.names.clear();
  for (const region of view.regions) shown.names.set(region.id, region.name);
  shown.gyms.clear();
  for (const gym of view.gyms) shown.gyms.set(gym.id, gym);
  return { added, removed };
}
