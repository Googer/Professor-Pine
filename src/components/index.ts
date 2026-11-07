import { cleanupControls } from '../commands/admin/cleanup-legacy.js';
import { closeControls } from '../commands/parties/delete.js';
import { reportControls } from '../commands/parties/report.js';
import { gymControls } from '../commands/gyms/controls.js';
import { gymViewControls } from '../commands/gyms/view-controls.js';
import { regionControls } from '../commands/regions/controls.js';
import { infoControls } from '../commands/meetups/info.js';
import { meetupFormControls } from '../commands/meetups/meetup.js';
import { placeAskControls } from '../commands/meetups/place-ask.js';
import { placesControls } from '../commands/meetups/places.js';
import { pokestopControls } from '../commands/stops/pokestop.js';
import { researchControls } from '../commands/research/research.js';
import { rocketControls } from '../commands/rocket/rocket.js';
import {
  targetControls,
  targetListControls,
  targetRemovalControls,
} from '../commands/notifications/targets.js';
import {
  wantBoxControls,
  wantControls,
  wantListControls,
} from '../commands/notifications/wants.js';
import { locationControls } from '../commands/raids/location.js';
import { raidControls } from '../commands/raids/raid.js';
import { roleControls } from '../commands/roles/menus.js';
import { countersControls } from '../commands/util/counters-dialog.js';
import { helpControls } from '../commands/util/help.js';
import { rankControls } from '../commands/util/rank.js';
import { statsControls } from '../commands/stats/stats.js';
import { settingsControls } from '../commands/settings/settings.js';
import { screenshotControls } from '../commands/screenshots/feedback.js';
import type { ComponentHandler } from '../discord/command.js';
import { dmControls } from './dm.js';
import { gymReviewControls } from './gym-review.js';
import { meetupAppealControls } from './meetup-appeal.js';
import { meetupSafetyControls } from './meetup-safety.js';
import { reportDecisionControls } from './moderation-reports.js';
import { scriptAccessControls } from './script-access.js';
import { partyButtons } from './party.js';
import { meetControls } from '../commands/parties/meet-dialog.js';
import { manageControls } from '../commands/trains/move.js';
import { meetupManageControls } from '../commands/meetups/manage.js';
import { maxControls } from '../commands/max/max.js';
import { maxPinControls } from './max-pin.js';

/** Every handler of buttons, select menus and modals. The router reads this list. */
export const components: readonly ComponentHandler[] = [
  raidControls,
  maxControls,
  maxPinControls,
  locationControls,
  infoControls,
  meetupFormControls,
  meetupSafetyControls,
  meetupAppealControls,
  placeAskControls,
  placesControls,
  reportDecisionControls,
  scriptAccessControls,
  wantControls,
  wantBoxControls,
  wantListControls,
  targetControls,
  targetRemovalControls,
  targetListControls,
  partyButtons,
  meetControls,
  manageControls,
  meetupManageControls,
  reportControls,
  closeControls,
  dmControls,
  roleControls,
  gymControls,
  gymViewControls,
  gymReviewControls,
  pokestopControls,
  researchControls,
  rocketControls,
  regionControls,
  screenshotControls,
  rankControls,
  statsControls,
  settingsControls,
  helpControls,
  countersControls,
  cleanupControls,
];
