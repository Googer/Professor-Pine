import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { clientSheet } from '../../test/support/stylesheets.js';

/**
 * A train's number on its stop takes no tap (Matt, 2026-10-30): it lies above every marker and
 * dot, and a tap goes through to what is under it. Read from Leaflet's stylesheet and the page's,
 * as the browser reads them: each part's `pointer-events` by the cascade (specificity, then order,
 * else inherited).
 */

/** Leaflet's stylesheet, which `map.css` imports first. */
const LEAFLET = readFileSync(
  createRequire(import.meta.url).resolve('leaflet/dist/leaflet.css'),
  'utf8',
).replace(/\/\*[\s\S]*?\*\//gu, '');

/** A rule outside any at-rule: its selectors, its declarations by name, its place. */
interface Rule {
  selectors: string[];
  declarations: Map<string, string>;
  order: number;
}

/** The classes of a number's parts and of what holds them, which the tests judge. */
const CHAIN_CLASSES = [
  'train-badge',
  'number',
  'leaflet-marker-icon',
  'leaflet-interactive',
  'leaflet-train-badges-pane',
];

/** The tags of a number's parts and of what holds them (a selector needing another skips them). */
const CHAIN_TAGS = new Set(['html', 'body', 'div', 'span']);

/** A rule's head parted into its selectors, a comma inside brackets (`:not(a, b)`) kept. */
function selectorList(head: string): string[] {
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
  return parts.map((selector) => selector.trim());
}

/**
 * Whether a selector this reading cannot follow might reach a part of the badge: it names one of
 * their classes, and every tag it names is one of theirs (`svg path.leaflet-interactive` is not).
 */
function mightReach(selector: string): boolean {
  const tags = selector.replace(/\[[^\]]*\]|\([^)]*\)/gu, '').match(/(?<![\w.#:-])[a-z][\w-]*/giu);
  if (tags?.some((tag) => !CHAIN_TAGS.has(tag.toLowerCase()))) return false;
  return CHAIN_CLASSES.some((name) =>
    new RegExp(String.raw`\.${name}(?![\w-])`, 'u').test(selector),
  );
}

/**
 * The top-level rules of stylesheets in the order the page loads them. A rule this reading
 * cannot follow (inside an at-rule, or a selector of more than classes) that sets
 * `pointer-events` and might reach a part of the badge throws (re-review N2): the reading would
 * otherwise pass it over and judge the taps without it.
 */
function topRules(...sheets: string[]): Rule[] {
  const rules: Rule[] = [];
  const unread: string[] = [];
  const read = (css: string, inAtRule: boolean): void => {
    let at = 0;
    while (at < css.length) {
      const open = css.indexOf('{', at);
      if (open < 0) break;
      const head = css
        .slice(at, open)
        .replace(/@import[^;]*;/gu, '')
        .trim();
      let depth = 0;
      let close = open;
      for (; close < css.length; close += 1) {
        if (css[close] === '{') depth += 1;
        if (css[close] === '}') depth -= 1;
        if (depth === 0) break;
      }
      const body = css.slice(open + 1, close);
      if (head.startsWith('@')) {
        read(body, true);
      } else {
        const declarations = new Map<string, string>();
        for (const part of body.split(';')) {
          const colon = part.indexOf(':');
          if (colon > 0)
            declarations.set(part.slice(0, colon).trim(), part.slice(colon + 1).trim());
        }
        const selectors = selectorList(head);
        if (declarations.has('pointer-events')) {
          for (const selector of selectors) {
            const followed = selector.split(/\s+/u).every((token) => compound(token) !== undefined);
            if ((inAtRule || !followed) && mightReach(selector)) unread.push(selector);
          }
        }
        if (!inAtRule) rules.push({ selectors, declarations, order: rules.length });
      }
      at = close + 1;
    }
  };
  for (const css of sheets) read(css, false);
  if (unread.length > 0) {
    throw new Error(`rules this reading cannot follow set pointer-events: ${unread.join(' | ')}`);
  }
  return rules;
}

/** An element as a selector of classes sees it: its classes. */
interface Part {
  classes: readonly string[];
}

/** A compound of classes; undefined for anything else (tags, `>`, `:not`, a pseudo-element). */
function compound(token: string): Part | undefined {
  const found = /^((?:\.[\w-]+)+)$/u.exec(token);
  if (!found) return undefined;
  return { classes: (found[1] ?? '').slice(1).split('.') };
}

/** The specificity of a selector of compounds: its classes. */
function specificity(selector: Part[]): number {
  return selector.reduce((sum, part) => sum + part.classes.length * 100, 0);
}

/** Whether a selector of compounds with descendant combinators matches the chain's last part. */
function matches(selector: Part[], chain: readonly Part[]): boolean {
  const fits = (part: Part, element: Part) =>
    part.classes.every((name) => element.classes.includes(name));
  const last = selector.at(-1);
  const self = chain.at(-1);
  if (!last || !self || !fits(last, self)) return false;
  // The ancestors of the element.
  let at = chain.length - 2;
  for (let index = selector.length - 2; index >= 0; index -= 1) {
    const part = selector[index];
    while (at >= 0 && !(part && fits(part, chain[at] ?? { classes: [] }))) at -= 1;
    if (at < 0) return false;
    at -= 1;
  }
  return true;
}

/** A property of the chain's last part by the cascade, inherited from its parent if `inherits`. */
function computed(
  rules: readonly Rule[],
  chain: readonly Part[],
  property: string,
  inherits: boolean,
): string | undefined {
  let best: { weight: number; order: number; value: string } | undefined;
  for (const rule of rules) {
    const value = rule.declarations.get(property);
    if (value === undefined) continue;
    for (const text of rule.selectors) {
      const parts = text.split(/\s+/u).map(compound);
      if (parts.some((part) => part === undefined)) continue;
      const selector = parts as Part[];
      if (!matches(selector, chain)) continue;
      const weight = specificity(selector);
      if (!best || weight > best.weight || (weight === best.weight && rule.order > best.order)) {
        best = { weight, order: rule.order, value };
      }
    }
  }
  if (best) return best.value;
  return inherits && chain.length > 1
    ? computed(rules, chain.slice(0, -1), property, inherits)
    : undefined;
}

/** Whether the part takes the pointer: `pointer-events` other than `none`, inherited. */
const takesPointer = (rules: readonly Rule[], chain: readonly Part[]): boolean =>
  (computed(rules, chain, 'pointer-events', true) ?? 'auto') !== 'none';

describe("a train's number takes no tap (Matt, 2026-10-30)", () => {
  it('reads the cascade as the browser does', () => {
    const rules = topRules('.a { pointer-events: none; }', '.a.b { pointer-events: auto; }');
    expect(takesPointer(rules, [{ classes: ['a'] }])).toBe(false);
    expect(takesPointer(rules, [{ classes: ['a', 'b'] }])).toBe(true);
    // Inherited by a child that no rule names.
    expect(takesPointer(rules, [{ classes: ['a'] }, { classes: ['c'] }])).toBe(false);
  });

  // Re-review N2: a rule it cannot read that could change whether the badge takes a tap is
  // refused, never passed over: one in an at-rule, or with a selector of more than classes.
  it('refuses a rule it cannot read that sets pointer-events on a part of the badge', () => {
    expect(() =>
      topRules('@media (hover: none) { .train-badge .number { pointer-events: none; } }'),
    ).toThrow(/train-badge/u);
    expect(() => topRules('#map .leaflet-marker-icon { pointer-events: auto; }')).toThrow(
      /leaflet-marker-icon/u,
    );
    expect(() => topRules('div > .number { pointer-events: none; }')).toThrow(/number/u);
    expect(() =>
      topRules(".train-badge:not([data-x='1']) .number { pointer-events: none; }"),
    ).toThrow(/number/u);
    // What cannot reach the badge's parts is let be: another element's tag, another class, a
    // property other than pointer-events.
    expect(() =>
      topRules(
        '.leaflet-pane > svg path.leaflet-interactive { pointer-events: auto; }',
        '@media print { .leaflet-control { pointer-events: none; } }',
        '@media (x) { .train-badge { color: red; } }',
      ),
    ).not.toThrow();
  });

  /** Whether the number's box or the number takes a tap, on the numbers' pane. */
  const partsTaking = (marked: string[]) => {
    const rules = topRules(LEAFLET, clientSheet('map.css'));
    const box = [
      { classes: ['leaflet-container'] },
      { classes: ['leaflet-pane', 'leaflet-map-pane'] },
      { classes: ['leaflet-pane', 'leaflet-train-badges-pane'] },
      { classes: ['leaflet-marker-icon', 'train-badge', ...marked] },
    ];
    const number = [...box, { classes: ['number'] }];
    return { box: takesPointer(rules, box), number: takesPointer(rules, number) };
  };

  it('takes no tap on its number or its box', () => {
    expect(partsTaking([])).toEqual({ box: false, number: false });
  });

  // No rule of the page gives it taps back, were Leaflet ever to mark it.
  it('takes none though it were marked interactive', () => {
    expect(partsTaking(['leaflet-interactive'])).toEqual({ box: false, number: false });
  });
});
