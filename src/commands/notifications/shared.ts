import type { Config } from '../../config/index.js';
import { MEMBER_WRITE_THROTTLE, type Throttle } from '../../discord/throttle.js';

/** Whether this installation notifies members at all (`settings.features.notifications`). */
export const notificationsEnabled = (config: Config): boolean =>
  config.settings.features.notifications;

/** How often one member may change what they are notified about: each use writes to the database. */
export const NOTIFICATION_THROTTLE: Throttle = MEMBER_WRITE_THROTTLE;
