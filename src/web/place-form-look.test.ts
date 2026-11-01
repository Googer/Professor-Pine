import { describe, expect, it } from 'vitest';
import { clientSheet } from '../../test/support/stylesheets.js';

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

  it("hides a stop's reports' controls above its form", () => {
    expect(selectors).toContain(
      '.stop-popup:has(.rocket-box > :not(button), .stop-actions > :not(button, .rocket-box)) :is([data-take-back], [data-same-task], .report-actions .sep:has(+ [data-take-back], + [data-same-task]))',
    );
  });
});
