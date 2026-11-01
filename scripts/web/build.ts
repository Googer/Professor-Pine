import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { build, type Plugin } from 'esbuild';
import { checkForcedDark, withForcedDark } from './forced-dark.js';

/**
 * Builds the web pages (`src/web/client/`) into `dist/web/`: the map (`assets/map-<hash>.js`
 * with Leaflet, `assets/map-<hash>.css` with Leaflet's style) and the region editor (plan 8M-2:
 * `assets/editor-<hash>.js` with Leaflet and Geoman, `assets/editor-<hash>.css` with Geoman's
 * style, an add-on of the map's beside which the map loads it when the editor is first turned on
 * (plan 8M-10), and the script of its worker, `assets/editor-worker-<hash>.js`) and the page of the
 * Wayspot export tool (plan 8W-P: `assets/userscript-<hash>.js` and `.css`), each an IIFE for
 * ES2022, minified, with Leaflet's pictures, every file named by a hash of its content so that
 * the server can let browsers keep them for good; `dist/web/assets.json` names each page's
 * script and style and the worker. The short pages' stylesheet (plan 8M-7) is `assets/page.css`
 * and the top page's script (plan 8M-14) `assets/top.js`, names without a hash, which the server
 * names without the manifest. The folder is emptied first, so no old file stays; the rest
 * of `dist/web/` is the compiled server code of `src/web/` and is left alone.
 *
 * Plan 8M-13 (S10): the map's head script `assets/theme-<hash>.js` (`theme-head.ts`, the theme
 * chosen set before the page is drawn), and the page's stylesheets with the rules of each dark
 * block added for a page forced dark (`withForcedDark`, `forced-dark.ts`); the build fails when
 * a page's built stylesheet lacks them (`checkForcedDark`, review BR-6 of the small pass).
 */

const root = path.resolve(import.meta.dirname, '../..');
const out = path.join(root, 'dist/web');
const assets = path.join(out, 'assets');
const manifest = path.join(out, 'assets.json');
const client = path.join(root, 'src/web/client');

// Only what this build makes: the compiled server code of src/web/ lives in dist/web/ too.
await rm(assets, { recursive: true, force: true });
await rm(manifest, { force: true });
await mkdir(assets, { recursive: true });

/** The page's own stylesheets, their dark blocks given their forced copies (plan 8M-13, S10). */
const forcedDark: Plugin = {
  name: 'forced-dark',
  setup(on) {
    // esbuild reads the filter as a Go regular expression, which takes no flags.
    on.onLoad({ filter: /\.css$/ }, async (file) => {
      if (path.resolve(path.dirname(file.path)) !== client) return undefined;
      return {
        contents: withForcedDark(await readFile(file.path, 'utf8')),
        loader: 'css',
        resolveDir: client,
      };
    });
  },
};

const result = await build({
  entryPoints: [
    { in: path.join(client, 'main.ts'), out: 'map' },
    { in: path.join(client, 'map.css'), out: 'map' },
    { in: path.join(client, 'theme-head.ts'), out: 'theme' },
    { in: path.join(client, 'editor.ts'), out: 'editor' },
    { in: path.join(client, 'editor.css'), out: 'editor' },
    { in: path.join(client, 'editor-worker.ts'), out: 'editor-worker' },
    { in: path.join(client, 'userscript.ts'), out: 'userscript' },
    { in: path.join(client, 'userscript.css'), out: 'userscript' },
  ],
  tsconfig: path.join(client, 'tsconfig.json'),
  // `@pine/wayspot-core` from its sources (tsconfig.json, `customConditions`).
  conditions: ['pine-source'],
  outdir: assets,
  entryNames: '[name]-[hash]',
  assetNames: '[name]-[hash]',
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: 'es2022',
  minify: true,
  charset: 'utf8',
  // Leaflet's licence (BSD-2-Clause) and Geoman's (MIT) ask for their notices: kept at the end.
  legalComments: 'eof',
  loader: { '.png': 'file', '.svg': 'file' },
  // Pictures Pine serves at their own address (plan 8M-11A: `/icons/dynamax.png`, a mask of
  // `map.css`), left as they are.
  external: ['/icons/*'],
  metafile: true,
  logLevel: 'warning',
  plugins: [forcedDark],
});

// The short pages' stylesheet (plan 8M-7: `pages.css` with `theme.css`) and the top page's
// script (plan 8M-14: `top.ts`, its Log out), under names of their own without a hash: those
// pages are answered where the manifest is not at hand (`answers.ts`, `top-page.ts`).
const pages = await build({
  entryPoints: [
    { in: path.join(client, 'pages.css'), out: 'page' },
    { in: path.join(client, 'top.ts'), out: 'top' },
  ],
  tsconfig: path.join(client, 'tsconfig.json'),
  outdir: assets,
  entryNames: '[name]',
  format: 'iife',
  platform: 'browser',
  target: 'es2022',
  bundle: true,
  minify: true,
  charset: 'utf8',
  metafile: true,
  logLevel: 'warning',
  plugins: [forcedDark],
});

const outputs = [
  ...Object.keys(result.metafile.outputs),
  ...Object.keys(pages.metafile.outputs),
].map((file) => path.basename(file));
const named = (pattern: RegExp): string => {
  const found = outputs.find((file) => pattern.test(file));
  if (found === undefined) throw new Error(`the build made no ${pattern}: ${outputs.join(', ')}`);
  return found;
};
// The unhashed files the server names by themselves: their absence is a failed build.
named(/^page\.css$/);
named(/^top\.js$/);
const files = {
  map: {
    script: named(/^map-[A-Z0-9]{8}\.js$/),
    style: named(/^map-[A-Z0-9]{8}\.css$/),
    theme: named(/^theme-[A-Z0-9]{8}\.js$/),
  },
  editor: {
    script: named(/^editor-[A-Z0-9]{8}\.js$/),
    style: named(/^editor-[A-Z0-9]{8}\.css$/),
    worker: named(/^editor-worker-[A-Z0-9]{8}\.js$/),
  },
  userscript: {
    script: named(/^userscript-[A-Z0-9]{8}\.js$/),
    style: named(/^userscript-[A-Z0-9]{8}\.css$/),
  },
};
// Each page's stylesheet must hold the forced-dark rules its sources call for (review BR-6 of the
// small pass, re-review N1): a plugin that did not run would otherwise ship a page that ignores a
// chosen Dark. Each with the sources it bundles: the editor's add-on does not import theme.css.
const styleSources: Array<[string, string[]]> = [
  [files.map.style, ['map.css', 'theme.css']],
  [files.editor.style, ['editor.css']],
  ['page.css', ['pages.css', 'theme.css']],
  [files.userscript.style, ['userscript.css', 'theme.css']],
];
for (const [style, sources] of styleSources) {
  checkForcedDark(
    style,
    await Promise.all(sources.map((file) => readFile(path.join(client, file), 'utf8'))),
    await readFile(path.join(assets, style), 'utf8'),
  );
}

await writeFile(manifest, `${JSON.stringify(files, null, 2)}\n`);

process.stdout.write(`dist/web/assets: ${outputs.join(', ')}\n`);
