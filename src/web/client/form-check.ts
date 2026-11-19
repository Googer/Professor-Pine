/** The live check of a form, to run again where the page changed the form itself. */
export interface FormCheck {
  /**
   * The check run now: the sending button on or off, the line its text. `afterSending`: a
   * server's answer on the line stays where nothing is missing (it stays until the next input).
   */
  run(afterSending?: boolean): void;
}

/** Ids of the missing lines, one per form drawn. */
let lines = 0;

/** Runs `run` on the next frame (`requestAnimationFrame`, else after this turn). */
function nextFrameOf(run: () => void): void {
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run);
  else queueMicrotask(run);
}

/**
 * Says `text` on a form's line after a press (branch review W1): the line made live and cleared
 * first, the text written on the next frame, so that a screen reader hears the change (a line made
 * live in the same change as its text is not read). Used for a press of an off Report and for the
 * server's answer under a form (`sayInForm`).
 */
export function sayLine(
  line: HTMLElement,
  text: string,
  nextFrame: (run: () => void) => void = nextFrameOf,
): void {
  line.setAttribute('aria-live', 'polite');
  line.textContent = '';
  line.hidden = false;
  nextFrame(() => {
    line.textContent = text;
    line.hidden = text === '';
  });
}

/** How each form drawn says its missing line once more (`sayMissing`). */
const sayers = new WeakMap<HTMLElement, () => void>();

/**
 * Says a form's missing line once more where its sending button is off (review P9: Enter on an
 * off Report, `formKeys`), as a press of the button does; nothing for a form without a check.
 */
export function sayMissing(form: HTMLElement): void {
  sayers.get(form)?.();
}

/**
 * Wires a form's pure check (plan 8M-22) to its fields: run at once and on every input and
 * change, its text (`check()`: what is missing, or nothing) on the form's line (`.form-answer`)
 * and its sending button (`button[data-submit]`) off while it says something, `aria-disabled`
 * and named by the line (`aria-describedby`), so that a keyboard or screen-reader user hears why
 * as Report gets the focus. The line is no live region while the check writes it (each keystroke
 * would be read); a press of the button while it is off says the line once more: cleared, made
 * live, and written on the next frame (as the regions box says its answers). The same check still
 * answers the press itself, in the form's own Submit handler, which returns on an off button
 * (`isOff`, `form-buttons.ts`). A form without a sending button is left alone.
 */
export function liveCheck(
  form: HTMLElement,
  check: () => string | undefined,
  options: { nextFrame?: (run: () => void) => void } = {},
): FormCheck {
  const send = form.querySelector<HTMLButtonElement>('button[data-submit]');
  const line = form.querySelector<HTMLElement>('.form-answer');
  const nextFrame = options.nextFrame ?? nextFrameOf;
  if (!send || !line) return { run: () => undefined };
  lines += 1;
  const id = `form-line-${String(lines)}`;
  line.setAttribute('id', id);
  send.setAttribute('aria-describedby', id);

  const write = (text: string): void => {
    line.textContent = text;
    line.hidden = text === '';
  };
  const run = (afterSending = false): void => {
    const missing = check();
    if (missing === undefined || missing === '') {
      send.removeAttribute('aria-disabled');
      if (!afterSending) {
        line.removeAttribute('aria-live');
        write('');
      }
      return;
    }
    send.setAttribute('aria-disabled', 'true');
    line.removeAttribute('aria-live');
    write(missing);
  };
  const typed = (): void => {
    run();
  };
  form.addEventListener('input', typed);
  form.addEventListener('change', typed);
  /** The line said once more, while the sending button is off: cleared, made live, written. */
  const say = (): void => {
    if (send.disabled || send.getAttribute('aria-disabled') !== 'true') return;
    sayLine(line, check() ?? '', nextFrame);
  };
  sayers.set(form, say);
  form.addEventListener('click', (event) => {
    const target = event.target;
    const pressed = target instanceof HTMLElement ? target.closest('button[data-submit]') : null;
    if (pressed === send) say();
  });
  run();
  return { run };
}
