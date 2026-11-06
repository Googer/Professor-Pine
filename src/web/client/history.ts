import { showBoards } from './history-boards-ui.js';
import { showDays } from './history-days-ui.js';
import { showTally } from './history-tally-ui.js';
import { showMe } from './me-ui.js';
import { showAccount } from './page-frame.js';

/*
 * The history page (plan 8H-5) and "Your history" (plan 8H-6, `data-page="me"`), one bundle: the
 * header (the login, or the member's menu with the theme); on the history page the region tally
 * of `/api/stats/regions` with its periods (`history-tally-ui.ts`) and the boards
 * (`history-boards-ui.ts`), above them raids by day, the big days and a boss's trend (plan 8H-8,
 * `history-days-ui.ts`); on "Your history" the member's own numbers (`me-ui.ts`). Logged out or no
 * member, the days say so once and every other section hides (B9). This is tried at staging.
 */

const data = document.body.dataset;
const guild = data.guild ?? '';
const login = data.login === 'discord' ? 'discord' : 'links';
void showAccount(guild, login, 'history', () => [], true);

if (data.page === 'me') {
  showMe(guild, login);
} else {
  showDays(guild, login);
  showTally(guild, login);
  showBoards(guild, login);
}
