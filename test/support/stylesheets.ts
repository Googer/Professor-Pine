import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * The web page's stylesheets as tests read them (plan 8M-13): a file of `src/web/client/` without
 * its comments, `theme.css`'s light values, a length worked out through them, and the body of a
 * media query.
 */

const CLIENT = path.resolve(import.meta.dirname, '../../src/web/client');

/** A stylesheet of the page's folder, its comments taken out. */
export function clientSheet(file: string): string {
  return readFileSync(path.join(CLIENT, file), 'utf8').replace(/\/\*[\s\S]*?\*\//gu, '');
}

/** The light set of `theme.css`'s custom properties (its first `:root` block), by name. */
export function themeTokens(): Map<string, string> {
  const light = /^\s*:root\s*\{([^{}]*)\}/u.exec(clientSheet('theme.css'))?.[1] ?? '';
  return new Map(
    [...light.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/gu)].map((match) => [
      match[1] ?? '',
      (match[2] ?? '').trim(),
    ]),
  );
}

/** A length of a stylesheet in pixels: `var(…)` of `values`, `calc` of + − × and brackets. */
export function cssPixels(text: string, values: ReadonlyMap<string, string>): number {
  const resolved = text
    .replace(/var\((--[a-z0-9-]+)\)/gu, (_whole, name: string) => {
      const value = values.get(name);
      if (value === undefined) throw new Error(`${name} is not in theme.css`);
      return `(${value})`;
    })
    .replace(/calc\(/gu, '(')
    .replace(/px/gu, '');
  const parts = resolved.match(/\d+(?:\.\d+)?|[-+*()]/gu) ?? [];
  let at = 0;
  const sum = (): number => {
    let total = product();
    while (parts[at] === '+' || parts[at] === '-') {
      const sign = parts[at] === '+' ? 1 : -1;
      at += 1;
      total += sign * product();
    }
    return total;
  };
  const product = (): number => {
    let total = unit();
    while (parts[at] === '*') {
      at += 1;
      total *= unit();
    }
    return total;
  };
  const unit = (): number => {
    const part = parts[at];
    at += 1;
    if (part === '-') return -unit();
    if (part === '(') {
      const inner = sum();
      at += 1;
      return inner;
    }
    return Number(part);
  };
  return sum();
}

/** The body of the first block that `start` finds the head of (an `@media`), braces counted. */
export function blockAt(css: string, start: RegExp): string {
  const found = css.search(start);
  if (found < 0) return '';
  const open = css.indexOf('{', found);
  let depth = 0;
  for (let at = open; at < css.length; at += 1) {
    if (css[at] === '{') depth += 1;
    if (css[at] === '}') depth -= 1;
    if (depth === 0) return css.slice(open + 1, at);
  }
  return '';
}

/**
 * The body of the `@media (prefers-reduced-motion: no-preference)` block whose first rules name
 * `selector` (before any other at-rule).
 */
export function motionBlock(css: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  return blockAt(
    css,
    new RegExp(
      String.raw`@media\s*\(prefers-reduced-motion:\s*no-preference\)\s*\{[^@]*?${escaped}`,
      'u',
    ),
  );
}
