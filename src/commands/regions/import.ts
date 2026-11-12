import {
  ButtonStyle,
  ChannelType,
  SlashCommandSubcommandBuilder,
  type APIButtonComponent,
} from 'discord.js';
import type { AppContext } from '../../app-context.js';
import type { SubcommandPart } from '../../discord/command-group.js';
import { UserError } from '../../discord/errors.js';
import type { V2Message } from '../../discord/party-gateway.js';
import {
  kmlText,
  MAX_KML_AREAS,
  MAX_KML_CORNERS,
  readKml,
  type KmlProblem,
  type KmlSkipped,
  type KmlSkipReason,
} from '@pine/wayspot-core/kml';
import { MAX_OUTLINE_CORNERS } from '@pine/wayspot-core/outline';
import type { Worded } from '../../domain/web/editor-data.js';
import {
  MAX_CATEGORY_CHANNELS,
  MAX_NEW_CHANNELS,
  MAX_SERVER_CHANNELS,
  type LeftOut,
  type LeftOutReason,
  type PlannedImport,
} from '../../domain/regions/region-import.js';
import { count, fitItems, plain, truncate, unplain } from '../../render/text.js';
import { actionRow, container, fileComponent, separator, textDisplay } from '../../render/v2.js';
import {
  importSummary,
  type ImportedRegion,
  type ImportFailure,
  type ImportOutcome,
  type ImportPreview,
  type NotImported,
} from '../../services/region-admin-service.js';
import {
  answerRegion,
  button,
  pendingRegions,
  REGION_COLOUR,
  REHEARSAL_CHANNELS,
  regionStaff,
  selfRoleReminder,
  type ButtonAnswer,
} from './shared.js';

/** A file of regions is tens of kilobytes; anything beyond this is something else. */
export const MAX_KML_BYTES = 1_000_000;
/** How long the download of the file may take. */
const DOWNLOAD_MS = 10_000;
/** How much of a name from a file is shown. */
const NAME_SHOWN = 40;
/**
 * How much room the sentences of a preview or an outcome, the list of what would be (or was)
 * imported, and the list of what is left out (or was not imported) may take: together with
 * their headings within the 4,000 characters of a components-v2 message (`TEXT_BUDGET`).
 */
const SENTENCES = 1_400;
const IMPORT_LIST = 1_700;
const LEFT_OUT_LIST = 800;
/** The heading of the preview of `/region import` and of its outcome. */
const IMPORT_HEADING = '### Import regions';
/** How much of a message the names of new channels or categories may take. */
const NAMES_SHOWN = 500;

/** A file larger than `MAX_KML_BYTES`, by what it says or by what came. */
const TOO_LARGE = 'That file is larger than 1 MB. Export only the layer with the regions.';

const HOW_TO_KML =
  'In Google My Maps choose "Export to KML/KMZ" and tick "Export as KML instead of KMZ".';

/** Why a file cannot be read as KML, as a sentence. */
function kmlProblemText(problem: KmlProblem): string {
  switch (problem) {
    case 'kmz':
      return `That is a KMZ file (a zipped KML), and I read KML only. ${HOW_TO_KML}`;
    case 'not-xml':
      return 'That file is not well-formed XML, so I cannot read it as KML.';
    case 'doctype':
      return (
        'That file declares a document type (DOCTYPE), which I never read. A KML file from a ' +
        'map editor has none.'
      );
    case 'too-deep':
      return 'That file is nested deeper than any KML I know, so I did not read it.';
    case 'not-kml':
      return 'That file is XML, but not KML: its outermost element must be `kml`.';
    case 'no-areas':
      return (
        'That file has no areas. I look for placemarks with a polygon: draw each region as a ' +
        'shape and name it after its channel.'
      );
    case 'too-many-areas':
      return `That file has more than ${MAX_KML_AREAS} areas. Import the regions in several files.`;
    case 'too-many-corners':
      return (
        `The outlines of that file have more than ${MAX_KML_CORNERS} corners in all. Import ` +
        'the regions in several files, or simplify the shapes.'
      );
  }
}

/** Why a placemark with a polygon is no area, in a few words. */
function skipText(reason: KmlSkipReason): string {
  if (reason.kind === 'several-areas') return 'it has several areas, and a region is one';
  if (reason.kind === 'no-outline') return 'its polygon has no outline';
  switch (reason.problem.kind) {
    case 'not-a-number':
      return 'a coordinate of its outline is no number';
    case 'out-of-range':
      return 'a coordinate of its outline is no place on earth';
    case 'too-few':
      return 'its outline has fewer than three corners';
    case 'too-many':
      return (
        `its outline has ${reason.problem.corners} corners, more than the ` +
        `${MAX_OUTLINE_CORNERS} I take: simplify the shape`
      );
    case 'crosses-itself':
      return 'its outline crosses or touches itself';
  }
}

/** A name the bot made of a file (a channel or a category), as an answer shows it: as code. */
function derived(name: string): string {
  return `\`${name.replace(/`/gu, '')}\``;
}

/** Why an area of the file is left out of the plan, in a few words. */
function leftOutText(left: LeftOut): string {
  const channel = derived(`#${left.channelName}`);
  const reasons: Readonly<Record<LeftOutReason, string>> = {
    'no-name': 'its name gives no channel name',
    'several-channels': `several channels are called ${channel}`,
    'several-areas': `several areas of the file stand for ${channel}`,
    'not-text': `${channel} is not a text channel`,
    foreign: `${channel} cannot be a region of this server`,
    'cannot-create': `there is no channel ${channel}, and I may not create one`,
    'other-channel': 'it stands for another channel',
    waits: `${channel} waits for the next import`,
    'not-allowed': `there is no channel ${channel}, and you may not create one`,
    'category-full':
      `${channel} would get its forum beside it, and its category ` +
      `${derived(left.category ?? '')} is full`,
    'server-full': 'the server has no room for what it needs',
  };
  return reasons[left.reason];
}

/** Names as a list in a sentence: "a", "a and b", "a, b, and c". */
function andList(items: readonly string[]): string {
  if (items.length <= 2) return items.join(' and ');
  return `${items.slice(0, -1).join(', ')}, and ${items.at(-1) ?? ''}`;
}

/** A name from a file as an answer shows it: as text, cut, never empty. */
function shown(name: string): string {
  return name === '' ? '(no name)' : plain(truncate(name, NAME_SHOWN));
}

/** One area that would be imported, as a line of the preview. */
function plannedLine(planned: PlannedImport): string {
  let where: string;
  if ('id' in planned.channel) {
    const what =
      planned.regionId === null
        ? 'new region'
        : planned.unchanged
          ? 'outline unchanged'
          : 'new outline';
    where = `<#${planned.channel.id}> · ${what}`;
  } else {
    const { category } = planned.channel.create;
    const inCategory =
      category === null
        ? 'without a category'
        : 'create' in category
          ? `in the new category ${derived(category.create)}`
          : `in the category ${derived(category.name)}`;
    where = `**new channel** ${derived(`#${planned.channelName}`)} ${inCategory}`;
  }
  const gyms =
    planned.gymsBefore === null || planned.unchanged
      ? count(planned.gyms, 'gym')
      : `${count(planned.gyms, 'gym')} (${planned.gymsBefore} before)`;
  const notes = [
    ...(planned.stranded > 0
      ? [`${count(planned.stranded, 'gym')} would lie in no region of this server any more`]
      : []),
    ...(planned.holes ? ['its holes are ignored'] : []),
    ...(planned.hasForum
      ? []
      : planned.adoptForum
        ? [`takes back its forum <#${planned.adoptForum.id}>`]
        : planned.forumBlocked
          ? [
              'category' in planned.forumBlocked
                ? `**keeps no forum**: its category ${derived(planned.forumBlocked.category)} is full`
                : '**keeps no forum**: the server is full',
            ]
          : ['gets a forum']),
    ...(planned.nearMiss === undefined
      ? []
      : [`**did you mean ${derived(`#${planned.nearMiss}`)}?**`]),
  ];
  return [`- ${shown(planned.name)} → ${where}`, gyms, ...notes].join(' · ');
}

/**
 * How risky a line is, for the order of the list: a new channel that may be a typo first, then
 * new channels, then outlines that leave gyms without a region, then the rest.
 */
function risk(planned: PlannedImport): number {
  if (planned.nearMiss !== undefined) return 0;
  if ('create' in planned.channel) return 1;
  if (planned.stranded > 0) return 2;
  return planned.unchanged ? 4 : 3;
}

/** The longest label Discord shows on a button. */
const MAX_LABEL = 80;

/** What an import would create, as words: "1 channel, 2 categories, 3 forums". */
function creations(preview: ImportPreview): { words: string; things: number } {
  const parts = [
    [preview.newChannels.length, 'channel', 'channels'],
    [preview.newCategories.length, 'category', 'categories'],
    [preview.newForums, 'forum', 'forums'],
  ] as const;
  const made = parts.filter(([n]) => n > 0);
  return {
    words: made.map(([n, one, many]) => count(n, one, many)).join(', '),
    things: made.reduce((sum, [n]) => sum + n, 0),
  };
}

/** The label of the button that carries an import out: it says what it will create. */
function importLabel(preview: ImportPreview): string {
  const { words, things } = creations(preview);
  if (things === 0) return 'Import';
  const label = `Import and create ${words}`;
  return label.length <= MAX_LABEL ? label : `Import and create ${count(things, 'thing')}`;
}

const names = (items: readonly string[], sign: string): string =>
  fitItems(
    items.map((name) => derived(`${sign}${name}`)),
    NAMES_SHOWN,
  );

/** The first line of a preview: what the file would do, counted. */
function summaryLine(
  preview: ImportPreview,
  oneChannel: boolean,
  from: 'file' | 'editor' = 'file',
): string {
  const { imports } = preview;
  const fresh = imports.filter((one) => one.regionId === null).length;
  const changed = imports.filter((one) => one.regionId !== null && !one.unchanged).length;
  const same = imports.filter((one) => one.unchanged).length;
  const gives = [
    ...(fresh > 0 ? [count(fresh, 'new region')] : []),
    ...(changed > 0 ? [count(changed, 'new outline')] : []),
  ];
  const doing = [
    ...(gives.length > 0 ? [`give ${gives.join(' and ')}`] : []),
    ...(same > 0
      ? [`leave ${count(same, 'outline')} as ${same === 1 ? 'it is' : 'they are'}`]
      : []),
  ];
  return (
    `${from === 'file' ? 'This file' : 'Saving'} would ${doing.join(' and ')}. Nothing is ` +
    `changed yet${oneChannel ? ' (no channel is created).' : '.'}`
  );
}

/**
 * The preview of an import: what would be imported, area by area (the lines to look at twice
 * first), what would be created, what is left out and why, and what the new outlines mean for
 * gyms and raids. It fits Discord's limits with any file: lists that do not fit are cut with a
 * count, and then every line is also in an attached file (`preview.txt`), written for reading
 * in a text editor: channels by their names (`channelNames`, by id), and no bold.
 */
export function renderPreview(
  preview: ImportPreview,
  skipped: readonly KmlSkipped[],
  others: number,
  oneChannel = false,
  channelNames: ReadonlyMap<string, string> = new Map(),
  buttons: readonly APIButtonComponent[] = [],
): V2Message {
  const { lines, lists } = previewWords(preview, skipped, others, oneChannel);
  return importMessage(lines, lists, PREVIEW_FILE, channelNames, buttons);
}

/**
 * What a preview says, as sentences and lists (Discord's markdown): of a file (`renderPreview`)
 * or of a save of the region editor (`from: 'editor'`, plan 8M-2), which has no file and says
 * so.
 */
export function previewWords(
  preview: ImportPreview,
  skipped: readonly KmlSkipped[],
  others: number,
  oneChannel = false,
  from: 'file' | 'editor' = 'file',
): { lines: string[]; lists: ImportList[] } {
  const { imports, leftOut, newChannels, newCategories } = preview;
  const lines: string[] = [];
  if (imports.length === 0) {
    lines.push(
      from === 'file' ? 'Nothing in this file can be imported.' : 'No outline can be saved.',
    );
  } else {
    lines.push(summaryLine(preview, oneChannel, from));
    if (!oneChannel && from === 'file') {
      lines.push('Regions that are not in this file stay as they are.');
    }
  }
  // The editor's names are typed into its panel, not read from a file.
  const inFile = from === 'file' ? ' in the file' : '';
  const close = imports.filter((one) => one.nearMiss !== undefined).length;
  if (close > 0) {
    lines.push(
      close === 1
        ? `**1 new channel has a name close to another**: is it a typo${inFile}?`
        : `**${close} new channels have names close to others**: are they typos${inFile}?`,
    );
  }
  if (newChannels.length > 0) {
    lines.push(
      `I would **create ${count(newChannels.length, 'channel')}**: ${names(newChannels, '#')}. ` +
        `Check the names: a typo ${from === 'file' ? 'in the file' : 'in a name'} makes a ` +
        'channel of that name.',
    );
  }
  if (newCategories.length > 0) {
    lines.push(
      `I would **create ${count(newCategories.length, 'category', 'categories')}**: ` +
        `${names(newCategories, '')}.`,
    );
  }
  if (preview.newForums > 0) {
    lines.push(
      `I would **create ${count(preview.newForums, 'forum')}**, one for each region that has none.`,
    );
  }
  for (const overflow of preview.overflow) {
    const moved = count(overflow.channels, 'new channel');
    // The overflow categories this import makes: they copy the permissions of the one they
    // continue, and stand right after it.
    const made = overflow.into.filter((name) =>
      imports.some((one) => {
        const category = 'create' in one.channel ? one.channel.create.category : null;
        return category !== null && 'create' in category && category.create === name;
      }),
    );
    const copied = `with the permissions of ${derived(overflow.category)}, right after it`;
    const copies =
      made.length === 0
        ? ''
        : overflow.into.length === 1
          ? `, a new category ${copied}`
          : ` (${andList(made.map((name) => derived(name)))} new, ${copied})`;
    const goes =
      `${moved} ${overflow.channels === 1 ? 'goes' : 'go'} into ` +
      `${andList(overflow.into.map((name) => derived(name)))}${copies}`;
    const forums =
      overflow.forums === 0
        ? ''
        : overflow.forums === overflow.room
          ? overflow.room === 1
            ? ', and the forum of a region that has none takes it'
            : ', and the forums of regions that have none take all of them'
          : `, ${overflow.forums} of them for the ` +
            `${overflow.forums === 1 ? 'forum of a region' : 'forums of regions'} that ` +
            `${overflow.forums === 1 ? 'has' : 'have'} none`;
    const takes =
      overflow.room > overflow.forums
        ? ', and a new region takes two, its channel and its forum'
        : '';
    lines.push(
      overflow.room === 0
        ? `The category ${derived(overflow.category)} is full (Discord allows ` +
            `${MAX_CATEGORY_CHANNELS} channels in a category, and forums count), so ${goes}.`
        : `The category ${derived(overflow.category)} has room for ` +
            `${count(overflow.room, 'more channel')} (Discord allows ${MAX_CATEGORY_CHANNELS} ` +
            `in a category, and forums count)${forums}${takes}: so ${goes}.`,
    );
  }
  const blocked = imports.filter((one) => one.forumBlocked !== undefined);
  const byCategory = blocked.filter(
    (one) => one.forumBlocked !== undefined && 'category' in one.forumBlocked,
  ).length;
  if (byCategory > 0) {
    lines.push(
      `${byCategory === 1 ? '1 region keeps' : `${byCategory} regions keep`} no forum for now ` +
        `(under "Would be imported"): ${byCategory === 1 ? 'its category is' : 'their categories are'} ` +
        `full, and Discord allows ${MAX_CATEGORY_CHANNELS} channels in a category, forums ` +
        `included. Move some channels out of ${byCategory === 1 ? 'it' : 'them'}, then run ` +
        '`/admin setup-forums`.',
    );
  }
  if (blocked.length > byCategory) {
    const n = blocked.length - byCategory;
    lines.push(
      `${n === 1 ? '1 region keeps' : `${n} regions keep`} no forum for now (under "Would be ` +
        `imported"): the server has as many channels as Discord allows (${MAX_SERVER_CHANNELS}). ` +
        'Delete channels nobody uses, then run `/admin setup-forums`.',
    );
  }
  const again = from === 'file' ? 'import again' : 'save again';
  const categoryFull = leftOut.filter((left) => left.reason === 'category-full').length;
  if (categoryFull > 0) {
    lines.push(
      `${categoryFull === 1 ? '1 area needs' : `${categoryFull} areas need`} a forum in a full ` +
        `category (under "Left out"): Discord allows ${MAX_CATEGORY_CHANNELS} channels in a ` +
        'category, and forums count. Move some channels out of that category, or move the ' +
        `region’s channel into one with room, and ${again}.`,
    );
  }
  const serverFull = leftOut.filter((left) => left.reason === 'server-full').length;
  if (serverFull > 0) {
    lines.push(
      `The server has no room for ${count(serverFull, 'area')} (under "Left out"): Discord ` +
        `allows ${MAX_SERVER_CHANNELS} channels in a server, and forums and categories count. ` +
        `Delete channels nobody uses, and ${again}.`,
    );
  }
  if (preview.stranded > 0) {
    lines.push(
      `${count(preview.stranded, 'gym')} would then lie in no region of this server any ` +
        'more: no raid can be reported there.',
    );
  }
  if (preview.raidsOutside > 0) {
    lines.push(
      preview.raidsOutside === 1
        ? '1 active raid is at a gym that would lie outside its region. It stays in its post.'
        : `${preview.raidsOutside} active raids are at gyms that would lie outside their ` +
            'region. They stay in their posts.',
    );
  }
  if (leftOut.some((left) => left.reason === 'cannot-create')) {
    lines.push(
      'I may not create channels in this server (I lack Manage Channels), so areas without a ' +
        'channel are left out. Give me that permission, or create the channels yourself, and ' +
        'import again.',
    );
  }
  if (leftOut.some((left) => left.reason === 'not-allowed')) {
    lines.push(
      'Creating channels takes the Manage Channels permission, which you lack, so areas ' +
        'without a channel are left out: create their channels yourself, or ask somebody who ' +
        'may.',
    );
  }
  const waiting = leftOut.filter((left) => left.reason === 'waits').length;
  if (waiting > 0) {
    lines.push(
      `I create at most ${MAX_NEW_CHANNELS} channels in one import, so ` +
        `${waiting === 1 ? '1 area waits' : `${waiting} areas wait`} (under "Left out"): once ` +
        (from === 'file'
          ? 'this import is done, import the same file again. What is imported already comes ' +
            'out unchanged.'
          : 'this save is done, save again: what waits stays staged.'),
    );
  }
  if (others > 0) {
    lines.push(
      others === 1
        ? '1 placemark of the file is no area (a point or a line) and is ignored.'
        : `${others} placemarks of the file are no areas (points, lines) and are ignored.`,
    );
  }
  const planned = [...imports]
    .map((one, index) => ({ one, index }))
    .sort((a, b) => risk(a.one) - risk(b.one) || a.index - b.index)
    .map(({ one }) => plannedLine(one));
  const out = [
    ...leftOut.map((left) => leftOutLine(left)),
    ...skipped.map((skip) => `- ${shown(skip.name)}: ${skipText(skip.reason)}`),
  ];
  return {
    lines,
    lists: [
      { title: 'Would be imported', items: planned, room: IMPORT_LIST },
      { title: 'Left out', items: out, room: LEFT_OUT_LIST },
    ],
  };
}

/** An area left out of the plan, as a line of a list: its name and why. */
export function leftOutLine(left: LeftOut): string {
  return `- ${shown(left.name)}: ${leftOutText(left)}`;
}

/**
 * Sentences and lists of a preview or an outcome as plain text (plan 8M-2, the region editor
 * sets them as text): channels by their names (`channelNames`, by id), no bold, no markdown
 * escapes (`\_`, `\*`, `\~`, `\|`, `\>`, `\#`, `\-`, `\[`, `\]`, `\(`, `\)`), every list
 * whole, those without lines left out. What the attached file of a cut message holds, by parts.
 */
export function plainWords(
  lines: readonly string[],
  lists: readonly ImportList[],
  channelNames: ReadonlyMap<string, string>,
): Worded {
  // Names the bot made are code (`derived`), which strips backticks from them: a backtick after
  // an even number of backslashes is markdown, and nothing inside one is escaped; one after an
  // odd number was typed (`plain` wrote it as \`). Names of a file or a member went through
  // `plain`, whose escapes outside code are undone (`unplain`: a typed backslash too, once).
  // The bot's channel mentions are named first: a typed `<#…>` still has `plain`'s zero-width
  // space after the `<` then, which `unplain` takes out.
  const plainText = (text: string): string =>
    text
      .split(/(?<=(?:^|[^\\])(?:\\\\)*)(`[^`]*`)/u)
      .map((part, index) =>
        index % 2 === 1
          ? part.slice(1, -1)
          : unplain(
              part
                .replace(/<#(\d+)>/gu, (_mention, id: string) => `#${channelNames.get(id) ?? id}`)
                .replace(/\*\*/gu, ''),
            ),
      )
      .join('');
  return {
    lines: lines.map(plainText),
    lists: lists
      .filter((list) => list.items.length > 0)
      .map((list) => ({
        title: list.title,
        items: list.items.map((item) => plainText(item.replace(/^- /u, ''))),
      })),
  };
}

/** A list of a preview or an outcome: its heading, its lines and the room it has. */
export interface ImportList {
  title: string;
  items: readonly string[];
  room: number;
}

/**
 * A preview or an outcome of `/region import` as a components-v2 message (plan 8B-4): one
 * container with the heading and the sentences, a line, the lists each under its heading in
 * bold (a list without lines is left out), and the buttons in a row inside. Lists that do not
 * fit are cut with a count, and then every line is also in an attached file (`file`, shown as
 * a file of the message), written for reading in a text editor: channels by their names
 * (`channelNames`, by id), and no bold.
 */
function importMessage(
  lines: readonly string[],
  lists: readonly ImportList[],
  file: string,
  channelNames: ReadonlyMap<string, string>,
  buttons: readonly APIButtonComponent[] = [],
): V2Message {
  const shownLists = lists.filter((list) => list.items.length > 0);
  let cut = false;
  const texts = shownLists.map((list) => {
    const text = fitItems(list.items, list.room, '\n');
    if (text !== list.items.join('\n')) cut = true;
    return `**${list.title}**\n${text}`;
  });
  const said = lines.join('\n');
  if (truncate(said, SENTENCES) !== said) cut = true;
  const sentences = truncate(
    cut
      ? [...lines.slice(0, 1), 'Every line is in the attached file.', ...lines.slice(1)].join('\n')
      : said,
    SENTENCES,
  );
  const whole = [...lines, ...shownLists.flatMap((list) => ['', `${list.title}:`, ...list.items])]
    .join('\n')
    .replace(/<#(\d+)>/gu, (_mention, id: string) => `#${channelNames.get(id) ?? id}`)
    .replace(/\*\*/gu, '');
  return {
    v2: true,
    components: [
      container(REGION_COLOUR, [
        textDisplay(sentences === '' ? IMPORT_HEADING : `${IMPORT_HEADING}\n${sentences}`),
        ...(texts.length === 0 ? [] : [separator(), ...texts.map((text) => textDisplay(text))]),
        ...(cut ? [fileComponent(file)] : []),
        ...(buttons.length === 0 ? [] : [actionRow([...buttons])]),
      ]),
    ],
    ...(cut ? { files: [{ attachment: Buffer.from(whole, 'utf8'), name: file }] } : {}),
  };
}

/** The name of the file a preview attaches when its lists had to be cut. */
export const PREVIEW_FILE = 'preview.txt';

/** Why an area was not imported in the end, in a few words. */
function failureText(failed: NotImported): string {
  const channel = derived(`#${failed.channelName}`);
  const reasons: Readonly<Record<ImportFailure, string>> = {
    'channel-gone': 'its channel is gone, or is no text channel any more',
    foreign: `${channel} cannot be a region of this server`,
    'name-taken': `channels called ${channel} have appeared that are not one text channel`,
    'no-permission': `I may not create ${channel} (I lack Manage Channels)`,
    'category-full':
      `${channel} could not be created: the category ${derived(failed.category ?? '')} is ` +
      `full (Discord allows ${MAX_CATEGORY_CHANNELS} channels in a category, and forums ` +
      'count). Move some channels out of it, and try again',
    'server-full':
      `${channel} could not be created: the server has as many channels as Discord allows ` +
      `(${MAX_SERVER_CHANNELS}, forums and categories count). Delete channels nobody uses, and ` +
      'try again',
    'copy-refused':
      `${channel} could not be created: I may not make the new category ` +
      `${derived(failed.category ?? '')} with the permissions of ${derived(failed.copyOf ?? '')} ` +
      '(that takes Manage Channels and Manage Roles, and every permission those overwrites ' +
      `give). Give them to me, or make ${derived(failed.category ?? '')} yourself with those ` +
      'permissions, and try again',
    'base-gone':
      `${channel} could not be created: the category that the new category ` +
      `${derived(failed.category ?? '')} was to continue, with its permissions, is gone. Import ` +
      'again',
    'bad-name': `Discord does not take ${channel} as a channel name`,
    'no-server': `${channel} could not be created: its category is gone`,
    failed: `${channel} could not be created: try again in a moment`,
    'not-written': 'the outlines could not be written: try again in a moment',
    'not-allowed': `you may not create ${channel} (that takes Manage Channels)`,
  };
  const created =
    failed.createdChannelId === undefined
      ? ''
      : ` I had created <#${failed.createdChannelId}> for it: it exists, but is no region. ` +
        'Import again, or delete it.';
  return `${reasons[failed.reason]}.${created}`;
}

/** A reason as a part of a line: lower case at first, without its full stop. */
function asPart(reason: string): string {
  const trimmed = reason.trim().replace(/\.$/u, '');
  return trimmed.charAt(0).toLowerCase() + trimmed.slice(1);
}

function importedLine(region: ImportedRegion): string {
  const what = [
    region.newRegion ? 'new region' : region.unchanged ? 'outline unchanged' : 'new outline',
    ...(region.channelCreated ? ['channel created'] : []),
    count(region.gyms, 'gym'),
    ...(region.forum === 'created' ? ['forum created'] : []),
    ...(region.forum === 'adopted' && region.adoptedForum !== undefined
      ? [`forum <#${region.adoptedForum}> taken back`]
      : []),
    ...(region.forum === 'none'
      ? [
          region.forumReason === undefined
            ? '**no forum**'
            : `**no forum**: ${asPart(region.forumReason)}`,
        ]
      : []),
  ];
  return `- <#${region.channelId}> · ${what.join(' · ')}`;
}

/** The order of the lines of an outcome: without a forum first, then with a new one. */
const FORUM_ORDER: Readonly<Record<ImportedRegion['forum'], number>> = {
  none: 0,
  created: 1,
  adopted: 1,
  had: 2,
};

/** The name of the file an outcome attaches when its lists had to be cut. */
export const OUTCOME_FILE = 'outcome.txt';

/**
 * What an import did, as the answer that takes the place of the preview; cut lists are in
 * `outcome.txt` whole. **Not imported** has the larger room: it is what staff have to put right.
 */
export function renderOutcome(
  ctx: AppContext,
  serverId: string,
  outcome: ImportOutcome,
  channelNames: ReadonlyMap<string, string> = new Map(),
): V2Message {
  const { lines, lists } = outcomeWords(outcome, selfRoleReminder(ctx, serverId, 'new'));
  return importMessage(lines, lists, OUTCOME_FILE, channelNames);
}

/**
 * What an import did, as sentences and lists (Discord's markdown): `renderOutcome`'s, and the
 * region editor's (plan 8M-2). `newReminder` is said when a region is new (`selfRoleReminder`).
 */
export function outcomeWords(
  outcome: ImportOutcome,
  newReminder: string | undefined,
): { lines: string[]; lists: ImportList[] } {
  const { imported, notImported, categoriesCreated } = outcome;
  const lines: string[] = [];
  if (imported.length === 0) {
    lines.push('Nothing was imported.');
  } else {
    const created = imported.filter((region) => region.channelCreated).length;
    lines.push(
      `Imported ${count(imported.length, 'region')}` +
        (created > 0 ? `, and created ${count(created, 'channel')} for them.` : '.'),
    );
  }
  if (!outcome.reloaded) {
    lines.push(
      'The outlines are stored, but I could not load them again: members see them after the ' +
        'next restart.',
    );
  }
  if (categoriesCreated.length > 0) {
    lines.push(
      `Created ${count(categoriesCreated.length, 'category', 'categories')}: ` +
        `${names(categoriesCreated, '')}.`,
    );
  }
  const forumless = imported.filter((region) => region.forum === 'none').length;
  if (forumless > 0) {
    lines.push(
      `${forumless === 1 ? '1 of them has' : `${forumless} of them have`} no forum, so ` +
        'nothing can be reported there yet: put right what is said below, then run ' +
        '`/admin setup-forums`.',
    );
  }
  if (imported.some((region) => region.newRegion) && newReminder !== undefined) {
    lines.push(newReminder);
  }
  const ordered = imported
    .map((region, index) => ({ region, index }))
    .sort((a, b) => FORUM_ORDER[a.region.forum] - FORUM_ORDER[b.region.forum] || a.index - b.index)
    .map(({ region }) => importedLine(region));
  const failures = notImported.map((failed) => `- ${shown(failed.name)}: ${failureText(failed)}`);
  return {
    lines,
    lists: [
      { title: 'Imported', items: ordered, room: LEFT_OUT_LIST },
      { title: 'Not imported', items: failures, room: IMPORT_LIST },
    ],
  };
}

/**
 * `/region import`: gives channels their outlines from a KML file. Without `channel`, every
 * area of the file goes to the text channel its name stands for, and a channel that is missing
 * is created (with its category); with `channel`, the file gives that one channel its outline
 * and nothing is created. Nothing is changed before the staff member has seen what would be
 * done and pressed Import.
 */
export const importRegions: SubcommandPart = {
  data: new SlashCommandSubcommandBuilder()
    .setName('import')
    .setDescription('Give channels their outlines from a KML file')
    .addAttachmentOption((option) =>
      option.setName('file').setDescription('The KML file with the areas').setRequired(true),
    )
    .addChannelOption((option) =>
      option
        .setName('channel')
        .setDescription('Give this one channel the outline of the file (nothing is created)')
        .addChannelTypes(ChannelType.GuildText),
    ),
  help: {
    details:
      'Draw each region as a shape in a map editor such as Google My Maps, and name it after ' +
      'its channel ("North ' +
      `Hills" stands for #north-hills). ${HOW_TO_KML}\n\nAttach the file, and I show what the ` +
      'import would do before anything is changed: which channels get a new outline, which ' +
      'become regions, how many gyms lie in each, and what is left out and why.\n\nFor a name ' +
      'that no channel has I create the channel (if you may manage channels), in the ' +
      'category the shape’s description names (or one named after the shape), or, when that ' +
      `category is full (Discord allows ${MAX_CATEGORY_CHANNELS} channels in one, and forums ` +
      'count), in the next of its name ("North 2").\n\nThe preview ' +
      'lists every channel and category it would create, and the button says how many. One ' +
      `import creates at most ${MAX_NEW_CHANNELS} channels: import the same file again for ` +
      'the rest.\n\nEvery region that has no forum gets one (or takes back the forum it had, ' +
      'when it was removed and its forum kept).\n\nWith `channel`, the file is for that one ' +
      'channel: its only shape, or the one ' +
      `named after the channel.\n\nAn outline may have up to ${MAX_OUTLINE_CORNERS} corners and ` +
      'must not cross itself; holes are ignored. `/region export` gives the outlines back as ' +
      'a file.',
    examples: ['/region import file:regions.kml', '/region import file:north.kml channel:#north'],
  },
  defer: 'ephemeral',
  async execute(interaction, ctx) {
    const staff = await regionStaff(interaction, ctx);
    const file = interaction.options.getAttachment('file', true);
    const given = interaction.options.getChannel('channel');
    const target = given === null ? undefined : ctx.regionAdmin.textChannel(staff, given.id);
    if (given !== null && !target) {
      throw new UserError(
        'Only an ordinary text channel of this server can be a region: not a thread, a forum, ' +
          'a voice or an announcement channel.',
      );
    }
    if (file.size > MAX_KML_BYTES) {
      throw new UserError(TOO_LARGE);
    }
    const download = await ctx.attachments.download(file.url, {
      maxBytes: MAX_KML_BYTES,
      timeoutMs: DOWNLOAD_MS,
    });
    if (!download.ok) {
      throw new UserError(
        download.reason === 'too-large'
          ? TOO_LARGE
          : 'I could not download that file from Discord. Try again in a moment.',
      );
    }
    const text = kmlText(download.bytes);
    if (!text.ok) {
      throw new UserError(
        text.reason === 'kmz'
          ? kmlProblemText('kmz')
          : 'That file is not text I can read: it must be a KML file, saved as UTF-8.',
      );
    }
    const reading = readKml(text.text);
    if (!reading.ok) throw new UserError(kmlProblemText(reading.reason));
    // The forums of removed regions, which a region of the same channel takes back.
    const orphanForums = await ctx.regionAdmin.orphanForums(staff).catch((err: unknown) => {
      ctx.log.warn({ err }, 'could not list the forums that parties name');
      return [];
    });
    const preview = ctx.regionAdmin.preview(staff, reading.areas, target, orphanForums);
    if (preview.problem !== undefined && target) {
      throw new UserError(
        `The file has ${count(reading.areas.length, 'area')}, and ` +
          (preview.problem === 'none-for-channel' ? 'none' : 'several') +
          ` of them ${preview.problem === 'none-for-channel' ? 'is' : 'are'} named after ` +
          `<#${target.id}>. Use a file with that area alone, or name exactly one area after ` +
          'the channel.',
      );
    }
    if (ctx.rehearsal && makesChannels(preview.imports)) throw new UserError(REHEARSAL_CHANNELS);
    const channelNames = new Map(
      ctx.regionAdmin.channelsOf(staff).map((channel) => [channel.id, channel.name]),
    );
    const render = (buttons: readonly APIButtonComponent[]) =>
      renderPreview(
        preview,
        reading.skipped,
        reading.others,
        target !== undefined,
        channelNames,
        buttons,
      );
    if (preview.imports.length === 0) {
      await answerRegion(interaction, render([]));
      return;
    }
    const token = pendingRegions.put(interaction.user.id, {
      what: 'import',
      imports: preview.imports,
    });
    await answerRegion(
      interaction,
      render([
        button(token, 'import', importLabel(preview), ButtonStyle.Primary).toJSON(),
        button(token, 'cancel', 'Cancel', ButtonStyle.Secondary).toJSON(),
      ]),
    );
  },
};

/** Whether an import would make channels (of a new region, and its category). */
function makesChannels(imports: readonly PlannedImport[]): boolean {
  return imports.some((one) => 'create' in one.channel);
}

/**
 * Import was pressed under the preview. Everything is looked at again by the service (the
 * preview may be minutes old), and the answer says what was really done; it takes the place of
 * the preview.
 */
export const importAnswers: Readonly<Record<string, ButtonAnswer>> = {
  'import:import': async (interaction, ctx, request) => {
    if (request.what !== 'import') return;
    if (ctx.rehearsal && makesChannels(request.imports)) throw new UserError(REHEARSAL_CHANNELS);
    const staff = await regionStaff(interaction, ctx);
    const outcome = await ctx.regionAdmin.import(staff, request.imports);
    try {
      const channelNames = new Map(
        ctx.regionAdmin.channelsOf(staff).map((channel) => [channel.id, channel.name]),
      );
      await answerRegion(interaction, renderOutcome(ctx, staff.server, outcome, channelNames));
    } catch (err) {
      // An import of many areas may outlast the interaction (a quarter of an hour): what it did
      // is in the log, the only place left to say it.
      ctx.log.error(
        { err, staff: staff.staffId, ...importSummary(outcome) },
        'could not show the outcome of a region import',
      );
    }
  },
};
