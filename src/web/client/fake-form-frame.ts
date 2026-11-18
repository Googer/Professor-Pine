import type { FormFrame } from './form-home.js';
import { FakeElement } from '../../../test/support/fake-page.js';

/** The side pane's box of a fake page: tells who waits when a form is drawn into it. */
class PaneBox extends FakeElement {
  private waiters: ((form: FakeElement) => void)[] = [];

  /** The next form drawn into the box (a node with `data-form`), not its loading line. */
  nextForm(): Promise<FakeElement> {
    return new Promise((resolve) => this.waiters.push(resolve));
  }

  override replaceChildren(...children: FakeElement[]): void {
    super.replaceChildren(...children);
    const [form] = children;
    if (form?.getAttribute('data-form') === null) return;
    if (form) for (const waiter of this.waiters.splice(0)) waiter(form);
  }
}

/** The frame of the forms over a fake page (plan 8M-22), and what a test reads of it. */
export interface FakeFormFrame {
  frame: FormFrame;
  /** The side pane's box, which holds "New train" (`idle`) without a form. */
  tools: PaneBox;
  idle: FakeElement;
  /** Whether the place's popup is open. */
  isOpen(): boolean;
  /** Whether a form holds. */
  held(): boolean;
  /** The arguments of each claim taken. */
  takes: unknown[][];
  /** What letting the hold go runs beside it (a list drawn anew). */
  onRelease: { run: () => void };
  /** What opening the place again draws (its popup drawn anew); by default it as it was. */
  onBack: { run: () => void };
  /** The hold taken by another form, as a form elsewhere would. */
  takenElsewhere(): void;
}

/**
 * The frame the party layer gives the forms (`FormFrame`, plan 8M-22) over a fake page: the side
 * pane's box under `body`; `popup`, the place's popup in `body`, taken out of the page as a form
 * opens (`leave`, its name `place`) and put back by Cancel (`back`); a hold of one claim at a time,
 * or the page's own (`pageHold`: then `held`, `takes` and `onRelease` are the fake's, unused).
 */
export function fakeFormFrame(
  body: FakeElement,
  popup: FakeElement | undefined,
  place?: string,
  /** The page's own hold (a real `FormHold`), in place of the fake's. */
  pageHold?: FormFrame['hold'],
): FakeFormFrame {
  const tools = new PaneBox('div');
  const idle = new FakeElement('button');
  idle.setAttribute('data-new-train', '');
  tools.append(idle);
  body.append(tools);
  const takes: unknown[][] = [];
  let holder: object | undefined;
  let open = popup !== undefined;
  const onRelease = { run: (): void => undefined };
  const onBack = { run: (): void => undefined };
  const hold: FormFrame['hold'] = {
    take: (...args) => {
      if (holder !== undefined) return undefined;
      takes.push(args);
      holder = { inPopup: false, aside: true };
      return holder as never;
    },
    holds: (claim) => claim === holder,
    release: (claim) => {
      if (claim !== holder) return;
      holder = undefined;
      onRelease.run();
    },
    moved: (claim, place, aside) => {
      if (claim !== holder) return undefined;
      holder = { inPopup: place === true, aside: aside === true };
      return holder as never;
    },
  };
  const frame: FormFrame = {
    tools: tools as unknown as HTMLElement,
    hold: pageHold ?? hold,
    idle: () => {
      tools.replaceChildren(idle);
    },
    leave: () => {
      if (!open || !popup) return {};
      open = false;
      const parent = popup.parent;
      parent?.childNodes.splice(parent.childNodes.indexOf(popup), 1);
      popup.parent = undefined;
      return {
        ...(place === undefined ? {} : { place }),
        back: () => {
          open = true;
          parent?.append(popup);
          onBack.run();
        },
      };
    },
  };
  return {
    frame,
    tools,
    idle,
    isOpen: () => open,
    held: () => holder !== undefined,
    takes,
    onRelease,
    onBack,
    takenElsewhere: () => {
      holder = {};
    },
  };
}
