import { basename } from 'node:path';
import {
  ButtonStyle,
  ComponentType,
  SeparatorSpacingSize,
  type APIActionRowComponent,
  type APIButtonComponent,
  type APIStringSelectComponent,
  type APIButtonComponentWithURL,
  type APIComponentInContainer,
  type APIContainerComponent,
  type APIFileComponent,
  type APIMediaGalleryComponent,
  type APISectionAccessoryComponent,
  type APISectionComponent,
  type APISeparatorComponent,
  type APITextDisplayComponent,
  type APIThumbnailComponent,
} from 'discord.js';
import type { V2Message } from '../discord/party-gateway.js';

/** The components of a components-v2 message, as plain API objects (as embeds were). */

export function textDisplay(content: string): APITextDisplayComponent {
  return { type: ComponentType.TextDisplay, content };
}

/** A thin line with a little room around it. */
export function separator(): APISeparatorComponent {
  return { type: ComponentType.Separator, divider: true, spacing: SeparatorSpacingSize.Small };
}

/** One text with a button or a picture beside it. */
export function section(
  content: string,
  accessory: APISectionAccessoryComponent,
): APISectionComponent {
  return { type: ComponentType.Section, components: [textDisplay(content)], accessory };
}

export function thumbnail(url: string): APIThumbnailComponent {
  return { type: ComponentType.Thumbnail, media: { url } };
}

export function actionRow(
  buttons: APIButtonComponent[],
): APIActionRowComponent<APIButtonComponent> {
  return { type: ComponentType.ActionRow, components: buttons };
}

/**
 * A file sent with the message, shown where the component stands: `name` is the name of one of
 * the message's own files (`attachment://<name>`).
 */
export function fileComponent(name: string): APIFileComponent {
  return { type: ComponentType.File, file: { url: `attachment://${name}` } };
}

/** At most this many pictures stand in one gallery (Discord's limit). */
export const GALLERY_ITEMS = 10;

/**
 * Pictures at the full width of the message (a map). Each address is `attachment://<name>` of a
 * file sent with the message, or https. Discord counts the gallery as one component; its items
 * are no components.
 */
export function mediaGallery(
  items: readonly { url: string; description?: string }[],
): APIMediaGalleryComponent {
  if (items.length < 1 || items.length > GALLERY_ITEMS) {
    throw new RangeError(`a gallery holds 1 to ${GALLERY_ITEMS} pictures, not ${items.length}`);
  }
  return {
    type: ComponentType.MediaGallery,
    items: items.map(({ url, description }) => ({
      media: { url },
      ...(description === undefined ? {} : { description }),
    })),
  };
}

/** A map picture as a message shows it: the gallery to put where it stands, and its file. */
export interface MapPicture {
  /** The gallery of the map, or nothing when there is no map. */
  gallery: APIMediaGalleryComponent[];
  /** The file the message sends with it (a local path), or nothing. */
  files: string[];
}

/**
 * A map file (a path from `ctx.maps`, or undefined when there is none) as the gallery that shows
 * it and the file to send: without a map, neither. `description` is the picture's alt text.
 */
export function mapPicture(path: string | undefined, description?: string): MapPicture {
  if (path === undefined) return { gallery: [], files: [] };
  return {
    gallery: [mediaGallery([{ url: `attachment://${basename(path)}`, description }])],
    files: [path],
  };
}

/** A row that holds one select menu (a row holds a menu alone). */
export function menuRow(
  menu: APIStringSelectComponent,
): APIActionRowComponent<APIStringSelectComponent> {
  return { type: ComponentType.ActionRow, components: [menu] };
}

/**
 * A button that opens an address: a post, a message, a place in Google Maps, a page of another
 * site (without an emoji: Discord marks a link button with its own sign).
 */
export function linkButton(
  label: string,
  emoji: string | undefined,
  url: string,
): APIButtonComponentWithURL {
  return {
    type: ComponentType.Button,
    style: ButtonStyle.Link,
    label,
    ...(emoji === undefined ? {} : { emoji: { name: emoji } }),
    url,
  };
}

/** The colour of the edge of a list: a member's own (`/wants`, `/targets`) and a region's summary. */
export const LIST_COLOUR = 0x5865f2;

/**
 * How many components these are as Discord counts them against its limit of 40: every nested
 * one and every accessory included.
 */
export function countComponents(components: readonly object[]): number {
  return components.reduce((sum: number, component) => {
    const nested = component as { components?: object[]; accessory?: object };
    return (
      sum + 1 + countComponents(nested.components ?? []) + (nested.accessory === undefined ? 0 : 1)
    );
  }, 0);
}

/** The box a post is drawn in, with the colour of its edge. */
export function container(
  accent: number,
  components: APIComponentInContainer[],
): APIContainerComponent {
  return { type: ComponentType.Container, accent_color: accent, components };
}

/**
 * A components-v2 message of one container: these texts (blank ones left out), each a text
 * display, then `more` (a row of buttons, a file). For questions and answers that are sentences.
 */
export function textMessage(
  accent: number,
  texts: readonly (string | undefined)[],
  more: readonly APIComponentInContainer[] = [],
): V2Message {
  const shown = texts.filter((text): text is string => text !== undefined && text.trim() !== '');
  return {
    v2: true,
    components: [container(accent, [...shown.map((text) => textDisplay(text)), ...more])],
  };
}
