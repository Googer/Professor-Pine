import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { EDITOR_MEDIA } from './client/editor-media.js';

/** A rule of a stylesheet: its selectors, its declarations, and the `@media` it is under. */
interface Rule {
  selectors: string[];
  declarations: Map<string, string>;
  media: string | undefined;
}

/** The rules of a stylesheet, comments aside, one level of `@media` deep. */
function rulesOf(css: string): Rule[] {
  const text = css.replace(/\/\*[\s\S]*?\*\//gu, '');
  const rules: Rule[] = [];
  const read = (part: string, media: string | undefined) => {
    let at = 0;
    while (at < part.length) {
      const open = part.indexOf('{', at);
      if (open < 0) break;
      const head = part.slice(at, open).trim();
      let depth = 1;
      let close = open + 1;
      for (; close < part.length && depth > 0; close += 1) {
        if (part[close] === '{') depth += 1;
        else if (part[close] === '}') depth -= 1;
      }
      const body = part.slice(open + 1, close - 1);
      if (head.startsWith('@media')) read(body, head.slice('@media'.length).trim());
      else if (!head.startsWith('@')) {
        rules.push({
          selectors: head.split(',').map((selector) => selector.trim().replace(/\s+/gu, ' ')),
          declarations: new Map(
            body
              .split(';')
              .map((line) => line.split(':').map((side) => side.trim()))
              .filter((pair): pair is [string, string] => pair.length === 2 && pair[0] !== '')
              .map(([name, value]) => [name, value]),
          ),
          media,
        });
      }
      at = close;
    }
  };
  read(text, undefined);
  return rules;
}

/** What the rules say of a property for a selector, the last that says it winning. */
function shown(rules: Rule[], selector: string, property: string, phone: boolean) {
  let value: string | undefined;
  for (const rule of rules) {
    if (rule.media !== undefined && !(phone && rule.media === '(max-width: 767px)')) continue;
    if (!rule.selectors.includes(selector)) continue;
    value = rule.declarations.get(property) ?? value;
  }
  return value;
}

describe("the header's login on a phone (8M-7 review fix 4)", () => {
  const rules = rulesOf(
    readFileSync(path.resolve(import.meta.dirname, 'client', 'map.css'), 'utf8'),
  );

  it('says "Log in with Discord" on a wide screen and "Log in" below 768 pixels', () => {
    expect(shown(rules, '#account a.login .short', 'display', false)).toBe('none');
    expect(shown(rules, '#account a.login .full', 'display', false)).toBeUndefined();
    expect(shown(rules, '#account a.login .full', 'display', true)).toBe('none');
    expect(shown(rules, '#account a.login .short', 'display', true)).toBe('inline');
  });

  it('takes less room on a phone, as the header buttons beside it do', () => {
    expect(shown(rules, '#account a.login', 'padding', true)).toBe(
      shown(rules, '.list-button', 'padding', true),
    );
  });
});

/** Whether a media query of the stylesheet's (widths only) holds at a window this wide. */
function holds(media: string, width: number): boolean {
  return media.split(' and ').every((part) => {
    const found = /\((min|max)-width: (\d+)px\)/u.exec(part);
    if (!found) return false;
    const limit = Number(found[2]);
    return found[1] === 'min' ? width >= limit : width <= limit;
  });
}

/** What the rules say of a property for a selector at a window this wide, the last winning. */
function shownAt(rules: Rule[], selector: string, property: string, width: number) {
  let value: string | undefined;
  for (const rule of rules) {
    if (rule.media !== undefined && !holds(rule.media, width)) continue;
    if (!rule.selectors.includes(selector)) continue;
    value = rule.declarations.get(property) ?? value;
  }
  return value;
}

// Plan 8M-9B (B7, provisional): five live toggles need the room of 1024 pixels.
describe("the layers' controls by the window's width", () => {
  const rules = rulesOf(
    readFileSync(path.resolve(import.meta.dirname, 'client', 'map.css'), 'utf8'),
  );

  it('are "Layers · n" and its sheet up to 1023 pixels, the row of toggles from 1024', () => {
    for (const width of [375, 768, 1023]) {
      expect(shownAt(rules, '#layers .chips', 'display', width), String(width)).toBe('none');
      expect(shownAt(rules, '.layers-button', 'display', width), String(width)).toBe(
        'inline-block',
      );
    }
    for (const width of [1024, 1280]) {
      expect(shownAt(rules, '#layers .chips', 'display', width), String(width)).toBe('flex');
      expect(shownAt(rules, '.layers-button', 'display', width), String(width)).toBe('none');
    }
  });
});

// Plan 8M-9A (A7): the header's row stays one row on a phone; the Report button floats there.
describe('the Report button on a wide screen and on a phone', () => {
  const rules = rulesOf(
    readFileSync(path.resolve(import.meta.dirname, 'client', 'map.css'), 'utf8'),
  );

  it('is in the header on a wide screen, over the map on a phone', () => {
    expect(shown(rules, '#report-button', 'display', true)).toBe('none');
    expect(shown(rules, '#report-button', 'display', false)).toBeUndefined();
    expect(shown(rules, '.report-control', 'display', false)).toBe('none');
    expect(shown(rules, '.report-control', 'display', true)).toBe('block');
    // The list's own line, on a phone alone, while the list is shown in place of the map.
    expect(shown(rules, '.report-line', 'display', false)).toBe('none');
    expect(shown(rules, 'body.list-open .report-line:not([hidden])', 'display', true)).toBe(
      'block',
    );
  });

  // Review B2: a rule that shows the line must not show it while it is hidden.
  it("leaves the phone list's line hidden while Report is not offered", () => {
    expect(shown(rules, 'body.list-open .report-line', 'display', true)).toBeUndefined();
  });
});

// Branch review BR-2 of 8M-11B: "Join the server on Discord" fits a phone's header.
describe("the server's invite in the header on a phone", () => {
  const rules = rulesOf(
    readFileSync(path.resolve(import.meta.dirname, 'client', 'map.css'), 'utf8'),
  );

  it('wraps onto its own line under the not-a-member line, as small as the login', () => {
    // On a wide screen it stays one line beside the line, as the header's controls do.
    expect(shown(rules, '#account a.invite', 'white-space', false)).toBeUndefined();
    expect(shown(rules, '#account a.invite', 'flex-basis', false)).toBeUndefined();
    expect(shown(rules, '#account a.invite', 'white-space', true)).toBe('normal');
    expect(shown(rules, '#account a.invite', 'padding', true)).toBe(
      shown(rules, '#account a.login', 'padding', true),
    );
  });

  // Plan 8M-13 (I1): the line and the button stacked, both at the left, the button its own width.
  it('stacks the line and the button at the left, the button as wide as its words', () => {
    // The line takes its row (it did), so the button starts the next; there it keeps its width
    // and is pushed to the left.
    expect(shown(rules, '#account .line', 'flex-basis', true)).toBe('100%');
    expect(shown(rules, '#account a.invite', 'flex-basis', true)).toBeUndefined();
    expect(shown(rules, '#account a.invite', 'margin-right', true)).toBe('auto');
    expect(shown(rules, '#account a.invite', 'text-align', true)).toBe('left');
    expect(shown(rules, '#account:has(a.invite) .line', 'text-align', true)).toBe('left');
    // A wide screen keeps its header.
    expect(shown(rules, '#account:has(a.invite) .line', 'text-align', false)).toBeUndefined();
    expect(shown(rules, '#account a.invite', 'margin-right', false)).toBeUndefined();
  });
});

// Matt, 2026-11-07: "History" and "Your history" are links among the menu's buttons; they look
// the same, on the map and on the history pages alike.
describe("the account menu's links", () => {
  for (const sheet of ['map.css', 'history.css']) {
    const rules = rulesOf(readFileSync(path.resolve(import.meta.dirname, 'client', sheet), 'utf8'));

    it(`center their words and darken under the pointer as its buttons do (${sheet})`, () => {
      expect(shown(rules, '.account-menu .menu a', 'text-align', false)).toBe('center');
      expect(shown(rules, '#account .menu a:hover', 'background', false)).toBe(
        shown(rules, '#account button:hover', 'background', false),
      );
    });

    it(`draws the page you are on as the chosen theme is drawn (${sheet})`, () => {
      const current = "#account .menu a[aria-current='page']";
      const chosen = '#account .theme-choice .theme-option.chosen';
      for (const property of ['background', 'color']) {
        expect(shown(rules, current, property, false), property).toBe(
          shown(rules, chosen, property, false),
        );
      }
    });
  }
});

// Plan 8M-11C, S29: "Edit regions" by one rule, a mouse and 1024 pixels, the stylesheet's query
// the very one the page asks (`EDITOR_MEDIA`).
// The history pages' menu has the item too (Matt, 2026-11-07), by the same rule.
describe('"Edit regions" in the account menu', () => {
  for (const sheet of ['map.css', 'history.css']) {
    const rules = rulesOf(readFileSync(path.resolve(import.meta.dirname, 'client', sheet), 'utf8'));
    const item = rules.filter((rule) => rule.selectors.includes('.account-menu .edit-regions'));

    it(`is hidden but where the page offers the editor, by its own query (${sheet})`, () => {
      expect(
        item
          .filter((rule) => rule.media === undefined)
          .map((rule) => rule.declarations.get('display')),
      ).toEqual(['none']);
      const shownBy = item.filter((rule) => rule.media !== undefined);
      expect(shownBy.map((rule) => rule.media)).toEqual([EDITOR_MEDIA]);
      expect(shownBy[0]?.declarations.get('display')).toBe('block');
    });
  }
});
