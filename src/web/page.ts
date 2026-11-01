import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { COLOR_SCHEME_META, escapeHtml } from './answers.js';
import type { DistanceUnits } from '../render/distance-words.js';
import type { TileSetting } from './headers.js';

/** Where `npm run web:build` leaves the bundle, from the bot's working folder. */
export const WEB_DIST = 'dist/web';

/** The names of a page's script and style in the bundle, hashed. */
export interface PageAssets {
  script: string;
  style: string;
}

/**
 * The names of the bundle's files the pages load (`dist/web/assets.json`): the map's, and the
 * region editor's with the script of its worker (plan 8M-2), and the page of the Wayspot export
 * tool (`/userscript`, plan 8W-P). The map's `theme` is its head script (plan 8M-13, S10: the
 * theme chosen set before the page is drawn).
 */
export interface AssetManifest {
  map: PageAssets & { theme: string };
  editor: PageAssets & { worker: string };
  userscript: PageAssets;
}

/** The built bundle: its folder, served at `/assets/`, and the names the page loads. */
export interface WebAssets {
  dir: string;
  /** Undefined when the bundle was not built: the page then says so. */
  manifest: AssetManifest | undefined;
}

/** A name esbuild gave a hash (`[name]-[hash]`): its content never changes under it. */
export const HASHED_NAME = /-[A-Z0-9]{8}\.[a-z0-9]+$/;

const isText = (value: unknown): value is string => typeof value === 'string';

/** A page's names from the manifest as read, or undefined when they are not all there. */
function pageAssets(value: unknown): PageAssets | undefined {
  const page = value as Partial<PageAssets> | undefined;
  return page && isText(page.script) && isText(page.style)
    ? { script: page.script, style: page.style }
    : undefined;
}

/**
 * The bundle as the build left it: `dist/web/assets` and the names in `dist/web/assets.json`.
 * Without the manifest (not built, or built by an older build) the folder is still given, and
 * the manifest is undefined.
 */
export async function readAssets(root = WEB_DIST): Promise<WebAssets> {
  const dir = path.resolve(root, 'assets');
  try {
    const read = JSON.parse(await readFile(path.join(root, 'assets.json'), 'utf8')) as {
      map?: { theme?: unknown };
      editor?: { worker?: unknown };
      userscript?: unknown;
    };
    const map = pageAssets(read.map);
    const editor = pageAssets(read.editor);
    const worker = read.editor?.worker;
    const theme = read.map?.theme;
    const userscript = pageAssets(read.userscript);
    if (!map || !editor || !userscript || !isText(worker) || !isText(theme)) {
      return { dir, manifest: undefined };
    }
    return { dir, manifest: { map: { ...map, theme }, editor: { ...editor, worker }, userscript } };
  } catch {
    return { dir, manifest: undefined };
  }
}

/** What the map page is told: in `data-` attributes of `<body>`, escaped. */
export interface MapPageData {
  guildId: string;
  /** The tiles the page offers (`shownTiles`): Google's only with a browser key. */
  tiles: TileSetting;
  /** The browser key, only with Google's tiles. */
  googleKey?: string;
  /** How a member logs in: with Discord, or only through the links of `/maps`. */
  login: 'discord' | 'links';
  /** The units the pages say distances in (`settings.distanceUnits`, task 7; the editor's too, review fix 8). */
  distanceUnits?: DistanceUnits;
}

/** The `data-` attributes of a page's `<body>`, escaped. */
function bodyAttributes(data: MapPageData, more: readonly string[] = []): string {
  return [
    `data-guild="${escapeHtml(data.guildId)}"`,
    `data-tiles="${data.tiles}"`,
    ...(data.tiles === 'google' && data.googleKey !== undefined
      ? [`data-google-key="${escapeHtml(data.googleKey)}"`]
      : []),
    `data-login="${data.login}"`,
    ...(data.distanceUnits === undefined ? [] : [`data-distance-units="${data.distanceUnits}"`]),
    ...more,
  ].join(' ');
}

/**
 * The head of a page: its title, its style and its script, nothing inline; first the head script
 * of a page with a theme to choose (`theme`, plan 8M-13, S10), neither deferred nor async, so
 * that the choice is set before anything is drawn.
 */
function head(title: string, assets: PageAssets & { theme?: string }): string[] {
  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    COLOR_SCHEME_META,
    ...(assets.theme === undefined
      ? []
      : [`<script src="/assets/${escapeHtml(assets.theme)}"></script>`]),
    `<title>${escapeHtml(title)}</title>`,
    `<link rel="stylesheet" href="/assets/${escapeHtml(assets.style)}">`,
    `<script src="/assets/${escapeHtml(assets.script)}" defer></script>`,
    '</head>',
  ];
}

/**
 * The map page (spec 3.1): a static template that loads the bundle's script and style, with
 * nothing inline (the CSP allows no inline style, and no inline script but a login link page's
 * own, by its hash); what the page needs to know is in
 * `data-` attributes of `<body>`, escaped. The script builds everything else; the side panel
 * (`#parties`: the list of what is on, plan 8M-7, with the phone's "List" button) for everybody, and
 * the line that the parties are read-only (`#read-only`), apart from the moment's news
 * (`#notice`, over the top of the map with its × since plan 8M-11A) so that neither takes the
 * other's place.
 *
 * The region editor is on the map (plan 8M-10): its script, style and worker are named in
 * `data-editor-script`, `data-editor-style` and `data-worker` (files of Pine's: the CSP's
 * `'self'` lets them in), loaded only when it is first turned on, and its places are hidden hosts
 * (`.editor-only`): its tools beside the layers' row, led by "Back to the map", its own map and
 * its panel in the places of the map and the side pane.
 */
export function mapPage(data: MapPageData, assets: AssetManifest): string {
  const editor = [
    `data-editor-script="/assets/${escapeHtml(assets.editor.script)}"`,
    `data-editor-style="/assets/${escapeHtml(assets.editor.style)}"`,
    `data-worker="/assets/${escapeHtml(assets.editor.worker)}"`,
  ];
  return [
    ...head('Professor Pine: map', assets.map),
    `<body ${bodyAttributes(data, editor)}>`,
    // Narrower than 768 pixels the title is "Pine" (`map.css`, fix round 1).
    '<header id="header"><span class="title"><span class="title-first">Professor </span>Pine</span>',
    '<nav id="layers" aria-label="Layers"></nav>' +
      '<div id="editor-bar" class="editor-only" hidden>' +
      '<button id="editor-back" type="button">Back to the map</button>' +
      '<span id="editor-tools"></span></div>',
    '<button id="list-button" class="list-button" type="button">List</button>',
    '<button id="search-button" class="search-button" type="button" aria-controls="filter" aria-expanded="false">Find</button>',
    // The Report button (plan 8M-9A), shown by the script to a member who may report; on a phone
    // it floats over the map instead (map.css), so that this row stays one row.
    '<button id="report-button" class="report-button" type="button" aria-haspopup="dialog" hidden>Report</button>',
    '<input id="filter" type="search" placeholder="Find a gym" aria-label="Find a gym">',
    '<span id="account"></span></header>',
    '<p id="read-only" role="status" hidden></p>',
    // The notice band (plan 8M-11A) over the top of the map (`map.css`), with its ×.
    '<div id="content"><div id="notice" role="status" hidden><span id="notice-text"></span>' +
      '<button id="notice-close" type="button" aria-label="Hide this line">×</button></div>' +
      '<main id="map" aria-label="Map"></main>' +
      '<aside id="parties" aria-label="What\'s going on" hidden></aside>' +
      '<div id="editor-map" class="editor-only" role="region" aria-label="Map of the regions" hidden></div>' +
      '<aside id="editor-panel" class="editor-only" aria-label="Regions" hidden></aside></div>',
    '<noscript><p>The map needs JavaScript.</p></noscript>',
    '</body>',
    '</html>',
  ].join('\n');
}
