/**
 * What staff are told of the forums of a new forum's name that no region has (staging F3 of
 * phase 19): a board of the server's from before its data was deleted, which nothing names any
 * more, so Pine cannot tell it from a forum somebody else made and never takes it back.
 */
export function oldBoardsWords(forumIds: readonly string[]): string {
  const named = forumIds.map((id) => `<#${id}>`);
  if (named.length === 1) {
    return (
      `${named[0] ?? ''} has the same name as the new forum but belongs to no region: if it is ` +
      'an old board of mine, delete it'
    );
  }
  const list = `${named.slice(0, -1).join(', ')} and ${named.at(-1) ?? ''}`;
  return (
    `${list} have the same name as the new forum but belong to no region: if they are old ` +
    'boards of mine, delete them'
  );
}
