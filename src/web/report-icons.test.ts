import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { GIGANTAMAX_ICON, ICON_PATH, REPORT_ICONS } from './client/report-icons.js';
import { ICON_PATH as SERVED_AT } from './server.js';
import { pictureOrigins } from './headers.js';

/**
 * The Report menu's icons (plan 8M-9A, A8): the game's own where they fit, by an address pinned to
 * one commit of PokeMiners' pogo_assets on a host the page may load pictures from already (no new
 * origin in the Content Security Policy), else Pine's own drawing. Here, outside
 * `src/web/client/`, since the policy's origins are the server's.
 */
describe("the Report menu's icons", () => {
  it("are pinned to a commit of pogo_assets on an origin the page may load, Pine's own, or drawn by Pine", () => {
    const origins = pictureOrigins('https://pine.example');
    for (const [kind, icon] of Object.entries(REPORT_ICONS)) {
      if (icon.kind === 'shape') {
        expect(icon.elements.length, kind).toBeGreaterThan(0);
        continue;
      }
      // Pine's own (plan 8M-11A: the game's Dynamax icon, kept as `pictures/icons/`), of the
      // page's own origin: the policy's `'self'`.
      if (icon.src.startsWith('/')) {
        expect(icon.src, kind).toMatch(/^\/icons\/[\w-]+\.png$/u);
        continue;
      }
      // A picture, or a picture drawn as a mask (plan 8M-9B, B17).
      expect(icon.src, kind).toMatch(
        /^https:\/\/raw\.githubusercontent\.com\/PokeMiners\/pogo_assets\/[0-9a-f]{40}\/Images\/[^?#]+\.(?:png|svg)$/u,
      );
      expect(origins, kind).toContain(new URL(icon.src).origin);
    }
  });

  // Plan 8M-11A (S14, Matt 2026-10-28): the game's where it has one, Pine's own train otherwise.
  it("are the game's raid head, Dynamax icon, quest symbol, R, Campfire Poké Ball and calendar, and Pine's train", () => {
    expect(
      Object.fromEntries(Object.entries(REPORT_ICONS).map(([kind, icon]) => [kind, icon.kind])),
    ).toEqual({
      raid: 'picture',
      max: 'mask',
      research: 'mask',
      rocket: 'picture',
      spawn: 'mask',
      train: 'shape',
      meetup: 'mask',
    });
    expect(REPORT_ICONS.max).toMatchObject({ src: '/icons/dynamax.png' });
    expect(GIGANTAMAX_ICON).toMatchObject({ kind: 'mask', src: '/icons/gigantamax.png' });
    expect(ICON_PATH).toBe(SERVED_AT);
    expect(REPORT_ICONS.spawn).toMatchObject({
      src: expect.stringMatching(
        /\/Images\/Campfire\/Menu%20Icons\/pokeball\.53b7f974309c231f1fe98c2a66de6e91\.svg$/u,
      ) as string,
    });
    expect(REPORT_ICONS.meetup).toMatchObject({
      src: expect.stringMatching(/\/Images\/Menu%20Icons\/calendar_icon\.png$/u) as string,
    });
    // The train C3b as the design gives it: its own 48-unit drawing, strokes and holes kept.
    expect(REPORT_ICONS.train).toMatchObject({
      kind: 'shape',
      viewBox: '0 0 48 48',
      attributes: { fill: 'none', stroke: 'currentColor', 'stroke-width': '4' },
    });
  });

  it("are the game's quest symbol and Team GO Rocket's R for reports at stops (plan 8M-9B, B17)", () => {
    expect(REPORT_ICONS.research).toMatchObject({
      src: expect.stringMatching(/\/Images\/Quests\/QuestSymbol\.png$/u) as string,
    });
    expect(REPORT_ICONS.rocket).toMatchObject({
      src: expect.stringMatching(/\/Images\/Rocket\/teamrocket_r\.png$/u) as string,
    });
  });

  // Review F5: drawn as a mask wherever the icon is, the popups and phone cards too, by the
  // stylesheet alone (no script sets it): never a solid block.
  it("draws every mask from the stylesheet, at its icon's address", () => {
    const css = readFileSync(path.join(import.meta.dirname, 'client', 'map.css'), 'utf8');
    for (const icon of [...Object.values(REPORT_ICONS), GIGANTAMAX_ICON]) {
      if (icon.kind !== 'mask') continue;
      const rule =
        new RegExp(`\\.report-icon\\.mask-${icon.name}\\s*\\{([^}]*)\\}`, 'u').exec(css)?.[1] ?? '';
      for (const name of ['mask-image', '-webkit-mask-image']) {
        expect(rule, `${icon.name} ${name}`).toContain(`${name}: url('${icon.src}')`);
      }
    }
  });

  // Plan 8M-11A (S14, Matt): in dark, the light halo blew the masks, the train and the white raid
  // head out: no outline on them there.
  it('draws no outline in dark on the masks and the light pictures, and none on the train at all', () => {
    const css = readFileSync(path.join(import.meta.dirname, 'client', 'map.css'), 'utf8');
    const dark = [...css.matchAll(/@media \(prefers-color-scheme: dark\) \{([^@]*?)\n\}/gu)]
      .map((match) => match[1] ?? '')
      .join('\n');
    // Where the page is not forced light; the build adds the rule for a page forced dark (plan
    // 8M-13, S10).
    expect(dark).toMatch(
      /:root:not\(\[data-theme='light'\]\) \.report-icon\.mask,\s*:root:not\(\[data-theme='light'\]\) \.report-icon\.light \{\s*filter: none;/u,
    );
    // Matt, 2026-10-28 (fix round 1): the train without the halo in light too.
    const outside = css.replace(/@media[^{]*\{[\s\S]*?\n\}/gu, '');
    expect(outside).toMatch(/\.report-icon\.shape-train \{[^}]*filter: none;/u);
    expect(REPORT_ICONS.raid).toMatchObject({ kind: 'picture', light: true });
  });
});
