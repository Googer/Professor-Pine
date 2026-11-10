/**
 * The page's dark rules for a page forced dark (plan 8M-13, S10). Each dark block of the page's
 * stylesheets is written once, as
 * `@media (prefers-color-scheme: dark) { :root:not([data-theme='light']) … { … } }`: dark where
 * the device is and the member did not choose Light. The build adds, right after each such block,
 * the same rules for `:root[data-theme='dark']` outside the query: dark wherever the member chose
 * Dark. One source per block; a rule of such a block that a forced Light would not turn off is
 * refused, so that a block of the old shape cannot slip through. Not `light-dark()`: `ThemeWatch`
 * reads the tokens through `getComputedStyle`, which would hand Leaflet that text unresolved.
 */

/** The prefix of every selector of a dark block in the sources. */
export const NOT_FORCED_LIGHT = ":root:not([data-theme='light'])";

/** The prefix of the same rules for a page forced dark, which the build adds. */
export const FORCED_DARK = ":root[data-theme='dark']";

const DARK_MEDIA = /@media\s*\(prefers-color-scheme:\s*dark\)\s*\{/gu;

/** The index of the brace that closes the block opened at `open`. */
function closing(css: string, open: number): number {
  let depth = 0;
  for (let at = open; at < css.length; at += 1) {
    if (css[at] === '{') depth += 1;
    if (css[at] === '}') {
      depth -= 1;
      if (depth === 0) return at;
    }
  }
  throw new Error('a dark block is not closed');
}

/** A dark block's rules for a page forced dark; a selector without the prefix is refused. */
function forcedRules(body: string): string {
  const rules = [...body.replace(/\/\*[\s\S]*?\*\//gu, '').matchAll(/([^{}]+)\{([^{}]*)\}/gu)];
  return rules
    .map((rule) => {
      const selectors = (rule[1] ?? '').split(',').map((one) => one.trim());
      const forced = selectors.map((selector) => {
        if (!selector.startsWith(NOT_FORCED_LIGHT)) {
          throw new Error(
            `a dark rule's selector must start with ${NOT_FORCED_LIGHT}, as a forced Light ` +
              `turns it off: ${selector}`,
          );
        }
        return FORCED_DARK + selector.slice(NOT_FORCED_LIGHT.length);
      });
      return `${forced.join(',\n')} {${rule[2] ?? ''}}`;
    })
    .join('\n\n');
}

/** The two prefixes with their quotes taken out, as the selectors are compared. */
const NOT_LIGHT_BARE = NOT_FORCED_LIGHT.replaceAll("'", '');
const FORCED_BARE = FORCED_DARK.replaceAll("'", '');

/**
 * Every rule of a stylesheet (inside an at-rule too) as one selector and its declarations, each
 * selector of a list apart, comments out, quotes dropped from selectors and white space made one,
 * so that the source's and the minifier's forms compare.
 */
function selectorsOf(css: string): string[] {
  const rules = [...css.replace(/\/\*[\s\S]*?\*\//gu, '').matchAll(/([^{}]+)\{([^{}]*)\}/gu)];
  return rules.flatMap((rule) => {
    const head = (rule[1] ?? '').trim();
    const body = (rule[2] ?? '').replace(/\s+/gu, ' ').replace(/;\s*$/u, '').trim();
    return headSelectors(head).map((selector) => `${selector} {${body}}`);
  });
}

/** The selectors of a rule's head, quotes dropped, white space made one. */
function headSelectors(head: string): string[] {
  // Commas inside brackets (`:not(a, b)`) do not part selectors.
  const parts: string[] = [];
  let depth = 0;
  let from = 0;
  for (let at = 0; at < head.length; at += 1) {
    if (head[at] === '(' || head[at] === '[') depth += 1;
    if (head[at] === ')' || head[at] === ']') depth -= 1;
    if (head[at] === ',' && depth === 0) {
      parts.push(head.slice(from, at));
      from = at + 1;
    }
  }
  parts.push(head.slice(from));
  return parts.map((part) => part.replace(/['"]/gu, '').replace(/\s+/gu, ' ').trim());
}

/**
 * Throws when a built stylesheet lacks the forced copies its sources call for (review BR-6 of the
 * small pass, re-review N1): when any source holds a dark block, the built text must hold dark
 * rules (`:root:not([data-theme='light']) … { … }`), and for each of them its forced twin, the
 * same selector after `:root[data-theme='dark']` with the same declarations. Paired, not
 * counted: a forced rule a source writes by hand (`map.css`'s `color-scheme`) stands in for no
 * missing copy, though its selector may be a copy's. Run by the build on each page's stylesheet, so
 * that a plugin that did not run (a path it did not know) fails the build instead of shipping a
 * page that ignores a chosen Dark.
 */
export function checkForcedDark(name: string, sources: readonly string[], built: string): void {
  if (!sources.some((css) => new RegExp(DARK_MEDIA.source, 'u').test(css))) return;
  const rules = selectorsOf(built);
  const forced = new Set(
    rules.filter((one) => one.startsWith(FORCED_BARE)).map((one) => one.slice(FORCED_BARE.length)),
  );
  const dark = rules
    .filter((one) => one.startsWith(NOT_LIGHT_BARE))
    .map((one) => one.slice(NOT_LIGHT_BARE.length));
  const missing = dark.filter((rest) => !forced.has(rest));
  if (dark.length === 0 || missing.length > 0) {
    const named = missing.map((rest) => `"${NOT_FORCED_LIGHT}${rest.slice(0, rest.indexOf('{'))}"`);
    throw new Error(
      `${name} was built without its rules for a page forced dark (${FORCED_DARK} missing for ` +
        `${named.length === 0 ? 'every dark block' : named.join(', ')}): the forced-dark plugin ` +
        'did not run on its stylesheets',
    );
  }
}

/** A stylesheet with the rules for a page forced dark added after each of its dark blocks. */
export function withForcedDark(css: string): string {
  let built = '';
  let from = 0;
  for (const match of css.matchAll(DARK_MEDIA)) {
    const open = match.index + match[0].length - 1;
    const end = closing(css, open);
    built += `${css.slice(from, end + 1)}\n\n/* The same, for a page forced dark (built). */\n`;
    built += forcedRules(css.slice(open + 1, end));
    from = end + 1;
  }
  return built + css.slice(from);
}
