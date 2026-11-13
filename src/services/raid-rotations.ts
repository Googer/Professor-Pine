import {
  mergeRotations,
  nextRotationChangeIn,
  parseRaidManifest,
  parseRotationFragment,
  rotationAddress,
  rotationsIn,
  type RaidRotation,
  type RotationEntry,
} from '../domain/pogo/raid-manifest.js';
import type { FeedSource, GetText } from './boss-feed-service.js';

/** The manifest was about 7,000 characters on 2026-10-27; far more is not the manifest. */
export const MAX_MANIFEST_CHARS = 200_000;
/** A rotation's page was about 20,000 characters on 2026-10-27; far more is not the page. */
export const MAX_ROTATION_PAGE_CHARS = 500_000;

/** What a read of Leek Duck's rotations gave. */
export type RotationsRead =
  | {
      status: 'read';
      /** The bosses of the rotations in force, merged (`mergeRotations`), as ScrapedDuck's entries. */
      entries: RotationEntry[];
      /**
       * The rotations in force (`rotationsAt`: one that ended may be kept over a gap), in the
       * manifest's order.
       */
      inForce: RaidRotation[];
      /**
       * When the rotations in force change next, in any of the zones read (the soonest);
       * undefined when nothing later changes them.
       */
      nextChange: number | undefined;
      /** Rotations of the manifest and cards of the pages that could not be read. */
      skipped: number;
      /** Rotations of the manifest left out at a city's own times (an in-person event's). */
      elsewhere: number;
      /**
       * Plan 19A-2: the entries and rotations in force of each other zone asked for whose
       * rotations in force are not `zone`'s (a rotation starts at 10:00 on each zone's clock); a
       * zone not here has `zone`'s, as has one with no regular rotation in force.
       */
      byZone: ReadonlyMap<string, { entries: RotationEntry[]; inForce: RaidRotation[] }>;
      /**
       * The other zones left out of `byZone` because a page only they need could not be read
       * (fix round 1, L2), and why: each keeps the list it had (`zone`'s when it had none of its
       * own), and the feed retries as after a failure of its own (fix round 2, P2, P5).
       */
      unread: ReadonlyMap<string, string>;
    }
  | {
      status: 'fallback';
      /** Why, for the log (it may hold an address). */
      reason: string;
      /** What `get` rejected with, when a download failed. */
      cause?: unknown;
      /** As above, when the manifest itself could be read. */
      inForce?: RaidRotation[];
      nextChange?: number;
      elsewhere?: number;
    };

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** "no regular rotation is in force", with the rotations left out at a city's own times. */
function noRegularRotation(elsewhere: number): string {
  const left =
    elsewhere === 0
      ? ''
      : ` (${elsewhere} at a city's own time${elsewhere === 1 ? '' : 's'} left out)`;
  return `no regular rotation is in force${left}`;
}

/**
 * Whether two zones have the same rotations in force, in whatever order (fix round 1, L4: each
 * zone's are sorted by their starts on its own clock).
 */
export function sameRotations(a: readonly RaidRotation[], b: readonly RaidRotation[]): boolean {
  const slugs = (rotations: readonly RaidRotation[]) =>
    rotations
      .map((rotation) => rotation.slug)
      .sort()
      .join(' ');
  return slugs(a) === slugs(b);
}

/**
 * Reads Leek Duck's raid manifest (`manifestUrl`) and the page of each rotation in force at
 * `now` (only those: a few requests a read) in `zone` (the instance's default zone) and in each
 * of `others` (plan 19A-2: the other zones in use, `rotationsIn`), each page once. ScrapedDuck's
 * feed is the fallback when the manifest cannot be read or is no manifest, when no regular
 * rotation is in force in `zone` (none ended within a day either, `rotationsAt`), or when the page
 * of a rotation in force in `zone` cannot be read or lists no boss (one only other zones need
 * leaves those zones out, `unread`: fix round 1, L2); no shadow rotation in force is no shadow
 * bosses (Leek Duck lists them ahead). A failed download is given as the `cause`, for the
 * caller to tell an outage from a structural cause. Never rejects unless `get` was stopped,
 * which the caller tells by its own signal.
 */
export async function readRaidRotations(
  get: GetText,
  manifestUrl: string,
  zone: string,
  now: number,
  others: readonly string[] = [],
): Promise<RotationsRead> {
  let text: string;
  try {
    text = await get(manifestUrl, { accept: 'application/json', maxChars: MAX_MANIFEST_CHARS });
  } catch (err) {
    const reason = `the manifest could not be read: ${messageOf(err)}`;
    return { status: 'fallback', reason, cause: err };
  }
  let manifest: ReturnType<typeof parseRaidManifest>;
  try {
    manifest = parseRaidManifest(JSON.parse(text) as unknown, zone);
  } catch (err) {
    const reason = err instanceof SyntaxError ? 'it is not JSON' : messageOf(err);
    return { status: 'fallback', reason: `the manifest could not be read: ${reason}` };
  }
  const { elsewhere } = manifest;
  const zones = [zone, ...others.filter((other) => other !== zone)];
  const inForce = rotationsIn(manifest.rotations, zone, now);
  const nextChange = nextRotationChangeIn(manifest.rotations, zones, now);
  const known = { inForce, elsewhere, ...(nextChange === undefined ? {} : { nextChange }) };
  if (!inForce.some((rotation) => rotation.kind === 'regular')) {
    return { status: 'fallback', reason: noRegularRotation(elsewhere), ...known };
  }
  // The other zones whose rotations in force differ, with a regular one among them.
  const differing = new Map<string, RaidRotation[]>();
  for (const other of zones.slice(1)) {
    const theirs = rotationsIn(manifest.rotations, other, now);
    if (sameRotations(theirs, inForce)) continue;
    if (theirs.some((rotation) => rotation.kind === 'regular')) differing.set(other, theirs);
  }
  // Each page once, whichever zones have its rotation in force: the default zone's first, the
  // only ones whose failure falls back (fix round 1, L2).
  const pages = new Map<string, RotationEntry[]>();
  let skipped = manifest.skipped;
  /** A page read, or why it could not be. */
  const readPage = async (
    rotation: RaidRotation,
  ): Promise<{ reason: string; cause?: unknown } | undefined> => {
    if (pages.has(rotation.slug)) return undefined;
    const address = rotationAddress(manifestUrl, rotation.slug);
    let page: string;
    try {
      page = await get(address, { accept: 'text/html', maxChars: MAX_ROTATION_PAGE_CHARS });
    } catch (err) {
      return {
        reason: `the page of ${rotation.slug} could not be read: ${messageOf(err)}`,
        cause: err,
      };
    }
    const { entries, skipped: cards } = parseRotationFragment(page);
    if (entries.length === 0) return { reason: `the page of ${rotation.slug} lists no boss` };
    skipped += cards;
    pages.set(rotation.slug, entries);
    return undefined;
  };
  for (const rotation of inForce) {
    const failed = await readPage(rotation);
    if (failed !== undefined) return { status: 'fallback', ...failed, ...known };
  }
  // A page only other zones need that fails leaves those zones out: the feed keeps what they
  // had, the log says which, and the list is read again soon (`BossFeedService`).
  const unread = new Map<string, string>();
  for (const [other, theirs] of differing) {
    for (const rotation of theirs) {
      const failed = await readPage(rotation);
      if (failed === undefined) continue;
      unread.set(other, failed.reason);
      break;
    }
  }
  const merged = (rotations: readonly RaidRotation[]): RotationEntry[] =>
    mergeRotations(
      rotations.map((rotation) => ({ rotation, entries: pages.get(rotation.slug) ?? [] })),
    );
  const byZone = new Map(
    [...differing]
      .filter(([other]) => !unread.has(other))
      .map(([other, theirs]) => [other, { entries: merged(theirs), inForce: theirs }]),
  );
  return {
    status: 'read',
    entries: merged(inForce),
    inForce,
    nextChange,
    skipped,
    elsewhere,
    byZone,
    unread,
  };
}

/**
 * Leek Duck's raid manifest as the source `RaidBossService` tries before ScrapedDuck's feed
 * (plan 8B-L): its merged entries are the document `parseRaidBossFeed` reads, those of the
 * instance's default zone (`zone`), and the other zones in use (`zones`, plan 19A-2) each their
 * own where their rotations in force differ (`byZone`).
 */
export function raidManifestSource(manifest: {
  url: string;
  zone: string;
  zones?: () => readonly string[];
}): FeedSource {
  return {
    name: "Leek Duck's raid manifest",
    async read(get, now) {
      const others = manifest.zones?.() ?? [];
      const read = await readRaidRotations(get, manifest.url, manifest.zone, now, others);
      const next = read.nextChange === undefined ? {} : { nextChange: read.nextChange };
      if (read.status === 'fallback') {
        return {
          fallback: read.reason,
          ...next,
          ...('cause' in read ? { cause: read.cause } : {}),
        };
      }
      return {
        json: read.entries,
        skipped: read.skipped,
        ...next,
        detail: { rotations: read.inForce.map((rotation) => rotation.title) },
        byZone: new Map([...read.byZone].map(([zone, { entries }]) => [zone, entries])),
        ...(read.unread.size === 0 ? {} : { unreadZones: read.unread }),
      };
    },
  };
}
