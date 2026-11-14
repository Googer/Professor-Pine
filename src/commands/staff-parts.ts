import type { SubcommandPart } from '../discord/command-group.js';
import { requireBotManagement, requireServerAdmin } from '../discord/guards.js';

/**
 * The parts of a staff command (`/admin`, `/region`), each guarded before its own guards (plan
 * 19C-2; the guard is each part's, so that a few can admit more than the rest): for staff as
 * `/admin` counts them (`requireBotManagement`) by default, so that a part added to the list is
 * staff's without a word; only those `setup` names (the parts that set a server up, which its
 * checklist sends to) for whoever may set the server up (`requireServerAdmin`: also its owner and
 * who may manage it). The order is `parts`'.
 */
export function staffParts(
  parts: readonly SubcommandPart[],
  setup: readonly SubcommandPart[],
): SubcommandPart[] {
  return parts.map((part) => ({
    ...part,
    guards: [
      setup.includes(part) ? requireServerAdmin : requireBotManagement,
      ...(part.guards ?? []),
    ],
  }));
}
