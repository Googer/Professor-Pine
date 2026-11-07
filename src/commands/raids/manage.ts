import type { ButtonInteraction, ModalSubmitInteraction } from 'discord.js';
import type { AppContext } from '../../app-context.js';
import { deferSubmit, withoutOpenToken } from '../../discord/dialog.js';
import type { ComponentHandler } from '../../discord/command.js';
import { UserError } from '../../discord/errors.js';
import { requireGuild } from '../../discord/guards.js';
import { countUse, raidChangeWindow } from '../parties/windows.js';
import { STALE_COMPONENT } from '../../discord/router.js';
import { isRaid, type Party, type RaidParty } from '../../domain/party/party.js';
import {
  MOVES_LATER,
  movesLeft,
  raidChangesAsked,
  type RaidManageFields,
} from '../../domain/web/raid-manage.js';
import {
  RAID_BOSS_INPUT,
  RAID_CHARGE_INPUT,
  RAID_END_INPUT,
  RAID_HATCH_INPUT,
  RAID_MANAGE_FORM,
  RAID_MANAGE_KIND,
  RAID_QUICK_INPUT,
  raidManageDialog,
} from '../../render/manage-dialogs.js';
import { partyOver } from '../parties/reply.js';
import { changingMember } from './change.js';
import { bossMoves, manageRaidAs } from './raid-changes.js';
import { raidOptions } from './raid-options.js';

const A_RAID = { type: 'raid' } as const;

/** The active raid a control names, refused privately as the map's route refuses it. */
function activeRaid(ctx: AppContext, partyId: string): RaidParty {
  const party: Party | undefined = ctx.parties.get(partyId);
  if (!party) throw new UserError(partyOver(A_RAID));
  if (!isRaid(party)) throw new UserError(STALE_COMPONENT);
  return party;
}

/**
 * Manage… of a raid's post (plan 8M-21; `party:<id>:manage`): the map's "Manage the raid" as a
 * dialog (`raidManageDialog`), for anybody who sees the post, as the map lets anybody who sees the
 * raid change it (plan 8M-8B). Nothing is read from the database: the pick lists and the moves
 * are in memory.
 */
export async function openRaidManage(
  interaction: ButtonInteraction,
  ctx: AppContext,
  partyId: string,
): Promise<void> {
  const party = activeRaid(ctx, partyId);
  await interaction.showModal(
    raidManageDialog({
      party,
      options: raidOptions(ctx.raidBosses.bosses(), ctx.config.settings.timezone),
      moves: bossMoves(ctx, party),
      now: Date.now(),
    }),
  );
}

/** What a Submit holds, by the names of the map's fields; '' for what it does not have. */
function submittedFields(interaction: ModalSubmitInteraction): RaidManageFields {
  const { fields } = interaction;
  const text = (id: string) => (fields.fields.has(id) ? fields.getTextInputValue(id) : '');
  const chosen = (id: string) =>
    fields.fields.has(id) ? (fields.getStringSelectValues(id)[0] ?? '') : '';
  return {
    hatch: text(RAID_HATCH_INPUT),
    end: text(RAID_END_INPUT),
    boss: chosen(RAID_BOSS_INPUT),
    quick: chosen(RAID_QUICK_INPUT),
    charge: chosen(RAID_CHARGE_INPUT),
  };
}

/**
 * Submit of a raid's Manage… (`rmanage:<id>:form:~…`): acknowledged privately, then what was
 * filled in made as the map's form makes it (`raidChangesAsked`, `manageRaidAs`: the boss, the
 * times, the moves, each through its command's path), answered in the commands' words; moves
 * picked beside a new boss wait, as the map's form turns them off (`MOVES_LATER`).
 */
export async function submitRaidManage(
  interaction: ModalSubmitInteraction,
  ctx: AppContext,
  partyId: string,
  args: readonly string[],
): Promise<void> {
  if (withoutOpenToken(args).length > 0) throw new UserError(STALE_COMPONENT);
  const fields = submittedFields(interaction);
  await deferSubmit(interaction);
  const say = (content: string) => interaction.editReply({ content });
  const party = ctx.parties.get(partyId);
  if (!party) return void (await say(partyOver(A_RAID)));
  if (!isRaid(party)) return void (await say(STALE_COMPONENT));
  const userId = interaction.user.id;
  const answer = await manageRaidAs(
    ctx,
    party,
    changingMember(interaction),
    raidChangesAsked(fields),
    Date.now(),
    // Each change in its command's window, as the map's route counts it (review M1).
    (change) => countUse(ctx.throttles, raidChangeWindow(change.change), userId, Date.now()),
  );
  const later = answer.kind === 'ok' && movesLeft(fields) ? ` ${MOVES_LATER}` : '';
  await say(`${answer.text}${later}`);
}

/**
 * The dialog of a raid's Manage…: counted by no window of its own (review M1): each change it
 * makes counts in its command's window, as the map's route counts it (`manageRaidAs`).
 */
export const raidManageControls: ComponentHandler = {
  kind: RAID_MANAGE_KIND,
  guards: [requireGuild],
  throttle: () => undefined,
  async modal(interaction, id, ctx) {
    if (id.action !== RAID_MANAGE_FORM) throw new UserError(STALE_COMPONENT);
    await submitRaidManage(interaction, ctx, id.id, id.args);
  },
};
