import { ComponentType, type APIModalInteractionResponseCallbackData } from 'discord.js';

/** What a handler showed with `showModal`, as a fake recorded it. */
interface ShowsModals {
  showModal: { mock: { calls: ReadonlyArray<readonly unknown[]> } };
}

/** The dialog a fake was answered with (`showModal`); undefined when it opened none. */
export function dialogOf(fake: ShowsModals): APIModalInteractionResponseCallbackData | undefined {
  return fake.showModal.mock.calls[0]?.[0] as APIModalInteractionResponseCallbackData | undefined;
}

/** The dialog a fake was answered with; fails the test when it opened none. */
export function shownDialog(fake: ShowsModals): APIModalInteractionResponseCallbackData {
  const shown = dialogOf(fake);
  if (!shown) throw new Error('no dialog was opened');
  return shown;
}

/** The texts of a dialog's text displays. */
export function dialogTexts(dialog: APIModalInteractionResponseCallbackData): string[] {
  return dialog.components.flatMap((component) =>
    component.type === ComponentType.TextDisplay ? [component.content] : [],
  );
}

/** The texts of a dialog's text displays as one text, a line between two. */
export function dialogText(dialog: APIModalInteractionResponseCallbackData): string {
  return dialogTexts(dialog).join('\n');
}

/** A choice of a dialog's radio groups, and whether it is picked before the member picks. */
export interface DialogChoice {
  value: string;
  label: string;
  description: string | undefined;
  picked: boolean;
}

/** An option of a dialog's field: its value and label, and whether it starts ticked or chosen. */
export interface FieldOption {
  value: string;
  label: string;
  description?: string;
  ticked: boolean;
}

/**
 * A field of a dialog (a label and what it holds; plan 8R-4): its label and description, its
 * input's custom id and kind, a Checkbox's tick to start with, a group's or a menu's options.
 */
export interface DialogField {
  label: string;
  description?: string;
  id: string;
  kind: 'checkbox' | 'group' | 'select' | 'radio' | 'text' | 'other';
  /** A Checkbox: whether it starts ticked. */
  ticked?: boolean;
  /** A line of text: what it holds to start with, if anything (Discord's `value`). */
  value?: string;
  options?: FieldOption[];
}

const KINDS: Partial<Record<ComponentType, DialogField['kind']>> = {
  [ComponentType.Checkbox]: 'checkbox',
  [ComponentType.CheckboxGroup]: 'group',
  [ComponentType.StringSelect]: 'select',
  [ComponentType.RadioGroup]: 'radio',
  [ComponentType.TextInput]: 'text',
};

/** The fields of a dialog, in their order: every label with what it holds. */
export function dialogFields(dialog: APIModalInteractionResponseCallbackData): DialogField[] {
  return dialog.components.flatMap((component): DialogField[] => {
    if (component.type !== ComponentType.Label) return [];
    const inner = component.component as {
      type: ComponentType;
      custom_id: string;
      default?: boolean;
      value?: string;
      options?: { value: string; label: string; description?: string; default?: boolean }[];
    };
    return [
      {
        label: component.label,
        ...(component.description === undefined ? {} : { description: component.description }),
        id: inner.custom_id,
        kind: KINDS[inner.type] ?? 'other',
        ...(inner.type === ComponentType.Checkbox ? { ticked: inner.default === true } : {}),
        ...(inner.value === undefined ? {} : { value: inner.value }),
        ...(inner.options === undefined
          ? {}
          : {
              options: inner.options.map((option) => ({
                value: option.value,
                label: option.label,
                ...(option.description === undefined ? {} : { description: option.description }),
                ticked: option.default === true,
              })),
            }),
      },
    ];
  });
}

/** A dialog's field by its label; fails the test when it has none. */
export function dialogField(
  dialog: APIModalInteractionResponseCallbackData,
  label: string,
): DialogField {
  const found = dialogFields(dialog).find((field) => field.label === label);
  if (!found) throw new Error(`the dialog has no field ${label}`);
  return found;
}

/**
 * The choices of a dialog's radio groups and string selects (a menu, plan 8X-1B: Meet…), in
 * their order; `picked` is a radio choice or a menu option marked to start chosen (`default`).
 */
export function dialogChoices(dialog: APIModalInteractionResponseCallbackData): DialogChoice[] {
  return dialog.components.flatMap((component) =>
    component.type === ComponentType.Label &&
    (component.component.type === ComponentType.RadioGroup ||
      component.component.type === ComponentType.StringSelect)
      ? component.component.options.map((option) => ({
          value: option.value,
          label: option.label,
          description: option.description,
          picked: option.default === true,
        }))
      : [],
  );
}

/**
 * A dialog's custom id without its per-open token (`openToken`, plan 8X-F), failing the test when
 * it has none: `pclose:<id>:close:~lx2k` gives `pclose:<id>:close`.
 */
export function withoutToken(customId: string): string {
  const at = customId.lastIndexOf(':~');
  if (at < 0 || !/^[0-9a-z]+$/.test(customId.slice(at + 2))) {
    throw new Error(`no per-open token in ${customId}`);
  }
  return customId.slice(0, at);
}
