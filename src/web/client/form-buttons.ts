import type { PageNode } from './popup.js';

/**
 * The button that sends a form on the map (Submit, Report, Start, Make the meetup …): the
 * primary blue in every form, as Discord's dialogs draw Submit (Matt, 2026-11-07: "just be
 * consistent"). Cancel, Back and the form's other buttons stay gray. Every form builds its
 * sending button here, so the color is decided once.
 */
export function sendButton(text: string, attributes: Record<string, string>): PageNode {
  return {
    tag: 'button',
    className: 'press primary',
    text,
    attributes: { type: 'button', ...attributes },
  };
}
