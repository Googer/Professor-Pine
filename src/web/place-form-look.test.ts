import { describe, expect, it } from 'vitest';
import { clientSheet } from '../../test/support/stylesheets.js';

/** A node of the page as `renderNode` draws it (`PageNode` of `src/web/client/popup.ts`). */
interface PageNode {
  tag: string;
  className?: string;
  children?: PageNode[];
}

/**
 * A form open in a place's popup or card (staging of 2026-10-30): the place's other controls are
 * hidden, not grayed, so that the form's own buttons stay above the fold; they are back when its
 * box holds its button again. Read from the stylesheet, as a browser reads it: what hides them is
 * the box holding anything but its button.
 */

/** The selectors of the rule that hides, one by one, with white space made single. */
function hidingSelectors(css: string): string[] {
  const rules = [...css.matchAll(/([^{}]*)\{([^{}]*)\}/gu)];
  const rule = rules.find((one) => (one[1] ?? '').includes('.place-control'));
  expect(rule?.[2]).toMatch(/display:\s*none/u);
  const head = (rule?.[1] ?? '')
    .replace(/\s+/gu, ' ')
    .replace(/\(\s/gu, '(')
    .replace(/\s\)/gu, ')');
  const parts: string[] = [];
  let depth = 0;
  let from = 0;
  for (let at = 0; at < head.length; at += 1) {
    if (head[at] === '(') depth += 1;
    if (head[at] === ')') depth -= 1;
    if (head[at] === ',' && depth === 0) {
      parts.push(head.slice(from, at).trim());
      from = at + 1;
    }
  }
  parts.push(head.slice(from).trim());
  return parts;
}

/** A compound selector: a tag, classes, and `:not(…)` lists of compounds. */
interface Compound {
  tag?: string;
  classes: string[];
  nots: Compound[][];
}

/** Splits at the commas outside brackets. */
function topLevel(text: string, by: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let from = 0;
  for (let at = 0; at < text.length; at += 1) {
    if (text[at] === '(') depth += 1;
    if (text[at] === ')') depth -= 1;
    if (text[at] === by && depth === 0) {
      parts.push(text.slice(from, at).trim());
      from = at + 1;
    }
  }
  parts.push(text.slice(from).trim());
  return parts;
}

function compound(text: string): Compound {
  const nots: Compound[][] = [];
  const rest = text.replace(/:not\((.*)\)/u, (_all, inner: string) => {
    nots.push(topLevel(inner, ',').map(compound));
    return '';
  });
  if (/[^\w.-]/u.test(rest)) throw new Error(`the matcher reads no "${text}"`);
  const [tag, ...classes] = rest.split('.');
  return { ...(tag ? { tag } : {}), classes, nots };
}

function matches(node: PageNode, one: Compound): boolean {
  const classes = (node.className ?? '').split(' ');
  return (
    (one.tag === undefined || one.tag === node.tag) &&
    one.classes.every((name) => classes.includes(name)) &&
    one.nots.every((list) => !list.some((not) => matches(node, not)))
  );
}

/** Whether a node under `root` ends a chain of `a > b > c` (`:has`'s relative argument). */
function hasMatch(root: PageNode, argument: string): boolean {
  const chains = topLevel(argument, ',').map((one) => topLevel(one, '>').map(compound));
  const below = (node: PageNode): PageNode[] =>
    (node.children ?? []).flatMap((child) => [child, ...below(child)]);
  const from = (node: PageNode, chain: Compound[]): boolean => {
    const [first, ...rest] = chain;
    if (!first || !matches(node, first)) return false;
    return rest.length === 0 || (node.children ?? []).some((child) => from(child, rest));
  };
  return chains.some((chain) => below(root).some((node) => from(node, chain)));
}

describe("the place's controls under a form in its popup", () => {
  const selectors = hidingSelectors(clientSheet('map.css'));

  it('hides the controls before and after the one whose box holds a form', () => {
    expect(selectors).toContain('.place-control:has(> :not(button)) ~ .place-control');
    expect(selectors).toContain('.place-control:has(~ .place-control > :not(button))');
  });

  it("hides a raid's controls above the form, its post staying", () => {
    expect(selectors).toContain(
      // `.raids`: drawn while the post has not come, and kept so under the form (`gymRaidsPopup`).
      ':is(.post-popup, .raids):has(> .place-control > :not(button)) :is(.post-controls, .mine-part, .presses, .change-raid, .map-line .link-button, .map-line .sep:has(+ .link-button))',
    );
    expect(selectors).toContain('.raid-choices:has(> .place-control > :not(button)) .choices');
  });

  // Review SH-5: the rule's `:has(…)` evaluated over the stop's popup as the page draws it. No DOM
  // library is installed (jsdom, happy-dom), so a matcher of just the selectors the argument uses
  // (a tag, classes, `>`, `:not(a, b)`) reads it as a browser would.
  it("hides a stop's reports' controls exactly when a form is open among its actions", () => {
    const rule = selectors.find((one) => one.startsWith('.stop-popup:has('));
    const argument = /^\.stop-popup:has\((.*?)\) :is\(/u.exec(rule ?? '')?.[1] ?? '';
    // The stop's popup (`stopPopup`, `plainStopPopup`) and its actions in the classes their
    // builders give them (`researchButton`, `rocketBox`, `spawnAtBox`, `meetupAtStopBox`; the
    // server's typecheck reads no page module).
    const popup = (actions: PageNode[]): PageNode => ({
      tag: 'div',
      className: 'stop-popup plain',
      children: [
        { tag: 'strong', className: 'place-name' },
        { tag: 'div', className: 'stop-actions', children: actions },
      ],
    });
    const box = (className: string): PageNode => ({
      tag: 'div',
      className: `${className} place-control`,
      children: [{ tag: 'button', className: 'press' }],
    });
    const all = (): PageNode[] => [
      { tag: 'button', className: 'press place-control' },
      box('rocket-box'),
      box('spawn-box'),
      box('meetup-box'),
    ];
    const form: PageNode = { tag: 'div', className: 'raid-form spawn-form' };
    const withFormIn = (index: number): PageNode[] =>
      all().map((box, at) => (at === index ? { ...box, children: [form] } : box));
    expect(hasMatch(popup(all()), argument)).toBe(false);
    // The rule before 2026-11-07 hid them always, the meetup's box taken for a form.
    const before = '.rocket-box > :not(button), .stop-actions > :not(button, .rocket-box)';
    expect(hasMatch(popup(all()), before)).toBe(true);
    for (const index of [1, 2, 3]) expect(hasMatch(popup(withFormIn(index)), argument)).toBe(true);
    // Research's form takes the place of every action.
    expect(hasMatch(popup([{ tag: 'div', className: 'raid-form research-form' }]), argument)).toBe(
      true,
    );
  });

  it("hides a stop's reports' controls above its form, and only then", () => {
    // A form in a box of the stop's actions (Rocket, a spawn, a meetup), or research's in place of
    // them all; a box that holds its button hides nothing (a box alone is no form).
    expect(selectors).toContain(
      '.stop-popup:has(.stop-actions > .place-control > :not(button), .stop-actions > :not(button, .place-control)) :is([data-take-back], [data-same-task], .report-actions .sep:has(+ [data-take-back], + [data-same-task]))',
    );
  });
});
