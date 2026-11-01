/*
 * The words of a group's line in the dialogs about groups (plan 8X-1B) and in Group… on the map
 * (plan 8M-8B), without an import, so that the map's page takes it whole: one wording for both.
 */

/**
 * A group's short line: how many are in it (`2 trainers`, `Nobody yet`, `2/4 coming`), then for a
 * raid or a max battle its meeting time as a clock time (`meeting at 7:30 PM`), or that it has
 * none yet (null); `undefined` for a party without meeting times. The clock time is the caller's:
 * the server's zone on Discord, the reader's on the map.
 */
export function groupLine(size: string, meeting: string | null | undefined): string {
  if (meeting === undefined) return size;
  return meeting === null ? `${size} · no meeting time yet` : `${size} · meeting at ${meeting}`;
}
