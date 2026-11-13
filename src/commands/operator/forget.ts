import {
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  SlashCommandSubcommandBuilder,
  type ModalSubmitInteraction,
} from 'discord.js';
import type { AppContext } from '../../app-context.js';
import { MemberRemovalError } from '../../db/repositories/member-data-repository.js';
import type { ComponentHandler } from '../../discord/command.js';
import type { SubcommandPart } from '../../discord/command-group.js';
import { encodeCustomId } from '../../discord/custom-id.js';
import { deferSubmit, dialog } from '../../discord/dialog.js';
import { UserError } from '../../discord/errors.js';
import { isInstanceOperatorOf, requireInstanceOperator } from '../../discord/guards.js';
import { answerApart, showInPlace, v2Answer } from '../../discord/late-reply.js';
import type { V2Message } from '../../discord/party-gateway.js';
import { STALE_COMPONENT } from '../../discord/router.js';
import {
  forgetFailedMessage,
  forgetLookMessage,
  forgetOutcomeMessage,
  forgetQuestion,
  type ByHand,
} from '../../render/member-removal.js';
import { plainNoLinks, type NamedMember } from '../../render/text.js';
import { removable } from '../../services/member-removal.js';
import { EXPIRED, NOT_YOURS, PendingRequests } from '../../services/pending-requests.js';

/**
 * The kind of the custom ids of `/operator forget` (plan 8G): `forget:<token>:ask` under the look
 * ("Remove…", which opens the question) and `forget:<token>:remove`, the question's dialog,
 * whose Submit removes. The token is a pending request of the operator who asked.
 */
export const FORGET_KIND = 'forget';

/** How long a look can be confirmed by the operator who asked for it. */
export const FORGET_MINUTES = 10;

/** The looks waiting for "Remove…" and its question, by the token of their controls. */
const pending = new PendingRequests<{ member: NamedMember }>({
  ttlMs: FORGET_MINUTES * 60_000,
  max: 20,
});

/**
 * `/operator forget member:`: removes what Pine holds of somebody, across every server, when they
 * ask for it (plan 8G; the privacy policy's promise). The instance operators' alone (plan 19B-1,
 * `requireInstanceOperator`: the owner and the file's `operators`; never a server's staff), on the
 * command and again on its controls): the data spans servers and it cannot be undone.
 *
 * First a look, then the act. The command answers privately with what Pine holds of that id
 * (`MemberRemoval.look`: counts, nothing of the data itself), what a removal takes, what it
 * leaves and why, and what is left for the operators to do by hand, with "Remove…" where there is
 * anything to take. The button asks once more in a dialog ("This cannot be undone"), and only
 * its Submit removes (`MemberRemoval.remove`, the one way it goes), answering with what went
 * and what is left. Only the operator who asked can press, within `FORGET_MINUTES`; a look is
 * answered once. Nothing is sent to the member and nobody is pinged; the id is enough, so it
 * works for somebody who has left the server, or Discord.
 */
export const forget: SubcommandPart = {
  data: new SlashCommandSubcommandBuilder()
    .setName('forget')
    .setDescription('Remove what Pine holds of somebody, in every server (its operators only)')
    .addUserOption((option) =>
      option
        .setName('member')
        .setDescription('Whose data: a member, or anybody’s Discord id')
        .setRequired(true),
    ),
  help: {
    details:
      'For a request to have somebody’s data removed. Only the operators of this Pine (its ' +
      'owner and those its settings name) can use it, also in a direct message with me: it ' +
      'works across every server Pine is in, and it cannot be undone.\n\n' +
      'It first shows, for you alone, what Pine holds of that person in every server, as ' +
      'counts: what a removal takes, what it leaves and why, and what is left for you to do ' +
      'by hand. Nothing changes until you press "Remove…" and confirm, within ' +
      `${String(FORGET_MINUTES)} minutes.\n\n` +
      'A removal takes their settings, friend code, in-game name and Pokebattler id, their ' +
      'wants, gym notices and saved routes, and their web logins, kept screenshots and access ' +
      'to the export tool.\n\n' +
      'It takes their id out of the history of every server, with the names and descriptions ' +
      'of the trains and meetups they made while their history was on (a record made without ' +
      'it does not say who made it), and switches their history and boards off.\n\n' +
      'It takes their id and name off the reports they made to the moderators and off their ' +
      'own meetup requests, appeals and asks that are decided; what they wrote there stays, ' +
      'without who wrote it.\n\n' +
      'It leaves what the moderators need: meetup blocks and rulings, reports about the ' +
      'person, and anything still waiting for a decision. The staff’s log ages out and what ' +
      'is live ends by itself (a party staff saved, when they let it go); counts that name ' +
      'nobody stay.\n\n' +
      'Backups keep the data until they age out, and posts on Discord are not edited. The ' +
      'person is not told. `member` takes an id too, for somebody who has left.',
    examples: ['/operator forget member:@Ash'],
  },
  guards: [requireInstanceOperator],
  // Named in `/help` to the instance operators alone (plan 19B-1).
  seenBy: (asker, ctx) => isInstanceOperatorOf(asker.user.id, ctx),
  // The look reads every table and both screenshot folders: longer than Discord waits.
  defer: 'ephemeral',
  async execute(interaction, ctx) {
    const user = interaction.options.getUser('member', true);
    // The name in this server where the account is in it (Discord sends the member then), else
    // the account's: for the operator's eyes alone, kept only for the look's ten minutes.
    const inServer = interaction.options.getMember('member');
    const shown =
      inServer === null
        ? null
        : 'displayName' in inServer
          ? inServer.displayName
          : (inServer.nick ?? null);
    const member: NamedMember = { id: user.id, name: shown ?? user.globalName ?? user.username };
    const look = await ctx.memberRemoval.look(user.id);
    const controls = removable(look)
      ? {
          remove: new ButtonBuilder()
            .setCustomId(
              encodeCustomId({
                kind: FORGET_KIND,
                id: pending.put(interaction.user.id, { member }),
                action: 'ask',
              }),
            )
            .setLabel('Remove…')
            .setStyle(ButtonStyle.Danger)
            .toJSON(),
          minutes: FORGET_MINUTES,
        }
      : undefined;
    await answerApart(interaction, forgetLookMessage(member, look, controls, byHandOf(ctx)));
  },
};

/**
 * What this installation leaves the operators to do by hand: where `/request` sends gym requests,
 * and whether it has the old bot's own `parties/` folder.
 */
function byHandOf(ctx: Pick<AppContext, 'config'>): ByHand {
  const { GITHUB_TOKEN, GITHUB_REPO, LEGACY_PARTIES_DIR } = ctx.config.env;
  return {
    // Only where the command is offered (both set), as `/request` itself asks.
    ...(GITHUB_TOKEN === undefined || GITHUB_REPO === undefined
      ? {}
      : { requestsRepo: GITHUB_REPO }),
    ...(LEGACY_PARTIES_DIR === undefined ? {} : { legacyParties: true }),
  };
}

/**
 * The controls of `/operator forget` (kind `forget`): the instance operators' alone, as the command. "Remove…"
 * (`ask`) reads nothing but the pending look and opens the question; the question's Submit
 * (`remove`) takes the look (it is answered once), acknowledges on the look and removes, its
 * answer in the look's place (`inPlaceOfLook`). A removal the database refuses is answered with
 * the step that failed: nothing changed.
 */
export const forgetControls: ComponentHandler = {
  kind: FORGET_KIND,
  guards: [requireInstanceOperator],
  async button(interaction, id) {
    if (id.action !== 'ask') throw new UserError(STALE_COMPONENT);
    const found = pending.peek(id.id, interaction.user.id);
    if (found === 'not-yours') throw new UserError(NOT_YOURS);
    if (found === 'expired') throw new UserError(EXPIRED);
    const { member } = found.value;
    await interaction.showModal(
      dialog({
        customId: encodeCustomId({ kind: FORGET_KIND, id: id.id, action: 'remove' }),
        title: 'Remove a member’s data',
        text: forgetQuestion(plainNoLinks(member.name ?? member.id)),
      }),
    );
  },
  async modal(interaction, id, ctx) {
    if (id.action !== 'remove') throw new UserError(STALE_COMPONENT);
    // Taken before anything is sent: the look is answered once, whatever comes of it.
    const found = pending.take(id.id, interaction.user.id);
    if (found === 'not-yours') throw new UserError(NOT_YOURS);
    if (found === 'expired') throw new UserError(EXPIRED);
    const { member } = found.value;
    // Acknowledged on the look (the removal may take longer than Discord waits): its answer
    // takes the look's place, Remove… with it (v2.0.2).
    if (interaction.isFromMessage()) await interaction.deferUpdate();
    else await deferSubmit(interaction);
    let outcome;
    try {
      outcome = await ctx.memberRemoval.remove(member.id, interaction.user.id);
    } catch (err) {
      // Rolled back and logged by the service; anything else is the router's to say.
      if (!(err instanceof MemberRemovalError)) throw err;
      await inPlaceOfLook(interaction, ctx, member, forgetFailedMessage(member, err.step));
      return;
    }
    // Committed: the data is gone, and a send Discord refuses is never answered as a failure
    // (the answer is kept within `FORGET_TEXT_BUDGET`; this is for whatever else refuses it).
    await inPlaceOfLook(
      interaction,
      ctx,
      member,
      forgetOutcomeMessage(member, outcome, byHandOf(ctx)),
    ).catch((err: unknown) => {
      ctx.log.warn(
        { err, member: member.id },
        'removed a member’s data; the answer could not be sent',
      );
    });
  },
};

/**
 * Shows the Submit's answer in the place of the look (`showInPlace`), so that the look no longer
 * offers Remove… once it is answered. A look that can no longer be edited (the operator dismissed
 * it, Discord forgot it) is logged and the answer follows privately below instead; a Submit from
 * no message answers apart.
 */
async function inPlaceOfLook(
  interaction: ModalSubmitInteraction,
  ctx: Pick<AppContext, 'log'>,
  member: NamedMember,
  message: V2Message,
): Promise<void> {
  if (!interaction.isFromMessage()) {
    await answerApart(interaction, message);
    return;
  }
  try {
    await showInPlace(interaction, message);
  } catch (err) {
    ctx.log.warn({ err, member: member.id }, 'could not show the outcome in place of the look');
    await interaction.followUp({
      ...v2Answer(message),
      flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
    });
  }
}
