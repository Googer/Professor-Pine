import {
  ComponentType,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type StringSelectMenuInteraction,
} from 'discord.js';
import type { AppContext } from '../../app-context.js';
import type { ComponentHandler, Guard } from '../../discord/command.js';
import { UserError } from '../../discord/errors.js';
import { guildIdOf, requireGuild } from '../../discord/guards.js';
import { STALE_COMPONENT } from '../../discord/router.js';
import { MEMBER_WRITE_THROTTLE } from '../../discord/throttle.js';
import {
  groupRoleIds,
  menuRequest,
  pickedNone,
  type ShownChoice,
} from '../../domain/roles/menus.js';
import type { ChangeRequest, RosterEntry } from '../../domain/roles/self-roles.js';
import {
  NEXT_ACTION,
  OTHER_ID,
  PAGE_ID,
  PICK_ACTION,
  PREVIOUS_ACTION,
  renderRoleMenus,
  ROLES_KIND,
} from '../../render/role-menus.js';
import { fitItems, plain } from '../../render/text.js';
import { LIST_COLOUR, textMessage } from '../../render/v2.js';
import type { V2Message } from '../../discord/party-gateway.js';
import type { RoleChangeOutcome } from '../../services/self-role-service.js';
import {
  actingRoleMember,
  requireJoined,
  ROLES_UNAVAILABLE,
  rolesEnabled,
  roleText,
  STILL_WORKING,
} from './shared.js';
import { failureSentences, memberProblem } from './words.js';
import { answer, showInPlace, v2Answer } from '../../discord/late-reply.js';

/** `/iam` without a role: the private message with the menus, the member's roles ticked. */
export async function showRoleMenus(
  interaction: ChatInputCommandInteraction,
  ctx: AppContext,
): Promise<void> {
  const guildId = guildIdOf(interaction);
  const member = actingRoleMember(interaction);
  const roster = await ctx.selfRoles.roster(guildId);
  if (!roster) throw new UserError(ROLES_UNAVAILABLE);
  await answer(
    interaction,
    v2Answer(renderRoleMenus(roster, new Set(ctx.selfRoles.heldNow(guildId, member)), 0)),
  );
}

/** What a press says that could not draw the menus again. */
const MENUS_AGAIN = 'Use `/iam` again for the menus.';

/** What an old message of menus says once the new menus follow below it. */
export const OLD_MENUS = 'These menus were replaced by the ones below.';

/**
 * Shows the menus in the place of the message that was pressed (acknowledged with
 * `deferUpdate`). A message of menus from before plan 8B-4 is plain text with rows: it is not
 * made a components-v2 message in place (whether Discord takes that is not known); it is
 * closed with `OLD_MENUS` and the menus follow privately below it.
 */
function showMenus(
  interaction: StringSelectMenuInteraction | ButtonInteraction,
  message: V2Message,
): Promise<void> {
  return showInPlace(interaction, message, OLD_MENUS);
}

/**
 * The menus made anew from the roster and the roles the member holds now, with `note` at the
 * end; only the note when the roster cannot be read.
 */
async function menusNow(
  ctx: AppContext,
  guildId: string,
  member: ReturnType<typeof actingRoleMember>,
  page: number,
  note: string,
): Promise<V2Message> {
  const roster = await ctx.selfRoles.roster(guildId).catch((err: unknown) => {
    ctx.log.warn({ err }, 'could not read the self-assignable roles again');
    return undefined;
  });
  // Without the roster there are no menus to draw: the member is told how to get them back.
  if (!roster) return textMessage(LIST_COLOUR, [`${note} ${MENUS_AGAIN}`]);
  return renderRoleMenus(roster, new Set(ctx.selfRoles.heldNow(guildId, member)), page, note);
}

/** A choice of the menu that was pressed, with the name it showed. */
interface PressedChoice extends ShownChoice {
  label: string;
}

/**
 * The menu that was pressed, as its message shows it: the values it offers, their labels, and
 * which of them it showed ticked.
 */
function pressedMenu(interaction: StringSelectMenuInteraction): PressedChoice[] | undefined {
  // A components-v2 message holds its menus inside its container; one from before plan 8B-4
  // in rows at the top. Both are looked through.
  const visit = (component: unknown): PressedChoice[] | undefined => {
    const one = component as {
      type?: unknown;
      custom_id?: unknown;
      options?: { value: string; label: string; default?: boolean }[];
      components?: unknown[];
    };
    if (one.type === ComponentType.StringSelect && one.custom_id === interaction.customId) {
      return (one.options ?? []).map((option) => ({
        value: option.value,
        label: option.label,
        ticked: option.default === true,
      }));
    }
    for (const inner of one.components ?? []) {
      const found = visit(inner);
      if (found) return found;
    }
    return undefined;
  };
  for (const component of interaction.message.components) {
    const found = visit(component.toJSON());
    if (found) return found;
  }
  return undefined;
}

/** How much of a list of names a message has room for. */
const NAMES_ROOM = 500;

/** What a press says when it changed nothing. */
const NOTHING_CHANGED = 'Nothing was changed.';
/**
 * What a press says whose change failed in a way nobody explained before a step of it was known
 * to be done: a request that timed out may have arrived all the same, so it does not claim that
 * nothing was changed.
 */
const COULD_NOT_CHANGE = 'I could not make the change.';

/**
 * What a change of a menu did, as the message says it: "Added **Mystic**; removed **Valor**."
 * (what was really done), a sentence for each role of the menu that was skipped, and for a
 * change Discord stopped half-way what it did not do. `shown` is the menu as it was pressed,
 * for the name of a role that is no longer on the list and for what the member unticked in it;
 * `request` is what the menu asked for, and `chosen` the values that are ticked now.
 */
function changeNote(
  outcome: Extract<RoleChangeOutcome, { kind: 'done' | 'partial' }>,
  request: ChangeRequest,
  shown: readonly PressedChoice[],
  chosen: readonly string[],
): string {
  const { plan, given, taken } = outcome;
  const names = (entries: readonly RosterEntry[]): string =>
    fitItems(
      entries.map((entry) => roleText(entry.name)),
      NAMES_ROOM,
    );
  const done = [
    ...(given.length > 0 ? [`added ${names(given)}`] : []),
    ...(taken.length > 0 ? [`removed ${names(taken)}`] : []),
  ].join('; ');
  const sentences = done === '' ? [] : [`${done.charAt(0).toUpperCase()}${done.slice(1)}.`];
  // The rule needs saying only for a role the member did not untick in this menu themself
  // (by picking another one where it stood ticked): one that another part of the group shows,
  // or that they got elsewhere since; and one that stood ticked and still does (an old menu of
  // a group that has since become pick-one, in which another role was ticked beside it). From
  // the values that are ticked now, not from what is to be given: a role that stays ticked is
  // not given again.
  const unticked = new Set(
    shown.flatMap((choice) =>
      choice.ticked && !chosen.includes(choice.value) ? [choice.value] : [],
    ),
  );
  const [unasked] = taken.filter(
    (entry) =>
      plan.displaced.includes(entry) && entry.role !== undefined && !unticked.has(entry.role.id),
  );
  if (unasked?.group) {
    sentences.push(
      `Only one role of the group ${plain(unasked.group.name)} can be held at a time.`,
    );
  }
  for (const skip of plan.skipped) {
    // A role that left the list and was not ticked needs no word: there is nothing to say
    // about a role the member did not ask for.
    if (skip.reason === 'not-offered' && !request.give.includes(skip.roleId)) continue;
    const label = shown.find((choice) => choice.value === skip.roleId)?.label;
    const name = roleText(skip.entry?.name ?? label ?? 'That role');
    const sentence = memberProblem(name, skip);
    if (!sentences.includes(sentence)) sentences.push(sentence);
  }
  if (outcome.kind === 'partial') sentences.push(...failureSentences(outcome));
  else if (done === '') sentences.push(NOTHING_CHANGED);
  return sentences.join(' ');
}

/** Old messages may still be about when the feature was switched off. */
const requireRoles: Guard = (_interaction, ctx) => {
  if (!rolesEnabled(ctx.config)) throw new UserError(STALE_COMPONENT);
};

/**
 * The controls of `/iam` without a role. Changing a menu applies exactly that menu's
 * difference (`menuRequest`: what it showed unticked and is now ticked is given, what it showed
 * ticked and is now unticked is taken), read from the menu as the message shows it
 * (`interaction.message`: inside its container, or in the rows of a message from before plan
 * 8B-4), so nothing about an open message is kept anywhere and it still works after a restart.
 * Every press is acknowledged first: what follows may ask Discord and the database. Then the
 * message is always made anew from the roster and the member's roles as they are now
 * (`menusNow`), never copied, with what the press did in small print: also after a change that
 * did nothing (the member has too many changes under way, or it failed before its first step
 * was done), since Discord's client keeps the ticks of a press that was acknowledged and they
 * must not stand as if they had been applied. Without the roster it says so and how to get the
 * menus again. A message of menus from before plan 8B-4 is closed with `OLD_MENUS` and the new
 * menus follow privately below it (`showMenus`).
 */
export const roleControls: ComponentHandler = {
  kind: ROLES_KIND,
  guards: [requireGuild, requireRoles, requireJoined],
  throttle: MEMBER_WRITE_THROTTLE,

  async select(interaction, id, ctx) {
    if (id.action !== PICK_ACTION || !interaction.isStringSelectMenu()) {
      throw new UserError(STALE_COMPONENT);
    }
    const guildId = guildIdOf(interaction);
    const member = actingRoleMember(interaction);
    const shown = pressedMenu(interaction);
    if (!shown) throw new UserError(STALE_COMPONENT);
    // Changing the roles is requests to Discord, which may take longer than an answer may.
    await interaction.deferUpdate();
    const request = menuRequest(shown, interaction.values);
    const page = Number(id.args[1]);
    /**
     * The menus made anew as the member's roles are now (never the pressed message copied:
     * Discord's client keeps the ticks of a press that was acknowledged, and they must not
     * stand as if they had been applied), with what is to be said about the press.
     */
    const putBack = async (sentence: string) =>
      showMenus(interaction, await menusNow(ctx, guildId, member, page, sentence));
    let outcome: RoleChangeOutcome;
    try {
      // "None" counts only where the menu offered it and showed it unticked: it is no role's
      // id, but anything may arrive, and "None" that stood ticked already changes nothing.
      if (pickedNone(shown, interaction.values) && id.id !== OTHER_ID) {
        // "None" gives back every role of the group, also those another part of it shows.
        const roster = await ctx.selfRoles.roster(guildId);
        const group = roster?.groups.find((other) => String(other.id) === id.id);
        if (roster && group?.pickOne) {
          request.take = [...new Set([...request.take, ...groupRoleIds(roster, group.id)])];
        }
      }
      outcome = await ctx.selfRoles.change(guildId, member, request);
    } catch (err) {
      // The service throws only while no step is known to be done. The router tells the member,
      // with the reference; the message itself is put back first, and a failure of that changes
      // nothing about what is reported.
      await putBack(COULD_NOT_CHANGE).catch((backErr: unknown) => {
        ctx.log.warn({ err: backErr }, 'could not put the role menus back');
      });
      throw err;
    }
    if (outcome.kind === 'unavailable') {
      await putBack(`${ROLES_UNAVAILABLE} ${NOTHING_CHANGED}`);
      return;
    }
    if (outcome.kind === 'refused') {
      // Nothing can be said through an interaction that ran out while its change waited.
      if (outcome.reason === 'busy') await putBack(`${STILL_WORKING} ${NOTHING_CHANGED}`);
      return;
    }
    await showMenus(
      interaction,
      renderRoleMenus(
        outcome.roster,
        new Set(outcome.held),
        page,
        changeNote(outcome, request, shown, interaction.values),
      ),
    );
  },

  async button(interaction, id, ctx) {
    const step = id.action === NEXT_ACTION ? 1 : id.action === PREVIOUS_ACTION ? -1 : undefined;
    if (id.id !== PAGE_ID || step === undefined) throw new UserError(STALE_COMPONENT);
    const guildId = guildIdOf(interaction);
    const member = actingRoleMember(interaction);
    await interaction.deferUpdate();
    const roster = await ctx.selfRoles.roster(guildId);
    if (!roster) throw new UserError(ROLES_UNAVAILABLE);
    await showMenus(
      interaction,
      renderRoleMenus(
        roster,
        new Set(ctx.selfRoles.heldNow(guildId, member)),
        Number(id.args[0]) + step,
      ),
    );
  },
};
