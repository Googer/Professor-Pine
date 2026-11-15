/**
 * Who may have this Pine (plan 19C-1; spec `2026-11-12-multi-server-instance-design.md`,
 * "Joining, the setup state, leaving"): the one rule that the check at every ready, the check on
 * joining, `/operator servers` and the operators' tiers (`isTrustedServer`) ask.
 *
 * A server may have this Pine when it is not blocked, and the instance is open
 * (`servers: "open"`), or the file lists it, or it was recorded at the upgrade to 2.1, or an
 * instance operator allowed it. The file's `servers` unset (or an empty list) lists none: the
 * instance is closed to new servers, open only to the recorded and the allowed.
 */

/** What the instance's database says of a server (`ServerRecord`, migration 061). */
export interface Standing {
  /** Recorded at the upgrade to 2.1 (it had a `Guild` row then): allowed by that. */
  recorded: boolean;
  /** Allowed by an instance operator (`/operator servers allow`). */
  allowed: boolean;
  /** Blocked by an instance operator: wins over every allowance. */
  blocked: boolean;
}

/** A server the database says nothing of. */
export const NO_STANDING: Standing = Object.freeze({
  recorded: false,
  allowed: false,
  blocked: false,
});

/** What the rule reads of the instance's settings (`servers`). */
export interface Admission {
  /** `servers: "open"`: any server not blocked. */
  open: boolean;
  /** The servers the file lists; undefined where it lists none (unset, open, an empty list). */
  listed: readonly string[] | undefined;
}

/** Whether a server may have this Pine. */
export function mayHave(serverId: string, instance: Admission, standing: Standing): boolean {
  if (standing.blocked) return false;
  return (
    instance.open ||
    standing.recorded ||
    standing.allowed ||
    (instance.listed?.includes(serverId) ?? false)
  );
}
