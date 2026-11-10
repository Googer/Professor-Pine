import type { ControlThrottle } from '../../discord/command.js';
import type { Throttle } from '../../discord/throttle.js';

/**
 * The limit of reports, apart from `report.ts` and `report-message.ts`, which import each other:
 * both read it as they load (plan 8S-3).
 */

/** The name of `/report`, in whose window every report is counted (the Apps menu's too). */
export const REPORT_COMMAND = 'report';

/** How often a member may report: five an hour (a post in the moderators' channel each). */
export const REPORT_THROTTLE: Throttle = { uses: 5, perSeconds: 3600 };

/** `/report`'s window, which the form of every report counts in. */
export const REPORT_WINDOW: ControlThrottle = { ...REPORT_THROTTLE, as: REPORT_COMMAND };
