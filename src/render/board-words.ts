/**
 * The words about the region's board that go to a member (plan 8R-9F): the board keeps only the
 * bot's lists, and what a member writes there is deleted.
 */

/**
 * The direct message to a member whose message in the board was deleted (plan 8R-9F, Q2): at
 * most once a day. Plain text: a DM that only says something.
 */
export function boardDeletedDm(boardId: string, regionChannelId: string): string {
  return (
    `I deleted your message in <#${boardId}>: the board keeps only my lists of what is on. ` +
    `Chat in <#${regionChannelId}>, or report with a command such as \`/raid\`, \`/research\` ` +
    'or `/rocket`, there or in the board.'
  );
}
