import {
  ComponentType,
  type APIActionRowComponent,
  type APIButtonComponent,
  type APIComponentInMessageActionRow,
  type APIMessageTopLevelComponent,
  type APIStringSelectComponent,
} from 'discord.js';
import type {
  ClassicMessage,
  OutgoingMessage,
  V2Message,
} from '../../src/discord/party-gateway.js';

/**
 * Reading what the bot sent, for tests: a classic message (text, embeds, rows) or a
 * components-v2 message (a party's post and its copies), whichever the test expects.
 */

type Row = APIActionRowComponent<APIComponentInMessageActionRow>;

/** The message as a classic one; fails the test when it is v2 (or missing). */
export function classic(message: OutgoingMessage | undefined): ClassicMessage {
  if (!message) throw new Error('There is no message');
  if (message.v2) throw new Error('The message is components v2, not classic');
  return message;
}

/** The message as a components-v2 one; fails the test when it is classic (or missing). */
export function v2(message: OutgoingMessage | undefined): V2Message {
  if (!message) throw new Error('There is no message');
  if (!message.v2) throw new Error('The message is classic, not components v2');
  return message;
}

/** The rows of controls of a classic message. */
export function rowsOf(message: OutgoingMessage | undefined): Row[] {
  return classic(message).components ?? [];
}

/** Every component of a v2 message, depth first, containers and sections before what they hold. */
export function allComponents(message: OutgoingMessage | undefined): unknown[] {
  const found: unknown[] = [];
  const visit = (component: APIMessageTopLevelComponent | Record<string, unknown>): void => {
    found.push(component);
    const inner = (component as { components?: unknown[] }).components;
    for (const child of inner ?? []) visit(child as Record<string, unknown>);
    const accessory = (component as { accessory?: unknown }).accessory;
    if (accessory !== undefined) visit(accessory as Record<string, unknown>);
  };
  for (const component of v2(message).components) visit(component);
  return found;
}

/** How many components Discord counts in a v2 message: every one, nested ones included. */
export function componentCount(message: OutgoingMessage | undefined): number {
  return allComponents(message).length;
}

/** The text displays of a v2 message, in order. */
export function textDisplays(message: OutgoingMessage | undefined): string[] {
  return allComponents(message)
    .filter(
      (component): component is { type: ComponentType.TextDisplay; content: string } =>
        (component as { type?: unknown }).type === ComponentType.TextDisplay,
    )
    .map((component) => component.content);
}

/** All the text of a v2 message, its text displays joined by line breaks. */
export function textOf(message: OutgoingMessage | undefined): string {
  return textDisplays(message).join('\n');
}

/** A button as a test reads it. */
export interface ShownButton {
  label: string | undefined;
  emoji: string | undefined;
  style: number;
  customId: string | undefined;
  url: string | undefined;
}

/** Every button of a message (v2: also those beside sections), in order. */
export function buttonsOf(message: OutgoingMessage | undefined): ShownButton[] {
  const components = message?.v2
    ? allComponents(message)
    : rowsOf(message).flatMap((row) => row.components);
  return components
    .filter(
      (component): component is APIButtonComponent =>
        (component as { type?: unknown }).type === ComponentType.Button,
    )
    .map((button) => ({
      label: 'label' in button ? button.label : undefined,
      emoji: 'emoji' in button ? button.emoji?.name : undefined,
      style: button.style,
      customId: 'custom_id' in button ? button.custom_id : undefined,
      url: 'url' in button ? button.url : undefined,
    }));
}

/** A string select menu as a test reads it. */
export interface ShownSelect {
  customId: string;
  placeholder: string | undefined;
  options: { label: string; value: string; description: string | undefined }[];
}

/** Every string select menu of a v2 message, in order. */
export function selectsOf(message: OutgoingMessage | undefined): ShownSelect[] {
  return allComponents(message)
    .filter(
      (component): component is APIStringSelectComponent =>
        (component as { type?: unknown }).type === ComponentType.StringSelect,
    )
    .map((menu) => ({
      customId: menu.custom_id,
      placeholder: menu.placeholder,
      options: menu.options.map((option) => ({
        label: option.label,
        value: option.value,
        description: option.description,
      })),
    }));
}

/** The labels of every button of a message, in order. */
export function buttonLabels(message: OutgoingMessage | undefined): (string | undefined)[] {
  return buttonsOf(message).map((button) => button.label);
}

/**
 * What every button of a message shows, in order: its label, or its emoji's name where it has no
 * label (a status's icon, plan 8D-G).
 */
export function buttonNames(message: OutgoingMessage | undefined): (string | undefined)[] {
  return buttonsOf(message).map((button) => button.label ?? button.emoji);
}

/** The custom ids of every button of a message, in order (link buttons have none). */
export function customIdsOf(message: OutgoingMessage | undefined): string[] {
  return buttonsOf(message).flatMap((button) =>
    button.customId === undefined ? [] : [button.customId],
  );
}

/** The accent colour of the (first) container of a v2 message. */
export function accentOf(message: OutgoingMessage | undefined): number | undefined {
  const container = v2(message).components.find(
    (component) => component.type === ComponentType.Container,
  );
  return container?.type === ComponentType.Container
    ? (container.accent_color ?? undefined)
    : undefined;
}

/** The address of the (first) thumbnail of a v2 message. */
export function thumbnailOf(message: OutgoingMessage | undefined): string | undefined {
  const thumbnail = allComponents(message).find(
    (component): component is { type: ComponentType.Thumbnail; media: { url: string } } =>
      (component as { type?: unknown }).type === ComponentType.Thumbnail,
  );
  return thumbnail?.media.url;
}

/** The addresses of every thumbnail of a v2 message, in order. */
export function thumbnailsOf(message: OutgoingMessage | undefined): string[] {
  return allComponents(message).flatMap((component) => {
    const { type, media } = component as { type?: unknown; media?: { url: string } };
    return type === ComponentType.Thumbnail && media ? [media.url] : [];
  });
}

/**
 * The thumbnail beside the section whose text starts with `start` (the gym's picture beside
 * "**Where**"); undefined when there is no such section or it has none.
 */
export function thumbnailBeside(
  message: OutgoingMessage | undefined,
  start: string,
): string | undefined {
  for (const component of allComponents(message)) {
    const { type, components, accessory } = component as {
      type?: unknown;
      components?: { content?: string }[];
      accessory?: { type?: unknown; media?: { url: string } };
    };
    if (type !== ComponentType.Section || !components?.[0]?.content?.startsWith(start)) continue;
    return accessory?.type === ComponentType.Thumbnail ? accessory.media?.url : undefined;
  }
  return undefined;
}

/**
 * The sections of a v2 message, in order: the text of each and the label of the button beside it,
 * or its emoji's name where it has no label (a status's icon, plan 8D-G; undefined beside a
 * picture).
 */
export function sectionsOf(
  message: OutgoingMessage | undefined,
): { text: string; button: string | undefined }[] {
  return allComponents(message).flatMap((component) => {
    const { type, components, accessory } = component as {
      type?: unknown;
      components?: { content?: string }[];
      accessory?: { type?: unknown; label?: string; emoji?: { name?: string } };
    };
    if (type !== ComponentType.Section) return [];
    const text = (components ?? []).map((part) => part.content ?? '').join('\n');
    return [
      {
        text,
        button:
          accessory?.type === ComponentType.Button
            ? (accessory.label ?? accessory.emoji?.name)
            : undefined,
      },
    ];
  });
}

/**
 * The texts of the parts of a v2 message's container, in order: a text display's, and a
 * section's with, where a button stands beside it, the text display right under it (its details:
 * a status's names, what a group is), as one text, as the reader takes them in.
 */
export function partTexts(message: OutgoingMessage | undefined): string[] {
  const texts: string[] = [];
  let afterButton = false;
  for (const top of v2(message).components) {
    const parts = top.type === ComponentType.Container ? top.components : [top];
    for (const part of parts) {
      if (part.type === ComponentType.TextDisplay) {
        if (afterButton) texts.push(`${texts.pop() ?? ''}\n${part.content}`);
        else texts.push(part.content);
        afterButton = false;
      } else if (part.type === ComponentType.Section) {
        texts.push(part.components.map((text) => text.content).join('\n'));
        afterButton = part.accessory.type === ComponentType.Button;
      } else {
        afterButton = false;
      }
    }
  }
  return texts;
}

/** The addresses of the pictures of the galleries of a v2 message, in order. */
export function galleryOf(message: OutgoingMessage | undefined): string[] {
  return allComponents(message).flatMap((component) => {
    const { type, items } = component as { type?: unknown; items?: { media: { url: string } }[] };
    return type === ComponentType.MediaGallery ? (items ?? []).map((item) => item.media.url) : [];
  });
}

/** The line a copy of a post in another channel opens with: the first line of its first text. */
export function leadOf(message: OutgoingMessage | undefined): string | undefined {
  return textDisplays(message)[0]?.split('\n')[0];
}

/**
 * What a copy of a post in another channel shows of the post: its text displays without the
 * line it opens with.
 */
export function copiedPost(message: OutgoingMessage | undefined): string[] {
  const [first = '', ...rest] = textDisplays(message);
  return [first.slice(first.indexOf('\n') + 1), ...rest];
}

/** The lines of the first text of a post: what it is, its times (a raid: its boss). */
export function header(message: OutgoingMessage | undefined): string[] {
  return textDisplays(message)[0]?.split('\n') ?? [];
}

/** The line under which a direct message of the notifier lists its reasons. */
const REASONS_HEADING = '-# You asked to be told about';

/**
 * The news of a direct message: the first line of its first text (a v2 message of the notifier),
 * or of its content (a classic one: the meeting-time DM).
 */
export function dmSentence(message: OutgoingMessage | undefined): string {
  if (message?.v2) return textDisplays(message)[0]?.split('\n')[0] ?? '';
  return (classic(message).content ?? '').split('\n')[0] ?? '';
}

/** The lines under the news of a v2 direct message: the brief of its party or spawn. */
export function dmBrief(message: OutgoingMessage | undefined): string[] {
  return textDisplays(message)[0]?.split('\n').slice(1) ?? [];
}

/**
 * The reasons a v2 direct message names under `-# You asked to be told about`, each by its label,
 * in order: those with a button, then those listed without (the hint line left out).
 */
export function dmReasons(message: OutgoingMessage | undefined): string[] {
  // The parts of the message's container, from the heading on: the sections of the reasons with
  // a button, and the text that lists the others (wherever the message puts it).
  const parts = v2(message).components.flatMap(
    (component) => (component as { components?: unknown[] }).components ?? [],
  ) as { type?: unknown; content?: string; components?: { content?: string }[] }[];
  const at = parts.findIndex(
    (part) => part.type === ComponentType.TextDisplay && part.content === REASONS_HEADING,
  );
  if (at < 0) return [];
  const after = parts.slice(at + 1);
  const withButton = after
    .filter((part) => part.type === ComponentType.Section)
    .map((part) => part.components?.[0]?.content ?? '');
  const listed = after
    .filter((part) => part.type === ComponentType.TextDisplay)
    .flatMap((part) => (part.content ?? '').split('\n'))
    .filter((line) => !line.startsWith('-# '));
  return [...withButton, ...listed];
}

/** The link buttons of a message, as `label url`. */
export function linksOf(message: OutgoingMessage | undefined): string[] {
  return buttonsOf(message).flatMap((button) =>
    button.url === undefined ? [] : [`${button.label ?? ''} ${button.url}`],
  );
}

/**
 * A direct message as tests compare it, one line each: a classic one (the meeting time) by the
 * lines of its content; one of the notifier by its news and, when it has any, its reasons joined
 * by ` · `.
 */
export function dmSummary(message: OutgoingMessage | undefined): string[] {
  if (!message?.v2) return (classic(message).content ?? '').split('\n');
  const reasons = dmReasons(message);
  return [dmSentence(message), ...(reasons.length === 0 ? [] : [reasons.join(' · ')])];
}
