import {
  mergeRotations,
  nextRotationChange,
  parseRaidManifest,
  parseRotationFragment,
  rotationAddress,
  rotationsAt,
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
      /** When the rotations in force change next; undefined when nothing later changes them. */
      nextChange: number | undefined;
      /** Rotations of the manifest and cards of the pages that could not be read. */
      skipped: number;
      /** Rotations of the manifest left out at a city's own times (an in-person event's). */
      elsewhere: number;
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
 * Reads Leek Duck's raid manifest (`manifestUrl`) and the page of each rotation in force at
 * `now` (only those: a few requests a read), in the zone of `settings.timezone`. ScrapedDuck's
 * feed is the fallback when the manifest cannot be read or is no manifest, when no regular
 * rotation is in force (none ended within a day either, `rotationsAt`), or when the page of a
 * rotation in force cannot be read or lists no boss; no shadow rotation in force is no shadow
 * bosses (Leek Duck lists them ahead). A failed download is given as the `cause`, for the
 * caller to tell an outage from a structural cause. Never rejects unless `get` was stopped,
 * which the caller tells by its own signal.
 */
export async function readRaidRotations(
  get: GetText,
  manifestUrl: string,
  zone: string,
  now: number,
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
  const inForce = rotationsAt(manifest.rotations, now);
  const nextChange = nextRotationChange(manifest.rotations, now);
  const known = { inForce, elsewhere, ...(nextChange === undefined ? {} : { nextChange }) };
  if (!inForce.some((rotation) => rotation.kind === 'regular')) {
    return { status: 'fallback', reason: noRegularRotation(elsewhere), ...known };
  }
  const read: { rotation: RaidRotation; entries: RotationEntry[] }[] = [];
  let skipped = manifest.skipped;
  for (const rotation of inForce) {
    const address = rotationAddress(manifestUrl, rotation.slug);
    let page: string;
    try {
      page = await get(address, { accept: 'text/html', maxChars: MAX_ROTATION_PAGE_CHARS });
    } catch (err) {
      const reason = `the page of ${rotation.slug} could not be read: ${messageOf(err)}`;
      return { status: 'fallback', reason, cause: err, ...known };
    }
    const { entries, skipped: cards } = parseRotationFragment(page);
    if (entries.length === 0) {
      return { status: 'fallback', reason: `the page of ${rotation.slug} lists no boss`, ...known };
    }
    skipped += cards;
    read.push({ rotation, entries });
  }
  const entries = mergeRotations(read);
  return { status: 'read', entries, inForce, nextChange, skipped, elsewhere };
}

/**
 * Leek Duck's raid manifest as the source `RaidBossService` tries before ScrapedDuck's feed
 * (plan 8B-L): its merged entries are the document `parseRaidBossFeed` reads.
 */
export function raidManifestSource(manifest: { url: string; zone: string }): FeedSource {
  return {
    name: "Leek Duck's raid manifest",
    async read(get, now) {
      const read = await readRaidRotations(get, manifest.url, manifest.zone, now);
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
      };
    },
  };
}
