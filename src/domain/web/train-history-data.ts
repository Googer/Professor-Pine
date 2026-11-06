/*
 * Ended trains on the map's History (plan 8H-7B, Part F's web half): what `GET
 * /s/<guild>/api/history/trains?month=` and `GET /s/<guild>/api/history/trains/<id>` answer and
 * the page reads, and the map's address of one train. Types and pure strings only, shared by the
 * server, the bot's post and the page.
 */

/** A train of a month's list: every word the server's. */
export interface TrainItemView {
  /** Its record's id (`PartyHistory.id`). */
  id: number;
  /** Its name as kept (member-typed: the page sets it as text). */
  name: string;
  /** When it was made, in the posts' zone: "Sat, Jun 14, 6:15 PM". */
  when: string;
  /** About its stops and who came: "About 14 stops · 12 riders". */
  about: string;
}

/** A month's trains the member may see, newest first, at most `TRAINS_LISTED` of them. */
export interface TrainMonthView {
  /** `yyyy-mm`, in the posts' zone. */
  month: string;
  trains: TrainItemView[];
  /** How many more the member may see that the list leaves out. */
  more: number;
}

/** A line of a train's card as the page shows it: small print where `small`. */
export interface TrainCardLineView {
  text: string;
  small: boolean;
}

/** A train's route and card (`…/trains/<id>`). */
export interface TrainRouteView extends TrainItemView {
  /** Its month (`yyyy-mm`, in the posts' zone): where History opens for it (the page has no Temporal). */
  month: string;
  /** The places of its stops the map can place, each once. */
  points: { lat: number; lon: number }[];
  /** Its stops in order, as indexes into `points` (a loop repeats one). */
  route: number[];
  /** Its card's lines (a legacy train: one line of its stops). */
  card: TrainCardLineView[];
}

/** The map's query of one ended train (`?train=<id>`). */
export const TRAIN_QUERY = 'train';

/** The map of a server opened at an ended train (plan 8H-7B, the post's "Route on the map"). */
export function trainMapPath(guild: string, historyId: number): string {
  return `/s/${guild}/map?${TRAIN_QUERY}=${String(historyId)}`;
}
