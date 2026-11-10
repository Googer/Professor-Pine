/** What the export needs of a gym. */
interface ExportedGym {
  id: number;
  name: string;
  lat: number;
  lon: number;
}

/** The first line of the export, as the legacy bot wrote it: the map tools go by it. */
export const TSV_HEADER = 'Gym Name\tLongitude\tLatitude';

/**
 * A name as a cell of the export: a tab or a line break would end the cell or the row, so each
 * run of them, and of any other control character, is a space, and a double quote is an
 * apostrophe (as the legacy bot wrote it: the map tools that read the file take a double quote
 * for the start of a quoted cell). A name that begins with `=`, `+`, `-` or `@` is left as it
 * is: the file is for a map layer, not for a spreadsheet (Matt has yet to rule otherwise).
 */
function cell(name: string): string {
  return name
    .replace(/[\p{Cc}\u2028\u2029]+/gu, ' ')
    .replace(/"/g, "'")
    .trim();
}

/**
 * The gyms as a file of tab-separated values, one gym per line under the header, by name (and
 * by id for gyms of one name), longitude before latitude. Every line ends with a line feed.
 */
export function gymsTsv(gyms: readonly ExportedGym[]): string {
  const rows = [...gyms]
    .map((gym) => ({ ...gym, name: cell(gym.name) }))
    .sort((a, b) => a.name.localeCompare(b.name, 'en') || a.id - b.id)
    .map((gym) => `${gym.name}\t${gym.lon}\t${gym.lat}`);
  return [TSV_HEADER, ...rows].map((line) => `${line}\n`).join('');
}
