import type { Settings } from '../config/settings.js';
import type { Gym } from '../db/repositories/gym-repository.js';
import type {
  Region,
  RegionAdminStorage,
  RegionRepository,
} from '../db/repositories/region-repository.js';
import type { SavedRouteUpkeep } from '../db/repositories/saved-route-repository.js';
import { isMissingPermission, type PartyGateway } from '../discord/party-gateway.js';
import type { KmlArea } from '@pine/wayspot-core/kml';
import type { LatLon } from '@pine/wayspot-core/lat-lon';
import { isTrain, partyWord, type Party } from '../domain/party/party.js';
import { isEliteGym } from '../domain/party/raid.js';
import {
  channelKey,
  planImport,
  type ImportPlan,
  type PlannedCategory,
  type PlannedImport,
  type ServerChannel,
} from '../domain/regions/region-import.js';
import type { Logger } from '../log.js';
import type { AdminLock } from './admin-lock.js';
import type { PartyService } from './party-service.js';
import type { PartyStore } from './party-store.js';
import type { GymView } from './gym-directory.js';
import type { RegionProvider } from './region-directory.js';
import type { ServerSettingsLookup } from './server-settings.js';

/**
 * The staff member a change of regions is made by: their snowflake (the log and the server's
 * audit log say who changed what), the row of their server (`Guild.id`), whose regions alone
 * they touch, and that server's snowflake, by which its channels are found.
 */
export interface RegionStaff {
  staffId: string;
  guildId: number;
  server: string;
  /**
   * Whether they may create and delete channels themselves (Manage Channels, on the server):
   * the bot does that for them only then.
   */
  mayManageChannels: boolean;
  /**
   * Whether they may remove regions (plan 19C-2): staff as `/admin` counts them
   * (`isBotManagement`), as `/region remove` asks; absent, no. Who may set the server up without a
   * staff role adds and edits regions, and removes none.
   */
  mayRemoveRegions?: boolean;
}

/** What an import would do (`planImport`), and whether the bot may create channels at all. */
export type ImportPreview = ImportPlan & { mayCreate: boolean };

/** A region an import wrote. */
export interface ImportedRegion {
  /** The name of the area in the file. */
  name: string;
  channelId: string;
  regionId: number;
  /** Whether the channel was no region before. */
  newRegion: boolean;
  /** Whether its outline is the one it had (as the preview said). */
  unchanged: boolean;
  /** Whether the channel was created by this import. */
  channelCreated: boolean;
  /** How many gyms lie in it now. */
  gyms: number;
  /**
   * Its forum: it `had` one, one was `created` now, it took back the forum of a removed region
   * of its channel (`adopted`: `adoptedForum`), or it has `none` because that failed
   * (`forumReason` says why, when that is known).
   */
  forum: 'had' | 'created' | 'adopted' | 'none';
  forumReason?: string;
  adoptedForum?: string;
}

/**
 * Why an area that was to be imported was not, in the end. `channel-gone`: its channel was
 * deleted since the preview, or is no text channel any more; `foreign`: it is another server's
 * region now; `name-taken`: its channel was to be created, and channels of that name exist now
 * that are not one text channel; `no-permission`, `server-full`, `category-full`, `bad-name`,
 * `no-server`: Discord refused to create its channel or its category (`CreatedChannel`);
 * `failed`: that failed for another reason (logged); `not-written`: the outlines could not be
 * written (nothing was); `not-allowed`: its channel was to be created, and the staff member may
 * not create channels; `copy-refused`: its category was a new one continuing another (an
 * overflow category, plan 8S-4), and Discord refused to make it with that one's permissions;
 * `base-gone`: the category it was to continue is gone, so it was not made.
 */
export type ImportFailure =
  | 'channel-gone'
  | 'foreign'
  | 'name-taken'
  | 'no-permission'
  | 'server-full'
  | 'category-full'
  | 'bad-name'
  | 'no-server'
  | 'failed'
  | 'not-written'
  | 'not-allowed'
  | 'copy-refused'
  | 'base-gone';

export interface NotImported {
  name: string;
  channelName: string;
  reason: ImportFailure;
  /** The channel this import created for it, which exists although it is no region. */
  createdChannelId?: string;
  /**
   * With `category-full`: the name of the category that was full; with `copy-refused`: the name
   * of the category that could not be made.
   */
  category?: string;
  /** With `copy-refused`: the name of the category whose permissions it was to have. */
  copyOf?: string;
}

export interface ImportOutcome {
  imported: ImportedRegion[];
  notImported: NotImported[];
  /** The names of the categories this import created. */
  categoriesCreated: string[];
  /**
   * False when what was written could not be loaded again (tried twice): the outlines are
   * stored, but members see them only after the next load (a restart, or another change).
   */
  reloaded: boolean;
}

/**
 * What an import did, by numbers and region ids, for the log: never a name or anything else
 * of the file.
 */
export function importSummary(outcome: ImportOutcome): Record<string, unknown> {
  const notImported: Partial<Record<ImportFailure, number>> = {};
  for (const { reason } of outcome.notImported) {
    notImported[reason] = (notImported[reason] ?? 0) + 1;
  }
  const { imported } = outcome;
  return {
    imported: imported.length,
    regions: imported.map((region) => region.regionId),
    newRegions: imported.filter((region) => region.newRegion).length,
    channelsCreated: imported.filter((region) => region.channelCreated).length,
    categoriesCreated: outcome.categoriesCreated.length,
    forumsCreated: imported.filter((region) => region.forum === 'created').length,
    forumsTakenBack: imported.filter((region) => region.forum === 'adopted').length,
    withoutForum: imported.filter((region) => region.forum === 'none').length,
    notImported,
    reloaded: outcome.reloaded,
  };
}

/** How a region's channel or forum stands on Discord. */
export type ChannelState = 'there' | 'gone';

/** A region as `/region list` shows it. */
export interface RegionLine {
  region: Region;
  /** Its text channel: `gone` when the server has no such channel any more. */
  channel: ChannelState;
  /** Its forum: `none` while it has none yet. */
  forum: ChannelState | 'none';
  gyms: number;
  /** How many of them are elite raid gyms. */
  elite: number;
  /** Its active parties. */
  parties: number;
}

export interface RegionList {
  regions: RegionLine[];
  /** How many of the server's gyms lie in none of its regions (plan 19B-2): still its own. */
  unplacedGyms: number;
  /** The forums that parties of this server name and no region has, and that still exist. */
  orphanForums: string[];
}

/** What removing a region would do. */
export interface RemovalQuestion {
  region: Region;
  channel: ChannelState;
  forum: ChannelState | 'none';
  /** Its active parties, which are ended. */
  parties: number;
  /** The gyms that will lie in no region of this server afterwards. */
  strandedGyms: number;
  /** The saved routes of members that go with it. */
  routes: number;
}

export type RemovalOutcome =
  /** The server has no such region (any more). */
  | { kind: 'gone' }
  /**
   * A party of the region could not be ended: nothing else happened, the region is as it was
   * but for the `ended` parties that are over.
   */
  | { kind: 'stuck'; ended: number; party: Party }
  /** The row could not be deleted: the region is as it was but for its ended parties. */
  | { kind: 'failed'; ended: number }
  | {
      kind: 'removed';
      region: Region;
      /** The parties that were ended. */
      ended: number;
      /** The saved routes that went with it. */
      routes: number;
      /** The gyms that lie in no region of this server now. */
      strandedGyms: number;
      /**
       * What became of the forum: it had `none`, it was `gone` already, it was `kept` or
       * `deleted` as asked, or it could not be deleted (`not-deleted`; `forumDenied` when for
       * lack of a permission).
       */
      forum: 'none' | 'gone' | 'kept' | 'deleted' | 'not-deleted';
      /** The forum that was decided about: the one the row had when it was deleted. */
      forumChannelId: string | null;
      forumDenied?: boolean;
      /** False when the regions could not be loaded again (as for `ImportOutcome`). */
      reloaded: boolean;
    };

/** What a removal of a save of the region editor did; `error`: it rejected (logged). */
export interface EditorRemoval {
  regionId: number;
  outcome: RemovalOutcome | { kind: 'error' };
}

/**
 * What a save of the region editor did (`RegionAdminService.save`): nothing, as something
 * `changed` since the page loaded it; or it was `saved`: what was imported (none when nothing
 * was to be), and each removal.
 */
export type EditorSaveOutcome<Changed> =
  | { kind: 'changed'; changed: readonly Changed[] }
  | { kind: 'saved'; imported: ImportOutcome | undefined; removed: EditorRemoval[] };

/** An area of an export: named so that an import finds its channel again. */
export type ExportedArea = Pick<KmlArea, 'name' | 'description' | 'outline'>;

export interface RegionAdminOptions {
  /** The lock gym administration runs under too (`AdminLock`). */
  lock: AdminLock;
  storage: RegionAdminStorage & Pick<RegionRepository, 'setForum'>;
  regions: RegionProvider & { load(): Promise<void> };
  /** The gyms per server (plan 19B-2): a server counts and plans with its own. */
  gyms: {
    of(guildId: number | undefined): Pick<GymView, 'all' | 'inRegion' | 'regionsOf'>;
    load(): Promise<void>;
  };
  store: Pick<PartyStore, 'active' | 'inRegion' | 'closeRegion' | 'reopenRegion'>;
  posts: Pick<PartyService, 'end' | 'changed' | 'setupForums' | 'forgetTags' | 'orphanForums'>;
  routes: Pick<SavedRouteUpkeep, 'countInRegion'>;
  gateway: Pick<
    PartyGateway,
    | 'serverChannels'
    | 'channelKind'
    | 'mayCreateChannels'
    | 'createCategory'
    | 'createTextChannel'
    | 'deletePost'
    | 'deleteChannel'
  >;
  settings: Settings;
  /** Each server's values: the ending of its regions' forums (plan 19A-1). */
  servers: ServerSettingsLookup;
  log: Logger;
}

/** How often the parties of a region are looked for again while they are being ended. */
const END_ROUNDS = 3;

const categoryKey = (name: string): string => name.normalize('NFC').toLowerCase();

/** Why a channel (or its category) could not be created, with the names its words need. */
type CategoryRefused = { ok: false; reason: ImportFailure } & Pick<
  NotImported,
  'category' | 'copyOf'
>;

/** An area that is ready to be written: its channel exists. */
interface Ready {
  planned: PlannedImport;
  channelId: string;
  channelCreated: boolean;
}

/**
 * Region administration (`/region`): giving channels their outlines from a file, listing and
 * exporting the regions of a server, and removing one. A server's staff touch only the regions
 * whose row belongs to their server and the channels of their server: a region of another
 * server is, for them, no region.
 *
 * Every change runs under the lock of gym administration (`AdminLock`), which decides by the
 * regions' rows what staff may touch. After every change both directories that hold the
 * regions are loaded again (`RegionDirectory`, `GymDirectory`) and the active trains are shown
 * anew (their copies stand in the channels of the regions of their route). Every change is
 * noted in the log with who made it, which regions and what, by numbers: never a file's text.
 *
 * Regions are never removed by themselves: not at start, not when a channel is gone. The only
 * removal is `remove`.
 */
export class RegionAdminService {
  constructor(private readonly options: RegionAdminOptions) {}

  /** The regions of a server (by its row id), oldest first. */
  regionsOf(guildId: number): Region[] {
    return this.options.regions.all().filter((region) => region.guildId === guildId);
  }

  /** The region with this row id, when it is the server's. */
  regionOf(regionId: number, guildId: number): Region | undefined {
    const region = this.options.regions.byId(regionId);
    return region?.guildId === guildId ? region : undefined;
  }

  /** The channels of the staff member's server; none when the bot does not know the server. */
  channelsOf(staff: Pick<RegionStaff, 'server'>): ServerChannel[] {
    return this.options.gateway.serverChannels(staff.server) ?? [];
  }

  /** An ordinary text channel of the server by its id: what can be a region. */
  textChannel(
    staff: Pick<RegionStaff, 'server'>,
    channelId: string,
  ): { id: string; name: string } | undefined {
    const found = this.channelsOf(staff).find((channel) => channel.id === channelId);
    return found?.kind === 'text' ? { id: found.id, name: found.name } : undefined;
  }

  /**
   * What an import of these areas would do (`planImport`), by the channels, regions, gyms and
   * raids as they are now. Nothing is changed. With `target` the file is for that one channel
   * (which the caller has checked with `textChannel`). `orphanForums` are the forums of removed
   * regions (`orphanForums`), which a region of the same channel takes back. `removing` are
   * regions removed together with the import (the region editor's save, plan 8M-2): their gyms
   * count among those left in no region.
   */
  preview(
    staff: RegionStaff,
    areas: readonly KmlArea[],
    target?: { id: string; name: string },
    orphanForums: readonly string[] = [],
    removing: readonly number[] = [],
  ): ImportPreview {
    const { regions, gyms, store, gateway, servers } = this.options;
    const mayCreate = gateway.mayCreateChannels(staff.server);
    const plan = planImport({
      areas,
      channels: this.channelsOf(staff),
      regions: regions.all(),
      guildId: staff.guildId,
      gyms: gyms.of(staff.guildId).all(),
      raids: store.active().map(({ regionId, gymId }) => ({ regionId, gymId })),
      mayCreate,
      staffMayCreate: staff.mayManageChannels,
      orphanForums,
      forumSuffix: servers.of(staff.server).regionForumSuffix,
      removing,
      ...(target ? { target } : {}),
    });
    return { ...plan, mayCreate };
  }

  /**
   * Carries out what a preview showed (`planned`: its `imports`), as far as it still holds:
   *
   * 1. under the lock, every channel is looked at again. A channel that is gone, or no text
   *    channel any more, or another server's region now, leaves its area out. A channel that
   *    was to be created is created, in its category, which is created first when it does
   *    not exist (areas of one category share it); when a text channel of that name has
   *    appeared meanwhile, that one is taken. What Discord refuses leaves that area out;
   * 2. all outlines are written in one transaction, all or none. When that fails nothing is a
   *    region that was none, and the channels created in step 1 are named as such;
   * 3. the directories are loaded (tried once more when that fails) and the trains shown anew;
   * 4. a region that the preview had take back the forum of a removed region of its channel
   *    (`adoptForum`) is given it, when it is still there and still nobody's;
   * 5. every region written that has no forum (a forum deleted by hand is none) gets one, with its tags and its list of active
   *    raids (`PartyService.setupForums`, as `/admin setup-forums` does it), still under the
   *    lock: gym administration decides by the regions, and waits until they are complete. A
   *    forum that cannot be made leaves the region as it is, with the reason.
   *
   * Active parties stay where they are when an outline changes under them. Never rejects.
   */
  async import(staff: RegionStaff, planned: readonly PlannedImport[]): Promise<ImportOutcome> {
    return this.options.lock.run(() => this.importNow(staff, planned, '/region import'));
  }

  /** `import` under the lock already; `via` names what asked in the server's audit log. */
  private async importNow(
    staff: RegionStaff,
    planned: readonly PlannedImport[],
    via: string,
  ): Promise<ImportOutcome> {
    const outcome = await this.write(staff, planned, via);
    await this.adoptForums(staff, planned, outcome);
    await this.setUpForums(staff, outcome);
    this.options.log.info(
      { staff: staff.staffId, guild: staff.guildId, ...importSummary(outcome) },
      'a region import is done',
    );
    return outcome;
  }

  /**
   * A save of the region editor (plan 8M-2): what its preview showed, imported (`import`'s
   * steps) and removed (`remove`'s), all in one run under the lock, so that nothing changes in
   * between. First of all, under the lock, `notAsLoaded` is asked what of the save is no longer
   * as the page loaded it (by the regions as they are now): anything, and nothing is done
   * (`changed`, with what it said). Each removal that rejects is `error` (logged), and the others
   * go on. What Discord's audit log says of the channels made and deleted names the region
   * editor. Never rejects.
   */
  async save<Changed>(
    staff: RegionStaff,
    planned: readonly PlannedImport[],
    removals: readonly { regionId: number; forum: 'keep' | 'delete' }[],
    notAsLoaded: () => readonly Changed[],
  ): Promise<EditorSaveOutcome<Changed>> {
    const { lock, log } = this.options;
    return lock.run(async (): Promise<EditorSaveOutcome<Changed>> => {
      const changed = notAsLoaded();
      if (changed.length > 0) return { kind: 'changed', changed };
      const imported =
        planned.length > 0 ? await this.importNow(staff, planned, 'region editor') : undefined;
      const removed: EditorRemoval[] = [];
      for (const { regionId, forum } of removals) {
        try {
          removed.push({
            regionId,
            outcome: await this.removeNow(regionId, staff, forum, 'region editor'),
          });
        } catch (err) {
          log.error(
            { err, region: regionId, staff: staff.staffId },
            'could not remove a region in the web editor',
          );
          removed.push({ regionId, outcome: { kind: 'error' } });
        }
      }
      return { kind: 'saved', imported, removed };
    });
  }

  /**
   * Step 4 of `import`: the forums of removed regions that regions without one take back, as
   * the preview showed. Looked at again first: the forum must still be a forum, belong to no
   * region and be named by parties of this server (`orphanForums`). A forum that is not is left
   * alone, and the region gets a new one in step 5.
   */
  private async adoptForums(
    staff: RegionStaff,
    planned: readonly PlannedImport[],
    outcome: ImportOutcome,
  ): Promise<void> {
    const { storage, regions, gateway, log } = this.options;
    const wanted = outcome.imported.flatMap((region) => {
      const forum = planned.find((one) => one.name === region.name)?.adoptForum;
      return region.forum === 'none' && forum ? [{ region, forumId: forum.id }] : [];
    });
    if (wanted.length === 0) return;
    let orphans: string[];
    try {
      orphans = await this.orphanForums(staff);
    } catch (err) {
      log.warn({ err, staff: staff.staffId }, 'could not list the forums that parties name');
      return;
    }
    let adopted = false;
    for (const { region, forumId } of wanted) {
      const free =
        orphans.includes(forumId) &&
        gateway.channelKind(forumId) === 'forum' &&
        regions.byForum(forumId) === undefined;
      if (!free) continue;
      try {
        if ((await storage.setForum(region.regionId, forumId)) !== 'set') continue;
      } catch (err) {
        log.warn({ err, region: region.regionId }, 'could not give a region its forum back');
        continue;
      }
      region.forum = 'adopted';
      region.adoptedForum = forumId;
      adopted = true;
      log.info(
        { staff: staff.staffId, region: region.regionId, forum: forumId },
        'a region took back its forum',
      );
    }
    if (adopted) await this.reload();
  }

  /**
   * Step 5 of `import`: the forums of the regions written that have none, and the set-up of the
   * forums taken back (tags, posts by the bot alone, the list of active raids).
   */
  private async setUpForums(staff: RegionStaff, outcome: ImportOutcome): Promise<void> {
    const { posts, log } = this.options;
    const needForum = outcome.imported.filter(
      (region) => region.forum === 'none' || region.forum === 'adopted',
    );
    if (needForum.length === 0) return;
    try {
      const results = await posts.setupForums(
        staff.server,
        needForum.map((region) => region.regionId),
      );
      for (const result of results) {
        const region = needForum.find((one) => one.regionId === result.region.id);
        if (!region || region.forum === 'adopted') continue;
        if (result.forum === 'created') region.forum = 'created';
        else if (result.reason !== undefined) region.forumReason = result.reason;
      }
    } catch (err) {
      log.error({ err, staff: staff.staffId }, 'could not set up the forums of imported regions');
    }
  }

  /** Steps 1 to 3 of `import`, under the lock; `via` names what asked (`importNow`). */
  private async write(
    staff: RegionStaff,
    planned: readonly PlannedImport[],
    via: string,
  ): Promise<ImportOutcome> {
    const { storage, regions, gyms, log } = this.options;
    const ready: Ready[] = [];
    const notImported: NotImported[] = [];
    const categoriesCreated: string[] = [];
    /**
     * The categories made in this run, by name without case (the cache may not have them yet),
     * or why one could not be made: the areas after it are left out alike, without asking again.
     */
    const madeCategories = new Map<string, string | CategoryRefused>();
    const taken = new Set<string>();
    for (const one of planned) {
      const leave = (
        reason: ImportFailure,
        createdChannelId?: string,
        more: Pick<NotImported, 'category' | 'copyOf'> = {},
      ): void => {
        notImported.push({
          name: one.name,
          channelName: one.channelName,
          reason,
          ...(createdChannelId === undefined ? {} : { createdChannelId }),
          ...more,
        });
      };
      const channels = this.channelsOf(staff);
      let channelId: string;
      let channelCreated = false;
      if ('id' in one.channel) {
        const { id } = one.channel;
        if (channels.find((channel) => channel.id === id)?.kind !== 'text') {
          leave('channel-gone');
          continue;
        }
        channelId = id;
      } else {
        // Looked at again: a channel of the name may have been made since the preview.
        const key = channelKey(one.channelName);
        const namesakes = channels.filter(
          (channel) => channel.kind !== 'category' && channelKey(channel.name) === key,
        );
        const [namesake] = namesakes;
        if (namesake) {
          if (namesakes.length > 1 || namesake.kind !== 'text') {
            leave('name-taken');
            continue;
          }
          channelId = namesake.id;
        } else if (!staff.mayManageChannels) {
          leave('not-allowed');
          continue;
        } else {
          const made = await this.createChannel(
            staff,
            one.channelName,
            one.channel.create.category,
            channels,
            madeCategories,
            categoriesCreated,
            `${via} by ${staff.staffId}`,
          );
          if (!made.ok) {
            const { ok: _ok, reason, ...more } = made;
            leave(reason, undefined, more);
            continue;
          }
          channelId = made.id;
          channelCreated = true;
        }
      }
      const existing = regions.byChannel(channelId);
      if (existing && existing.guildId !== staff.guildId) {
        leave('foreign', channelCreated ? channelId : undefined);
        continue;
      }
      if (taken.has(channelId)) {
        leave('name-taken', channelCreated ? channelId : undefined);
        continue;
      }
      taken.add(channelId);
      ready.push({ planned: one, channelId, channelCreated });
    }
    if (ready.length === 0) {
      return { imported: [], notImported, categoriesCreated, reloaded: true };
    }

    let saved: Awaited<ReturnType<RegionAdminStorage['saveOutlines']>>;
    try {
      saved = await storage.saveOutlines(
        staff.guildId,
        ready.map(({ planned: one, channelId }) => ({ channelId, ring: one.outline })),
      );
    } catch (err) {
      log.error({ err, staff: staff.staffId }, 'could not write the outlines of regions');
      for (const { planned: one, channelId, channelCreated } of ready) {
        notImported.push({
          name: one.name,
          channelName: one.channelName,
          reason: 'not-written',
          ...(channelCreated ? { createdChannelId: channelId } : {}),
        });
      }
      return { imported: [], notImported, categoriesCreated, reloaded: true };
    }
    log.info(
      {
        staff: staff.staffId,
        guild: staff.guildId,
        regions: saved.map((one) => one.regionId),
        created: saved.filter((one) => one.created).length,
        replaced: saved.filter((one) => !one.created).length,
        channelsCreated: ready.filter((one) => one.channelCreated).length,
        categoriesCreated: categoriesCreated.length,
        corners: ready.map(({ planned: one }) => one.outline.length - 1),
      },
      'the outlines of regions were imported',
    );
    const reloaded = await this.reload();
    const imported = ready.flatMap(({ planned: one, channelId, channelCreated }) => {
      const written = saved.find((row) => row.channelId === channelId);
      if (!written) return [];
      const region: ImportedRegion = {
        name: one.name,
        channelId,
        regionId: written.regionId,
        newRegion: written.created,
        unchanged: !written.created && one.unchanged,
        channelCreated,
        gyms: gyms.of(staff.guildId).inRegion(channelId).length,
        // A forum deleted by hand is none: the region gets a new one.
        forum: this.hasForum(regions.byId(written.regionId)) ? 'had' : 'none',
      };
      return [region];
    });
    return { imported, notImported, categoriesCreated, reloaded };
  }

  /**
   * Creates the text channel of a new region, in its category: the very one the plan named,
   * while it is still there (of several of one name, the one with room), else one of its name,
   * which is created first when the server has none (looked for again, and among those this run
   * made). `auditReason` is what the server's audit log says of them: what asked, and who. A
   * full category is named with the failure.
   */
  private async createChannel(
    staff: RegionStaff,
    name: string,
    category: PlannedCategory,
    channels: readonly ServerChannel[],
    madeCategories: Map<string, string | CategoryRefused>,
    categoriesCreated: string[],
    auditReason: string,
  ): Promise<{ ok: true; id: string } | CategoryRefused> {
    const { gateway, log } = this.options;
    try {
      let categoryId: string | null = null;
      let categoryName: string | undefined;
      if (category !== null) {
        const wanted = 'create' in category ? category.create : category.name;
        const key = categoryKey(wanted);
        const planned =
          'id' in category
            ? channels.find((channel) => channel.id === category.id && channel.kind === 'category')
            : undefined;
        const existing =
          planned ??
          channels.find(
            (channel) => channel.kind === 'category' && categoryKey(channel.name) === key,
          );
        const before = existing ? undefined : madeCategories.get(key);
        if (typeof before === 'object') return before;
        categoryId = existing?.id ?? before ?? null;
        categoryName = existing?.name ?? wanted;
        if (categoryId === null) {
          // An overflow category continues another: its permissions, right after it (also one
          // that existed at the preview and was deleted since, made again).
          const { like } = category;
          const made = await gateway.createCategory(staff.server, wanted, auditReason, like);
          if (!made.ok) {
            const base = like === undefined ? undefined : channels.find((one) => one.id === like);
            // Refused its overwrites: only where the bot may create channels at all.
            const refused: CategoryRefused =
              made.reason === 'base-gone'
                ? { ok: false, reason: 'base-gone', category: wanted }
                : made.reason === 'no-permission' &&
                    base !== undefined &&
                    gateway.mayCreateChannels(staff.server)
                  ? { ok: false, reason: 'copy-refused', category: wanted, copyOf: base.name }
                  : made;
            madeCategories.set(key, refused);
            return refused;
          }
          madeCategories.set(key, made.id);
          categoriesCreated.push(made.name);
          categoryId = made.id;
          categoryName = made.name;
        }
      }
      const made = await gateway.createTextChannel(staff.server, name, categoryId, auditReason);
      if (made.ok) return { ok: true, id: made.id };
      return made.reason === 'category-full' && categoryName !== undefined
        ? { ...made, category: categoryName }
        : made;
    } catch (err) {
      log.error({ err, staff: staff.staffId }, 'could not create the channel of a region');
      return { ok: false, reason: 'failed' };
    }
  }

  /**
   * After regions changed: both directories read them again (once more when that fails), and
   * the active trains are shown anew. False when both tries failed: that is logged, and what is
   * in memory then is what was there before.
   */
  private async reload(): Promise<boolean> {
    const { regions, gyms, store, posts, log } = this.options;
    let loaded = false;
    for (let attempt = 1; attempt <= 2 && !loaded; attempt++) {
      try {
        await regions.load();
        await gyms.load();
        loaded = true;
      } catch (err) {
        log.error({ err, attempt }, 'regions changed, but they could not be read again');
      }
    }
    for (const party of store.active()) {
      if (isTrain(party)) posts.changed(party.id);
    }
    return loaded;
  }

  /** Whether a region has a forum that is still there. */
  private hasForum(region: Region | undefined): boolean {
    const forumId = region?.forumChannelId ?? null;
    return forumId !== null && this.options.gateway.channelKind(forumId) === 'forum';
  }

  private static state(
    channels: readonly ServerChannel[] | undefined,
    id: string,
    kind: ServerChannel['kind'],
  ): ChannelState {
    // A server the bot cannot list the channels of: nothing is known to be gone.
    if (channels === undefined) return 'there';
    return channels.find((channel) => channel.id === id)?.kind === kind ? 'there' : 'gone';
  }

  private forumState(
    channels: readonly ServerChannel[] | undefined,
    region: Region,
  ): ChannelState | 'none' {
    return region.forumChannelId === null
      ? 'none'
      : RegionAdminService.state(channels, region.forumChannelId, 'forum');
  }

  /** The gyms of a region's server (plan 19B-2) that lie in it and in no other of its regions. */
  private onlyIn(region: Region): Gym[] {
    const { regions } = this.options;
    const gyms = this.options.gyms.of(region.guildId ?? undefined);
    return gyms.inRegion(region.channelId).filter(
      (gym) =>
        !gyms.regionsOf(gym.id).some((channelId) => {
          const other = regions.byChannel(channelId);
          return other !== undefined && other.id !== region.id && other.guildId === region.guildId;
        }),
    );
  }

  /**
   * The forums that parties of this server name and no region has, and that still exist: the
   * forums of regions that were removed (and kept), or deleted outside the bot.
   */
  orphanForums(staff: Pick<RegionStaff, 'server'>): Promise<string[]> {
    return this.options.posts.orphanForums(staff.server);
  }

  /** The regions of the server with what is wrong with each, and what belongs to none. */
  async list(staff: Pick<RegionStaff, 'guildId' | 'server'>): Promise<RegionList> {
    const { store, gateway, log } = this.options;
    // The server's own gyms (plan 19B-2), in its own regions.
    const gyms = this.options.gyms.of(staff.guildId);
    const channels = gateway.serverChannels(staff.server);
    const lines = this.regionsOf(staff.guildId).map((region): RegionLine => {
      const inside = gyms.inRegion(region.channelId);
      return {
        region,
        channel: RegionAdminService.state(channels, region.channelId, 'text'),
        forum: this.forumState(channels, region),
        gyms: inside.length,
        elite: inside.filter(isEliteGym).length,
        parties: store.inRegion(region.id).length,
      };
    });
    let orphanForums: string[] = [];
    try {
      orphanForums = await this.orphanForums(staff);
    } catch (err) {
      log.warn({ err }, 'could not list the forums that parties name');
    }
    return {
      regions: lines,
      unplacedGyms: gyms.all().filter((gym) => gyms.regionsOf(gym.id).length === 0).length,
      orphanForums,
    };
  }

  /**
   * The outlines of the server's regions as areas to write to a file (`writeKml`) that imports
   * again as it is: each is named by its channel (the name stands for the channel), and its
   * description is the name of the category the channel is in now. `only` gives one region.
   * `skipped` counts the regions left out: those without an outline, and (of several) those
   * whose channel is gone, which no name would find again.
   */
  exported(
    staff: Pick<RegionStaff, 'guildId' | 'server'>,
    only?: number,
  ): { areas: ExportedArea[]; skipped: number } {
    const channels = this.options.gateway.serverChannels(staff.server) ?? [];
    const wanted = this.regionsOf(staff.guildId).filter(
      (region) => only === undefined || region.id === only,
    );
    const areas: ExportedArea[] = [];
    for (const region of wanted) {
      const channel = channels.find((one) => one.id === region.channelId);
      if (region.bounds === null || (!channel && only === undefined)) continue;
      const category = channels.find(
        (one) => one.kind === 'category' && one.id === channel?.categoryId,
      );
      areas.push({
        name: channel?.name ?? `deleted-channel-${region.channelId}`,
        description: category?.name ?? null,
        outline: region.bounds.map(({ lat, lon }): LatLon => ({ lat, lon })),
      });
    }
    return { areas, skipped: wanted.length - areas.length };
  }

  /** What removing a region would do now; undefined when the server has no such region. */
  async removalQuestion(
    regionId: number,
    staff: Pick<RegionStaff, 'guildId' | 'server'>,
  ): Promise<RemovalQuestion | undefined> {
    const { store, routes, gateway } = this.options;
    const region = this.regionOf(regionId, staff.guildId);
    if (!region) return undefined;
    const channels = gateway.serverChannels(staff.server);
    return {
      region,
      channel: RegionAdminService.state(channels, region.channelId, 'text'),
      forum: this.forumState(channels, region),
      parties: store.inRegion(region.id).length,
      strandedGyms: this.onlyIn(region).length,
      routes: await routes.countInRegion(region.id),
    };
  }

  /**
   * Removes a region. Everything is decided now, whatever a question said minutes ago. Under
   * the lock, in this order:
   *
   * 1. the region is closed to new parties (`PartyStore.closeRegion`), and every active party
   *    of it is ended (`PartyService.end`), its post saying why. When one cannot be ended,
   *    nothing more happens (`stuck`) and the region takes parties again;
   * 2. the row is deleted (`failed` when it cannot be: the region is as it was, without its
   *    parties). With it go the saved routes of the region, and its parties' rows lose their
   *    region; its text channel and the gyms are never touched;
   * 3. the directories are loaded: from here on the channel is no region for anybody. The
   *    region stays closed, so that whoever held it across this is refused as well;
   * 4. the list of active raids in its forum is deleted (after the row, so that nothing makes
   *    it anew), and the forum is deleted or kept, as asked. A kept forum stays as history:
   *    its posts are archived and locked, and the hourly sweeps go on by the party rows. A
   *    forum that cannot be deleted is said in the answer; the region is gone all the same.
   */
  remove(regionId: number, staff: RegionStaff, forum: 'keep' | 'delete'): Promise<RemovalOutcome> {
    return this.options.lock.run(() => this.removeNow(regionId, staff, forum, '/region remove'));
  }

  /** `remove` under the lock already; `via` names what asked in the server's audit log. */
  private async removeNow(
    regionId: number,
    staff: RegionStaff,
    forum: 'keep' | 'delete',
    via: string,
  ): Promise<RemovalOutcome> {
    const { storage, store, posts, gateway, log } = this.options;
    const region = this.regionOf(regionId, staff.guildId);
    if (!region) return { kind: 'gone' };
    await store.closeRegion(region.id);
    let ended = 0;
    let stuck: Party | undefined;
    for (let round = 0; round < END_ROUNDS && !stuck; round++) {
      const parties = store.inRegion(region.id);
      if (parties.length === 0) break;
      for (const party of parties) {
        try {
          const lastWords = `This region is being removed, so this ${partyWord(party)} was closed.`;
          if (await posts.end(party.id, undefined, { lastWords })) ended++;
        } catch (err) {
          log.error({ err, party: party.id, region: region.id }, 'could not end a party');
          stuck = party;
          break;
        }
      }
    }
    stuck ??= store.inRegion(region.id)[0];
    if (stuck) {
      store.reopenRegion(region.id);
      return { kind: 'stuck', ended, party: stuck };
    }
    const strandedGyms = this.onlyIn(region).length;
    let removed: Awaited<ReturnType<RegionAdminStorage['remove']>>;
    try {
      removed = await storage.remove(region.id, staff.guildId);
    } catch (err) {
      log.error({ err, region: region.id }, 'could not remove a region');
      store.reopenRegion(region.id);
      return { kind: 'failed', ended };
    }
    const reloaded = await this.reload();
    // Somebody else removed it in the same moment: memory has caught up now.
    if (!removed.removed) return { kind: 'gone' };
    const { routes } = removed;
    // What the row had when it was locked and deleted, whatever memory said.
    const forumId = removed.forumChannelId;
    if (removed.summaryMessageId !== null) {
      try {
        await gateway.deletePost(removed.summaryMessageId);
      } catch (err) {
        log.warn({ err, region: region.id }, 'could not delete the list of a removed region');
      }
    }
    let forumOutcome: Extract<RemovalOutcome, { kind: 'removed' }>['forum'] = 'none';
    let forumDenied = false;
    if (forumId !== null) {
      posts.forgetTags(forumId);
      // A server the bot does not know (it left it) has no forum left to delete.
      const channels = gateway.serverChannels(staff.server);
      const there =
        channels !== undefined && RegionAdminService.state(channels, forumId, 'forum') === 'there';
      if (!there) forumOutcome = 'gone';
      else if (forum === 'keep') forumOutcome = 'kept';
      else {
        try {
          await gateway.deleteChannel(forumId, `${via} by ${staff.staffId}`);
          forumOutcome = 'deleted';
        } catch (err) {
          log.warn({ err, forum: forumId }, 'could not delete the forum of a removed region');
          forumOutcome = 'not-deleted';
          forumDenied = isMissingPermission(err);
        }
      }
    }
    log.info(
      {
        staff: staff.staffId,
        guild: staff.guildId,
        region: region.id,
        channel: region.channelId,
        ended,
        routes,
        strandedGyms,
        forum: forumOutcome,
      },
      'a region was removed',
    );
    return {
      kind: 'removed',
      region,
      ended,
      routes,
      strandedGyms,
      forum: forumOutcome,
      forumChannelId: forumId,
      ...(forumDenied ? { forumDenied } : {}),
      reloaded,
    };
  }
}
