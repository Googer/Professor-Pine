import {
  ButtonBuilder,
  type APIButtonComponent,
  type ButtonInteraction,
  type ButtonStyle,
} from 'discord.js';
import type { AppContext } from '../../app-context.js';
import { BoundedMap } from '../../bounded-map.js';
import type { Region } from '../../db/repositories/region-repository.js';
import { channelContext } from '../../discord/channel-context.js';
import type { GuardableInteraction, LocatedInteraction } from '../../discord/command.js';
import { encodeCustomId } from '../../discord/custom-id.js';
import { UserError } from '../../discord/errors.js';
import { guildIdOf, managesChannels } from '../../discord/guards.js';
import { answerApart, sayInPlace, showInPlace, type Press } from '../../discord/late-reply.js';
import type { V2Message } from '../../discord/party-gateway.js';
import type { PlannedImport, ServerChannel } from '../../domain/regions/region-import.js';
import { LIMITS, truncate } from '../../render/text.js';
import { actionRow, textMessage } from '../../render/v2.js';
import { PendingRequests } from '../../services/pending-requests.js';
import type { RegionStaff } from '../../services/region-admin-service.js';

/** The custom-id kind of the controls of `/region` (documented in `custom-id.ts`). */
export const REGION_KIND = 'region';

/** The colour of what is said about regions: `/region`, `/bounds`, `/find-region`. */
export const REGION_COLOUR = 0x2ecc71;

/**
 * A question or an answer of `/region` as a components-v2 message (plan 8B-4: an answer takes
 * the place of its question, and a v2 message never becomes classic again): its sentences, and
 * its buttons in a row inside.
 */
export function regionQuestion(
  texts: readonly (string | undefined)[],
  buttons: readonly (ButtonBuilder | APIButtonComponent)[] = [],
): V2Message {
  const row = buttons.map((one) => (one instanceof ButtonBuilder ? one.toJSON() : one));
  return textMessage(REGION_COLOUR, texts, row.length === 0 ? [] : [actionRow(row)]);
}

/**
 * Shows a question or an answer of `/region`: as the answer of the command (its deferral
 * edited), or in the place of the message a control is on (`showInPlace`).
 */
export async function answerRegion(
  interaction: GuardableInteraction,
  message: V2Message,
): Promise<void> {
  if (interaction.isChatInputCommand()) await answerApart(interaction, message);
  else await showInPlace(interaction, message);
}

/** Says a sentence in the place of the message a control of `/region` is on (`sayInPlace`). */
export function sayRegion(interaction: Press, text: string): Promise<void> {
  return sayInPlace(interaction, text, REGION_COLOUR);
}

/** What a question of `/region` waits with until the staff member answers. */
export type PendingRegion =
  /** `/region import`: what the preview said would be imported, as it was planned. */
  { what: 'import'; imports: readonly PlannedImport[] };

/**
 * How long a question of `/region` can be answered. A preview is looked through before it is
 * confirmed, but what it says goes stale: half an hour. The requests are few (an import holds
 * its outlines), so their number is bounded tightly.
 */
export const PENDING_MINUTES = 30;

/** The questions of `/region` that wait for their answer, by the token of their controls. */
export const pendingRegions = new PendingRequests<PendingRegion>({
  ttlMs: PENDING_MINUTES * 60_000,
  max: 50,
});

/**
 * The tokens of the questions that were answered a while ago: a second press on a button of
 * such a question is only acknowledged, so that it does not write "That has expired" over the
 * answer the first press is showing.
 */
const answered = new BoundedMap<string, true>(200);

export function markAnswered(token: string): void {
  answered.set(token, true);
}

export function wasAnswered(token: string): boolean {
  return answered.has(token);
}

/** What runs for a button of a question, by what the question is about and the button. */
export type ButtonAnswer = (
  interaction: ButtonInteraction,
  ctx: AppContext,
  request: PendingRegion,
) => Promise<void>;

export { EXPIRED, NOT_YOURS } from '../../services/pending-requests.js';
/**
 * Rehearsal mode (`ctx.rehearsal`): `/region` makes, renames, moves or deletes no channel, which
 * every member would see. An import of outlines alone, or a removal that keeps the forum, goes on.
 */
export const REHEARSAL_CHANNELS =
  'Rehearsal mode is on: I create, rename, move or delete no channel now, since every member ' +
  'would see it. Nothing was changed. Outlines of regions that have their channels, and removing ' +
  'a region while keeping its forum, work as usual.';

/** Also what is said of a region of another server: for this server's staff it is none. */
export const REGION_GONE = 'That region no longer exists.';

/** A button of a question of `/region`: `region:<token>:<action>`. */
export function button(
  token: string,
  action: string,
  label: string,
  style: ButtonStyle,
): ButtonBuilder {
  return new ButtonBuilder()
    .setCustomId(encodeCustomId({ kind: REGION_KIND, id: token, action }))
    .setLabel(label)
    .setStyle(style);
}

/**
 * Who the staff member is and whose regions they touch (`RegionStaff`): the row of their
 * server, its snowflake, and whether they may manage channels there. Refused for a server the
 * bot has no row of yet.
 */
export async function regionStaff(
  interaction: LocatedInteraction,
  ctx: AppContext,
): Promise<RegionStaff> {
  const server = guildIdOf(interaction);
  const guildId = await ctx.guilds.idFor(server);
  if (guildId === undefined) {
    throw new UserError('I do not know this server yet. Try again in a moment.');
  }
  // Read from the server, never from the channel of the command (`managesChannels`).
  const mayManageChannels = managesChannels(interaction);
  return { staffId: interaction.user.id, guildId, server, mayManageChannels };
}

/**
 * The region an interaction happened in, of this server: its text channel or a thread in it,
 * or its forum or a post in it. Also a region that has no outline yet (which `regionChannelOf`
 * does not count as one). Undefined anywhere else.
 */
export function regionHere(
  interaction: LocatedInteraction,
  ctx: AppContext,
  guildId: number,
): Region | undefined {
  const { baseChannelId } = channelContext(interaction);
  if (baseChannelId === undefined) return undefined;
  const region = ctx.regions.byChannel(baseChannelId) ?? ctx.regions.byForum(baseChannelId);
  return region?.guildId === guildId ? region : undefined;
}

/**
 * A region as an answer names it: its channel as a mention, or, when the channel is gone,
 * "deleted channel" with its id (a mention of a channel that is gone shows as nothing).
 */
export function regionLabel(region: Region, channels: readonly ServerChannel[]): string {
  return channels.some((channel) => channel.id === region.channelId)
    ? `<#${region.channelId}>`
    : `deleted channel ${region.channelId}`;
}

/**
 * A region as a sentence names it: "the region <#…>", or "the region of the deleted channel
 * 1234" when its channel is gone.
 */
export function regionInSentence(region: Region, channels: readonly ServerChannel[]): string {
  return channels.some((channel) => channel.id === region.channelId)
    ? `the region <#${region.channelId}>`
    : `the region of the deleted channel ${region.channelId}`;
}

/** Lines as the text of one message: never longer than Discord takes. */
export function content(lines: readonly (string | undefined)[]): string {
  return truncate(
    lines.filter((line): line is string => line !== undefined).join('\n'),
    LIMITS.content,
  );
}

/**
 * What staff are reminded of after a region was made or removed, where members give themselves
 * roles: a region usually has a role of its own. Undefined where that feature is off.
 */
export function selfRoleReminder(
  ctx: AppContext,
  serverId: string,
  what: 'new' | 'removed',
): string | undefined {
  return roleReminder(ctx.servers.of(serverId).features.roles, what);
}

/** `selfRoleReminder` by whether members give themselves roles (the server's `features.roles`). */
export function roleReminder(roles: boolean, what: 'new' | 'removed'): string | undefined {
  if (!roles) return undefined;
  return what === 'new'
    ? 'If members give themselves a role for a region, add the role of a new region with ' +
        '`/admin self-roles add`.'
    : 'If members gave themselves a role for this region, take it off the list with ' +
        '`/admin self-roles remove`.';
}
