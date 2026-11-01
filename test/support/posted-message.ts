import { EAST_CHANNEL, WEST_CHANNEL } from './gyms.js';
import type { PostedMessage, ReplyPayload } from '../../src/commands/screenshots/mention.js';
import type { ScreenshotSource } from '../../src/services/screenshot-service.js';

/** The author of the posted messages of the screenshot tests, and another member. */
export const AUTHOR = '700000000000000001';
export const OTHER = '700000000000000002';

/** A posted message that records what the trigger did to it. */
export function posted(attachments: ScreenshotSource[], more: Partial<PostedMessage> = {}) {
  const did: string[] = [];
  const replies: ReplyPayload[] = [];
  const message: PostedMessage = {
    id: '800000000000000001',
    channelId: WEST_CHANNEL,
    guildId: '412345678901234567',
    inThread: false,
    authorId: AUTHOR,
    authorBot: false,
    member: { name: 'Rhea', team: 'instinct' },
    createdAt: Date.now(),
    mentionsBot: true,
    bare: true,
    attachments,
    channelName: (id) => (id === EAST_CHANNEL ? 'east' : id === WEST_CHANNEL ? 'west' : undefined),
    react: (emoji) => {
      did.push(`react ${emoji}`);
      return Promise.resolve();
    },
    unreact: (emoji) => {
      did.push(`unreact ${emoji}`);
      return Promise.resolve();
    },
    reply: (payload) => {
      replies.push(payload);
      did.push('reply');
      return Promise.resolve({
        delete: () => {
          did.push('reply deleted');
          return Promise.resolve();
        },
      });
    },
    delete: () => {
      did.push('deleted');
      return Promise.resolve();
    },
    ...more,
  };
  return { message, did, replies };
}
