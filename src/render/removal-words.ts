/*
 * The words of the question before a party is ended by a moderator (plan 8Q, `removalDialog`):
 * archive its post or delete it, on Discord and in staff's Delete… on the map (plan 8M-8B),
 * without an import, so that the map's page takes them whole: one wording for both.
 */

/** The title of staff's closing of a party (`/delete`'s dialog): `Close this raid`. */
export function closeTitle(word: string): string {
  return `Close this ${word}`;
}

/** Its question: `Close this raid?`. */
export function closeQuestion(word: string): string {
  return `Close this ${word}?`;
}

/** The label of the choice between the ways. */
export const REMOVAL_LABEL = 'The post';

/** The ways, the harsher last: never picked to start with. */
export const REMOVAL_CHOICES = [
  { value: 'archive', label: 'Archive post', description: 'Keeps it readable and locked.' },
  {
    value: 'delete',
    label: 'Delete post',
    description:
      'Removes it with everything written in it: for what nobody should keep reading, like a ' +
      'home address.',
  },
] as const;

/**
 * What the question says where the bot may not delete the post (`forum`, the post's forum as the
 * caller names it): it will be archived, why deleting it is not offered, and what Submit does.
 */
export function archiveOnlyText(question: string, forum: string): string {
  return (
    `${question}\n\nIts post will be archived (kept readable and locked): I can't ` +
    `delete posts in ${forum} (Manage Threads is missing there), so deleting it is ` +
    'not offered. Delete it yourself if nobody should keep reading it.\n\n' +
    'Submit archives its post.'
  );
}
