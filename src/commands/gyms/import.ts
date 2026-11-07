import { gunzipSync } from 'node:zlib';
import {
  AttachmentBuilder,
  ButtonStyle,
  MessageFlags,
  SlashCommandSubcommandBuilder,
  type APIButtonComponent,
  type APIComponentInContainer,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
} from 'discord.js';
import type { AppContext } from '../../app-context.js';
import type { LocatedInteraction } from '../../discord/command.js';
import type { SubcommandPart } from '../../discord/command-group.js';
import type { CustomId } from '../../discord/custom-id.js';
import { UserError } from '../../discord/errors.js';
import { discordPayload } from '../../discord/party-gateway.js';
import {
  MAX_EXPORT_CELLS,
  MAX_EXPORT_WAYSPOTS,
  MAX_EXPORT_PARTS,
  MAX_WAYSPOT_TEXT,
  forImport,
  mergeExportParts,
  readWayspotExport,
  withGameKinds,
  WAYSPOT_EXPORT_VERSION,
  type ExportProblem,
  type PartsProblem,
  type WayspotExport,
  type WayspotFault,
} from '@pine/wayspot-core/export-file';
import { DEFAULT_SCAN_MARGIN } from '@pine/wayspot-core/scan-area';
import { changesWayspots, type WayspotCounts } from '../../domain/wayspots/keep.js';
import { GYM_COLOUR } from '../../render/gym-view.js';
import { count, cutMarkdown, fitItems, plain, timestamp, truncate } from '../../render/text.js';
import type { PineStop } from '../../domain/stops/pine-stop.js';
import { pineStopKey } from '../../domain/stops/report.js';
import { PINE_STOP_NEAR_METRES } from '../../services/pine-stops.js';
import { actionRow, container, fileComponent, textDisplay } from '../../render/v2.js';
import { importReportCsv } from '../../render/wayfarer-report.js';
import type { StaffPlace } from '../../services/gym-admin-service.js';
import { PendingRequests } from '../../services/pending-requests.js';
import { mayDeleteOutside } from '../../services/wayfarer-import-service.js';
import type {
  OutsideDeletion,
  ScannedArea,
  Unrecorded,
  WayfarerCounts,
  WayfarerOutcome,
  WayfarerPreview,
} from '../../services/wayfarer-import-service.js';
import { distanceWords, type DistanceUnits } from '../../render/distance-words.js';
import { gymWithId } from '../../render/gym-view.js';
import { actingMember } from '../parties/reply.js';
import { button, EXPIRED, markAnswered, NOT_YOURS, staffPlace, wasAnswered } from './shared.js';

/** Discord's upload limit without boosts: an export of all of Pittsburgh is far smaller, packed. */
export const MAX_EXPORT_BYTES = 10 * 1024 * 1024;
/** How large an export may be once unpacked: room for the most Wayspots the reader takes. */
export const MAX_UNPACKED_BYTES = 64 * 1024 * 1024;
/** How long the download of the file may take: ten megabytes from Discord's CDN. */
const DOWNLOAD_MS = 30_000;

/** The name of the report the preview attaches: a line per gym (`importReportCsv`). */
export const REPORT_FILE = 'wayfarer-import.csv';

/** The name of the file the export tool saves, as the help and the refusals name it. */
const EXPORT_NAME = '`pine-wayspots-<date>.json.gz`';

/**
 * The options that take the files of one export: the export, or its parts (the export tool saves
 * an export of more than `MAX_PART_BYTES` packed in up to `MAX_EXPORT_PARTS` parts).
 */
export const FILE_OPTIONS = ['file', 'file2', 'file3', 'file4', 'file5'] as const;

/**
 * How long a preview can be confirmed, and how many may wait: each holds an export (tens of
 * thousands of Wayspots; only what Import reads of them, `forImport`), so few, and only while
 * somebody reads the preview.
 */
export const IMPORT_PENDING_MINUTES = 30;
export const MAX_PENDING_IMPORTS = 3;

/** The exports whose preview waits for Import or Cancel, by the token of its buttons. */
export const pendingImports = new PendingRequests<{ file: WayspotExport }>({
  ttlMs: IMPORT_PENDING_MINUTES * 60_000,
  max: MAX_PENDING_IMPORTS,
});

/** The actions of the preview's buttons (`gym:<token>:<action>`, kind `gym`). */
export const IMPORT_ACTION = 'wayfarer-import';
export const CANCEL_ACTION = 'wayfarer-cancel';

/**
 * The actions of the deletion of the gyms beyond the scanned area: the outcome's button that asks
 * (`outside-ask`), and the question's two answers.
 */
export const OUTSIDE_ASK = 'outside-ask';
export const OUTSIDE_DELETE = 'outside-delete';
export const OUTSIDE_KEEP = 'outside-keep';

/** Whether a control of the kind `gym` belongs to `/gym import` (its preview or its outcome). */
export function isImportAction(action: string): boolean {
  return [IMPORT_ACTION, CANCEL_ACTION, OUTSIDE_ASK, OUTSIDE_DELETE, OUTSIDE_KEEP].includes(action);
}

/**
 * The scanned areas whose gyms beyond may be deleted, by the token of the outcome's button and of
 * the question: only the outlines and the margin of the file (the list is worked out again at
 * every press), and for the question the gyms it named (`ids`: no other is deleted), for half
 * an hour.
 */
export const pendingOutside = new PendingRequests<ScannedArea & { ids?: readonly number[] }>({
  ttlMs: IMPORT_PENDING_MINUTES * 60_000,
  max: 20,
});

/**
 * The token of the question an outcome's button asks, made of the outcome's own (random) token:
 * the same for every press of that button, and never an outcome's (those are hex digits only).
 */
export const questionToken = (outcomeToken: string): string => `${outcomeToken}q`;

/** How many gyms the question before the deletion names. */
export const OUTSIDE_NAMED = 10;

/** What a file attached to `/gym import` holds: its text, or why it holds none. */
export type Unpacked =
  { ok: true; text: string } | { ok: false; reason: 'damaged' | 'too-large' | 'not-text' };

/**
 * The text of an export: unpacked when it is gzip (by its first two bytes, `1f 8b`, whatever
 * the file is called), and at most `limit` bytes once unpacked; otherwise the file itself.
 * Either must be UTF-8 (a byte order mark is dropped). Unpacking blocks for a moment: an export
 * of a whole city unpacks in a fraction of a second, and the limit bounds it.
 */
export function unpackExport(bytes: Uint8Array, limit = MAX_UNPACKED_BYTES): Unpacked {
  let data: Uint8Array = bytes;
  if (bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b) {
    try {
      data = gunzipSync(bytes, { maxOutputLength: limit });
    } catch (err) {
      const code = (err as { code?: unknown }).code;
      return { ok: false, reason: code === 'ERR_BUFFER_TOO_LARGE' ? 'too-large' : 'damaged' };
    }
  } else if (bytes.length > limit) {
    return { ok: false, reason: 'too-large' };
  }
  try {
    return { ok: true, text: new TextDecoder('utf-8', { fatal: true }).decode(data) };
  } catch {
    return { ok: false, reason: 'not-text' };
  }
}

const NOT_AN_EXPORT =
  `Attach the file the Pine Wayfarer export tool saves (${EXPORT_NAME}): ` +
  '`/help command:gym import` says where to ask for the tool.';

/** What is wrong with a Wayspot of a file, as the end of a sentence. */
const FAULTS: Readonly<Record<WayspotFault, string>> = {
  shape: 'is not a Wayspot as the export tool writes one',
  id: 'has no Wayfarer id',
  kind: 'is neither a gym, a PokéStop nor a Power Spot',
  place: 'lies at no place on earth',
  text: `has a text longer than ${MAX_WAYSPOT_TEXT.toLocaleString('en-US')} characters`,
};

/**
 * Why a text is no export, as the answer says it; `tool` is where the export tool is asked for
 * (`settings.wayspotTool`).
 */
function problemText(problem: ExportProblem, tool: string): string {
  switch (problem.kind) {
    case 'not-json':
      return `That file is no export: it is neither gzip nor JSON. ${NOT_AN_EXPORT}`;
    case 'not-an-export':
      return `That file is JSON, but no export of Wayspots. ${NOT_AN_EXPORT}`;
    case 'no-outlines':
      return (
        'That export was saved by an older version of the Pine Wayfarer export tool, without ' +
        `the outlines of its areas. Install the current version (ask for it at ${tool}), ` +
        'then save the export again.'
      );
    case 'version':
      return (
        'That export was saved by a newer version of the Pine Wayfarer export tool (file ' +
        `version ${problem.version}) than this bot reads (version ${WAYSPOT_EXPORT_VERSION}). ` +
        'The bot has to be updated first, or the export saved again with the version handed ' +
        `out at ${tool}.`
      );
    case 'too-many':
      return (
        `That export holds more than ${MAX_EXPORT_WAYSPOTS.toLocaleString('en-US')} Wayspots ` +
        `or ${MAX_EXPORT_CELLS.toLocaleString('en-US')} cells. Scan fewer regions in one run.`
      );
    case 'bad-wayspot':
      return (
        `Wayspot ${problem.index + 1} of that export ${FAULTS[problem.fault]}, so I read ` +
        'nothing of it. Was the file changed by hand? Save the export again.'
      );
    case 'bad-cell':
      return (
        `Entry ${problem.index + 1} of the ${problem.list === 'cells' ? 'covered' : 'empty'} ` +
        'cells of that export is no cell of the map, so I read nothing of it. Was the file ' +
        'changed by hand? Save the export again.'
      );
  }
}

/** Why an attachment cannot be unpacked, as the answer says it. */
function unpackText(reason: 'damaged' | 'too-large' | 'not-text'): string {
  switch (reason) {
    case 'damaged':
      return 'That file is packed (gzip), but damaged: I could not unpack it. Save the export again.';
    case 'too-large':
      return (
        'Unpacked, that file is larger than 64 MB, more than any export of Wayspots. ' +
        NOT_AN_EXPORT
      );
    case 'not-text':
      return `That file is no export: it is neither gzip nor text. ${NOT_AN_EXPORT}`;
  }
}

/** "1", "1 and 2", "1, 2 and 3". */
function listed(numbers: readonly number[]): string {
  const words = numbers.map(String);
  return words.length <= 1
    ? words.join('')
    : `${words.slice(0, -1).join(', ')} and ${words.at(-1)}`;
}

/**
 * Why attached files do not make one export, as the answer says it; `count` is how many parts
 * the first file says the export has.
 */
function partsText(problem: PartsProblem, count: number): string {
  switch (problem.kind) {
    case 'not-parts':
      return (
        'A whole export cannot be imported together with other files. Attach one export, or ' +
        'every part of one.'
      );
    case 'mixed-runs':
      return (
        'Those files are parts of different exports. Attach every part of one Save export ' +
        `(\`pine-wayspots-<date>-part1of${count}.json.gz\` and so on), and nothing else.`
      );
    case 'same-part':
      return `Part ${problem.index} of ${count} of the export is attached twice. Attach each part once.`;
    case 'missing-parts':
      return (
        `That is not the whole export: ${problem.missing.length === 1 ? 'part' : 'parts'} ` +
        `${listed(problem.missing)} of ${problem.count} ${problem.missing.length === 1 ? 'is' : 'are'} ` +
        `missing. Attach all ${problem.count} parts at once.`
      );
  }
}

/**
 * The export attached to the command (`file`, and `file2` to `file5` for its parts): the size of
 * every file checked before any is downloaded, then each downloaded, unpacked and read, and the
 * parts merged into one export (`mergeExportParts`). Refused with a sentence that says what is
 * wrong, naming the file when there are several.
 */
async function attachedExport(
  interaction: ChatInputCommandInteraction,
  ctx: AppContext,
): Promise<WayspotExport> {
  const attachments = FILE_OPTIONS.flatMap((name) => {
    const attachment = interaction.options.getAttachment(name, name === 'file');
    return attachment === null ? [] : [attachment];
  });
  const several = attachments.length > 1;
  const refused = (name: string, sentence: string): UserError =>
    new UserError(
      several
        ? `${fileName(name, ATTACHMENT_NAME_SHOWN)}: ${sentence.replace(/^That /u, 'that ')}`
        : sentence,
    );
  const tooLarge = several
    ? 'That file is larger than 10 MB, more than any packed part of an export. Attach the ' +
      'files the export tool saves, as they are.'
    : 'That file is larger than 10 MB, more than any packed export of Wayspots. Attach the ' +
      `${EXPORT_NAME} the export tool saves, as it is.`;
  for (const attachment of attachments) {
    if (attachment.size > MAX_EXPORT_BYTES) throw refused(attachment.name, tooLarge);
  }
  const files: WayspotExport[] = [];
  for (const attachment of attachments) {
    const download = await ctx.attachments.download(attachment.url, {
      maxBytes: MAX_EXPORT_BYTES,
      timeoutMs: DOWNLOAD_MS,
    });
    if (!download.ok) {
      throw download.reason === 'too-large'
        ? refused(attachment.name, tooLarge)
        : refused(
            attachment.name,
            several
              ? 'That file could not be downloaded from Discord. Try again in a moment.'
              : 'I could not download that file from Discord. Try again in a moment.',
          );
    }
    const unpacked = unpackExport(download.bytes);
    if (!unpacked.ok) throw refused(attachment.name, unpackText(unpacked.reason));
    const reading = readWayspotExport(unpacked.text);
    if (!reading.ok)
      throw refused(attachment.name, problemText(reading.problem, ctx.config.settings.wayspotTool));
    files.push(reading.file);
  }
  const merged = mergeExportParts(files);
  if (!merged.ok) {
    throw new UserError(partsText(merged.problem, files[0]?.part?.count ?? files.length));
  }
  return withGameKinds(merged.file);
}

/** How much room the lines by region may take. */
const REGION_LIST = 1_500;
/** How much room the sentences of the preview and of the outcome may take. */
const SENTENCES = 2_400;
/**
 * The sentences of a preview, an outcome or a question as one text, cut to `SENTENCES` where
 * they are longer (no real import is), never inside a mention, a code span or bold
 * (`cutMarkdown`): they are finished markdown.
 */
export function sentencesText(lines: readonly string[]): string {
  return cutMarkdown(lines.join('\n'), SENTENCES);
}

/** How much of a name from a file is shown, and how much room the names may take. */
const NAME_SHOWN = 40;
/** How much of the name of an attached file is shown: the name of a part is about 45 characters. */
const ATTACHMENT_NAME_SHOWN = 80;

/** A name from a file as an answer shows it: as code, cut, never empty. */
function fileName(name: string, shown = NAME_SHOWN): string {
  const cut = truncate(name.replace(/`/gu, ''), shown);
  return cut.trim() === '' ? '(no name)' : `\`${cut}\``;
}

/** "1 gym is", "2 gyms are": a count with the verb that fits it. */
function counted(n: number, noun: string, one: string, many: string): string {
  return `${count(n, noun)} ${n === 1 ? one : many}`;
}

/** A line by region: what happens there, counted, leaving out what does not. */
function regionLine(channelId: string | null, counts: WayfarerCounts): string {
  const parts = [
    [counts.matched, 'found'],
    [counts.renamed, 'renamed'],
    [counts.moved, 'moved'],
    [counts.added, 'added'],
    [counts.held, 'held'],
    [reviewCount(counts), 'to review'],
    [counts.answered, 'answered before'],
    [counts.notInWayfarer, 'not in Wayfarer'],
    [counts.notCovered, 'not reached'],
  ] as const;
  const what = parts.filter(([n]) => n > 0).map(([n, word]) => `${n} ${word}`);
  return `- ${channelId === null ? 'In no region' : `<#${channelId}>`}: ${what.join(', ')}`;
}

/** The review queue's items of a count, by kind, as words: "1 to match, 2 missing". */
function reviewWords(counts: WayfarerCounts): string {
  return [
    ...(counts.reviewMatch > 0 ? [`${counts.reviewMatch} to match`] : []),
    ...(counts.reviewMissing > 0 ? [`${counts.reviewMissing} missing from Wayfarer`] : []),
    ...(counts.reviewUnknown > 0 ? [`${counts.reviewUnknown} never found in Wayfarer`] : []),
  ].join(', ');
}

/**
 * What becomes of the gyms found in Wayfarer, one line each: "- 2 get the name Wayfarer gives
 * them" (`done`: "took").
 */
function matchLines(counts: WayfarerCounts, done: boolean): string[] {
  const line = (n: number, present: [string, string], past: string): string[] =>
    n === 0 ? [] : [`- ${n} ${done ? past : n === 1 ? present[0] : present[1]}`];
  return [
    ...line(
      counts.tidied,
      [
        'only has spaces or capitals of its name tidied',
        'only have spaces or capitals of their names tidied',
      ],
      counts.tidied === 1
        ? 'only had spaces or capitals of its name tidied'
        : 'only had spaces or capitals of their names tidied',
    ),
    ...line(
      counts.renamed,
      ['gets the name Wayfarer gives it', 'get the name Wayfarer gives them'],
      counts.renamed === 1
        ? 'took the name Wayfarer gives it'
        : 'took the name Wayfarer gives them',
    ),
    ...line(
      counts.moved,
      ['moves to where Wayfarer has it', 'move to where Wayfarer has them'],
      counts.moved === 1 ? 'moved to where Wayfarer has it' : 'moved to where Wayfarer has them',
    ),
    ...line(
      counts.pictures,
      ['gets its picture from Wayfarer', 'get their pictures from Wayfarer'],
      counts.pictures === 1 ? 'got its picture from Wayfarer' : 'got their pictures from Wayfarer',
    ),
    ...line(
      counts.unmarked,
      ['loses the mark "not in Wayfarer"', 'lose the mark "not in Wayfarer"'],
      'lost the mark "not in Wayfarer"',
    ),
  ];
}

/** The gyms found in Wayfarer, as a sentence and what becomes of them. */
function foundLines(counts: WayfarerCounts, done: boolean): string[] {
  const { matched, unchanged } = counts;
  if (matched === 0) return [];
  const found = `${counted(matched, 'gym', 'was', 'were')} found in Wayfarer`;
  if (unchanged === matched) {
    return [`${found}, and ${matched === 1 ? 'it is' : 'all of them are'} up to date.`];
  }
  return [`${found}:`, ...matchLines(counts, done)];
}

/** How many items of the review queue a plan has, of every kind. */
function reviewCount(counts: WayfarerCounts): number {
  return counts.reviewMatch + counts.reviewMissing + counts.reviewUnknown;
}

/**
 * Whether an import would change no gym and queue nothing new: every gym it matches is as the
 * Wayspot says, it adds none, what it would ask about is asked already, with the same question,
 * and it changes no kept PokéStop or power spot. Such an import is not offered (it would only
 * note when the gyms were seen). When the kept ones could not be read (`wayspots` undefined), it
 * may change them: it is offered, and the preview says why it cannot tell.
 */
export function changesNothing(
  preview: Pick<WayfarerPreview, 'counts' | 'queuedAlready' | 'wayspots'>,
): boolean {
  const { counts } = preview;
  return (
    counts.matched === counts.unchanged &&
    counts.tidied === 0 &&
    counts.added === 0 &&
    reviewCount(counts) === preview.queuedAlready &&
    preview.wayspots !== undefined &&
    !changesWayspots(preview.wayspots)
  );
}

/** What the preview says when the kept PokéStops and power spots could not be read. */
const KEPT_UNREAD =
  'I could not read the PokéStops and Power Spots kept for `/wild` and the map, so I cannot ' +
  'say what this export changes of them. Import tries again.';

/**
 * What an import does to the PokéStops and power spots Pine keeps (plan 8W-2), one line: "…: 2
 * new, 1 changed, 3 gone". None when it changes none of them (a change of the Wayfarer gyms kept
 * beside them is said nowhere); `unread` when they could not be read (`undefined`, logged): the
 * preview says so, the outcome names them among what it could not write.
 */
function wayspotLines(counts: WayspotCounts | undefined, unread: string[] = []): string[] {
  if (counts === undefined) return unread;
  const parts = [
    ...(counts.added > 0 ? [`${counts.added.toLocaleString('en-US')} new`] : []),
    ...(counts.changed > 0 ? [`${counts.changed.toLocaleString('en-US')} changed`] : []),
    ...(counts.gone > 0 ? [`${counts.gone.toLocaleString('en-US')} gone`] : []),
  ];
  return parts.length === 0
    ? []
    : [`PokéStops and Power Spots for \`/wild\` and the map: ${parts.join(', ')}.`];
}

/** How many stops of Pine's own the preview names; the rest are counted. */
const PINE_STOPS_NAMED = 5;

/**
 * The stops of Pine's own of this server that lie near a PokéStop of the export (plan 8R-1):
 * Wayfarer may list them now, and staff take the one of Pine's own off. None: nothing said.
 */
function pineStopLines(stops: readonly PineStop[], units: DistanceUnits): string[] {
  if (stops.length === 0) return [];
  const named = stops
    .slice(0, PINE_STOPS_NAMED)
    .map((stop) => `**${plain(truncate(stop.name, 60))}** (\`${pineStopKey(stop.id)}\`)`);
  const more = stops.length - named.length;
  const list = more > 0 ? `${named.join(', ')} and ${String(more)} more` : andList(named);
  const one = stops.length === 1;
  return [
    `${one ? 'A PokéStop' : `${String(stops.length)} PokéStops`} of Pine’s own ` +
      `${one ? 'lies' : 'lie'} within ${distanceWords(PINE_STOP_NEAR_METRES, units)} of a PokéStop of ` +
      `this export: ${list}. Wayfarer may list ${one ? 'it' : 'them'} now: \`/pokestop remove\` ` +
      `takes ${one ? 'it' : 'one'} off.`,
  ];
}

/** "A, B and C". */
function andList(names: readonly string[]): string {
  const rest = [...names];
  const last = rest.pop() ?? '';
  return rest.length === 0 ? last : `${rest.join(', ')} and ${last}`;
}

/** How many channels a sentence names at most. */
const CHANNELS_NAMED = 10;

/**
 * What the preview says of the area the file scanned: where its outlines are not this server's
 * regions as they are now, and the gyms beyond it (in no region, outside the outlines grown by
 * the margin), which the outcome offers to delete when the scan allows it (`deletable`).
 */
function areaLines(preview: WayfarerPreview, file: WayspotExport): string[] {
  const lines: string[] = [];
  const { regionsNotScanned, areasNotRegions } = preview.outlines;
  if (regionsNotScanned.length > 0) {
    const named = regionsNotScanned.slice(0, CHANNELS_NAMED).map((id) => `<#${id}>`);
    const more = regionsNotScanned.length - named.length;
    // Nothing beyond is offered while a region lies outside the scanned area (the gyms around it
    // were never looked at): said when the scan would otherwise allow it.
    lines.push(
      `${counted(regionsNotScanned.length, 'region', 'is', 'are')} not as the scan's areas ` +
        `were (changed since, or not scanned): ${named.join(', ')}${more > 0 ? ` and ${more} more` : ''}.` +
        (preview.deletable
          ? ' No gym beyond the area can be deleted until a finished scan covers every region ' +
            'as it is now.'
          : ''),
    );
  }
  if (areasNotRegions > 0) {
    lines.push(
      `${counted(areasNotRegions, "of the scan's areas", 'is', 'are')} no region of this ` +
        'server as it is now.',
    );
  }
  const beyond = preview.beyond.length;
  if (beyond > 0) {
    const them = beyond === 1 ? 'it' : 'them';
    const lie =
      `${counted(beyond, 'gym', 'lies', 'lie')} in no region and outside the area this ` +
      `scan covered (in the report as \`beyond\`)`;
    lines.push(
      preview.deletable
        ? `${lie}. Once imported, you can delete ${them}.`
        : file.margin === 0
          ? `${lie}. This scan went no margin beyond its areas, so ${them} cannot be deleted ` +
            'from it.'
          : `${lie}. The scan did not finish (some cells of its area never came), so ${them} ` +
            'cannot be deleted from it.',
    );
  }
  return lines;
}

/** The sentences that say what an import would do, and what it leaves alone. */
function previewLines(
  preview: WayfarerPreview,
  file: WayspotExport,
  units: DistanceUnits,
): string[] {
  const { counts } = preview;
  const lines: string[] = [];
  const wayspots = count(file.wayspots.length, 'Wayspot');
  lines.push(
    changesNothing(preview)
      ? `Importing this export of ${wayspots} would change nothing.`
      : `Importing this export of ${wayspots} would do this. Nothing changes until you press ` +
          'Import.',
  );
  lines.push(...foundLines(counts, false));
  if (counts.added > 0) {
    lines.push(
      `${count(counts.added, 'new gym')} would be added: Wayfarer has ` +
        `${counts.added === 1 ? 'it' : 'them'}, this server does not.`,
    );
  }
  if (counts.untitled > 0) {
    lines.push(
      `${count(counts.untitled, 'Wayfarer gym')} without a title would not be added: a gym ` +
        'needs a name.',
    );
  }
  if (counts.held > 0) {
    const one = counts.held === 1;
    lines.push(
      `${counted(counts.held, 'Wayfarer gym', 'waits', 'wait')} for a question about a gym ` +
        `nearby, so ${one ? 'it is' : 'they are'} not added yet. ` +
        `${one ? 'It is' : 'They are'} in the report as \`held\`.`,
    );
  }
  if (counts.outside > 0) {
    const one = counts.outside === 1;
    lines.push(
      `${counted(counts.outside, 'Wayfarer gym', 'lies', 'lie')} just outside every region of ` +
        `this server: your outlines may leave ${one ? 'it' : 'them'} out. ` +
        `${one ? 'It is' : 'They are'} in the report as \`outside\`.`,
    );
  }
  const review = reviewCount(counts);
  const oneByOne = '`/gym review` shows them one at a time.';
  if (review > 0 && preview.queuedAlready === review) {
    lines.push(
      `${counted(review, 'gym', 'is', 'are')} in the review queue already ` +
        `(${reviewWords(counts)}). ${oneByOne}`,
    );
  } else if (review > 0) {
    const already =
      preview.queuedAlready === 0
        ? ''
        : ` ${counted(preview.queuedAlready, 'of them', 'is', 'are')} there already.`;
    lines.push(
      `${count(review, 'gym')} would go to the review queue for you to decide ` +
        `(${reviewWords(counts)}). ${oneByOne}${already}`,
    );
  }
  if (counts.answered > 0) {
    lines.push(
      `${counted(counts.answered, 'gym', 'is', 'are')} not asked about again: staff answered ` +
        'Keep or None of these, and the Wayspots near them have not changed.',
    );
  }
  if (counts.notInWayfarer > 0) {
    lines.push(
      `${count(counts.notInWayfarer, 'gym')} marked "not in Wayfarer" ` +
        `${counts.notInWayfarer === 1 ? 'is' : 'are'} left alone.`,
    );
  }
  if (counts.notCovered > 0) {
    lines.push(
      `${counted(counts.notCovered, 'gym', 'lies', 'lie')} where the scan did not reach, so ` +
        `${counts.notCovered === 1 ? 'it is' : 'they are'} left alone.`,
    );
  }
  if (counts.ignored > 0) {
    lines.push(
      `${counted(counts.ignored, 'Wayspot', 'lies', 'lie')} outside this server’s regions ` +
        `and ${counts.ignored === 1 ? 'is' : 'are'} ignored.`,
    );
  }
  lines.push(...wayspotLines(preview.wayspots, [KEPT_UNREAD]));
  lines.push(...pineStopLines(preview.pineStopsNear, units));
  lines.push(...areaLines(preview, file));
  lines.push(
    preview.lastImport === undefined
      ? 'This is the first import of this server.'
      : `The last import was ${timestamp(preview.lastImport.importedAt, 'R')} ` +
          `(${timestamp(preview.lastImport.importedAt, 'f')}).`,
  );
  lines.push(`The attached \`${REPORT_FILE}\` lists every gym. An import never deletes a gym.`);
  return lines;
}

/** One components-v2 message of text displays (and more components after them). */
function v2Message(texts: readonly string[], more: APIComponentInContainer[] = []) {
  return discordPayload({
    v2: true,
    components: [
      container(GYM_COLOUR, [
        ...texts.filter((text) => text.trim() !== '').map((text) => textDisplay(text)),
        ...more,
      ]),
    ],
  });
}

/**
 * The preview of an import, a components-v2 message (Matt, 2026-10-15): what it would do, in
 * sentences, then by region, the report `wayfarer-import.csv` attached and shown as a file, and
 * Import / Cancel when there is something to import. `regionNames` are the names of this
 * server's region channels, by channel id. Without a region with an outline there is nothing to compare: one
 * sentence, as plain text.
 */
export function renderImportPreview(
  preview: WayfarerPreview,
  file: WayspotExport,
  regionNames: ReadonlyMap<string, string>,
  units: DistanceUnits,
  buttons: APIButtonComponent[] = [],
):
  | { content: string }
  | (Omit<ReturnType<typeof discordPayload>, 'files'> & { files: AttachmentBuilder[] }) {
  if (preview.regions === 0) {
    return {
      content:
        'This server has no region with an outline, so an import has nothing to compare: give ' +
        'the regions their outlines with `/region import` first.',
    };
  }
  const lines = previewLines(preview, file, units);
  const byRegion =
    preview.byRegion.length === 0
      ? []
      : [
          `**By region**\n${fitItems(
            preview.byRegion.map(({ channelId, counts }) => regionLine(channelId, counts)),
            REGION_LIST,
            '\n',
          )}`,
        ];
  const report = importReportCsv(
    preview.plan,
    new Map([...preview.gyms, ...preview.holders, ...preview.beyondGyms]),
    regionNames,
    preview.beyond,
  );
  return {
    ...v2Message(
      [sentencesText(lines), ...byRegion],
      [fileComponent(REPORT_FILE), ...(buttons.length === 0 ? [] : [actionRow(buttons)])],
    ),
    files: [new AttachmentBuilder(Buffer.from(report, 'utf8'), { name: REPORT_FILE })],
  };
}

/** Parts of an import's bookkeeping that were not written, as words. */
const UNRECORDED: Readonly<Record<Unrecorded, string>> = {
  import: 'the date of this import',
  reviews: 'the review queue',
  seen: 'when the gyms were seen',
  marks: 'the marks "not in Wayfarer" taken off',
  wayspots: 'the PokéStops and Power Spots',
};

/** What an import did, as the lines that take the place of the preview. */
export function renderImportOutcome(outcome: WayfarerOutcome): string[] {
  const { counts } = outcome;
  const lines: string[] = [...foundLines(counts, true)];
  if (counts.added > 0) {
    lines.push(
      `Added ${count(counts.added, 'new gym')}. Since gyms changed, the channel for bot updates ` +
        'is told what the import changed, in one post.',
    );
  }
  if (counts.untitled > 0) {
    lines.push(
      `${count(counts.untitled, 'Wayfarer gym')} without a title ` +
        `${counts.untitled === 1 ? 'was' : 'were'} not added.`,
    );
  }
  if (counts.held > 0) {
    lines.push(
      `${count(counts.held, 'Wayfarer gym')} ${counts.held === 1 ? 'was' : 'were'} not added: ` +
        'a gym nearby may be one (a later import asks), or another gym or a region of another ' +
        'server is in the way.',
    );
  }
  if (counts.outside > 0) {
    const one = counts.outside === 1;
    lines.push(
      `${count(counts.outside, 'Wayfarer gym')} just outside every region of this server ` +
        `${one ? 'was' : 'were'} not added: your outlines may leave ${one ? 'it' : 'them'} out.`,
    );
  }
  const review = reviewCount(counts);
  if (review > 0) {
    lines.push(
      `${counted(review, 'gym', 'is', 'are')} in the review queue (${reviewWords(counts)}). ` +
        '`/gym review` shows them one at a time.',
    );
  }
  if (counts.notCovered > 0) {
    lines.push(
      `${count(counts.notCovered, 'gym')} where the scan did not reach ` +
        `${counts.notCovered === 1 ? 'was' : 'were'} left alone.`,
    );
  }
  lines.push(...wayspotLines(outcome.wayspots));
  if (counts.failed > 0) {
    lines.push(
      `**${count(counts.failed, 'gym')} could not be written.** Import the ` +
        'same file again: what was written is found by its id.',
    );
  }
  if (outcome.unrecorded.length > 0) {
    lines.push(
      `The gyms are as said, but I could not write ${outcome.unrecorded
        .map((what) => UNRECORDED[what])
        .join(', ')}. Import the same file again in a moment.`,
    );
  }
  return [lines.length === 0 ? 'Imported. Nothing about the gyms changed.' : 'Imported.', ...lines];
}

/** The names of this server's region channels the bot sees, from the cache, by channel id. */
function regionNames(
  interaction: LocatedInteraction,
  ctx: AppContext,
  place: StaffPlace,
): Map<string, string> {
  if (!interaction.inCachedGuild() || place.guildId === undefined) return new Map();
  const { channels } = interaction.guild;
  return new Map(
    ctx.regions
      .all()
      .filter((region) => region.guildId === place.guildId)
      .flatMap((region) => {
        const name = channels.cache.get(region.channelId)?.name;
        return name === undefined ? [] : [[region.channelId, name] as const];
      }),
  );
}

/**
 * `/gym import`: the gyms of this server compared with a scan of Wayfarer's map (spec "The
 * import"). The preview says what the import would do and attaches every gym's line; nothing
 * is written before the staff member presses Import, which plans again with the gyms as they
 * are then.
 */
export const importGyms: SubcommandPart = {
  data: new SlashCommandSubcommandBuilder()
    .setName('import')
    .setDescription('Compare the gyms with an export of Wayfarer’s map, and import it')
    .addAttachmentOption((option) =>
      option
        .setName('file')
        .setDescription('The file the Pine Wayfarer export tool saved (.json.gz), or its part 1')
        .setRequired(true),
    )
    .addAttachmentOption((option) =>
      option.setName('file2').setDescription('Part 2 of the export, if it was saved in parts'),
    )
    .addAttachmentOption((option) =>
      option.setName('file3').setDescription('Part 3 of the export, if it was saved in parts'),
    )
    .addAttachmentOption((option) =>
      option.setName('file4').setDescription('Part 4 of the export, if it was saved in parts'),
    )
    .addAttachmentOption((option) =>
      option.setName('file5').setDescription('Part 5 of the export, if it was saved in parts'),
    ),
  help: {
    details: (settings) =>
      'The true list of gyms is Wayfarer’s. The export is made by the Pine Wayfarer export ' +
      `tool: ask for it at ${settings.wayspotTool}. It takes the KML file of \`/region export\`.\n\n` +
      `Attach the file it saves (${EXPORT_NAME}) here; an export too large for one upload ` +
      `is saved in up to ${MAX_EXPORT_PARTS} parts (\`…-part1of3.json.gz\` and so on): attach ` +
      'every part at once, as `file`, `file2` and so on, in any order.\n\nI show what the ' +
      'import would do ' +
      'before anything is changed: gyms found in Wayfarer take the Wayspot’s name and place, ' +
      'Wayfarer gyms that match none of ours are added, and every gym is listed in the attached ' +
      'report.\n\nAn import never deletes a gym: what needs a person to decide (which Wayspot a gym is, a gym ' +
      'Wayfarer no longer has) goes to the review queue of `/gym review`.\n\nThe scan also goes a ' +
      `little beyond the regions (${distanceWords(DEFAULT_SCAN_MARGIN, settings.distanceUnits)} unless set otherwise): Wayfarer gyms found ` +
      'there are never added, but the report lists them as `outside`, so you see where an ' +
      'outline should grow.\n\nGyms of this server in no region and beyond the area a finished ' +
      'scan of every region covered are listed as `beyond`: once the import is done, a button ' +
      'offers to delete them, after a question that names them. When gyms changed, the channel ' +
      'for bot updates gets one summary of what changed.',
    examples: ['/gym import file:pine-wayspots-2026-10-15.json.gz'],
  },
  defer: 'ephemeral',
  async execute(interaction, ctx) {
    const place = await staffPlace(interaction, ctx);
    if (place.guildId === undefined) {
      throw new UserError('I do not know this server yet. Try again in a moment.');
    }
    const file = await attachedExport(interaction, ctx);
    const preview = await ctx.wayfarer.preview(place, file);
    const names = regionNames(interaction, ctx, place);
    const units = ctx.config.settings.distanceUnits;
    if (preview.regions === 0 || changesNothing(preview)) {
      await interaction.editReply(renderImportPreview(preview, file, names, units));
      return;
    }
    const token = pendingImports.put(interaction.user.id, { file: forImport(file) });
    await interaction.editReply(
      renderImportPreview(preview, file, names, units, [
        button(token, IMPORT_ACTION, 'Import', ButtonStyle.Primary).toJSON(),
        button(token, CANCEL_ACTION, 'Cancel', ButtonStyle.Secondary).toJSON(),
      ]),
    );
  },
};

/**
 * What takes the place of the preview: lines in a components-v2 message (the preview is one, and
 * a v2 message cannot become classic again), no buttons, no report.
 */
const replaced = (lines: string | readonly string[], buttons: APIButtonComponent[] = []) => ({
  ...v2Message([sentencesText([lines].flat())], buttons.length === 0 ? [] : [actionRow(buttons)]),
  attachments: [],
});

/**
 * The buttons under the preview of `/gym import` (kind `gym`, the guards of its controls):
 * answered once, by the staff member who used the command, from the import's own pending
 * requests. Import takes the place of the preview with a line while it works (an import of a
 * city takes a while), then with what was done, or that it failed; when that edit fails (an
 * import may outlast the interaction's quarter of an hour), what was done is logged.
 */
export async function importButton(
  interaction: ButtonInteraction,
  id: CustomId,
  ctx: AppContext,
): Promise<void> {
  if (id.action === OUTSIDE_ASK) return askOutside(interaction, id, ctx);
  if (id.action === OUTSIDE_DELETE || id.action === OUTSIDE_KEEP) {
    return answerOutside(interaction, id, ctx);
  }
  const found = pendingImports.take(id.id, interaction.user.id);
  if (found === 'not-yours') throw new UserError(NOT_YOURS);
  if (found === 'expired') {
    if (wasAnswered(id.id)) await interaction.deferUpdate();
    else await interaction.update(replaced(EXPIRED));
    return;
  }
  markAnswered(id.id);
  if (id.action === CANCEL_ACTION) {
    await interaction.update(replaced('Nothing was imported.'));
    return;
  }
  const { file } = found.value;
  await interaction.update(
    replaced(
      `Importing ${count(file.wayspots.length, 'Wayspot')}… this message changes when it is done.`,
    ),
  );
  const place = await staffPlace(interaction, ctx);
  let outcome: WayfarerOutcome;
  try {
    outcome = await ctx.wayfarer.apply(place, file);
  } catch (err) {
    ctx.log.error({ err, staff: place.staffId }, 'a Wayfarer import failed');
    await interaction
      .editReply(
        replaced(
          'The import failed. What was written before that stands: import the same file again ' +
            'in a moment.',
        ),
      )
      .catch((failed: unknown) => {
        ctx.log.error({ err: failed }, 'could not say that a Wayfarer import failed');
      });
    return;
  }
  // A finished scan with a margin offers to delete the gyms beyond its area (Matt, 2026-10-15).
  const beyond = mayDeleteOutside(file) ? ctx.wayfarer.outsideArea(place.guildId, file) : [];
  const buttons =
    beyond.length === 0
      ? []
      : [
          button(
            pendingOutside.put(interaction.user.id, {
              outlines: file.outlines,
              margin: file.margin,
            }),
            OUTSIDE_ASK,
            `Delete ${count(beyond.length, 'gym')} outside the area…`,
            ButtonStyle.Secondary,
          ).toJSON(),
        ];
  try {
    await interaction.editReply(replaced(renderImportOutcome(outcome), buttons));
  } catch (err) {
    ctx.log.error(
      { err, staff: place.staffId, import: outcome.importId, ...outcome.counts },
      'could not show the outcome of a Wayfarer import',
    );
  }
}

/** An answer of lines and buttons for a reply deferred privately (`askOutside`). */
const privately = (lines: readonly string[], buttons: APIButtonComponent[] = []) => ({
  ...v2Message([sentencesText(lines)], buttons.length === 0 ? [] : [actionRow(buttons)]),
});

/**
 * The outcome's "Delete N gyms outside the area…": a private question with the list worked out
 * anew (the gyms as they are now), the first `OUTSIDE_NAMED` named, what goes with them (saved
 * routes, gym targets) and the gyms an active raid keeps, then "Delete N gyms" and "Keep them".
 * The button stays under the outcome; each press asks anew.
 */
async function askOutside(
  interaction: ButtonInteraction,
  id: CustomId,
  ctx: AppContext,
): Promise<void> {
  const found = pendingOutside.peek(id.id, interaction.user.id);
  if (found === 'not-yours') throw new UserError(NOT_YOURS);
  if (found === 'expired') throw new UserError(EXPIRED);
  // Reading what goes with each gym takes a moment.
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const place = await staffPlace(interaction, ctx);
  const unscanned = ctx.wayfarer.compareWith(place.guildId, found.value).regionsNotScanned.length;
  if (unscanned > 0) {
    await interaction.editReply(privately([`No gym can be deleted: ${regionsChanged(unscanned)}`]));
    return;
  }
  const beyond = ctx.wayfarer.outsideArea(place.guildId, found.value);
  if (beyond.length === 0) {
    await interaction.editReply(privately(['No gym lies outside the scanned area any more.']));
    return;
  }
  let routes = 0;
  let targets = 0;
  let raids = 0;
  for (const { gymId } of beyond) {
    const references = await ctx.gymAdmin.references(gymId);
    routes += references.routes;
    targets += references.targets;
    if (references.raids.length > 0) raids++;
  }
  const named = beyond.slice(0, OUTSIDE_NAMED).flatMap(({ gymId, metres }) => {
    const gym = ctx.gyms.get(gymId);
    return gym
      ? [
          `- ${gymWithId(gym)}, ${distanceWords(metres, ctx.config.settings.distanceUnits)} from the ` +
            "nearest region's outline",
        ]
      : [];
  });
  const left = beyond.length - named.length;
  const goes = [
    ...(routes > 0 ? [count(routes, 'stop of saved routes', 'stops of saved routes')] : []),
    ...(targets > 0 ? [count(targets, 'gym target')] : []),
  ];
  // One question per outcome: asked again, it replaces itself (the buttons of an earlier asking
  // answer the newest list), so that presses do not crowd other questions out of the store.
  const token = pendingOutside.put(
    interaction.user.id,
    {
      outlines: found.value.outlines,
      margin: found.value.margin,
      ids: beyond.map(({ gymId }) => gymId),
    },
    questionToken(id.id),
  );
  await interaction.editReply(
    privately(
      [
        `Delete ${count(beyond.length, 'gym')} of this server that ${beyond.length === 1 ? 'lies' : 'lie'} ` +
          'in no region and outside the area the scan covered? Nearest first:',
        ...named,
        ...(left > 0
          ? [`…and ${count(left, 'more gym')} (the report lists them as \`beyond\`).`]
          : []),
        ...(goes.length > 0 ? [`With them go ${goes.join(' and ')}.`] : []),
        ...(raids > 0
          ? [
              `${counted(raids, 'gym', 'has', 'have')} an active raid and ${raids === 1 ? 'is' : 'are'} kept.`,
            ]
          : []),
        'When gyms go, the channel for bot updates is told how many went, in one post.',
      ],
      [
        button(
          token,
          OUTSIDE_DELETE,
          `Delete ${count(beyond.length, 'gym')}`,
          ButtonStyle.Danger,
        ).toJSON(),
        button(token, OUTSIDE_KEEP, 'Keep them', ButtonStyle.Secondary).toJSON(),
      ],
    ),
  );
}

/** Why nothing beyond a scanned area may be deleted now: regions the scan did not see as they are. */
const regionsChanged = (regions: number): string =>
  `${counted(regions, 'region', 'of this server is not as the scan found it', 'of this server are not as the scan found them')} ` +
  '(added or changed since). Scan every region and import again.';

/** What the deletion did, as the lines that take the place of its question. */
export function outsideOutcomeLines(outcome: OutsideDeletion): string[] {
  if (outcome.regionsNotScanned > 0) {
    return [`No gym was deleted: ${regionsChanged(outcome.regionsNotScanned)}`];
  }
  const lines = [
    outcome.deleted === 0
      ? 'No gym was deleted.'
      : `Deleted ${count(outcome.deleted, 'gym')} outside the scanned area.`,
  ];
  if (outcome.notBeyond > 0) {
    lines.push(
      `${counted(outcome.notBeyond, 'gym', 'lies', 'lie')} no longer beyond the area (a region ` +
        'changed meanwhile) and stayed.',
    );
  }
  if (outcome.gone > 0) {
    lines.push(`${counted(outcome.gone, 'gym', 'was', 'were')} gone already.`);
  }
  if (outcome.raidThere.length > 0) {
    lines.push(
      `Kept, for an active raid: ${outcome.raidThere
        .slice(0, OUTSIDE_NAMED)
        .map((gym) => gymWithId(gym))
        .join(
          ', ',
        )}${outcome.raidThere.length > OUTSIDE_NAMED ? ' and more' : ''}. Press the button again once the raids are over.`,
    );
  }
  if (outcome.failed > 0) {
    lines.push(`**${count(outcome.failed, 'gym')} could not be deleted.** Try again in a moment.`);
  }
  return lines;
}

/** The answers to the question: Delete deletes what lies beyond now; Keep keeps everything. */
async function answerOutside(
  interaction: ButtonInteraction,
  id: CustomId,
  ctx: AppContext,
): Promise<void> {
  const found = pendingOutside.take(id.id, interaction.user.id);
  if (found === 'not-yours') throw new UserError(NOT_YOURS);
  if (found === 'expired') {
    if (wasAnswered(id.id)) await interaction.deferUpdate();
    else await interaction.update(replaced(EXPIRED));
    return;
  }
  markAnswered(id.id);
  if (id.action === OUTSIDE_KEEP) {
    await interaction.update(replaced('Nothing was deleted.'));
    return;
  }
  // Read before the answer: what it refuses is answered as a refusal.
  const place = await staffPlace(interaction, ctx);
  await interaction.update(replaced('Deleting… this message changes when it is done.'));
  try {
    const { ids = [], ...area } = found.value;
    const outcome = await ctx.wayfarer.deleteOutside(place, area, ids, actingMember(interaction));
    await interaction.editReply(replaced(outsideOutcomeLines(outcome)));
  } catch (err) {
    ctx.log.error(
      { err, staff: place.staffId },
      'the gyms beyond a scanned area could not be deleted',
    );
    await interaction
      .editReply(
        replaced('The deletion failed. What was deleted stays deleted: try again in a moment.'),
      )
      .catch(() => undefined);
  }
}
