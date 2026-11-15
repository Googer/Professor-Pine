import type { ServerValues } from '../../config/server-settings.js';
import { MEMBER_WRITE_THROTTLE, type Throttle } from '../../discord/throttle.js';

/** What staff are told to set where a server notifies nobody (plan 19A-1). */
export const NOTIFICATIONS_NOT_SET_UP = 'Staff turn on notifications in /admin settings.';

/**
 * Whether a server notifies its members (its `features.notifications`, plan 19A-1): the commands
 * of wants and gym targets are set up only there (`CommandHandler.setUpIn`).
 */
export const notificationsSetUp = (values: ServerValues): string | undefined =>
  values.features.notifications ? undefined : NOTIFICATIONS_NOT_SET_UP;

/** How often one member may change what they are notified about: each use writes to the database. */
export const NOTIFICATION_THROTTLE: Throttle = MEMBER_WRITE_THROTTLE;
