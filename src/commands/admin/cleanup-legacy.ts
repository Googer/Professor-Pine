import {
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  SlashCommandSubcommandBuilder,
  type APIButtonComponent,
  type APIComponentInContainer,
  type ButtonInteraction,
} from 'discord.js';
import type { AppContext } from '../../app-context.js';
import type { ComponentHandler } from '../../discord/command.js';
import type { SubcommandPart } from '../../discord/command-group.js';
import { encodeCustomId, type CustomId } from '../../discord/custom-id.js';
import { UserError } from '../../discord/errors.js';
import { requireBotManagement } from '../../discord/guards.js';
import { discordPayload } from '../../discord/party-gateway.js';
import type { CleanupEntry, CleanupList, DeleteOutcome } from '../../ops/legacy-cleanup.js';
import { count, plain, truncate } from '../../render/text.js';
import { actionRow, container, fileComponent, LIST_COLOUR, textDisplay } from '../../render/v2.js';
import type { LegacyFiles } from '../../services/legacy-cleanup.js';
import { BoundedMap } from '../../bounded-map.js';
import { EXPIRED, NOT_YOURS, PendingRequests } from '../../services/pending-requests.js';

/** The kind of the custom ids of the answer's buttons: `cleanup:<token>:delete|cancel`. */
export const CLEANUP_KIND = 'cleanup';
/** How long the list can be confirmed by the one who asked for it. */
export const CLEANUP_MINUTES = 10;
/**
 * How many channels one press deletes. A channel takes a second or two (the pause, the request,
 * Discord's limits), and the answer can be edited for 15 minutes after the press: a run longer
 * than that would end without saying so. The rest waits for another run.
 */
export const CLEANUP_PER_RUN = 400;
/** The file the whole list goes into when it does not fit the answer. */
export const LIST_FILE = 'legacy-cleanup.txt';
/** How many channels go between two edits of "Deleting…" with how far it is. */
const PROGRESS_EVERY = 10;

/**
 * The tokens of lists whose button was pressed: a second press meanwhile (a double click, or
 * during the deletion) is only acknowledged and leaves "Deleting…" as it is.
 */
const answered = new BoundedMap<string, true>(100);

/** How much of the answer the lists may take before they go into the file instead. */
const LIST_ROOM = 3_000;

/** The lists waiting for "Delete" or "Cancel", by the token of their buttons. */
const pending = new PendingRequests<{
  guildId: string;
  entries: readonly CleanupEntry[];
  /** How many of the list wait for another run (`CLEANUP_PER_RUN`). */
  left: number;
}>({
  ttlMs: CLEANUP_MINUTES * 60_000,
  max: 10,
});

function button(token: string, action: 'delete' | 'cancel', label: string, style: ButtonStyle) {
  return new ButtonBuilder()
    .setCustomId(encodeCustomId({ kind: CLEANUP_KIND, id: token, action }))
    .setLabel(label)
    .setStyle(style)
    .toJSON();
}

/** A v2 answer of these texts and more (a file, the buttons), as the command and its buttons send it. */
function answer(texts: readonly string[], more: APIComponentInContainer[] = []) {
  return discordPayload({
    v2: true,
    components: [
      container(LIST_COLOUR, [
        ...texts.filter((text) => text.trim() !== '').map((text) => textDisplay(text)),
        ...more,
      ]),
    ],
  });
}

/** A line of the list: the channel, its name (as code), its category, why. */
function entryLine(entry: CleanupEntry, mention: boolean): string {
  const name = `\`${truncate(entry.name.replace(/`/gu, ''), 100)}\``;
  const where = entry.category === null ? '' : ` in ${plain(truncate(entry.category, 100))}`;
  return `- ${mention ? `<#${entry.channelId}> ` : ''}${name}${where}: ${entry.why}`;
}

/**
 * A line of a channel that stays: as `entryLine`, with its party's name (as plain text), the day
 * it was made (UTC) and how many signed up.
 */
function staysLine(entry: CleanupEntry, mention: boolean): string {
  const party = entry.party;
  const name = party?.name ? ` “${plain(truncate(party.name, 100))}”` : '';
  const made =
    party?.createdAt == null
      ? ''
      : `, made ${new Date(party.createdAt).toISOString().slice(0, 10)}`;
  const signedUp = party === undefined ? '' : `, ${party.signedUp} signed up`;
  return entryLine({ ...entry, why: `${entry.why}${name}${made}${signedUp}` }, mention);
}

/** What the reading of the legacy files gave, in a sentence. */
function filesLine(files: LegacyFiles, gone: number): string {
  switch (files.read) {
    case 'none':
      return (
        'LEGACY_PARTIES_DIR is not set: only channels found by their category, name and first ' +
        'message are listed, none from the legacy files.'
      );
    case 'failed':
      return `The legacy files could not be read (${files.error}): only channels found by their category, name and first message are listed.`;
    case 'ok':
      return [
        `I read ${count(files.files, 'legacy file')}.`,
        files.skipped > 0 ? `${count(files.skipped, 'file')} could not be read (see the log).` : '',
        gone > 0
          ? `${gone} of the channels they name ${gone === 1 ? 'is' : 'are'} gone already.`
          : '',
      ]
        .filter(Boolean)
        .join(' ');
  }
}

const KEPT_HEADING = (n: number) =>
  `**Not deleted (${n}): they look like party channels, but I am not sure; delete by hand what should go:**`;
const STAYS_HEADING = (n: number) =>
  `Not deleted (${n}): legacy trains, meetups and saved parties, which stay as plain channels; ` +
  'delete by hand the ones that are dead:';

/**
 * The answer of the list: what was read, what would be deleted and what is left to a person, the
 * whole list as a file when it does not fit, and the buttons (none in rehearsal mode or when
 * there is nothing to delete).
 */
function listAnswer(
  list: CleanupList,
  files: LegacyFiles,
  buttons: APIButtonComponent[],
  rehearsal: boolean,
) {
  const sections = [
    `**To delete (${list.remove.length}):**`,
    ...(list.remove.length === 0
      ? ['Nothing.']
      : list.remove.map((entry) => entryLine(entry, true))),
    ...(list.kept.length === 0
      ? []
      : [KEPT_HEADING(list.kept.length), ...list.kept.map((entry) => entryLine(entry, true))]),
    ...(list.stays.length === 0
      ? []
      : [
          `**${STAYS_HEADING(list.stays.length)}**`,
          ...list.stays.map((entry) => staysLine(entry, true)),
        ]),
  ];
  const fits = sections.join('\n').length <= LIST_ROOM;
  const closing = [
    ...(rehearsal
      ? ['Rehearsal mode: nothing is deleted now. Run this again after the cutover.']
      : []),
    ...(buttons.length > 0
      ? [
          `Only you can confirm, within ${CLEANUP_MINUTES} minutes. The channels are deleted one ` +
            'at a time, which takes a while.',
          ...(list.remove.length > CLEANUP_PER_RUN
            ? [
                `This run deletes ${CLEANUP_PER_RUN} of them; run /admin cleanup-legacy again for the rest.`,
              ]
            : []),
        ]
      : []),
  ];
  const head = ['### Legacy party channels', filesLine(files, list.gone)];
  if (fits) {
    return answer(
      [...head, sections.join('\n'), closing.join(' ')],
      buttons.length > 0 ? [actionRow(buttons)] : [],
    );
  }
  const text = [
    `To delete (${list.remove.length}):`,
    ...list.remove.map((entry) => entryLine(entry, false)),
    '',
    `Not deleted (${list.kept.length}):`,
    ...list.kept.map((entry) => entryLine(entry, false)),
    '',
    STAYS_HEADING(list.stays.length),
    ...list.stays.map((entry) => staysLine(entry, false)),
  ].join('\n');
  return {
    ...answer(
      [
        ...head,
        `${count(list.remove.length, 'channel')} to delete, ${list.kept.length} not deleted (they ` +
          `look like party channels, but I am not sure), ` +
          (list.stays.length === 1
            ? '1 legacy train, meetup or saved party left as a plain channel.'
            : `${list.stays.length} legacy trains, meetups and saved parties left as plain channels.`) +
          ` The whole list is in the attached ${LIST_FILE}.`,
        closing.join(' '),
      ],
      [fileComponent(LIST_FILE), ...(buttons.length > 0 ? [actionRow(buttons)] : [])],
    ),
    files: [new AttachmentBuilder(Buffer.from(text, 'utf8'), { name: LIST_FILE })],
  };
}

/** What the deletion did, in sentences; `left` of the list wait for another run. */
function outcomeText(outcome: DeleteOutcome, left: number): string[] {
  const deleted = `Deleted ${count(outcome.deleted.length, 'legacy party channel')}.`;
  const gone =
    outcome.gone.length > 0
      ? ` ${outcome.gone.length} ${outcome.gone.length === 1 ? 'was' : 'were'} gone already.`
      : '';
  const rest =
    left > 0
      ? ` ${left} ${left === 1 ? 'is' : 'are'} left: run /admin cleanup-legacy again for them.`
      : '';
  return [
    `${deleted}${gone}${rest}`,
    ...(outcome.failed.length === 0
      ? []
      : [
          `${count(outcome.failed.length, 'channel')} could not be deleted (see the log):`,
          wholeLines(
            outcome.failed.map(({ entry, reason }) => `${entryLine(entry, true)} (${reason})`),
            LIST_ROOM,
          ),
        ]),
  ];
}

/**
 * As many whole lines as fit in `room`, and how many more there are: a line is never cut, so
 * that no escape and no channel mention is split.
 */
function wholeLines(lines: readonly string[], room: number): string {
  const kept: string[] = [];
  let used = 0;
  for (const line of lines) {
    // The line, its line break, and room for the count of the rest.
    if (used + line.length + 1 > room - 20) break;
    kept.push(line);
    used += line.length + 1;
  }
  const more = lines.length - kept.length;
  return [...kept, ...(more > 0 ? [`…and ${more} more.`] : [])].join('\n');
}

/** The region channels of the server the command was used in. */
async function regionChannels(
  ctx: AppContext,
  guildId: string,
): Promise<{ channelId: string; forumChannelId: string | null }[]> {
  const row = await ctx.guilds.idFor(guildId);
  return row === undefined ? [] : ctx.regions.all().filter((region) => region.guildId === row);
}

/**
 * `/admin cleanup-legacy`: the channels of the legacy bot's parties, in two steps. The list
 * (read only): the channels the legacy `active/` files name and the orphans, each with why, and
 * apart what only looks like one; then "Delete these n channels", which only the one who asked
 * may press, within `CLEANUP_MINUTES`. In rehearsal mode it only lists.
 */
export const cleanupLegacy: SubcommandPart = {
  data: new SlashCommandSubcommandBuilder()
    .setName('cleanup-legacy')
    .setDescription(
      'List the channels of the legacy bot’s parties, and delete them once confirmed',
    ),
  help: {
    details:
      'For the move from the legacy bot. Lists the channels of its raids, trains and ' +
      'meetups in this server: those named in its saved files of what was going on (where its ' +
      'folder of them is set up for me), and ' +
      'those it left behind, found by their category, their name and the bot’s own first ' +
      'message.\n\nWhat only looks like ' +
      'such a channel is listed apart and never deleted, and so are the channels of its trains, ' +
      'meetups and saved parties, which stay as plain channels.\n\nNothing is deleted until you press ' +
      `"Delete" under the list, within ${CLEANUP_MINUTES} minutes; the channels then go one at a time.`,
    examples: ['/admin cleanup-legacy'],
  },
  defer: 'ephemeral',
  async execute(interaction, ctx) {
    if (!interaction.inGuild()) throw new UserError('This only works in a server.');
    const guildId = interaction.guildId;
    const { list, files } = await ctx.legacyCleanup.list(
      guildId,
      await regionChannels(ctx, guildId),
    );
    const rehearsal = ctx.rehearsal !== undefined;
    const buttons =
      rehearsal || list.remove.length === 0
        ? []
        : (() => {
            const entries = list.remove.slice(0, CLEANUP_PER_RUN);
            const left = list.remove.length - entries.length;
            const token = pending.put(interaction.user.id, { guildId, entries, left });
            return [
              button(
                token,
                'delete',
                left > 0
                  ? `Delete ${entries.length} of these ${list.remove.length}`
                  : `Delete these ${count(list.remove.length, 'channel')}`,
                ButtonStyle.Danger,
              ),
              button(token, 'cancel', 'Cancel', ButtonStyle.Secondary),
            ];
          })();
    await interaction.editReply(listAnswer(list, files, buttons, rehearsal));
  },
};

/** What takes the place of the list once a button was pressed: sentences, no buttons, no file. */
const replaced = (texts: readonly string[]) => ({ ...answer(texts), attachments: [] });

async function pressed(
  interaction: ButtonInteraction,
  id: CustomId,
  ctx: AppContext,
): Promise<void> {
  const found = pending.take(id.id, interaction.user.id);
  if (found === 'not-yours') throw new UserError(NOT_YOURS);
  if (found === 'expired') {
    if (answered.has(id.id)) await interaction.deferUpdate();
    else await interaction.update(replaced([EXPIRED]));
    return;
  }
  answered.set(id.id, true);
  if (id.action !== 'delete') {
    await interaction.update(replaced(['Nothing was deleted.']));
    return;
  }
  if (ctx.rehearsal) {
    await interaction.update(replaced(['Rehearsal mode: nothing is deleted.']));
    return;
  }
  const { entries, left } = found.value;
  await interaction.update(
    replaced([
      `Deleting ${count(entries.length, 'channel')}, one at a time… this message changes when it is done.`,
    ]),
  );
  const total = count(entries.length, 'channel');
  const outcome = await ctx.legacyCleanup.remove(entries, interaction.user.id, async (done) => {
    if (done % PROGRESS_EVERY !== 0 || done >= entries.length) return;
    // How far it is, so that the answer says something however long it takes; a failed edit
    // only costs this one.
    await interaction
      .editReply(replaced([`Deleting ${total}, one at a time: ${done} done so far.`]))
      .catch((err: unknown) => ctx.log.warn({ err }, 'could not show how far the cleanup is'));
  });
  try {
    await interaction.editReply(replaced(outcomeText(outcome, left)));
  } catch (err) {
    ctx.log.error(
      { err, deleted: outcome.deleted.length, failed: outcome.failed.length },
      'could not show what the cleanup of legacy channels did',
    );
  }
}

/** The buttons under the list (kind `cleanup`): staff only, as `/admin` itself. */
export const cleanupControls: ComponentHandler = {
  kind: CLEANUP_KIND,
  guards: [requireBotManagement],
  button: pressed,
};
