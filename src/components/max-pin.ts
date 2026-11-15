import { closeDialog } from '../commands/parties/delete.js';
import type { ComponentHandler } from '../discord/command.js';
import { UserError } from '../discord/errors.js';
import { partyOfServer, requireGuild, requireManagement } from '../discord/guards.js';
import { STALE_COMPONENT } from '../discord/router.js';
import { MAX_PIN_KIND } from '../render/moderation.js';
import { SAFETY_THROTTLE } from './meetup-safety.js';

/**
 * Delete on the moderators' notice of a max battle at a pin (`maxpin:<party id>:delete`; Matt,
 * 2026-10-21, final review G1), for staff alone (`requireManagement`, refused uncounted): opens
 * the dialog of `/delete` (`closeDialog`), whose Submit (`closeControls`) closes the battle as
 * `/delete` does. A battle that is over, or of another server, says it has ended. The press reads
 * nothing slow before the dialog (the slow-read rule): `partyOfServer` finds the battle's server
 * in memory, and the Submit takes no party of another server either.
 */
export const maxPinControls: ComponentHandler = {
  kind: MAX_PIN_KIND,
  guards: [requireGuild, requireManagement],
  throttle: SAFETY_THROTTLE,
  async button(interaction, id, ctx) {
    if (id.action !== 'delete') throw new UserError(STALE_COMPONENT);
    // A battle of another server is none here (`partyOfServer`).
    const party = partyOfServer(interaction, ctx, id.id);
    if (!party) throw new UserError('This max battle has ended.');
    await interaction.showModal(closeDialog(interaction, ctx, party));
  },
};
