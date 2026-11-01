/**
 * Where the region editor is (plan 8M-10): on the map, turned on by `?edit=regions` in the map's
 * address. The server leads `/s/<guild>/regions/edit` there; the page reads and keeps the query.
 * No imports: the page's bundle takes it without the server's code.
 */

/** The query's name and value that have the editor on. */
export const EDIT_QUERY_NAME = 'edit';
export const EDIT_QUERY_VALUE = 'regions';

/** The map's address of a server with the region editor on. */
export const editingMapPath = (guild: string): string =>
  `/s/${guild}/map?${EDIT_QUERY_NAME}=${EDIT_QUERY_VALUE}`;
