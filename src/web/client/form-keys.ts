/**
 * Enter on a field the form's own. Not a text area (a new line), a menu or a button (their own
 * key), a search box (research's task box, where nothing is picked yet), a field with suggestions
 * (Enter may pick one) or the choice of Delete… (an arrow key checks "Delete post", with no undo);
 * not ending an input method's composition (Safari has ended it by the key: only the code 229 says
 * so), or with a modifier.
 */
function enterSubmits(event: KeyboardEvent): boolean {
  if (event.isComposing || event.keyCode === 229) return false;
  if (event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) return false;
  const field = event.target as HTMLElement;
  return (
    field.tagName === 'INPUT' &&
    field.getAttribute('type') !== 'search' &&
    !field.hasAttribute('list') &&
    field.closest('[data-form="close"]') === null
  );
}

/**
 * The keys of a form of the map: the report and change forms (a raid's report and Manage…, a max
 * battle's, a spawn's, research, Rocket, a meetup's form and editor, a new train) and the forms of
 * a post's controls. The one helper every form uses; route mode keeps its own Escape, which ends a
 * stop's drag.
 *
 * - Escape closes the form as its Cancel does (plan 8M-11A, S16).
 * - Enter presses its Submit (Matt, 2026-10-31; `enterSubmits`): the forms are no `<form>`, so the
 *   browser's own does nothing. A Submit that is disabled stays unpressed. Held down it does nothing
 *   more, also on a button an answer moved the focus to, which its repeats would press; a text area
 *   keeps its lines.
 *
 * The key goes no further: the popup or card under the form stays open (Leaflet's own Escape, the
 * card's). A key a field took already (`defaultPrevented`), and a form without that button, are
 * left alone.
 */
export function formKeys(form: HTMLElement): void {
  form.addEventListener('keydown', (event) => {
    if (event.defaultPrevented) return;
    if (event.key === 'Enter' && event.repeat) {
      if ((event.target as HTMLElement).tagName !== 'TEXTAREA') event.preventDefault();
      return;
    }
    const selector =
      event.key === 'Escape'
        ? 'button[data-cancel]'
        : event.key === 'Enter' && enterSubmits(event)
          ? 'button[data-submit]'
          : undefined;
    const button = selector === undefined ? null : form.querySelector<HTMLButtonElement>(selector);
    if (!button) return;
    event.stopPropagation();
    event.preventDefault();
    button.click();
  });
}
