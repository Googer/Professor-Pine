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
