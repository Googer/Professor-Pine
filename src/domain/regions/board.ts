/** What a region says of its board (plan 8R-9): its forum, and the summary post recorded in it. */
export interface BoardRecord {
  forumChannelId: string | null;
  summaryMessageId: string | null;
}

/**
 * The thread of a region's board (plan 8R-9): its summary post, where the region has a forum and
 * a summary recorded in it; null else. The one rule of where "Today’s Stops" is drawn and of the
 * answers that name the board (review W4).
 */
export function boardThreadOf(region: BoardRecord): string | null {
  return region.forumChannelId === null ? null : region.summaryMessageId;
}

/**
 * The region channels among these whose region has a board (`boardThreadOf`), in their order:
 * those the answers of `/research`, `/rocket` and the map name (review W4).
 */
export function channelsWithBoards(
  channelIds: readonly string[],
  regionOf: (channelId: string) => BoardRecord | undefined,
): string[] {
  return channelIds.filter((channelId) => {
    const region = regionOf(channelId);
    return region !== undefined && boardThreadOf(region) !== null;
  });
}
