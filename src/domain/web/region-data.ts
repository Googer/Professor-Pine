/**
 * What `GET /s/<guild>/api/regions/mine` answers (plan 8M-20, "Your regions on the map"), and
 * what a join or leave answers, as the page reads them. Types alone, with no import: the page's
 * bundle (`src/web/client/`) takes them without the server's code.
 */

/** How the member stands to a region on Discord: sees it, does not, or is kept out on purpose. */
export type RegionAccess = 'visible' | 'hidden' | 'barred';

/** A role that would open a region the member does not see on Discord. */
export interface RegionJoinView {
  roleId: string;
  /** The role's name as Discord has it. */
  name: string;
  /** The other regions it opens too, by id. */
  alsoOpens: number[];
  /** What it takes along unasked: the other role of a pick-one group, and the regions it closes. */
  alsoLeaves: { roles: string[]; regions: number[] };
  /** Why it cannot be given now, in `/iam`'s words; null when it can. */
  stuck: string | null;
}

/** A role the member holds that by itself opens a region for them. */
export interface RegionLeaveView {
  roleId: string;
  name: string;
  /** Whether leaving it closes the region. */
  closes: boolean;
  /** The other regions leaving closes too, by id. */
  alsoCloses: number[];
  /**
   * Where leaving does not close the region, what keeps it open: the names of the other roles,
   * and "a role staff gave you" for one that is not self-assignable.
   */
  stillOpenBy: string[];
}

/** One region of the map (one `/api/geo` has) whose gate the bot sees. */
export interface RegionMineView {
  id: number;
  access: RegionAccess;
  /**
   * Whether the map lists the region's raids for the member (the party lists' rule: not where
   * somebody, even by a self-assignable role, keeps them out on Discord; W3).
   */
  listed: boolean;
  join: RegionJoinView[];
  leave: RegionLeaveView[];
}

export interface RegionsMineView {
  /**
   * Discord could not be asked: the member is one by what it said lately, nothing is said of the
   * regions (R8), and nothing can be joined or left.
   */
  readOnly: boolean;
  /** Whether the server offers roles to join or leave its regions (`settings.features.roles`). */
  roles: boolean;
  regions: RegionMineView[];
}

/** What a join or leave answers: what came of it in `/iam`'s words, and the view as it is now. */
export interface RegionChangeAnswer {
  ok: boolean;
  /** `RoleChangeOutcome`'s kind: `done`, `partial`, `refused` (also a role skipped), `unavailable`. */
  outcome: 'done' | 'partial' | 'refused' | 'unavailable';
  text: string;
  /** The view after the change, from the member fetched afresh; absent where it could not be read. */
  view?: RegionsMineView;
}
