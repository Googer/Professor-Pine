/**
 * What `GET /s/<guild>/api/parties` answers (`partyView`), and what a press of a button
 * answers, as the page reads them (spec 3.2, 3.3). Types and the list of actions alone, with no
 * import: the page's bundle (`src/web/client/`) takes them without the server's
 * code. The list names nobody (attendees are counts); a party's post (`PostView`, plan 8M-8A)
 * names members exactly as the post on Discord does, never by id.
 */

/** The buttons of a post a member may press on the map (spec 3.3): the statuses, Leave, Done. */
export const MAP_ACTIONS = ['interested', 'join', 'here', 'leave', 'done'] as const;
export type MapAction = (typeof MAP_ACTIONS)[number];

/**
 * The post's Remote switch pressed on the map (plan 8X-5): `POST /s/<guild>/api/parties/<id>/
 * remote`, no body, which toggles it as the post's button does. Not one of `MAP_ACTIONS`: those
 * are the buttons of `MapAttendance.actions`; whether Remote is offered is `MapAttendance.remote`.
 */
export const MAP_REMOTE = 'remote';

/**
 * The post's +1 and −1 pressed on the map (plan 8M-8B): `POST /s/<guild>/api/parties/<id>/more`
 * and `…/less`, no body, as the post's buttons change the member's head count (a newcomer's +1
 * signs them up as interested). Offered while anything may be pressed (`MapAttendance.count`).
 */
export const MAP_COUNTS = ['more', 'less'] as const;
export type MapCount = (typeof MAP_COUNTS)[number];

/**
 * An answer to the completion question on the map (plan 8M-8B): `POST …/answer` with `{ yes }`,
 * as the question's "Yes, done" and "Not yet" (`MapAttendance.asked`).
 */
export const MAP_ANSWER = 'answer';

/**
 * A press of a button: with a group, the one a newcomer chose in the popup (`MapAttendance.pick`;
 * before plan 8X-1B, `join` with a group was "Join B").
 */
export interface MapPress {
  action: MapAction;
  group?: string;
}

/** Under which status a post lists a member; the member's own status on the map too. */
export type MapStatus = 'interested' | 'coming' | 'present' | 'complete';

/** The heads of a group by status, as the post counts them (a member's +1s counted). */
export interface GroupCounts {
  /** The group's letter. */
  id: string;
  interested: number;
  coming: number;
  present: number;
}

/** Who comes to a party, as counts, and what the member asking may press. */
export interface MapAttendance {
  /** Every group of the party, in order: one for a party without groups of its own. */
  groups: GroupCounts[];
  /**
   * How many are going (plan 8M-7): the committed heads of the whole party, coming, here and asked
   * whether they are done, +1s counted, by the lobbies' rule (`goingCount` of the domain): the
   * map's green count and the list's "Most going" read it, never a sum of their own.
   */
  going: number;
  /** The member's own status and group; null when they are not signed up. */
  mine: { status: MapStatus; group: string } | null;
  /** The buttons that apply, in the post's order; none while the map is read-only. */
  actions: MapPress[];
  /**
   * Which group, asked of a member who is not signed up for a party of several groups (plan
   * 8X-1B, as the post's dialog asks): the choices in its order, the first chosen to start with;
   * Interested, Join and Here send the chosen `group` (none for "any group with room"). Absent
   * where nothing is asked.
   */
  pick?: MapGroupChoice[];
  /**
   * The post's Remote switch (plan 8X-5): whether the member takes part remotely (`on`; false
   * while not signed up), and whether they may switch it on the map (`offered`: where the post
   * offers Remote, `remoteAllowed`, every party but an elite raid; never while read-only). It is
   * pressed apart from `actions` (`MAP_REMOTE`).
   */
  remote: MapRemote;
  /**
   * Whether +1 and −1 may be pressed (plan 8M-8B, `MAP_COUNTS`): as the post has them, for every
   * member; never while read-only.
   */
  count: boolean;
  /**
   * The completion question to this member (plan 8M-8B): somebody of their group was done and
   * asked whether they are too; `until` is when no answer counts as done (`pendingUntil`), `word`
   * the party in the question's words (`partyWord`: `raid`, `max battle`). Absent where they were
   * not asked, and while read-only.
   */
  asked?: { until: number; word: string };
  /**
   * Group… on the map (plan 8M-8B): the choices of the post's dialog as the server worded them,
   * or why it would not open. Absent for a party without groups, and while read-only (X10).
   */
  regroup?: MapRegroup;
}

/**
 * Group… for a member on the map (plan 8M-8B), as the post's dialog of `groupWays` has it: why it
 * would not open (`refused`, in its words), or its title (`Change group`, `Join a group`), its text
 * (which group the member is in; what Submit does where one way is left), the label of its choice
 * (`Move to`, `Join`), whether it was drawn for a member signed up (sent back with a move, so that
 * one who left meanwhile is refused), the groups to move to or join (a new group is not among
 * them: it needs a word with the others, on Discord), and whether a new group is a way there
 * (`newGroup`: the page links the post).
 */
export type MapRegroup =
  | { refused: string }
  /** A new group is the only way left (review W-1): nothing to submit on the map, the post's link. */
  | { onlyNewGroup: true }
  | {
      title: string;
      text: string;
      label: string;
      signedUp: boolean;
      choices: MapGroupWay[];
      newGroup: boolean;
    };

/**
 * Meet… on the map (plan 8M-8B, `GET …/parties/<id>/meet`), as the post's dialog offers it now:
 * its title, text and the choice's label; the member's group by its letter and stamp (sent back,
 * so that a move meanwhile is refused); the times as moments in time order, the in-game RSVP ones
 * (`rsvp`) and the hatch among them, which the page names in the reader's zone; the group's
 * meeting time now (`set`: "No meeting time" is offered while it has one), and the time chosen to
 * start with.
 */
export interface MapMeet {
  title: string;
  text: string;
  label: string;
  group: string;
  stamp: string;
  times: Array<{ at: number; rsvp: boolean; hatch?: true }>;
  set: number | null;
  picked: number | null;
}

/**
 * The report of a party to the moderators on the map (plan 8M-8B, X2;
 * `GET …/parties/<id>/report`), opened as `/report`'s form opens, in its words: its title, the
 * label of its one field, the field's placeholder, and how long a reason may be.
 */
export interface MapReport {
  title: string;
  label: string;
  placeholder: string;
  maxLength: number;
}

/**
 * A group Group… offers (`MapRegroup`): its letter and stamp (what a move sends back, refused once
 * the group went or was opened again), its label (`Group B: by the bridge`), how many are in it as
 * the dialog says it (`2 trainers`, `Nobody yet`, `2/4 coming`), and for a raid or a max battle its
 * meeting time (epoch milliseconds, shown in the reader's zone), null while it has none.
 */
export interface MapGroupWay {
  group: string;
  stamp: string;
  label: string;
  size: string;
  meeting?: number | null;
}

/** The Remote switch of a party on the map (`MapAttendance.remote`). */
export interface MapRemote {
  offered: boolean;
  on: boolean;
}

/** A choice of the popup's question "which group?": a group's letter, none for any with room. */
export interface MapGroupChoice {
  group?: string;
  label: string;
}

/** A raid's gym as its post names it: the name it shows, its place, its address line. */
export interface MapRaidPlace {
  name: string;
  /** Six decimals. */
  lat: number;
  lon: number;
  /** The address line (`addressLine`), or null when nothing of it is known. */
  address: string | null;
}

/** The groups of raid tiers, as `RaidTierGroup` spells them (plan 8M-7). */
export type MapTierGroup = '1' | '3' | '5' | 'mega' | 'elite' | 'shadow';

export interface MapRaid {
  kind: 'raid';
  id: string;
  /** The gym, as `/api/geo` lists it; null once the gym was deleted. */
  gymId: number | null;
  /** The post's picture (the egg, or the boss), only from the hosts the page may load. */
  picture: string | null;
  /** The tier in the posts' words: `Level 5 raid`, `Shadow Level 3 raid`. */
  tier: string;
  /**
   * The tier's group (plan 8M-7, `raidTierGroup` of the domain): the ring of its marker, a named
   * color of `theme.css` each.
   */
  tierGroup: MapTierGroup;
  /**
   * What it is in its post's own heading words (plan 8M-7, fix round 1, `raidLook` over the
   * renderer's `headlineParts`): `Level 5 raid against Yveltal`, `Level 5 raid (egg)`. The map's
   * popup, its list and the list of things at one place name the raid by it.
   */
  heading: string;
  /** The boss the post names: what it is against, or what the egg hatches as. */
  boss: string | null;
  /** Egg or hatched, by the clock when the view was made. */
  stage: 'egg' | 'hatched';
  /** Epoch milliseconds; null while nobody said. */
  hatchTime: number | null;
  endTime: number | null;
  /** The post on Discord (`https://discord.com/channels/…`, which opens the app). */
  link: string;
  /**
   * Where it is, as its post's Where names it (plan 8M-6): what the side panel shows of a raid at
   * a gym the map does not show. Null once the gym was deleted.
   */
  place: MapRaidPlace | null;
  /**
   * Whether the member may change its times, boss and moves on the map: as on Discord, where
   * anybody in the post may (plan 8M-8B, Matt's ruling; anybody the map shows the raid to);
   * never while read-only.
   */
  mayChange: boolean;
  attendance: MapAttendance;
  /** The key of its post as last shown (`postKey`, plan 8M-8A); null while it has none yet. */
  postKey: string | null;
  /** Staff's Delete… (plan 8M-8B); absent for anybody else. */
  close?: MapClose;
  /**
   * Report… to the moderators (plan 8M-8B, review W-7): for a member who sees the party's forum on
   * Discord, never while read-only; absent otherwise.
   */
  mayReport?: true;
}

/** What kind of battles a train goes to, as `TrainKind` spells it (plan 8X-4). */
export type MapTrainKind = 'raid' | 'dynamax' | 'gigantamax';

/**
 * What a train of each kind is called (plan 8X-4; design 6.1), worded once for every place that
 * names it: the heading of its post and its brief, `/train`'s choices, the panel's menu, `/help`,
 * the news of a new train, and the map (`MapTrain.trainKindWords`, plan 8X-5). Here, without an
 * import, so that a page may take it; the renderer's `train-words.ts` gives it on.
 */
export const TRAIN_KIND_WORDS: Readonly<Record<MapTrainKind, string>> = {
  raid: 'Raid Train',
  dynamax: 'Max Battle Train',
  gigantamax: 'Gigantamax Train',
};

export interface MapTrain {
  kind: 'train';
  id: string;
  name: string;
  /**
   * What kind of battles it goes to (plan 8X-5; `/train kind:`, the panel's menu), and the
   * train's name for it (`TRAIN_KIND_WORDS`): `Max Battle Train`. Not `kind`, which says that
   * the party is a train.
   */
  trainKind: MapTrainKind;
  trainKindWords: string;
  startTime: number | null;
  /** When it ends, if set: the page asks for the list again at that moment. */
  endTime: number | null;
  /**
   * The stops of its route, in order, by their keys (plan 8X-4, `stopKey`): a gym as its id
   * (`'12'`), a power spot as `w` and its Wayfarer id. It is also the version of the route: an
   * edit on the map carries the route it was drawn from (`drawn`), and one made on a route that
   * changed meanwhile is refused.
   */
  route: string[];
  /**
   * The power spots of its route that Pine keeps (plan 8X-4), by their keys in `route`, with
   * where they are, so that its line goes through them; the map shows no power spot of its own
   * until 8X-5. A gym's place is the map's gym; a stop missing from both is drawn nowhere.
   */
  spots: MapTrainSpot[];
  /** The index in `route` of the stop the train is at; null without a route or once finished. */
  stop: number | null;
  /**
   * What it does at the last stop (plan 8M-11B, S27), as the domain applies it (`endMode`): a
   * route of fewer than two stops finishes whatever its mode. A turn-back train's route is stored
   * in its travel order, reversed when it turns, so the line's arrows follow `route` as it is.
   */
  atEnd: MapAtEnd;
  /**
   * The stops ahead (plan 8M-15, design 3), as indices of `route`, in the order the train reaches
   * them until it has reached every stop once more (`stopsAhead` of `train.ts`: a loop round to the
   * stop before the current one, a turn-back out to the end and back to the start, through the
   * current stop); empty without a route and once finished. The map's badges and its Route list's
   * "next" / "in N stops" count from it.
   */
  stopsAhead: number[];
  /**
   * What lies ahead, as the post's small print says it (plan 8M-8C, R3: `aheadText`, the turning
   * and looping words the server's), for the map's Route; null where the post says nothing.
   */
  ahead: string | null;
  link: string;
  attendance: MapAttendance;
  /** The key of its post as last shown (`postKey`, plan 8M-8A); null while it has none yet. */
  postKey: string | null;
  /**
   * What the member may do to its route on the map (plan 8M-5), as the commands decide it; all
   * false while read-only. `arrange`: add, remove and move stops (signed up, the maker, staff);
   * `clear`: empty the route (the conductor, staff); `load`: put a saved route into it (who may
   * move the train, or the maker its first route).
   */
  may: MapTrainRights;
  /**
   * Move… as the post's dialog draws it now (plan 8M-8C, R1: `moveForm`, Discord's own words and
   * moves): null for who may not move the train (`mayNotMove`), for a train without a route, and
   * while read-only.
   */
  moves: MapMoves | null;
  /** Who leads the train, as the member sees it (nobody is named), and what they may do of it. */
  conductor: MapConductor;
  /**
   * Why the member may not move it on the map (plan 8M-8A, review N1; `moveRefusalOf`), null where
   * they may: the reason, and the words the page says under the post's Move… and Manage… (plan
   * 8M-8C, review C1: the commands' words, `manageRefusal`'s, as text of the page).
   */
  moveRefusal: { reason: MapMoveRefusal; text: string } | null;
  /**
   * Whether Manage… opens for the member (`mayManageOf`; branch review B2 of 8M-8C), as Discord
   * decides it before the dialog opens (`manageRefusal`): for who may move the train and staff,
   * also on a train without a route (its kind alone); never while read-only. The page offers
   * Manage… by it alone; where it is false, `moveRefusal` says why.
   */
  mayManage: boolean;
  /** Staff's Delete… (plan 8M-8B); absent for anybody else. */
  close?: MapClose;
  /**
   * Report… to the moderators (plan 8M-8B, review W-7): for a member who sees the party's forum on
   * Discord, never while read-only; absent otherwise.
   */
  mayReport?: true;
}

/**
 * Why a member may not move a train (`MapTrain.moveRefusal`): with a conductor not theirs, not
 * signed up without one, no route yet, the map read-only.
 */
export type MapMoveRefusal = 'not-conductor' | 'not-attending' | 'no-route' | 'read-only';

/** A power spot of a train's route on the map (`MapTrain.spots`): its key, name and place. */
export interface MapTrainSpot {
  key: string;
  name: string;
  lat: number;
  lon: number;
}

/**
 * What a member may do to a train on the map (`MapTrain.may`). Its kind is Manage…'s (plan 8M-8C),
 * which opens for who may move the train (`MapTrain.mayManage`).
 */
export interface MapTrainRights {
  arrange: boolean;
  clear: boolean;
  load: boolean;
}

/** What a train does at the last stop of its route, as `/train`'s option `at-end` takes it. */
export type MapAtEnd = 'finish' | 'loop' | 'turn-back';

/** The moves of Move… (Finish is Manage…'s). */
export type MapMove = 'next' | 'previous' | 'skip';

/**
 * Move… of a train on the map (plan 8M-8C, R1), as the post's dialog draws it (`moveForm` of
 * `src/render/train-dialogs.ts`): where the train is (`placeOf`: the handle of its stop, a gym's
 * id or a power spot's short hash, plan 8X-4; or `end` once the route is finished), which a move
 * carries as `from`; the dialog's text as text of the page (where the train is and what Next does;
 * with one move left what Submit does); the moves it offers in its order (`offeredMoves`: Next
 * first, a move that cannot be made left out, Previous as the undo at the end of a turn-back
 * route), each with where it leads (`targetOf`, carried as `target`), its label and the line under
 * it (the choice's description). With one move there is no choice: the text says what Submit does.
 */
export interface MapMoves {
  title: string;
  place: string;
  text: string;
  /** The label of the choice: `Where to`. */
  label: string;
  moves: Array<{ move: MapMove; target: string; label: string; line?: string }>;
}

/**
 * The conductor of a train as a member sees it: themself (`you`), somebody else (`other`), or
 * none; whether they may take the role (signed up, and not it already: `/conductor set`) and
 * give it up or take it off (the conductor, and staff: `/conductor clear`). Never while
 * read-only.
 */
export interface MapConductor {
  who: 'you' | 'other' | null;
  mayTake: boolean;
  mayDrop: boolean;
}

export interface MapMeetup {
  kind: 'meetup';
  id: string;
  name: string;
  startTime: number | null;
  endTime: number | null;
  link: string;
  attendance: MapAttendance;
  /** The key of its post as last shown (`postKey`, plan 8M-8A); null while it has none yet. */
  postKey: string | null;
  /**
   * Where it is (plan 8M-5M): the place it was made at, as it was named (a snapshot); null for a
   * meetup made before places (8D).
   */
  place: MapMeetupPlace | null;
  /** Its information as its maker wrote it (the post's "Meeting Information"), plain text. */
  info: string | null;
  /**
   * The editor on the map for who may change it (plan 8M-5M: its maker and staff; never while
   * read-only), null for anybody else: name, information, start and end. `start` is always true
   * since plan 8Z-2 (who may change a meetup sets its start signed up or not, as `/meet` has it);
   * it stays for a page loaded before, which asks no start without it.
   */
  panel: { start: boolean } | null;
  /** Staff's Delete… (plan 8M-8B); absent for anybody else. */
  close?: MapClose;
  /**
   * Report… to the moderators (plan 8M-8B, review W-7): for a member who sees the party's forum on
   * Discord, never while read-only; absent otherwise.
   */
  mayReport?: true;
}

/**
 * A meetup's place as the map shows it: its kind (a gym, a PokéStop, a power spot of a meetup
 * made before they were refused, or a pin), where it is in words (`At The Stacks`, `Near
 * Market Fountain` or `At Blue Tent (a pin)` for a pin, `At a dropped pin`), its point, and the
 * gym's id for a gym (null otherwise).
 */
export interface MapMeetupPlace {
  kind: 'gym' | 'stop' | 'powerspot' | 'pin';
  words: string;
  lat: number;
  lon: number;
  gymId: number | null;
  /**
   * The place it is at by the key the map's things at one place have (plan 8M-15: `gym:<id>`,
   * `stop:<key>` as the reports at stops key a stop, `spot:<Wayfarer id>`) and its title as it
   * was named; null for a pin. The list of the things at one place groups by it.
   */
  at: { key: string; name: string } | null;
}

/** The tiers of max battles, as `MaxTier` spells them: Dynamax 1 to 5 stars, Gigantamax. */
export type MapMaxTier = 'D1' | 'D2' | 'D3' | 'D4' | 'D5' | 'G';

/**
 * A max battle (plan 8X-5; design 7), shown as a raid is: its fields have `MapRaid`'s names
 * wherever they mean the same, so that one component of a page can draw both. It is at a power
 * spot (`spotId`, as `/api/powerspots` lists it) or at a pin, an "Unlisted power spot" (`spotId`
 * null). It has no egg and no hatch. The map draws it as a raid (plan 8M-9A), and its post's
 * controls work on it there as on any party's; its boss and end are changed on Discord alone
 * (`/boss`, `/end`: no Manage… of its own on the map).
 */
export interface MapMax {
  kind: 'max';
  id: string;
  /** The power spot's Wayfarer id; null for an unlisted power spot (a pin). */
  spotId: string | null;
  /** The post's picture (the boss), only from the hosts the page may load. */
  picture: string | null;
  /** The tier: `D1` to `D5`, `G`. */
  level: MapMaxTier;
  /** The tier in the posts' words: `Dynamax 2★`, `Gigantamax`. */
  tier: string;
  /** The boss the post names: `Machamp`. */
  boss: string;
  /** What the battle is, as its post heads it: `Dynamax Machamp (2★)`, `Gigantamax Machamp`. */
  title: string;
  /** Epoch milliseconds: a max battle always has an end. */
  endTime: number;
  /** The post on Discord (`https://discord.com/channels/…`, which opens the app). */
  link: string;
  /**
   * Where it is, as its post's Where names it: the power spot as it is now while it is the same
   * place, else as it was named; a pin as `Unlisted power spot` with no address. Six decimals.
   */
  place: MapRaidPlace;
  /** Its attendance; Done is always offered (a max battle is on from the start). */
  attendance: MapAttendance;
  /** The key of its post as last shown (`postKey`, plan 8M-8A); null while it has none yet. */
  postKey: string | null;
  /** Staff's Delete… (plan 8M-8B); absent for anybody else. */
  close?: MapClose;
  /**
   * Report… to the moderators (plan 8M-8B, review W-7): for a member who sees the party's forum on
   * Discord, never while read-only; absent otherwise.
   */
  mayReport?: true;
}

/** A party of any kind, as the map shows it. */
export type MapParty = MapRaid | MapMax | MapTrain | MapMeetup;

/**
 * Staff's Delete… of a party on the map (plan 8M-8B, X1), as `/delete`'s dialog asks: whether the
 * bot may delete its post (`PartyService.mayDeletePost`; where it may not, the form offers
 * "archive only" and says why, naming the forum: `forum`, `#west-raids`). Only for staff, never
 * while read-only.
 */
export interface MapClose {
  mayDelete: boolean;
  forum: string;
  /** The party in the dialog's words (`partyWord`: `raid`, `max battle`; review W-4). */
  word: string;
}

/** The active parties of a server a member may see, in the order they were made. */
export interface PartiesView {
  /** The zone the server's posts give times in (the server's zone). */
  zone: string;
  /** Discord cannot be reached: nothing can be pressed (spec 2.5). */
  readOnly: boolean;
  raids: MapRaid[];
  /**
   * The max battles (plan 8X-5), in the order they were made: a list of their own, so that a page
   * made before them, which reads `raids`, `trains` and `meetups`, goes on as it was.
   */
  maxes: MapMax[];
  trains: MapTrain[];
  meetups: MapMeetup[];
}

/**
 * How a time of a post is shown (Discord's timestamp styles): `t` a clock time, `T` with seconds,
 * `d` a short date, `D` a long one, `f` the date and clock time, `F` with the weekday, `R` how long
 * until or since. The page shows each in the reader's own zone and language, as Discord does.
 */
export type PostTimeStyle = 't' | 'T' | 'd' | 'D' | 'f' | 'F' | 'R';

/**
 * A piece of a post's text as the page draws it (plan 8M-8A): Discord's markdown read on the
 * server (`postText`, `src/render/post-text.ts`) into nodes, never HTML. `text` is as a reader sees
 * it (the escapes of what members wrote undone); `link` only to an address the server allows
 * (Google Maps, a post of this server on Discord, Pine's own pages), which the page checks again;
 * `emoji` with Pine's address of its picture where Pine serves one (`src`), else its name to show;
 * `time` in epoch milliseconds.
 */
export type PostNode =
  | { kind: 'text'; text: string }
  | { kind: 'strong' | 'em' | 'strike' | 'underline'; children: PostNode[] }
  | { kind: 'code'; text: string }
  | { kind: 'link'; href: string; children: PostNode[] }
  | { kind: 'emoji'; name: string; src?: string }
  | { kind: 'time'; at: number; style: PostTimeStyle };

/** A line of a post's text: a heading (`###`), small print (`-#`) or a plain line. */
export interface PostLine {
  style: 'heading' | 'small' | 'plain';
  nodes: PostNode[];
}

/**
 * The color of a post's edge (plan 8M-8A), by the name of its value in `theme.css`
 * (`--accent-<name>`, light and dark): a raid's egg, hatched and ended, a max battle, a meetup or
 * train, and `other` for a color no renderer gives today.
 */
export const POST_ACCENTS = ['egg', 'hatched', 'ended', 'max', 'timed', 'other'] as const;
export type PostAccent = (typeof POST_ACCENTS)[number];

/** The panels of the map a post's button opens (`PostControl`). */
export type PostPanel = 'group' | 'time' | 'meet' | 'moves' | 'manage' | 'route' | 'split';

/**
 * What a button of a post does on the map (plan 8M-8A), decided on the server from its custom id
 * (no custom id reaches the page): a press the map makes as the post's button does (`MAP_ACTIONS`,
 * `MAP_REMOTE`, or since plan 8M-8B `MAP_COUNTS`), one of the map's panels or forms (since plan
 * 8M-8C every dialog of a post has one: the variant "Do this on Discord" is gone, R8), the note
 * that the raid was reported from a screenshot (in the place of Screenshot feedback, whose feedback
 * stays on Discord), or nothing. A panel the member may not use says why, or sends them to the post
 * (`data-on-discord` of the page).
 */
export type PostControl =
  | { kind: 'press'; action: MapAction | typeof MAP_REMOTE | MapCount }
  | { kind: 'panel'; panel: PostPanel }
  | { kind: 'screenshot' }
  | { kind: 'none' };

/** A button of a post as the page draws it: Discord's look, and what it does on the map. */
export interface PostButtonView {
  /** Its words; none for a button that shows only its icon. */
  label?: string;
  /** Its icon: Pine's picture of a custom emoji (`src`), else a plain emoji (`name`). */
  emoji?: { name: string; src?: string };
  /** Discord's button styles, as `theme.css` names them. */
  style: 'primary' | 'secondary' | 'success' | 'danger';
  /** Off for everybody, as the post has it (Group… while nobody is signed up). */
  disabled: boolean;
  /**
   * What a reader and a screen reader call it: its label, or for an icon the words the post's
   * lines use (`STATUS_WORDS`: Interested, Coming, Here, Done) and the others' (Leave, −1, +1,
   * Remote, Meet…).
   */
  name: string;
  does: PostControl;
}

/** What stands beside a part of a post: the post's picture or a place's, or a button. */
export type PostBeside =
  { kind: 'picture'; src: string } | { kind: 'button'; button: PostButtonView };

/** A part of a post as the page draws it (`PostView.blocks`). */
export type PostViewBlock =
  | {
      type: 'text';
      /** What it is about (`BlockRole`): the phone card shows the `head` with the main buttons. */
      role?: 'head' | 'where' | 'trainers' | 'note';
      lines: PostLine[];
      beside?: PostBeside;
    }
  | { type: 'separator' }
  | { type: 'controls'; rows: PostButtonView[][] };

/**
 * A party's post as the page draws it (plan 8M-8A, `GET /s/<guild>/api/parties/<id>/post`): made
 * on the server from the layout its post was last shown with (`PartyService.layoutOf`), the text
 * read into nodes (`postText`), the buttons mapped to what they do on the map. `key` is the
 * layout's (`MapParty.postKey`).
 */
export interface PostView {
  key: string;
  accent: PostAccent;
  blocks: PostViewBlock[];
}

/**
 * What a press answers (`POST /s/<guild>/api/parties/<id>/<action>`): the words alone; the page
 * asks for the list again after a press.
 */
export interface PressAnswer {
  /** Whether it was done; when not, `text` says why (the post's words). */
  ok: boolean;
  /** What the post's button would answer, as plain text. */
  text: string;
}
