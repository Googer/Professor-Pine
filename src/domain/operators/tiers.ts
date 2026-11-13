/**
 * Who looks after what every server of an instance shares (plan 19B-1; spec
 * `2026-11-12-multi-server-instance-design.md`, "Operators"): the one rule of the two tiers, which
 * every surface asks (the guards of `/operator`, `/help`).
 *
 * - **Instance operators:** the owner (`OWNER_ID`) and the ids of the file's `operators`. They
 *   alone remove a member's data (`/operator forget`), and later see and remove servers.
 * - **Shared-data operators:** the instance operators, and on an instance that is not open the
 *   bot-management staff of the server a command came from, where that server may have this Pine
 *   (`servers` unset: any server; a list: a server of the list). On an open instance
 *   (`servers: "open"`) the instance operators alone. In a direct message the instance operators
 *   alone: no member's roles are read across servers. They change the boss list's overrides and
 *   sync it, set and end the event window, and clear the image cache.
 */

/** What the tiers read of an instance. */
export interface Instance {
  /** `OWNER_ID`; blank for none. */
  ownerId: string;
  /** The file's `operators`: Discord user ids. */
  operators: readonly string[];
  /** Whether the file's `servers` is `"open"`: any server may have this Pine. */
  open: boolean;
  /**
   * The file's `servers` as a list of server ids; undefined where it is unset, open or an empty
   * list (which is as unset).
   */
  listed: readonly string[] | undefined;
}

/** Who asks, and where. */
export interface Asker {
  userId: string;
  /** The server asked from; undefined in a direct message with the bot. */
  serverId: string | undefined;
  /**
   * Holds a bot-management role (admin, moderator, bot developer) in the server asked from; read
   * only where there is one.
   */
  botManagement: boolean;
}

/** Whether this user is an instance operator: the owner, or an operator the file names. */
export function isInstanceOperator(userId: string, instance: Instance): boolean {
  return (
    (instance.ownerId !== '' && userId === instance.ownerId) || instance.operators.includes(userId)
  );
}

/**
 * Whether who asks may change what every server shares, where they ask: an instance operator
 * anywhere; on an instance that is not open, also the bot-management staff of the server asked
 * from where the instance lists no servers or lists that one, never in a direct message.
 */
export function isSharedDataOperator(asker: Asker, instance: Instance): boolean {
  if (isInstanceOperator(asker.userId, instance)) return true;
  const { serverId } = asker;
  if (serverId === undefined || instance.open || !asker.botManagement) return false;
  return instance.listed === undefined || instance.listed.includes(serverId);
}
