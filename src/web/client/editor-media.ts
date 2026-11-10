/**
 * Where the region editor is offered (plan 8M-11C, S29): a screen of 1024 pixels or more, where
 * the header's row of layers shows, whose main pointer is a mouse or a trackpad (a touch laptop
 * with a trackpad is one; a large tablet is not). The one source: the page asks it
 * (`editorFits`) for the menu and the address, and `map.css` shows "Edit regions" under this very
 * query (`phone-header.test.ts` holds them to each other). Without the DOM's types, so that the
 * stylesheet's test reads it.
 */
export const EDITOR_MEDIA = '(min-width: 1024px) and (pointer: fine)';

/** Whether the editor is offered here (S29), asked of the browser (`matchMedia`'s `matches`). */
export function editorFits(matches: (query: string) => boolean): boolean {
  return matches(EDITOR_MEDIA);
}
