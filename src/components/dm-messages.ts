import { KeyedLock } from '../services/keyed-lock.js';

/**
 * The direct messages whose buttons are being changed, one change at a time per message (plan
 * 8R-4, F5: shared by a Stop's press, `dm.ts`, and the Submit of the dialog a Manage… opened,
 * `wantBoxControls`): two buttons of one message changed at once would each write the rows as
 * their own interaction saw them, and the second would undo the first.
 */
export const dmMessages = new KeyedLock<string>();
