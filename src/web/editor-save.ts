import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
  leftOutLine,
  outcomeWords,
  plainWords,
  previewWords,
  type ImportList,
} from '../commands/regions/import.js';
import { goesWith, outcomeLines } from '../commands/regions/remove.js';
import { REGION_GONE, regionInSentence, roleReminder } from '../commands/regions/shared.js';
import type { Region } from '../db/repositories/region-repository.js';
import { MAX_KML_AREAS, MAX_KML_CORNERS } from '@pine/wayspot-core/kml';
import { MAX_OUTLINE_CORNERS } from '@pine/wayspot-core/outline';
import type { Piece } from '../domain/regions/coverage.js';
import {
  categoryKey,
  categoryNameFor,
  channelKey,
  type ServerChannel,
} from '../domain/regions/region-import.js';
import {
  MAX_NEW_CATEGORY,
  MAX_NEW_CHANNEL_NAME,
  outlinesWritten,
  planSave,
  type SavePlan,
  type SaveProblem,
} from '../domain/regions/save-plan.js';
import { regionVersion } from '../domain/regions/version.js';
import type { SaveAnswer, SaveRequest, Worded } from '../domain/web/editor-data.js';
import { editorView } from '../domain/web/editor-view.js';
import type { Logger } from '../log.js';
import { count, truncate } from '../render/text.js';
import {
  importSummary,
  type ImportPreview,
  type RegionAdminService,
  type RegionStaff,
} from '../services/region-admin-service.js';
import type { SaveChecker, SaveChecks } from './save-check.js';

/** The largest body of a preview or a save of the region editor (spec 5). */
export const SAVE_BODY_LIMIT = 2 * 1024 * 1024;

const point = z.tuple([z.number().min(-90).max(90), z.number().min(-180).max(180)]);
const outline = z
  .array(point)
  .min(3)
  .max(MAX_OUTLINE_CORNERS + 1);
const version = z.string().regex(/^[A-Za-z0-9_-]{16}$/u);
const regionId = z.number().int().positive();
/**
 * A text longer than this is no request of the page (its fields take 100 and 200): a malformed
 * request, 400. A name or category longer than the page takes is refused with words by
 * `planSave` (422).
 */
const MALFORMED_TEXT = 1_000;

/**
 * What a preview or a save takes (`SaveRequest`): at most `MAX_KML_AREAS` of each kind and
 * `MAX_KML_CORNERS` corners in all, as a file of `/region import` may have.
 */
export const saveRequestSchema = z
  .strictObject({
    changes: z.array(z.strictObject({ regionId, outline, version })).max(MAX_KML_AREAS),
    additions: z
      .array(
        z.strictObject({
          channel: z.union([
            z.strictObject({ id: z.string().regex(/^\d{15,20}$/u) }),
            z.strictObject({ name: z.string().trim().min(1).max(MALFORMED_TEXT) }),
          ]),
          description: z.string().max(MALFORMED_TEXT).nullable(),
          outline,
        }),
      )
      .max(MAX_KML_AREAS),
    removals: z
      .array(z.strictObject({ regionId, forum: z.enum(['keep', 'delete']), version }))
      .max(MAX_KML_AREAS),
  })
  .refine(
    (request) =>
      [...request.changes, ...request.additions].reduce(
        (sum, one) => sum + one.outline.length,
        0,
      ) <=
      MAX_KML_CORNERS + 2 * MAX_KML_AREAS,
  );

/** What preview and save need (plan 8M-2): the region administration `/region` uses. */
export interface RegionEditing {
  /** Every region, of any server, as loaded now (`RegionDirectory`). */
  regions: { all(): readonly Region[] };
  admin: Pick<
    RegionAdminService,
    'preview' | 'save' | 'removalQuestion' | 'channelsOf' | 'orphanForums'
  >;
  /**
   * What works out the new overlaps and gaps of a save: off the bot's thread (`SaveCheckWorker`)
   * in the bot, on it in tests (`inThisThread`).
   */
  checker: SaveChecker;
  /** Whether members give themselves roles (`settings.features.roles`): the reminders say so. */
  selfRoles: boolean;
  log: Logger;
}

/** A square metre count as the answers write it: "1,234 m²". */
const squareMetres = (area: number): string => `${Math.round(area).toLocaleString('en-US')} m²`;

/** How an outline problem reads in a sentence. */
function outlineProblemText(problem: Extract<SaveProblem, { kind: 'outline' }>['problem']): string {
  switch (problem.kind) {
    case 'not-a-number':
    case 'out-of-range':
      return 'has a corner that is no place on earth';
    case 'too-few':
      return 'has fewer than three corners';
    case 'too-many':
      return `has ${problem.corners} corners, more than the ${MAX_OUTLINE_CORNERS} I take`;
    case 'crosses-itself':
      return 'crosses or touches itself';
  }
}

/** The names of what a save is about: regions by their channels, additions by their names. */
class SaveNames {
  constructor(
    private readonly regions: ReadonlyMap<number, Region>,
    private readonly channels: readonly ServerChannel[],
    private readonly request: SaveRequest,
  ) {}

  region(id: number): string {
    const region = this.regions.get(id);
    const channel = region && this.channels.find((one) => one.id === region.channelId);
    return channel ? `#${channel.name}` : `region ${id}`;
  }

  /** A new region by the channel it takes or the name of the one it makes (`shortened`: cut). */
  addition(index: number, shortened = false): string {
    const addition = this.request.additions[index];
    if (!addition) return 'a new region';
    if ('name' in addition.channel) {
      const { name } = addition.channel;
      return `the new region ${shortened ? truncate(name, NAME_SHOWN) : name}`;
    }
    const { id } = addition.channel;
    const channel = this.channels.find((one) => one.id === id);
    return `the new region #${channel?.name ?? id}`;
  }

  /** A key of `SavePlan.before` / `after`: `r<id>` or `a<index>`. */
  key(key: string): string {
    const n = Number(key.slice(1));
    return key.startsWith('r') ? this.region(n) : this.addition(n);
  }
}

/** Why a save cannot be done, as a sentence. */
function problemLine(problem: SaveProblem, names: SaveNames): string {
  switch (problem.kind) {
    case 'twice':
      return `${names.region(problem.regionId)} is changed twice in one save. Reload the page.`;
    case 'channel-gone':
      return (
        `The channel of ${names.region(problem.regionId)} is gone, so its outline cannot be ` +
        'changed here: remove the region instead.'
      );
    case 'outline':
      return `The outline of ${
        'regionId' in problem.target
          ? names.region(problem.target.regionId)
          : names.addition(problem.target.addition)
      } ${outlineProblemText(problem.problem)}.`;
    case 'already-region':
      return `#${problem.name} is a region already: pick another channel for ${names.addition(problem.addition)}.`;
    case 'not-a-channel':
      return `The channel of ${names.addition(problem.addition)} is no text channel of this server any more: pick another.`;
    case 'no-name':
      return `The name of ${names.addition(problem.addition)} gives no channel name: use letters or digits.`;
    case 'channel-exists':
      return problem.listed
        ? `#${problem.name} exists: pick it from the list for ${names.addition(problem.addition)}.`
        : `#${problem.name} exists already: pick another name for ${names.addition(problem.addition)}.`;
    case 'name-too-long':
      return (
        `The name of ${names.addition(problem.addition, true)} has ${problem.length} characters: ` +
        `a channel name has ${MAX_NEW_CHANNEL_NAME} at most.`
      );
    case 'category-too-long':
      return (
        `The category of ${names.addition(problem.addition, true)} has ${problem.length} ` +
        `characters: I take ${MAX_NEW_CATEGORY} at most.`
      );
  }
}

/** How much of an over-long name a refusal shows. */
const NAME_SHOWN = 40;

/** What a save answers when its overlaps and gaps would take too long to work out. */
const TOO_COMPLEX = 'Too complex to check: simplify the outlines.';
/** What a save answers when its check could not be run (its thread did not start or answer). */
const CANNOT_CHECK = 'I cannot check the outlines just now: try again in a minute.';
/** What a save answers when too many checks wait already. */
const BUSY = 'Busy checking other saves: try again in a minute.';
/** What a preview or a save answers once the web server is closing (the bot shutting down). */
export const CLOSING = 'Pine is shutting down: try again in a few minutes.';

/**
 * What a preview or a save comes to: an answer (`SaveAnswer`), or `later`, nothing done for now
 * and why (answered 503 with its words: the check cannot be run, too many wait, the bot is
 * shutting down).
 */
export type SaveOutcome = SaveAnswer | { kind: 'later'; error: string };

const byId = <T extends { id: string }>(a: T, b: T): number =>
  a.id < b.id ? -1 : a.id > b.id ? 1 : 0;

/** The regions of this server and those on its channels (`regionsStamp`). */
function regionsHere(
  guildId: number,
  regions: readonly Region[],
  channels: readonly ServerChannel[],
): Region[] {
  const own = new Set(channels.map((channel) => channel.id));
  return regions.filter((region) => region.guildId === guildId || own.has(region.channelId));
}

/**
 * The regions a save is checked against, as text, of this server alone: the versions of its
 * regions and which of its channels is the region of which row (also a row of no server on one
 * of them, which `planSave` counts as a region). Another save, an import or a removal meanwhile,
 * of any region of the server (two edits that together make a new overlap), changes it; another
 * server's regions do not. The verdict of a check is kept by it (`checkKey`).
 */
function regionsStamp(
  guildId: number,
  regions: readonly Region[],
  channels: readonly ServerChannel[],
): string {
  const versions = regions
    .filter((region) => region.guildId === guildId)
    .map((region) => [region.id, regionVersion(region.bounds, region.description)]);
  const regionChannels = regionsHere(guildId, regions, channels)
    .map((region) => ({ id: region.channelId, region: region.id }))
    .sort(byId)
    .map(({ id, region }) => [id, region]);
  return JSON.stringify([versions, regionChannels]);
}

/**
 * What of the server's channels a save depends on, by its plan: the channels it takes by id,
 * the names its areas go to (`channelKey`: the channel the import takes or makes), and the
 * categories a new channel of theirs would go into (`categoryKey`).
 */
interface Watched {
  ids: ReadonlySet<string>;
  names: ReadonlySet<string>;
  categories: ReadonlySet<string>;
}

function watchedBy(plan: SavePlan, request: SaveRequest): Watched {
  return {
    ids: new Set(
      request.additions.flatMap((addition) =>
        'id' in addition.channel ? [addition.channel.id] : [],
      ),
    ),
    names: new Set(plan.areas.map((area) => channelKey(area.name))),
    categories: new Set(
      plan.areas.flatMap((area) => {
        const category = categoryNameFor(area);
        return category === null ? [] : [categoryKey(category)];
      }),
    ),
  };
}

/**
 * The channels a save depends on, as text (id, name, kind, category): the channels and forums
 * of the regions of `regionsStamp`, those `watched` names, and every channel or category whose
 * name stands for a name the plan goes to or a category it names. A channel made, renamed or
 * deleted there meanwhile (one of the name a new region would make) changes it; the server's
 * other channels (a ticket or voice bot's, which come and go all day) do not, unless they fill or
 * empty a category the save puts channels into: a category is stamped with how many channels it
 * holds (plan 8S-4).
 */
function channelsStamp(
  guildId: number,
  regions: readonly Region[],
  channels: readonly ServerChannel[],
  watched: Watched,
): string {
  const ids = new Set(watched.ids);
  for (const region of regionsHere(guildId, regions, channels)) {
    ids.add(region.channelId);
    if (region.forumChannelId !== null) ids.add(region.forumChannelId);
  }
  const children = new Map<string, number>();
  for (const channel of channels) {
    if (channel.categoryId !== null) {
      children.set(channel.categoryId, (children.get(channel.categoryId) ?? 0) + 1);
    }
  }
  return JSON.stringify(
    channels
      .filter(
        (channel) =>
          ids.has(channel.id) ||
          watched.names.has(channelKey(channel.name)) ||
          (channel.kind === 'category' && watched.categories.has(categoryKey(channel.name))),
      )
      .sort(byId)
      // A category with how many channels it holds: one that filled meanwhile has no room
      // for what the save planned in it any more (plan 8S-4).
      .map(({ id, name, kind, categoryId }) =>
        kind === 'category'
          ? [id, name, kind, categoryId, children.get(id) ?? 0]
          : [id, name, kind, categoryId],
      ),
  );
}

/**
 * What the check of a save is of: the request, the regions it is checked against
 * (`regionsStamp`; never the channels: a channel coming or going leaves the outlines as they
 * are) and the areas the import leaves out, as a hash (`SaveChecks` keeps verdicts by it).
 */
function checkKey(staff: RegionStaff, request: SaveRequest, stamp: string): string {
  return createHash('sha256')
    .update(JSON.stringify([staff.guildId, request, stamp]))
    .digest('base64url');
}

/** What a save answers when the regions changed between its check and its run under the lock. */
const STALE = 'The regions changed meanwhile: preview again.';

/** The 409 of a save: the regions changed or removed meanwhile, as they are now. */
function conflictAnswer(
  regions: readonly Region[],
  staff: RegionStaff,
  channels: readonly ServerChannel[],
  conflicts: readonly { regionId: number; gone: boolean }[],
): SaveAnswer {
  const theirs = editorView({
    guildRow: staff.guildId,
    regions: regions.filter((region) => conflicts.some((one) => one.regionId === region.id)),
    channels,
    gyms: [],
    regionsOf: () => [],
    wayspots: [],
  }).regions;
  return {
    kind: 'conflicts',
    conflicts: conflicts.map(({ regionId, gone }) => ({
      regionId,
      theirs: gone ? null : (theirs.find((one) => one.id === regionId) ?? null),
    })),
  };
}

/** The middle of a piece, as a place to name. */
const near = (piece: Piece): string =>
  `${((piece.box.south + piece.box.north) / 2).toFixed(5)}, ` +
  `${((piece.box.west + piece.box.east) / 2).toFixed(5)}`;

/** What a save looked at, when it may be done. */
interface Prepared {
  plan: SavePlan;
  preview: ImportPreview;
  channels: ServerChannel[];
  names: SaveNames;
  regions: ReadonlyMap<number, Region>;
  /** What it was planned and checked against (`regionsStamp` and `channelsStamp`). */
  stamp: string;
  /** The channels it depends on (`channelsStamp`). */
  watched: Watched;
}

/**
 * Everything a preview and a save check, in this order (the page is never trusted): the regions
 * changed or removed must be as the page loaded them (else `conflicts`, with how they are now),
 * the outlines and channels must be what `/region import` takes, deleting a forum takes Manage
 * Channels, and there must be something to do. Then the preview of `RegionAdminService`, with
 * the removals; and no new overlap or gap may come of what that import will write
 * (`outlinesWritten`: the areas it leaves out are not; as the page shades them; worked out off
 * the bot's thread, `SaveChecks`: one too complex to work out in time is refused, a failure of
 * polyclip to cut the outlines is logged and does not block, a check that cannot be run or would
 * wait behind too many is `later`).
 */
async function prepare(
  editing: RegionEditing,
  staff: RegionStaff,
  request: SaveRequest,
  checks: SaveChecks,
): Promise<{ answer: SaveOutcome } | Prepared> {
  const { admin, log } = editing;
  const all = editing.regions.all();
  const channels = admin.channelsOf(staff);
  const regionsNow = regionsStamp(staff.guildId, all, channels);
  const regions = new Map(all.map((region) => [region.id, region]));
  const plan = planSave(request, { guildId: staff.guildId, regions: all, channels });
  const asked = watchedBy(plan, request);
  const names = new SaveNames(regions, channels, request);
  if (plan.conflicts.length > 0) {
    return { answer: conflictAnswer(all, staff, channels, plan.conflicts) };
  }
  const refused = plan.problems.map((problem) => problemLine(problem, names));
  if (!staff.mayManageChannels && plan.removals.some((removal) => removal.forum === 'delete')) {
    refused.push(
      'Deleting the forum of a region takes the Manage Channels permission, which you lack.',
    );
  }
  if (refused.length === 0 && plan.areas.length === 0 && plan.removals.length === 0) {
    refused.push('There is nothing to save.');
  }
  if (refused.length > 0) return { answer: { kind: 'refused', lines: refused } };
  const orphans = await admin.orphanForums(staff).catch((err: unknown) => {
    log.warn({ err }, 'could not list the forums that parties name');
    return [];
  });
  const preview = admin.preview(
    staff,
    plan.areas,
    undefined,
    orphans,
    plan.removals.map((removal) => removal.regionId),
  );
  // The categories the import puts new channels into: a full one's overflow too.
  const watched: Watched = {
    ...asked,
    categories: new Set([
      ...asked.categories,
      ...preview.imports.flatMap((one) => {
        const category = 'create' in one.channel ? one.channel.create.category : null;
        if (category === null) return [];
        return [categoryKey('create' in category ? category.create : category.name)];
      }),
    ]),
  };
  const stamp = regionsNow + channelsStamp(staff.guildId, all, channels, watched);
  // What the import will write is checked: the areas it leaves out are not written.
  const leftOut = new Set(preview.leftOut.map((left) => left.name));
  const key = checkKey(staff, request, `${regionsNow}${JSON.stringify([...leftOut].sort())}`);
  const verdict = await checks.check(key, plan.before, outlinesWritten(plan, leftOut));
  switch (verdict.kind) {
    case 'unavailable':
      log.warn(
        { err: verdict.err, guild: staff.guildId },
        'could not run the check of a save for new overlaps and gaps',
      );
      return { answer: { kind: 'later', error: CANNOT_CHECK } };
    case 'busy':
      return { answer: { kind: 'later', error: BUSY } };
    case 'too-complex':
      return { answer: { kind: 'refused', lines: [TOO_COMPLEX] } };
    case 'failed':
      log.warn(
        { err: verdict.err, guild: staff.guildId },
        'could not check a save for new overlaps and gaps',
      );
      break;
    case 'checked':
      for (const overlap of verdict.coverage.overlaps) {
        refused.push(
          `Saving would make a new overlap of ${squareMetres(overlap.area)} between ` +
            `${names.key(overlap.between[0])} and ${names.key(overlap.between[1])}.`,
        );
      }
      for (const gap of verdict.coverage.gaps) {
        refused.push(
          `Saving would make a new gap of ${squareMetres(gap.area)} between regions, around ` +
            `${near(gap)}.`,
        );
      }
      break;
  }
  if (refused.length > 0) return { answer: { kind: 'refused', lines: refused } };
  return { plan, preview, channels, names, regions, stamp, watched };
}

const channelNamesOf = (channels: readonly ServerChannel[]): Map<string, string> =>
  new Map(channels.map((channel) => [channel.id, channel.name]));

/**
 * What a save of the region editor would do (spec 4.5): `/region import`'s preview of the new
 * and changed outlines, in its words but for the file, and the regions it would remove with what
 * goes with each. Nothing is changed.
 */
export async function previewSave(
  editing: RegionEditing,
  staff: RegionStaff,
  request: SaveRequest,
  checks: SaveChecks,
): Promise<SaveOutcome> {
  const prepared = await prepare(editing, staff, request, checks);
  if ('answer' in prepared) return prepared.answer;
  const { plan, preview, channels, names } = prepared;
  const words =
    plan.areas.length > 0
      ? previewWords(preview, [], 0, false, 'editor')
      : { lines: [], lists: [] as ImportList[] };
  const removed: string[] = [];
  for (const removal of plan.removals) {
    const question = await editing.admin.removalQuestion(removal.regionId, staff);
    if (!question) continue;
    const forumId = question.forum === 'there' ? question.region.forumChannelId : null;
    const forum =
      forumId === null
        ? []
        : removal.forum === 'delete'
          ? [`its forum <#${forumId}> is deleted, with every post in it`]
          : [`its forum <#${forumId}> stays as history`];
    const going = goesWith(question, 'will').map((line) => line.replace(/^- /u, ''));
    removed.push(
      `- ${names.region(removal.regionId)}` +
        [...going, ...forum].map((part) => ` · ${part}`).join(''),
    );
  }
  const lines =
    plan.areas.length === 0
      ? [`Saving would remove ${count(removed.length, 'region')}. Nothing is changed yet.`]
      : removed.length > 0
        ? [...words.lines, `It would also remove ${count(removed.length, 'region')}.`]
        : words.lines;
  const worded: Worded = plainWords(
    lines,
    [...words.lists, { title: 'Would be removed', items: removed, room: 0 }],
    channelNamesOf(channels),
  );
  return {
    kind: 'preview',
    worded,
    changes: preview.imports.length > 0 || plan.removals.length > 0,
  };
}

/**
 * Saves what the region editor sends (spec 4.5), everything checked again as for the preview
 * (the overlaps and gaps of what was just previewed are not worked out again: `SaveChecks`),
 * then `RegionAdminService.save` of the outlines the plan takes and the regions to remove, in
 * one run under the admin lock, which first looks again whether the regions are still as the
 * page loaded them (else nothing is done and the answer is the conflicts, as above), and then
 * whether the server's regions, the regions of its channels and the channels the save depends on
 * are still as it was planned and checked against (`regionsStamp`, `channelsStamp`; else nothing
 * is done: `stale`). The answer says what was done region by region in `/region import`'s and
 * `/region remove`'s words; areas left out of the plan are among "Not imported", a removal that
 * failed is said. Logged as a command is: who, which server, how many; never a name. When the
 * web server began closing (`closing`) while the save was checked, nothing is started: `later`.
 */
export async function carryOutSave(
  editing: RegionEditing,
  staff: RegionStaff,
  request: SaveRequest,
  checks: SaveChecks,
  closing: () => boolean = () => false,
): Promise<SaveOutcome> {
  const prepared = await prepare(editing, staff, request, checks);
  if ('answer' in prepared) return prepared.answer;
  // The bot began to shut down while the save was checked: nothing is started now.
  if (closing()) return { kind: 'later', error: CLOSING };
  const { plan, preview, regions, stamp, watched } = prepared;
  const { admin, log } = editing;
  const done = await admin.save(
    staff,
    preview.imports,
    plan.removals,
    (): readonly ({ regionId: number; gone: boolean } | { stale: true })[] => {
      const now = editing.regions.all();
      const channels = admin.channelsOf(staff);
      const conflicts = planSave(request, {
        guildId: staff.guildId,
        regions: now,
        channels,
      }).conflicts;
      if (conflicts.length > 0) return conflicts;
      const stampNow =
        regionsStamp(staff.guildId, now, channels) +
        channelsStamp(staff.guildId, now, channels, watched);
      return stampNow === stamp ? [] : [{ stale: true }];
    },
  );
  if (done.kind === 'changed') {
    const conflicts = done.changed.flatMap((one) => ('stale' in one ? [] : [one]));
    if (conflicts.length === 0) return { kind: 'stale', line: STALE };
    return conflictAnswer(editing.regions.all(), staff, admin.channelsOf(staff), conflicts);
  }
  const outcome = done.imported;
  const removedLines: string[] = [];
  let removed = 0;
  for (const { regionId, outcome: removal } of done.removed) {
    const region = regions.get(regionId);
    const label = region ? regionInSentence(region, admin.channelsOf(staff)) : 'that region';
    if (removal.kind === 'removed') removed++;
    const lines =
      removal.kind === 'gone'
        ? [REGION_GONE]
        : removal.kind === 'error'
          ? [
              `I could not remove ${label} (the log says what failed): look at the regions and try again.`,
            ]
          : outcomeLines(removal, label, roleReminder(editing.selfRoles, 'removed'));
    removedLines.push(`- ${lines.join(' ')}`);
  }
  log.info(
    {
      staff: staff.staffId,
      guild: staff.guildId,
      changes: request.changes.length,
      additions: request.additions.length,
      removals: request.removals.length,
      removed,
      ...(outcome ? importSummary(outcome) : {}),
    },
    'regions were saved in the web editor',
  );
  const words = outcome
    ? outcomeWords(outcome, roleReminder(editing.selfRoles, 'new'))
    : { lines: [], lists: [] as ImportList[] };
  const leftOut = preview.leftOut.map((left) => leftOutLine(left));
  const lists = words.lists.map((list) =>
    list.title === 'Not imported' ? { ...list, items: [...list.items, ...leftOut] } : list,
  );
  if (!outcome && leftOut.length > 0)
    lists.push({ title: 'Not imported', items: leftOut, room: 0 });
  lists.push({ title: 'Removals', items: removedLines, room: 0 });
  return {
    kind: 'saved',
    worded: plainWords(words.lines, lists, channelNamesOf(admin.channelsOf(staff))),
  };
}
