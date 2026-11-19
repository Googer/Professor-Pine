import type { FormFrame } from './form-home.js';
import { FakeElement } from '../../../test/support/fake-page.js';

/** Who waits for the next form drawn, in the side pane or the card. */
type FormWaiters = ((form: FakeElement) => void)[];

/** The side pane's box, or the card's form layer, of a fake page: tells who waits for a form. */
class PaneBox extends FakeElement {
  constructor(
    tag: string,
    private readonly waiters: FormWaiters = [],
  ) {
    super(tag);
  }

  /** The next form drawn (a node with `data-form`, not its loading line), here or in the card. */
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

/** The phone's card of a fake page (plan 8M-22): its form mode, and its × pressed. */
export interface FakeCard {
  /** The card's form layer, in the page while a form is in it. */
  layer: PaneBox;
  /** The party the card shows. */
  key: string | undefined;
  formShown(): boolean;
  /** The card's × (or Escape): the form's Cancel. */
  pressX(): void;
}

/** The frame of the forms over a fake page (plan 8M-22), and what a test reads of it. */
export interface FakeFormFrame {
  frame: FormFrame;
  /** The side pane's box, which holds "New train" (`idle`) without a form. */
  tools: PaneBox;
  idle: FakeElement;
  /** The phone's card, on a phone (`options.phone`). */
  card: FakeCard | undefined;
  /** Whether the place's popup is open. */
  isOpen(): boolean;
  /** Whether a form holds. */
  held(): boolean;
  /** The arguments of each claim taken. */
  takes: unknown[][];
  /** Where each claim was, as taken or moved: `pane` (aside), `card`, `popup`, `place`. */
  places: string[];
  /** What letting the hold go runs beside it (a list drawn anew). */
  onRelease: { run: () => void };
  /** What opening the place again draws (its popup drawn anew); by default it as it was. */
  onBack: { run: () => void };
  /** The hold taken by another form, as a form elsewhere would. */
  takenElsewhere(): void;
}

/** Where a claim is, by the arguments it was taken or moved with. */
function placeOf(place: boolean | 'card', aside = false): string {
  if (place === 'card') return 'card';
  if (place) return 'popup';
  return aside ? 'pane' : 'place';
}

/**
 * The frame the party layer gives the forms (`FormFrame`, plan 8M-22) over a fake page: the side
 * pane's box under `body`; `popup`, the place's popup in `body`, taken out of the page as a form
 * opens (`leave`, its name `place`) and put back by Cancel (`back`); a hold of one claim at a time,
 * or the page's own (`pageHold`: then `held`, `takes` and `onRelease` are the fake's, unused). On a
 * phone (`options.phone`, review P7) a card whose form mode is a layer under `body`, showing the
 * party `showing` or nothing; a popup it is opened over stays open there only while the card shows
 * a party, as the party layer's `leave(true)` does.
 */
export function fakeFormFrame(
  body: FakeElement,
  popup: FakeElement | undefined,
  place?: string,
  /** The page's own hold (a real `FormHold`), in place of the fake's. */
  pageHold?: FormFrame['hold'],
  options: { phone?: { showing?: string } } = {},
): FakeFormFrame {
  const waiters: FormWaiters = [];
  const tools = new PaneBox('div', waiters);
  const idle = new FakeElement('button');
  idle.setAttribute('data-new-train', '');
  tools.append(idle);
  body.append(tools);
  const takes: unknown[][] = [];
  const places: string[] = [];
  let holder: object | undefined;
  let open = popup !== undefined;
  const onRelease = { run: (): void => undefined };
  const onBack = { run: (): void => undefined };
  const hold: FormFrame['hold'] = {
    take: (...args) => {
      if (holder !== undefined) return undefined;
      takes.push(args);
      places.push(placeOf(args[0], args[1]));
      holder = { inPopup: args[0] === true, aside: args[1] === true };
      return holder as never;
    },
    holds: (claim) => claim === holder,
    release: (claim) => {
      if (claim !== holder) return;
      holder = undefined;
      onRelease.run();
    },
    moved: (claim, to, aside) => {
      if (claim !== holder) return undefined;
      places.push(placeOf(to, aside));
      holder = { inPopup: to === true, aside: aside === true };
      return holder as never;
    },
  };
  let card: FakeCard | undefined;
  let cardFrame: Pick<FormFrame, 'card' | 'phone'> = {};
  if (options.phone) {
    const layer = new PaneBox('div', waiters);
    layer.className = 'card-form';
    let cancel: (() => void) | undefined;
    const made: FakeCard = {
      layer,
      key: options.phone.showing,
      formShown: () => cancel !== undefined,
      pressX: () => {
        cancel?.();
      },
    };
    card = made;
    cardFrame = {
      phone: () => true,
      card: {
        get key() {
          return made.key;
        },
        openForm: (form, pressed) => {
          cancel = pressed;
          body.append(layer);
          layer.replaceChildren(form as unknown as FakeElement);
        },
        closeForm: () => {
          cancel = undefined;
          layer.replaceChildren();
          layer.parent?.childNodes.splice(layer.parent.childNodes.indexOf(layer), 1);
          layer.parent = undefined;
        },
        close: () => {
          if (cancel === undefined) made.key = undefined;
        },
        formElement: () => (cancel === undefined ? undefined : (layer as unknown as HTMLElement)),
      },
    };
  }
  const frame: FormFrame = {
    tools: tools as unknown as HTMLElement,
    hold: pageHold ?? hold,
    ...cardFrame,
    idle: () => {
      tools.replaceChildren(idle);
    },
    leave: (inCard = false) => {
      // A party the card shows stays under a form in the card (`leave(true)`).
      if (inCard && card?.key !== undefined) return place === undefined ? {} : { place };
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
    card,
    isOpen: () => open,
    held: () => holder !== undefined,
    takes,
    places,
    onRelease,
    onBack,
    takenElsewhere: () => {
      holder = {};
    },
  };
}
