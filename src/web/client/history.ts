import type { RegionsMineView } from '../../domain/web/region-data.js';
import { EVERYONE_ITEMS, memberItems, menuItemNode, regionsAsked } from './account-items.js';
import { showBoards } from './history-boards-ui.js';
import { showDays } from './history-days-ui.js';
import { showTally } from './history-tally-ui.js';
import { showMe } from './me-ui.js';
import type { Me } from './notice.js';
import { getJson, showAccount } from './page-frame.js';
import { renderNode } from './popup.js';
import { regionsOffered } from './regions.js';
import { browserStorage, stagedRegions } from './staged-storage.js';

/*
 * The history page (plan 8H-5) and "Your history" (plan 8H-6, `data-page="me"`), one bundle: the
 * header (the login, or the member's menu with the map's items, the theme and Log out); on the
 * history page the region tally of `/api/stats/regions` with its periods (`history-tally-ui.ts`)
 * and the boards (`history-boards-ui.ts`), above them raids by day, the big days and a boss's
 * trend (plan 8H-8, `history-days-ui.ts`); on "Your history" the member's own numbers
 * (`me-ui.ts`). Logged out or no member, the days say so once and every other section hides (B9).
 * This is tried at staging.
 */

const data = document.body.dataset;
const guild = data.guild ?? '';
const login = data.login === 'discord' ? 'discord' : 'links';
const page = data.page === 'me' ? 'me' : 'history';

/**
 * The map's menu (Matt, 2026-11-07, `account-items.ts`): its items as links to the map, the page
 * you are on marked; "Your regions…" shown where the member's view of the regions offers it, as
 * on the map (`regionsOffered`); "Edit regions" with the browser's unsaved count, as the map's.
 */
function items(me: Me): HTMLElement[] {
  const unsaved =
    me.loggedIn && me.userId !== undefined
      ? stagedRegions(
          browserStorage(() => window.localStorage),
          guild,
          me.userId,
        )
      : 0;
  return memberItems(me, page).map((item) => {
    const element = renderNode(menuItemNode(item, guild, page, unsaved), document);
    if (item === 'regions' && regionsAsked(me)) {
      void getJson<RegionsMineView>(`/s/${guild}/api/regions/mine`)
        .then((view) => {
          element.hidden = !regionsOffered(view);
        })
        .catch(() => {
          // Not offered where the view could not be had, as on the map.
        });
    }
    return element;
  });
}

void showAccount(guild, login, 'history', items, true, () =>
  EVERYONE_ITEMS.map((item) => renderNode(menuItemNode(item, guild, page), document)),
);

if (page === 'me') {
  showMe(guild, login);
} else {
  showDays(guild, login);
  showTally(guild, login);
  showBoards(guild, login);
}
