/**
 * How long a change on the map waits for its post to be drawn (plan 8M-11A, S1): an edit's round
 * trip, plus the coalescer's 2 s delay in a burst, with room on a loaded host. Past it the answer
 * goes out anyway, and the page's next poll catches up.
 */
export const PRESS_SHOWN_MS = 5_000;

/** The draws of a party's post (`PartyService.drawTicket` and `shown`). */
export interface PostDraws {
  /** How many changes of the party were made: taken once a change has returned. */
  drawTicket(partyId: string): number;
  /** Resolves once a draw that read the party at `ticket` or later showed the post, or after `maxMs`. */
  shown(partyId: string, ticket: number, maxMs: number): Promise<void>;
}

/**
 * A change of a party on the map answers once its post shows it (plan 8M-11A, S1): called once
 * the change has returned, it takes the draw ticket then (review fix R1: its count with the
 * change itself, whatever another member changed meanwhile) and waits for a draw that read it, at
 * most `PRESS_SHOWN_MS`; at once where nothing was written (a refusal, the party over). The page
 * asks for the list as soon as the answer comes, and then gets the post with the change.
 */
export function shownAfter(draws: PostDraws, partyId: string, wrote: boolean): Promise<void> {
  if (!wrote) return Promise.resolve();
  return draws.shown(partyId, draws.drawTicket(partyId), PRESS_SHOWN_MS);
}
