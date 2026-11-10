import {
  confirmPayload,
  GYM_REVIEW_KIND,
  outcomeLines,
  reviewPayload,
} from '../commands/gyms/review.js';
import { staffPlace } from '../commands/gyms/shared.js';
import { actingMember } from '../commands/parties/reply.js';
import type { ComponentHandler } from '../discord/command.js';
import { UserError } from '../discord/errors.js';
import { requireBotManagement } from '../discord/guards.js';
import { STALE_COMPONENT } from '../discord/router.js';
import { isReviewAction } from '../services/wayfarer-review-service.js';

/** A review item's row id as a custom id carries it. */
const ROW_ID = /^[1-9]\d{0,9}$/;

/**
 * The buttons of `/gym review` (custom-id kind `gymreview`): `gymreview:<review id>:<action>`,
 * with the Wayfarer id of the candidate for "Same as" and "New gym". An item is found by its
 * row id, for the presser's server, and read again: whatever the message showed, the answer is
 * decided against the item as it is now (`WayfarerReviewService.decide`). The message then
 * shows what was done and the next item. The guard of `/gym` applies here as well: a button
 * can be pressed by whoever sees it, and a custom id can be sent by anybody. Any staff member
 * may answer any item of their server: the queue is the server's, not the message's.
 */
export const gymReviewControls: ComponentHandler = {
  kind: GYM_REVIEW_KIND,
  guards: [requireBotManagement],

  async button(interaction, id, ctx) {
    if (!ROW_ID.test(id.id) || !isReviewAction(id.action)) throw new UserError(STALE_COMPONENT);
    // An answer may move or delete a gym, which takes longer than Discord waits for a reply.
    await interaction.deferUpdate();
    const place = await staffPlace(interaction, ctx);
    if (place.guildId === undefined) {
      // The message is components v2, and stays so.
      await interaction.editReply(
        reviewPayload(undefined, ctx.config.settings.distanceUnits, [
          'I do not know this server yet. Try again in a moment.',
        ]),
      );
      return;
    }
    const reviewId = Number(id.id);
    const outcome = await ctx.wayfarerReview.decide(
      place,
      actingMember(interaction),
      reviewId,
      id.action,
      id.args[0],
    );
    if (outcome.kind === 'asking') {
      await interaction.editReply(confirmPayload(reviewId, outcome));
      return;
    }
    // Back shows the item that was asked about, while it is still open; else the next one.
    const again =
      outcome.kind === 'back' ? await ctx.wayfarerReview.shown(place.guildId, reviewId) : undefined;
    const next = again ?? (await ctx.wayfarerReview.next(place.guildId));
    await interaction.editReply(
      reviewPayload(
        next,
        ctx.config.settings.distanceUnits,
        outcomeLines(outcome, ctx.config.settings.distanceUnits),
      ),
    );
  },
};
