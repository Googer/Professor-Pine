/**
 * Whether the staff of a server may touch a gym, or put a gym at a place: the one rule against
 * gym administration across servers (Matt, 2026-10-13).
 *
 * `regionServers` has, for every region the gym or the place lies in, the server that region
 * belongs to (the row id of its guild; null for a region that belongs to no server). `guildId`
 * is the staff member's server, undefined when it has no row.
 *
 * - In a region of their own server: yes, also when a region of another server covers it too
 *   (overlapping regions: both servers may).
 * - In no region of any server: yes, for every server, so that a gym outside all regions can
 *   still be added, corrected or removed.
 * - Only in regions of other servers: no.
 */
export function withinReach(
  regionServers: readonly (number | null)[],
  guildId: number | undefined,
): boolean {
  const servers = regionServers.filter((server): server is number => server !== null);
  if (servers.length === 0) return true;
  return guildId !== undefined && servers.includes(guildId);
}
