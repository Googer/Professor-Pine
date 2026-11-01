import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Pine only links to Campfire, never fetches anything from it (Matt, 2026-10-28; design
 * `2026-10-28-campfire-links-design.md`, 5): Scopely Explore's terms forbid bots and scraping, and
 * Campfire's answers carry members' ids and names. No source under `src/` or `packages/` names
 * Campfire's API (its GraphQL address, or Niantic's social API behind it), so that a later change
 * cannot start reading it by accident. As `text-distances.test.ts`, it reads the files themselves.
 */

const ROOT = path.join(import.meta.dirname, '..');
const FOLDERS = ['src', 'packages'];
/** What reads Campfire's data rather than linking its pages. */
const REFUSED = /niantic-social-api|campfire\.scopely\.com\/graphql/iu;
/** Folders that are no sources of Pine's. */
const SKIPPED = new Set(['node_modules', 'dist']);
/** This guard names what it refuses. */
const SELF = path.relative(ROOT, import.meta.filename).replace(/\\/gu, '/');

/** Every file under a folder, as paths from the checkout, without the skipped folders. */
function filesUnder(folder: string): string[] {
  return readdirSync(path.join(ROOT, folder), { withFileTypes: true }).flatMap((entry) => {
    const relative = `${folder}/${entry.name}`;
    if (entry.isDirectory()) return SKIPPED.has(entry.name) ? [] : filesUnder(relative);
    return entry.isFile() && /\.(?:[cm]?[jt]s|json|html|css)$/u.test(entry.name) ? [relative] : [];
  });
}

describe('Campfire is linked, never fetched (plan 8V-1)', () => {
  it('finds the API addresses it refuses, and not the page members are sent to', () => {
    for (const text of [
      'https://campfire.scopely.com/graphql',
      'https://niantic-social-api.nianticlabs.com/graphql',
    ]) {
      expect(REFUSED.test(text), text).toBe(true);
    }
    expect(REFUSED.test('https://campfire.scopely.com/discover')).toBe(false);
  });

  it('has no source under src/ or packages/ that names them', () => {
    const files = FOLDERS.flatMap(filesUnder).filter((file) => file !== SELF);
    expect(files.length).toBeGreaterThan(100);
    const naming = files.filter((file) =>
      REFUSED.test(readFileSync(path.join(ROOT, file), 'utf8')),
    );
    expect(naming).toEqual([]);
  });
});
