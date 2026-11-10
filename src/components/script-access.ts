import type { ComponentHandler, Guard } from '../discord/command.js';
import { UserError } from '../discord/errors.js';
import { discordPayload } from '../discord/party-gateway.js';
import { STALE_COMPONENT } from '../discord/router.js';
import type { Throttle } from '../discord/throttle.js';
import {
  accessDecidedDm,
  DM_DECISIONS,
  SCRIPT_ACCESS_KIND,
  type DmDecision,
} from '../render/script-access-dm.js';

/** How often the owner may press the buttons of the requests' DMs. */
export const SCRIPT_ACCESS_THROTTLE: Throttle = { uses: 20, perSeconds: 60 };

/** What anybody but the owner is told of a press. */
export const OWNER_ONLY = 'Only the owner of this Pine decides who gets the Wayfarer export tool.';

/** Only the instance's owner (`OWNER_ID`) decides: the DM goes to nobody else. */
const requireOwner: Guard = (interaction, ctx) => {
  if (interaction.user.id !== ctx.config.env.OWNER_ID) throw new UserError(OWNER_ONLY);
};

const isDecision = (action: string): action is DmDecision =>
  (DM_DECISIONS as readonly string[]).includes(action);

/**
 * Approve and Refuse under the owner's DM of a request for the Wayfarer export tool (plan 8W-P;
 * custom-id kind `scriptaccess`, the id the request's row id, the argument the time of the asking
 * the DM was drawn for, in base 36). Only the owner may press (a guard:
 * Discord's own check of who pressed, so the page's fresh login is not needed here). A press
 * decides the request as it is now (`ScriptAccessService.decide` from `asked` and that asking: a
 * request asked again since is another; an approval makes a new key) and edits the DM to say what was decided and when, without its buttons; a request
 * decided meanwhile (on the page, or by another press) is left as it is and the DM says what it
 * was decided as; a DM of an asking renewed since is redrawn with its own asking's time (not the
 * newer asking's community line) and names the newer asking. A request that is gone, or a button it does not know, is out of date.
 */
export const scriptAccessControls: ComponentHandler = {
  kind: SCRIPT_ACCESS_KIND,
  guards: [requireOwner],
  throttle: SCRIPT_ACCESS_THROTTLE,
  async button(interaction, id, ctx) {
    const rowId = Number(id.id);
    const asked = id.args[0] ?? '';
    const askedAt = parseInt(asked, 36);
    if (
      !isDecision(id.action) ||
      !/^\d+$/.test(id.id) ||
      !Number.isSafeInteger(rowId) ||
      !/^[0-9a-z]+$/.test(asked) ||
      !Number.isSafeInteger(askedAt)
    ) {
      throw new UserError(STALE_COMPONENT);
    }
    if (!(await ctx.scriptAccess.byId(rowId))) throw new UserError(STALE_COMPONENT);
    await interaction.deferUpdate();
    const outcome = await ctx.scriptAccess.decide(rowId, id.action, 'asked', askedAt);
    if (outcome.kind === 'gone') {
      await interaction.followUp({ content: STALE_COMPONENT });
      return;
    }
    await interaction.editReply(
      discordPayload(
        accessDecidedDm(outcome.access, { before: outcome.kind === 'changed', askedAt }),
      ),
    );
  },
};
