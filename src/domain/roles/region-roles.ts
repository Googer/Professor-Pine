import { planChange, takeable, type Roster, type RosterEntry, type Skipped } from './self-roles.js';

/*
 * Which self-assignable roles open which region for a member (plan 8M-20; review R1, R12): the
 * web map's "Your regions…" offers to join a region the member does not see on Discord by a role
 * that opens it, and to leave one by the role that alone opens it for them. Pure: what Discord
 * makes of a role given or taken is the caller's (`GateLook.seesWith`, the gateway's `viewsWith`),
 * what a request takes along is `planChange`'s, as `/iam` and the menus plan it.
 */

/** How a member stands to a region's gate (`MemberAccess`, as the gateway says it). */
export type GateAccess = 'visible' | 'hidden' | 'barred';

/** A region by the channel that decides who sees it: its forum, or its text channel (`regionGate`). */
export interface RegionGate {
  regionId: number;
  gateId: string;
}

/** What Discord says of the member and the gates (`MemberGates`). */
export interface GateLook {
  /** By gate; a gate that is gone is not in it. */
  access: ReadonlyMap<string, GateAccess>;
  /** Whether the member would see a gate holding exactly these roles (not the everyone role). */
  seesWith(gateId: string, roleIds: ReadonlySet<string>): boolean;
  /**
   * What denies the member the view of a gate: an overwrite of their own that denies View Channel,
   * and the roles they hold whose overwrites deny it.
   */
  denials(gateId: string): { own: boolean; roles: readonly string[] };
}

/** A role that would open a region the member does not see. */
export interface RegionJoin {
  entry: RosterEntry;
  /** The other regions it would open too, by id. */
  alsoOpens: number[];
  /**
   * What the request would take along unasked (`planChange`'s `displaced`: the other role of a
   * pick-one group), and the regions only that took them into.
   */
  alsoLeaves: { entries: RosterEntry[]; regions: number[] };
  /** Why it would not be given now (`stuck`: a role of the group that will not go unasked). */
  stuck?: Skipped;
}

/** A role the member holds that by itself opens a region for them (A2, R12). */
export interface RegionLeave {
  entry: RosterEntry;
  /** Whether leaving it closes the region (nothing else they hold opens it). */
  closes: boolean;
  /** The other regions leaving closes too, by id (none where it does not close this one). */
  alsoCloses: number[];
  /**
   * Where it does not close the region, what keeps it open: the other roles of the roster they
   * hold that open it by themselves, and whether a role staff gave them (not on the roster) does.
   */
  stillOpenBy: { entries: RosterEntry[]; staffRole: boolean };
}

/** How a member stands to one region, and what they may do about it. */
export interface RegionChoice {
  regionId: number;
  access: GateAccess;
  /** Only where the region is hidden (R4: never past a denial). */
  join: RegionJoin[];
  /** Every role they hold that by itself opens it and can be taken away (`takeable`). */
  leave: RegionLeave[];
}

/**
 * How the member stands to a region on the page (A6): kept out (`barred`) only by an overwrite of
 * their own that denies the view, or by a role that denies it and that nobody can give themselves
 * (not on the roster without a problem); a region only self-assignable roles keep them out of is
 * `hidden`, which a join may open by giving one of them back. The party lists keep `memberAccess`'s
 * own `barred`.
 */
function pageAccess(
  access: GateAccess,
  denials: { own: boolean; roles: readonly string[] },
  roster: Roster | undefined,
): GateAccess {
  if (access === 'visible') return access;
  if (denials.own) return 'barred';
  const selfAssignable = (roleId: string): boolean =>
    roster?.entries.some((entry) => entry.role?.id === roleId && entry.problem === undefined) ??
    false;
  return denials.roles.some((roleId) => !selfAssignable(roleId)) ? 'barred' : 'hidden';
}

const without = (held: ReadonlySet<string>, ...ids: string[]): Set<string> => {
  const left = new Set(held);
  for (const id of ids) left.delete(id);
  return left;
};

/**
 * Per region whose gate is known: how the member stands to it, the roles of the roster that
 * would open it where it is hidden (R1: not seen with `held`, seen with `held` and the role, less
 * what giving it takes along), and the roles they hold that alone open it (seen with `held`, not
 * without the role). The roster's order is kept; without a roster nothing is offered.
 */
export function regionChoices(
  regions: readonly RegionGate[],
  look: GateLook,
  roster: Roster | undefined,
  held: ReadonlySet<string>,
): RegionChoice[] {
  const known = regions.flatMap((region) => {
    const access = look.access.get(region.gateId);
    return access === undefined
      ? []
      : [{ ...region, access: pageAccess(access, look.denials(region.gateId), roster) }];
  });
  const none = new Set<string>();
  /** The regions, other than `except`, seen with `before` and not with `after`. */
  const closed = (before: ReadonlySet<string>, after: ReadonlySet<string>, except: number) =>
    known
      .filter(
        (other) =>
          other.regionId !== except &&
          look.seesWith(other.gateId, before) &&
          !look.seesWith(other.gateId, after),
      )
      .map((other) => other.regionId);
  return known.map(({ regionId, gateId, access }): RegionChoice => {
    if (!roster) return { regionId, access, join: [], leave: [] };
    /** Whether a role by itself opens the gate (with no role, the member does not see it). */
    const opensAlone = (roleId: string): boolean =>
      look.seesWith(gateId, new Set([roleId])) && !look.seesWith(gateId, none);
    const leave = roster.entries.flatMap((entry): RegionLeave[] => {
      const id = entry.role?.id;
      if (id === undefined || !held.has(id) || !takeable(entry) || !opensAlone(id)) return [];
      const after = without(held, id);
      const closes = look.seesWith(gateId, held) && !look.seesWith(gateId, after);
      const others = [...held].filter((other) => other !== id && opensAlone(other));
      const onRoster = (roleId: string) =>
        roster.entries.find((other) => other.role?.id === roleId);
      return [
        {
          entry,
          closes,
          alsoCloses: closes ? closed(held, after, regionId) : [],
          stillOpenBy: closes
            ? { entries: [], staffRole: false }
            : {
                entries: others.flatMap((other) => {
                  const found = onRoster(other);
                  return found ? [found] : [];
                }),
                staffRole: others.some((other) => onRoster(other) === undefined),
              },
        },
      ];
    });
    const join =
      access !== 'hidden'
        ? []
        : roster.entries.flatMap((entry): RegionJoin[] => {
            const id = entry.role?.id;
            if (id === undefined || held.has(id) || entry.problem !== undefined) return [];
            const plan = planChange(roster, held, { give: [id], take: [] });
            const [skipped] = plan.skipped;
            // A stuck role is weighed as if what is in its way had gone: the button says why not.
            const displaced =
              skipped === undefined
                ? plan.displaced
                : roster.entries.filter(
                    (other) =>
                      other !== entry &&
                      other.group !== undefined &&
                      other.group.id === entry.group?.id &&
                      other.role !== undefined &&
                      held.has(other.role.id),
                  );
            const after = new Set(
              without(held, ...displaced.flatMap((other) => (other.role ? [other.role.id] : []))),
            );
            after.add(id);
            if (!look.seesWith(gateId, after)) return [];
            const alsoOpens = known
              .filter(
                (other) =>
                  other.regionId !== regionId &&
                  !look.seesWith(other.gateId, held) &&
                  look.seesWith(other.gateId, after),
              )
              .map((other) => other.regionId);
            return [
              {
                entry,
                alsoOpens,
                alsoLeaves: {
                  entries: skipped === undefined ? plan.displaced : [],
                  regions: skipped === undefined ? closed(held, after, regionId) : [],
                },
                ...(skipped === undefined ? {} : { stuck: skipped }),
              },
            ];
          });
    return { regionId, access, join, leave };
  });
}
