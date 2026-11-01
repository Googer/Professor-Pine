import type { V2Message } from '../discord/party-gateway.js';
import type { MirrorKind } from '../domain/party/party.js';
import { postMessage, type RenderedPost } from './party-post.js';

/** Where a party is, for the line above a copy of its message in another channel. */
export interface MirrorPlace {
  /** The party's post. */
  postId: string;
  /** The text channel of the party's region; undefined when the region is gone. */
  regionChannelId: string | undefined;
}

/**
 * A copy of a party's message for another place (spec 5.2): the same message as the first
 * message of the post, with the same controls, so a member can sign up where they see it. The
 * copy at the bottom of the post itself (`status`), which every kind of party can have, is the
 * message as it is. The copies in another channel (`ex`, `remote`) are a raid's alone
 * (`raidMirrors`): a line at the top says what raid it is and links to the post.
 *
 * `region` is the copy of a train in the channel of another region it stops in, for the members
 * there, who may not see the forum the train's post is in: its line invites them to sign up,
 * which lets them in unless somebody keeps them out. Until then Discord shows them the link as
 * an unknown channel, so the line promises neither the link nor the access. It has the post's
 * controls but the button that moves the train: a train is moved from its post, by who is
 * there; the copy is for getting in.
 *
 * `picture: false` is the copy without the post's picture, for when Discord refuses it;
 * `customEmoji: false` the copy with plain emoji on its buttons, for when Discord refuses one.
 */
export function renderMirror(
  kind: MirrorKind,
  rendered: RenderedPost,
  place: MirrorPlace,
  {
    picture = true,
    files = true,
    customEmoji = true,
  }: { picture?: boolean; files?: boolean; customEmoji?: boolean } = {},
): V2Message {
  if (kind === 'status') return postMessage(rendered.layout, { picture, files, customEmoji });
  if (kind === 'region') {
    return postMessage(rendered.layout, {
      picture,
      files,
      customEmoji,
      move: false,
      lead:
        'A raid train that stops in this region. ' +
        `Sign up here to follow it in its post: <#${place.postId}>`,
    });
  }
  const region = place.regionChannelId === undefined ? '' : ` in <#${place.regionChannelId}>`;
  const what = kind === 'ex' ? 'A raid at an elite raid gym' : 'A raid';
  return postMessage(rendered.layout, {
    picture,
    files,
    customEmoji,
    lead: `${what}${region}: <#${place.postId}>`,
  });
}
