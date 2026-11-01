import { expect } from 'vitest';
import type { V2Message } from '../../src/discord/party-gateway.js';
import type { MirrorKind } from '../../src/domain/party/party.js';
import { renderMirror } from '../../src/render/mirrors.js';
import {
  layoutTextLength,
  LEAD_ROOM,
  MAX_COMPONENTS,
  TEXT_BUDGET,
  type RenderedPost,
} from '../../src/render/party-post.js';
import { FakePartyGateway } from './fake-gateway.js';
import { componentCount } from './messages.js';

const KINDS: readonly MirrorKind[] = ['status', 'remote', 'ex', 'region'];

/**
 * Asserts that Discord would take a rendered post and every copy of it, with and without its
 * picture: the fake gateway's checks, at most 40 components, the text within its budget.
 */
export function expectSendable(rendered: RenderedPost): void {
  expect(layoutTextLength(rendered.layout)).toBeLessThanOrEqual(TEXT_BUDGET - LEAD_ROOM);
  const place = { postId: '900000000000000001', regionChannelId: '100000000000000001' };
  const messages = [
    rendered.message,
    ...KINDS.flatMap((kind) => [
      renderMirror(kind, rendered, place),
      renderMirror(kind, rendered, place, { picture: false }),
    ]),
  ];
  for (const message of messages) {
    expect(componentCount(message)).toBeLessThanOrEqual(MAX_COMPONENTS);
    FakePartyGateway.checkMessage(message);
  }
}

/**
 * Asserts that Discord would take a components-v2 message that is no post (a direct message, a
 * private list, a summary): the fake gateway's checks (the text displays within `TEXT_BUDGET`)
 * and at most 40 components.
 */
export function expectV2Sendable(message: V2Message): void {
  expect(componentCount(message)).toBeLessThanOrEqual(MAX_COMPONENTS);
  FakePartyGateway.checkMessage(message, TEXT_BUDGET);
}
