import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { POST_ACCENTS } from '../domain/web/party-data.js';

/**
 * The edge of a party's post on the map (plan 8M-8A): every accent the server names
 * (`accentName`) is a value of `theme.css` in its light and dark sets, drawn by a rule of
 * `map.css`. Here, beside `raid-marker-tiers.test.ts`, outside the client's type check.
 */
describe("a post's edge on the map", () => {
  it('has a value of theme.css in both sets and a rule of map.css for every accent', () => {
    const client = path.resolve(import.meta.dirname, 'client');
    const theme = readFileSync(path.join(client, 'theme.css'), 'utf8');
    const map = readFileSync(path.join(client, 'map.css'), 'utf8');
    for (const accent of POST_ACCENTS) {
      expect(theme.split(`--accent-${accent}:`).length - 1, accent).toBe(2);
      expect(map, accent).toMatch(
        new RegExp(
          String.raw`\.post\.accent-${accent}\)[^{]*\{[^}]*var\(--accent-${accent}\)`,
          'u',
        ),
      );
    }
  });
});
