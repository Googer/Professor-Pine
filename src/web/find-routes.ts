import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { readsEvery, searchTokens } from '../domain/search/text.js';
import {
  FIND_MAX_TEXT,
  FIND_MIN_LETTERS,
  FOUND_PLACES_PER_KIND,
  type FoundPlace,
  type FoundPlaceKind,
  type FoundPlacesView,
} from '../domain/web/find-data.js';
import { ALL_PLACE_KINDS, type PlaceChoice } from '../services/place-finder.js';
import { memberOrFailure } from './acting.js';
import { sendFailure } from './answers.js';
import type { GuildRequest } from './guild-routes.js';
import { limitedRead } from './rate-limit.js';
import type { WebDeps } from './server.js';
import { pointSchema } from './wayspot-box.js';

/**
 * The requests of Find one address may make in a minute (plan 8M-12): its own limit, above the
 * pick lists' 30 (a form asks once), so that typing never empties the group of places. The page
 * asks once a pause after the text changed.
 */
export const FIND_PER_MINUTE = 120;

/** What Find asks: the text (two letters at least) and where its member is, or the map's middle. */
const findQuery = z
  .object({
    q: z
      .string()
      .max(FIND_MAX_TEXT)
      .refine((text) => searchTokens(text).join('').length >= FIND_MIN_LETTERS),
    near: pointSchema.optional(),
  })
  .strict();

/**
 * Whether a hit reads every word typed in its name (`readsEvery`: as typed, as a beginning, or
 * misspelt within `allowedTypos`; `STOP_WORDS` ask nothing): Find leaves out a guess that misses a
 * word, as a filter would, and keeps one that only misspells it.
 */
function everyWord(text: string, choice: PlaceChoice): boolean {
  return choice.fit !== 'guess' || readsEvery(searchTokens(text), searchTokens(choice.title));
}

/** A place found as the page reads it. */
function foundPlace(choice: PlaceChoice): FoundPlace {
  return {
    kind: choice.kind satisfies FoundPlaceKind,
    id: choice.id,
    name: choice.title,
    address: choice.address || null,
    lat: choice.point.lat,
    lon: choice.point.lon,
    // Last within its kind already: `mergePlaces` ranks a guess after every other fit, so the
    // cap of each kind drops guesses first.
    guess: choice.fit === 'guess',
  };
}

/**
 * Find's places on the live map (plan 8M-12; design "Where each group is searched"): the gyms,
 * PokéStops and Power Spots of the server by name (`GET /s/<guild>/api/find-places?q=<text>
 * [&near=<lat>,<lon>]`), through the place search Discord's commands use (`PlaceFinder.find`: the
 * gym search and the `WayspotIndex` of each kind, held in memory, limited to the server's regions;
 * no database query), in its order, places that fit alike the nearer to `near` first, at most
 * `FOUND_PLACES_PER_KIND` of each kind; a guess that misses a word typed is left out. Members only
 * (`memberOrFailure`, as `/api/stops`), `FIND_PER_MINUTE` per address.
 */
export function findRoutes(scope: FastifyInstance, deps: WebDeps): void {
  const { sessions, parties } = deps;
  scope.get(
    '/api/find-places',
    { onRequest: limitedRead(FIND_PER_MINUTE, deps) },
    async (request: GuildRequest, reply) => {
      void reply.header('cache-control', 'private, no-store');
      const session = await sessions.of(request, reply);
      if (!session) return sendFailure(request, reply, 401);
      const query = findQuery.safeParse(request.query ?? {});
      if (!query.success) return sendFailure(request, reply, 400);
      const { guild } = request.params;
      const refused = await memberOrFailure(deps, request, reply, guild, session.userId);
      if (refused) return refused;
      const row = await parties.guilds.idFor(guild);
      const { q, near } = query.data;
      const found =
        row === undefined
          ? []
          : deps.stops.ctx.placeFinder.find(
              row,
              undefined,
              q,
              ALL_PLACE_KINDS,
              near === undefined ? {} : { anchors: [near] },
            );
      const counts = new Map<string, number>();
      const places: FoundPlace[] = [];
      for (const choice of found) {
        const count = counts.get(choice.kind) ?? 0;
        if (count >= FOUND_PLACES_PER_KIND || !everyWord(q, choice)) continue;
        counts.set(choice.kind, count + 1);
        places.push(foundPlace(choice));
      }
      const view: FoundPlacesView = { places };
      return view;
    },
  );
}
