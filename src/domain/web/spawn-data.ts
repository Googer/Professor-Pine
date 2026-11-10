/**
 * What the spawn reports of the live map answer (plan 8M-4S), as the page reads them. Types
 * alone, with no import: the page's bundle (`src/web/client/`) takes them without the server's
 * code.
 */

/**
 * `GET /s/<guild>/api/wild-options`: every Pokémon `/wild` takes (those that appear in the wild,
 * with the settings' exceptions), each as `[value, name]`: the value is what the report sends
 * (the catalogue's key, as a choice of `/wild` has it), the name what the member picks by.
 */
export interface WildOptionsView {
  pokemon: Array<[string, string]>;
}

/**
 * `POST /s/<guild>/api/spawns` answers this (beside the few words of a failure, `{ error }`):
 * whether the report was made, the words of `/wild` as text, and for a point that lies in several
 * regions without one picked, the regions to pick from (by id, named as `/api/geo` names them).
 */
export interface SpawnAnswer {
  ok: boolean;
  text: string;
  regions?: Array<{ id: number; name: string }>;
}

/**
 * A wild spawn that stands (Matt, 2026-11-07: spawns appear on the map), as its region message
 * says it: the Pokémon, the IVs the reporter checked, who reported it, where it is and when the
 * report goes away. Texts are as typed or as the game data names them, for the page to show as
 * text (never markdown).
 */
export interface MapSpawn {
  /** The report's message in the region's channel: the spawn's key on the map. */
  id: string;
  /** The Pokémon's name, as the game data has it. */
  pokemon: string;
  /** An event on lists it costumed: "costumed" before its name, as its message says. */
  costumed: boolean;
  /** The IVs the reporter checked, in the message's words (`100% IVs`, `0% IVs`); none unchecked. */
  ivs?: string;
  /** Its picture, as the message shows it, only where the page may load it. */
  picture?: string;
  /** Where it is, in the reporter's words; null where they said nothing. */
  details: string | null;
  /**
   * The place it was reported near, in words: `Near The Stacks (gym)`, a pin's `Near Yellow
   * Mural (PokéStop)`, the name its maps link gave, `Dropped pin`; none without one.
   */
  near?: string;
  /**
   * The address of the gym, PokéStop or Power Spot it is near as its message says it (`(no
   * address available)` where the map shows the place's picture without one); none for a pin.
   */
  address?: string;
  /**
   * The picture of that place, as its message shows it beside Where, by Pine's address
   * (`/s/<guild>/pictures/gym/<id>`, as a post's); none where Pine serves none.
   */
  placePicture?: string;
  /** Where the map draws it: the pin or the place it is near; null for none (listed, not drawn). */
  point: { lat: number; lon: number } | null;
  /** Who reported it, by the name shown then, as text ("a member" where none was kept). */
  reporter: string;
  /** The region's channel, as answers name it: `#west`, `Region 5` where the bot sees no name. */
  region: string;
  /** When it was reported, epoch milliseconds. */
  madeAt: number;
  /** When the report goes away, epoch milliseconds (the message says so too). */
  goneAt: number;
  /** The report's message on Discord. */
  link: string;
  /**
   * What Find on the map finds it by: the Pokémon's name and catalogue key (its form), and
   * `costumed`/`costume` where it is costumed, folded as `searchTokens` reads them, each once.
   */
  words: readonly string[];
}

/**
 * `GET /s/<guild>/api/spawns`: the wild spawns of the server that stand now, as the member may
 * see them, the one going away first at the head.
 */
export interface SpawnsView {
  spawns: MapSpawn[];
}
