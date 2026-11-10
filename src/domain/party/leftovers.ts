import type { Party } from './party.js';

/**
 * A message an ended party left on Discord that is not known to be deleted: a copy of its
 * message (`channelId`, where it stands), or the line that linked to it in its region's channel
 * (no `channelId`: its region's, `regionId`).
 */
export interface LeftoverCopy {
  partyId: string;
  messageId: string;
  channelId: string | null;
  regionId: number | null;
  /** When the party ended: its last write. */
  endedAt: number;
}

/**
 * What an ended party leaves to be deleted: its copies and the line that links to it in its
 * region's channel. Nothing for a party that has not ended.
 */
export function leftoversOf(party: Party): LeftoverCopy[] {
  if (party.status !== 'ended') return [];
  const endedAt = party.updatedAt;
  const copies: LeftoverCopy[] = party.mirrorMessages.map(({ channelId, messageId }) => ({
    partyId: party.id,
    messageId,
    channelId,
    regionId: null,
    endedAt,
  }));
  const link = party.regionLinkMessageId;
  if (link !== null && party.regionId !== null) {
    copies.push({
      partyId: party.id,
      messageId: link,
      channelId: null,
      regionId: party.regionId,
      endedAt,
    });
  }
  return copies;
}
