import {
  MessageFlags,
  SlashCommandBuilder,
  SlashCommandSubcommandBuilder,
  type AutocompleteInteraction,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type SlashCommandStringOption,
} from 'discord.js';
import type { AppContext } from '../../app-context.js';
import { MAX_SAVED_ROUTES, type SavedRoute } from '../../db/repositories/saved-route-repository.js';
import { commandGroup, type SubcommandPart } from '../../discord/command-group.js';
import { UserError } from '../../discord/errors.js';
import {
  guildIdOf,
  isBotManagement,
  isStaff,
  memberRoleNames,
  partyOfServer,
  regionChannelOf,
  requireTrain,
  trainOf,
} from '../../discord/guards.js';
import {
  isTrain,
  MAX_PARTY_NAME,
  MAX_ROUTE_STOPS,
  type TrainParty,
} from '../../domain/party/party.js';
import { STALE_COMPONENT } from '../../discord/router.js';
import { nameOf } from '../../domain/party/timed.js';
import { problemText } from '../../render/activity.js';
import { stopLabel, stopsFrom } from '../../render/train-stops.js';
import { gymStop, spotStop, stopKey, type StopRef } from '../../domain/party/stops.js';
import { count, LIMITS, plain, truncate } from '../../render/text.js';
import { routeLines } from '../../render/train-post.js';
import { atEndSentence, TRAIN_KIND_WORDS } from '../../render/train-words.js';
import { SAVED_ROUTE_CHOICE } from '../../services/train-service.js';
import { actingMember, commandTrain, partyOver } from '../parties/reply.js';
import { CHANGE_THROTTLE } from '../raids/change.js';
import { MAX_CHOICES, type Choice } from '../choices.js';
import type { LatLon } from '@pine/wayspot-core/lat-lon';
import { distanceWords } from '../../render/distance-words.js';
import { gymChoices, reportedGym } from '../raids/raid-input.js';
import { placeLabel, regionSpotChoices } from '../place-option.js';
import { clearOf, placeValue, readPlaceValue } from '../../services/place-finder.js';
import { placeFitBy, type PlaceFit, type PlaceKind } from '../../domain/search/place-merge.js';
import {
  ROUTE_STOP_THROTTLE,
  addStopAs,
  clearRouteAs,
  forgetRouteAs,
  loadRouteAs,
  moveStopAs,
  NO_SUCH_ROUTE,
  removeStopAs,
  saveRouteAs,
  trainPlaces,
  type TrainAnswer,
} from './train-changes.js';
import { serverValuesOf } from '../../discord/server-values.js';
import type { DistanceUnits } from '../../render/distance-words.js';

/**
 * The text of a change to a train, when it worked; a refusal and a train that has ended are
 * thrown as `UserError`s, as everywhere.
 */
function changed(answer: TrainAnswer): string {
  if (answer.kind !== 'ok') throw new UserError(answer.text);
  return answer.text;
}

function privately(interaction: ChatInputCommandInteraction, content: string): Promise<unknown> {
  return interaction.reply({ content, flags: MessageFlags.Ephemeral });
}

/**
 * The private answer of a subcommand that was acknowledged before it ran (`defer`): it takes
 * the place of the acknowledgement, and is as private as that.
 */
function afterwards(interaction: ChatInputCommandInteraction, content: string): Promise<unknown> {
  return interaction.editReply({ content });
}

/**
 * The route cut into texts that each fit one message, stop by stop: the whole route is shown,
 * however long it is, in as many messages as it takes.
 */
function routeMessages(heading: string, lines: readonly string[]): string[] {
  const messages: string[] = [];
  let text = heading;
  for (const line of lines) {
    if (text.length + 1 + line.length > LIMITS.content) {
      messages.push(text);
      text = line;
    } else {
      text += `\n${line}`;
    }
  }
  return [...messages, text];
}

const show: SubcommandPart = {
  data: new SlashCommandSubcommandBuilder()
    .setName('show')
    .setDescription('Show the whole route of this train, each stop with a link to its place'),
  help: {
    details:
      'Shows you every stop in order: those the train has left struck through, the one it is ' +
      'at marked, each a link to Google Maps, and what the train does ' +
      'at the end of a route of two stops or more.\n\nThe post shows where the train is and the ' +
      'next stops (a route of three stops or fewer whole); its button "Route" shows ' +
      'you this list too.',
    examples: ['/route show'],
  },
  throttle: CHANGE_THROTTLE,
  async execute(interaction, ctx) {
    await showRoute(interaction, ctx, commandTrain(interaction, ctx));
  },
};

/**
 * The route of a train as `/route show` and the button "Route" of its post answer it, the
 * texts of one or more private messages: every stop a link to its place (the answer has no Map of
 * its own), what the train does at the end of a route of two stops or more; a sentence for a
 * train without a route.
 */
function routeTexts(ctx: AppContext, party: TrainParty): string[] {
  if (party.train.route.length === 0) {
    return [problemText('no-route', ctx.attendance.limits(), 'train')];
  }
  const heading = `**The route of ${plain(nameOf(party))}**`;
  const lines = [
    ...routeLines(trainPlaces(ctx, party), { links: true }),
    // A route of one stop finishes there in every mode: nothing to say of it.
    ...(party.train.route.length < 2 ? [] : [atEndSentence(party.train.atEnd)]),
  ];
  return routeMessages(heading, lines);
}

/** The route of a train, privately, in as many messages as it takes (`routeTexts`). */
async function showRoute(
  interaction: ChatInputCommandInteraction | ButtonInteraction,
  ctx: AppContext,
  party: TrainParty,
): Promise<void> {
  const [first, ...more] = routeTexts(ctx, party);
  await interaction.reply({ content: first ?? '', flags: MessageFlags.Ephemeral });
  for (const content of more) {
    await interaction.followUp({ content, flags: MessageFlags.Ephemeral });
  }
}

/**
 * The button "Route" of a train's post (Matt, 2026-10-17): the route privately, exactly as
 * `/route show` answers it, to anybody, also on a copy of the post in another channel (the train
 * is the one the button names). A train that ended answers as the other controls of a post do;
 * a party that is no train never had the button.
 */
export async function showWholeRoute(
  interaction: ButtonInteraction,
  ctx: AppContext,
  partyId: string,
): Promise<void> {
  const party = partyOfServer(interaction, ctx, partyId);
  if (!party) throw new UserError(partyOver({ type: 'train' }));
  if (!isTrain(party)) throw new UserError(STALE_COMPONENT);
  await showRoute(interaction, ctx, party);
}

/** The kinds of place a stop of a route may be (plan 8X-4; design 6.2). */
const STOP_KINDS: readonly PlaceKind[] = ['gym', 'powerspot'];

/**
 * Which kind of stop the list offers first among places that fit as well (Matt, 2026-10-20): a
 * train of max battles power spots, a raid train gyms. A better fit comes first whatever its
 * kind, so a gym's name typed on a max train still finds the gym.
 */
function kindsFirst(party: TrainParty | undefined): readonly PlaceKind[] {
  return party === undefined || party.train.kind === 'raid'
    ? ['gym', 'powerspot']
    : ['powerspot', 'gym'];
}

/** The stop a choice's value names (`gym:12`, `powerspot:<Wayfarer id>`, and `g:12` of before). */
function stopOfValue(text: string): StopRef | undefined {
  const legacy = /^g:(\d{1,10})$/u.exec(text);
  if (legacy) return gymStop(Number(legacy[1]));
  const read = readPlaceValue(text);
  if (read?.kind === 'gym' && /^\d{1,10}$/u.test(read.id)) return gymStop(Number(read.id));
  return read?.kind === 'powerspot' ? spotStop(read.id) : undefined;
}

/** What `/route add stop:` found for what was typed. */
type FoundStop =
  { kind: 'stop'; stop: StopRef } | { kind: 'none' } | { kind: 'several'; titles: string[] };

/**
 * The stop `/route add stop:` names: a choice of its list (a gym or a power spot of the server),
 * or typed text that means one gym (`reportedGym`) or power spot (`clearOf`, as `near` options do)
 * beyond doubt, the train's own kind of stop first (see below); `several` with what fits otherwise,
 * `none` when nothing does. A stop of no region of the
 * train's server is none (`TrainService.reaches`): to its members there is no such stop.
 */
function typedStop(
  interaction: ChatInputCommandInteraction,
  ctx: AppContext,
  party: TrainParty,
  typed: string,
): FoundStop {
  const picked = stopOfValue(typed.trim());
  if (picked) return ctx.trains.reaches(party, picked) ? { kind: 'stop', stop: picked } : NONE;
  const region = regionChannelOf(interaction, ctx);
  const reached = (stop: StopRef): boolean => ctx.trains.reaches(party, stop);
  // A gym by the rule `/raid` and `/route add` always had (`reportedGym`; one of no region of the
  // train's server is none, as before 8X-4), a power spot by the rule of `near` options
  // (`clearOf`), of those the train reaches.
  const reported = reportedGym(ctx.gyms.of(party.guildId), region, typed);
  const found = ctx.placeFinder.find(party.guildId, region, typed, STOP_KINDS);
  const spots = found.filter(
    (choice) => choice.kind === 'powerspot' && reached(spotStop(choice.id)),
  );
  const spot = clearOf(spots);
  // Whether a kind has places of the train's server that fit every word typed (not guesses).
  // For gyms it and `reportedGym` must search the same gyms: those of the train's server.
  const fitting = (kind: PlaceKind): boolean =>
    found.some((choice) => choice.kind === kind && choice.fit !== 'guess');
  // How a gym fits: by the list's fit or, where the list does not carry it, by its own names.
  const listedGymFit = (gym: { id: number; name: string; nickname: string | null }): PlaceFit =>
    found.find((choice) => choice.kind === 'gym' && choice.id === String(gym.id))?.fit ??
    placeFitBy(typed, [gym.name, gym.nickname], { allWords: true, corrected: false }).fit;
  // A gym beyond doubt has every word as typed (`clearGymHit`): it fits as well as a word's fit
  // at least.
  const gymFit = (gym: { id: number; name: string; nickname: string | null }): PlaceFit => {
    const fit = listedGymFit(gym);
    return fitRank(fit) > fitRank('word') ? 'word' : fit;
  };
  // The best fit of several places of one kind (those the train reaches). None of them reached
  // is `guess`, the worst fit: then the other kind's stop beyond doubt is always better, as it
  // would be against no place at all (review r0, F-A3).
  const bestOf = (fits: readonly PlaceFit[]): PlaceFit =>
    fits.reduce<PlaceFit>((best, fit) => (fitRank(fit) < fitRank(best) ? fit : best), 'guess');
  // Of several gyms, one with every word as typed fits as one beyond doubt does (`gymFit`), the
  // others by their list's fit (review r0, F-A2).
  const severalGymFit = (
    gym: { id: number; name: string; nickname: string | null },
    everyWord: readonly number[],
  ): PlaceFit => (everyWord.includes(gym.id) ? gymFit(gym) : listedGymFit(gym));
  const sides: Record<'gym' | 'powerspot', TypedSide> = {
    gym:
      reported.kind === 'gym'
        ? reached(gymStop(reported.gym.id))
          ? {
              kind: 'clear',
              stop: gymStop(reported.gym.id),
              fit: gymFit(reported.gym),
            }
          : { kind: 'none' }
        : reported.kind === 'several'
          ? {
              kind: 'several',
              fitting: fitting('gym'),
              best: bestOf(
                reported.gyms
                  .filter((gym) => reached(gymStop(gym.id)))
                  .map((gym) => severalGymFit(gym, reported.everyWord)),
              ),
            }
          : { kind: 'none' },
    powerspot: spot
      ? { kind: 'clear', stop: spotStop(spot.id), fit: spot.fit }
      : spots.length > 0
        ? {
            kind: 'several',
            fitting: fitting('powerspot'),
            best: bestOf(spots.map((choice) => choice.fit)),
          }
        : { kind: 'none' },
  };
  // The train's own kind of stop decides first (`kindsFirst`): its stop beyond doubt is taken,
  // its several are several, unless the other kind's stop beyond doubt fits strictly better
  // than the best of them (design 6.2: a better match first, whatever its kind; a tie is the
  // train's kind's); without one, or with only guesses of it, the other kind's stop beyond doubt.
  const [ownKind, otherKind] = kindsFirst(party) as ['gym' | 'powerspot', 'gym' | 'powerspot'];
  const own = sides[ownKind];
  const other = sides[otherKind];
  if (own.kind === 'clear') {
    const better = other.kind === 'clear' && fitRank(other.fit) < fitRank(own.fit);
    return { kind: 'stop', stop: better ? other.stop : own.stop };
  }
  if (own.kind === 'several' && other.kind === 'clear' && fitRank(other.fit) < fitRank(own.best)) {
    return { kind: 'stop', stop: other.stop };
  }
  const guessed = own.kind === 'none' || (own.kind === 'several' && !own.fitting);
  if (guessed && other.kind === 'clear') return { kind: 'stop', stop: other.stop };
  // Nothing beyond doubt: what fits, guesses too, is for the member to pick from the list.
  const titles = [
    ...(reported.kind === 'gym'
      ? [reported.gym]
      : reported.kind === 'several'
        ? reported.gyms
        : []
    ).map((one) => one.name),
    ...spots.map((choice) => `${choice.title} (Power Spot)`),
  ];
  return own.kind === 'none' && other.kind === 'none'
    ? NONE
    : titles.length === 0
      ? NONE
      : { kind: 'several', titles };
}

/** What typed text found of one kind of stop (`typedStop`). */
type TypedSide =
  | { kind: 'clear'; stop: StopRef; fit: PlaceFit }
  /**
   * `fitting`: some of them fit every word typed; else they are guesses only. `best`: the best
   * fit among them (of those the train reaches).
   */
  | { kind: 'several'; fitting: boolean; best: PlaceFit }
  | { kind: 'none' };

/** How well a place fits what was typed, best first (`PlaceFit`). */
function fitRank(fit: PlaceFit): number {
  return ['exact', 'word', 'beginning', 'loose', 'guess'].indexOf(fit);
}

const NONE: FoundStop = { kind: 'none' };

/**
 * What `/route add stop:` offers before anything is typed: the region's own gyms by name, as
 * before power spots; a train of max battles the region's power spots by name ahead of them
 * (plan 8X-4), each named by its kind.
 */
function firstStops(
  interaction: AutocompleteInteraction,
  ctx: AppContext,
  party: TrainParty | undefined,
): { name: string; value: string }[] {
  const region = regionChannelOf(interaction, ctx);
  const regionName = (channelId: string): string | undefined =>
    interaction.guild?.channels.cache.get(channelId)?.name;
  const gyms = gymChoices(ctx.gyms.of(party?.guildId), region, '', regionName);
  if (kindsFirst(party)[0] !== 'powerspot' || region === undefined) {
    return gyms.map((choice) => ({ ...choice, value: `gym:${choice.value.slice(2)}` }));
  }
  const spots = regionSpotChoices(ctx, region);
  const named = gyms.map((choice) => ({
    name: placeLabel({ kind: 'gym', title: choice.name, where: undefined }),
    value: `gym:${choice.value.slice(2)}`,
  }));
  return [...spots, ...named].slice(0, MAX_CHOICES);
}

/** A stop of a route as a choice's value names it (`gym:12`, `powerspot:<Wayfarer id>`). */
function valueOfStop(ref: StopRef): string {
  return placeValue({ kind: ref.kind, id: String(ref.id) });
}

/**
 * Where the route's last stop is (`PlaceFinder.chosen`), the anchor of `/route add stop:`'s list
 * (Matt, 2026-10-27, "nearby stops first"); a stop gone from the server's places passed over for
 * the one before it. Undefined without a route, or with every stop gone.
 */
function lastStopPoint(ctx: AppContext, party: TrainParty): LatLon | undefined {
  for (const ref of [...party.train.route].reverse()) {
    const chosen = ctx.placeFinder.chosen(party.guildId, valueOfStop(ref));
    if (chosen) return chosen.point;
  }
  return undefined;
}

/**
 * What `/route add stop:` offers before anything is typed on a route with a stop (Matt,
 * 2026-10-27): the server's gyms and Power Spots nearest the last stop (`PlaceFinder.nearest`),
 * nearest first whatever the train's kind, without a radius, those on the route left out, each
 * with its distance.
 */
function nearestStops(
  ctx: AppContext,
  distanceUnits: DistanceUnits,
  party: TrainParty,
  last: LatLon,
): Choice[] {
  return ctx.placeFinder
    .nearest(party.guildId, STOP_KINDS, [last], {
      count: MAX_CHOICES,
      except: new Set(party.train.route.map(valueOfStop)),
    })
    .map(({ choice, metres }) => ({
      name: placeLabel(choice, distanceWords(metres, distanceUnits)),
      value: placeValue(choice),
    }));
}

const add: SubcommandPart = {
  data: new SlashCommandSubcommandBuilder()
    .setName('add')
    .setDescription('Add a stop to the end of the route of this train: a gym or Power Spot')
    .addStringOption((option) =>
      option
        .setName('stop')
        .setDescription('A gym or Power Spot: type part of its name and pick from the list')
        .setRequired(true)
        .setMaxLength(100)
        .setAutocomplete(true),
    ),
  help: {
    details:
      'Adds a gym or a Power Spot (where max battles are) to the end of the route; it may lie ' +
      'in another region of this server. You must be signed up (moderators need not be).\n\n' +
      `The list that appears while you type puts Power Spots first for a ` +
      `${TRAIN_KIND_WORDS.dynamax} or ${TRAIN_KIND_WORDS.gigantamax}, gyms first for a ` +
      `${TRAIN_KIND_WORDS.raid}, and says what each is and where.\n\nOnce the route has a stop, ` +
      'places near the last stop come first among places that fit what you type equally ' +
      'well; with nothing typed, it lists those nearest it, ' +
      'with their distances.\n\nA stop is on a route once, and a route has at most ' +
      `${MAX_ROUTE_STOPS} stops. A stop added to a finished route makes the train go on ` +
      'there, which moves the train: with a conductor only they and the moderators can do ' +
      'that, and the others are told.',
    examples: ['/route add stop:Big Fountain'],
  },
  throttle: ROUTE_STOP_THROTTLE,
  async execute(interaction, ctx) {
    const party = commandTrain(interaction, ctx);
    const typed = interaction.options.getString('stop', true);
    const found = typedStop(interaction, ctx, party, typed);
    const shown = plain(truncate(typed, 80));
    if (found.kind === 'none') {
      throw new UserError(
        `I found no gym or Power Spot for "${shown}". Type part of its name and pick it from the list.`,
      );
    }
    if (found.kind === 'several') {
      const names = found.titles.slice(0, 3).map((title) => plain(title));
      // The dots stand for places that are not named: only when there are such.
      const more = found.titles.length > names.length ? '…' : '';
      throw new UserError(
        `Several places fit "${shown}" (${names.join(', ')}${more}). Pick one from the list.`,
      );
    }
    await privately(
      interaction,
      changed(
        await addStopAs(
          ctx,
          party,
          actingMember(interaction),
          found.stop,
          isStaff(interaction, ctx),
        ),
      ),
    );
  },
  async autocomplete(interaction, ctx) {
    const party = trainOf(interaction, ctx);
    const typed = String(interaction.options.getFocused());
    // Not the stops that are on the route already.
    const onRoute = new Set((party?.train.route ?? []).map(stopKey));
    const unrouted = (value: string): boolean => {
      const stop = stopOfValue(value);
      return stop === undefined || !onRoute.has(stopKey(stop));
    };
    // Nearby stops first (Matt, 2026-10-27): the next stop is almost always near the last.
    const last = party && lastStopPoint(ctx, party);
    if (typed.trim() === '') {
      await interaction.respond(
        party && last
          ? nearestStops(ctx, serverValuesOf(interaction, ctx).distanceUnits, party, last)
          : firstStops(interaction, ctx, party).filter((c) => unrouted(c.value)),
      );
      return;
    }
    // The train's server, as it has it; the interaction's only where there is no train.
    const row =
      party?.guildId ??
      (interaction.inGuild() ? await ctx.guilds.idFor(guildIdOf(interaction)) : undefined);
    const found =
      row === undefined
        ? []
        : ctx.placeFinder.find(row, regionChannelOf(interaction, ctx), typed, STOP_KINDS, {
            kindsFirst: kindsFirst(party),
            anchors: last ? [last] : [],
          });
    await interaction.respond(
      found
        .map((choice) => ({ name: placeLabel(choice), value: placeValue(choice) }))
        .filter((choice) => unrouted(choice.value))
        .slice(0, MAX_CHOICES),
    );
  },
};

/**
 * The stops of the route as choices of a list, `3. Name`, narrowed to what was typed: a number
 * means that stop, anything else is looked for in the names. The value of a choice is the
 * number of the stop.
 */
function stopChoices(
  interaction: AutocompleteInteraction,
  ctx: AppContext,
): { name: string; value: number }[] {
  const party = trainOf(interaction, ctx);
  if (!party) return [];
  const typed = String(interaction.options.getFocused()).trim().toLowerCase();
  const stops = stopsFrom(ctx.gyms, ctx.wayspots);
  // `/route move`'s `to`, its `from` given: where the stop would stand (Matt, 2026-10-24).
  const from =
    interaction.options.getFocused(true).name === 'to'
      ? interaction.options.getInteger('from')
      : null;
  const moving = from !== null && from >= 1 && from <= party.train.route.length ? from : null;
  const all = party.train.route.map((ref, index) => {
    const name = stopLabel(stops(ref));
    const number = index + 1;
    const label =
      moving === null
        ? name
        : number === moving
          ? `${name} (where it is)`
          : `${number < moving ? 'before' : 'after'} ${name}`;
    return { name: truncate(`${number}. ${label}`, 100), value: number, words: name };
  });
  const words = typed.split(/\s+/).filter(Boolean);
  const found =
    typed === ''
      ? all
      : /^\d+$/.test(typed)
        ? // The stop with that number first, then those whose number begins with it.
          all
            .filter((choice) => String(choice.value).startsWith(typed))
            .sort((a, b) => Number(String(b.value) === typed) - Number(String(a.value) === typed))
        : all.filter((choice) => words.every((word) => choice.words.toLowerCase().includes(word)));
  return found.slice(0, MAX_CHOICES).map(({ name, value }) => ({ name, value }));
}

async function respondWithStops(interaction: AutocompleteInteraction, ctx: AppContext) {
  await interaction.respond(stopChoices(interaction, ctx));
}

const remove: SubcommandPart = {
  data: new SlashCommandSubcommandBuilder()
    .setName('remove')
    .setDescription('Take a stop off the route of this train')
    .addIntegerOption((option) =>
      option
        .setName('stop')
        .setDescription('The number of the stop: pick from the list')
        .setRequired(true)
        .setMinValue(1)
        .setAutocomplete(true),
    ),
  help: {
    details:
      'Takes a stop off the route, by its number in `/route show`. You must be signed up ' +
      '(moderators need not be).\n\nThe train stays at the stop it is at. When that very stop ' +
      'is removed, the train moves on to the one after it: with a conductor only they and the ' +
      'moderators can do that, and the others are told.',
    examples: ['/route remove stop:3'],
  },
  throttle: ROUTE_STOP_THROTTLE,
  async execute(interaction, ctx) {
    const party = commandTrain(interaction, ctx);
    const number = interaction.options.getInteger('stop', true);
    await privately(
      interaction,
      changed(
        await removeStopAs(
          ctx,
          party,
          actingMember(interaction),
          number,
          isStaff(interaction, ctx),
        ),
      ),
    );
  },
  autocomplete: respondWithStops,
};

const move: SubcommandPart = {
  data: new SlashCommandSubcommandBuilder()
    .setName('move')
    .setDescription('Move a stop to another place of the route of this train')
    .addIntegerOption((option) =>
      option
        .setName('from')
        .setDescription('The number of the stop to move: pick from the list')
        .setRequired(true)
        .setMinValue(1)
        .setAutocomplete(true),
    )
    .addIntegerOption((option) =>
      option
        .setName('to')
        .setDescription('The number it is to have afterwards: the list says where it would stand')
        .setRequired(true)
        .setMinValue(1)
        .setAutocomplete(true),
    ),
  help: {
    details:
      'Moves a stop to another place in the route. `to` is the number the stop has afterwards, ' +
      'so the last number moves it to the end. The train stays at the stop it is at. You must ' +
      'be signed up (moderators need not be).',
    examples: ['/route move from:5 to:2'],
  },
  throttle: ROUTE_STOP_THROTTLE,
  async execute(interaction, ctx) {
    const party = commandTrain(interaction, ctx);
    const from = interaction.options.getInteger('from', true);
    const to = interaction.options.getInteger('to', true);
    await privately(
      interaction,
      changed(
        await moveStopAs(
          ctx,
          party,
          actingMember(interaction),
          from,
          to,
          isStaff(interaction, ctx),
        ),
      ),
    );
  },
  autocomplete: respondWithStops,
};

const clear: SubcommandPart = {
  data: new SlashCommandSubcommandBuilder()
    .setName('clear')
    .setDescription('Remove every stop from the route of this train (conductor, moderators)'),
  help: {
    details:
      'Takes every stop off the route, so the train is at the start again: the first stop ' +
      'added is where it is. For the conductor of the train, and for admins, moderators and ' +
      'bot developers.',
    examples: ['/route clear'],
  },
  throttle: CHANGE_THROTTLE,
  async execute(interaction, ctx) {
    const party = commandTrain(interaction, ctx);
    // As the legacy bot had it: clearing a route is for bot management, and for who leads it.
    const staff = isBotManagement(
      memberRoleNames(interaction),
      interaction.user.id,
      ctx.config.env.OWNER_ID,
    );
    await privately(
      interaction,
      changed(await clearRouteAs(ctx, party, actingMember(interaction), staff)),
    );
  },
};

/** What a choice of the saved routes adds for what a train does at the end of the route. */
const CHOICE_MODE: Readonly<Record<SavedRoute['atEnd'], string>> = {
  finish: '',
  loop: ', loops',
  'turn-back': ', turns back',
};

/** What the value of a choice of the list of saved routes begins with, before the id of its row. */
const ROUTE_CHOICE = 'id:';

/**
 * The saved route an option names: a choice of the list (`id:` and the id of its row,
 * `SAVED_ROUTE_CHOICE`: what no route can be called), or the name of one of the member's routes
 * of this region as it was typed. Anything that is no choice of the list is a name, also digits
 * alone and `id:north`: a member may call a route `1` or `2026`. The service checks again that
 * the row is the member's own and of this region.
 */
async function typedRoute(
  interaction: ChatInputCommandInteraction,
  ctx: AppContext,
  party: TrainParty,
): Promise<number> {
  const text = interaction.options.getString('route', true).trim();
  if (SAVED_ROUTE_CHOICE.test(text)) {
    const id = text.slice(ROUTE_CHOICE.length);
    // No row has an id of more digits.
    if (id.length > 10) throw new UserError(NO_SUCH_ROUTE);
    return Number(id);
  }
  const mine = await ctx.trains.savedRoutes(party.id, interaction.user.id);
  const fits = mine.filter((route) => route.name.toLowerCase() === text.toLowerCase());
  const [only] = fits;
  if (!only || fits.length > 1) throw new UserError(NO_SUCH_ROUTE);
  return only.id;
}

/**
 * The member's saved routes of the region of this train, as choices: `Name (3 stops)`, and
 * what a train does at the end of one that does not finish there (`Name (3 stops, loops)`).
 */
async function respondWithRoutes(interaction: AutocompleteInteraction, ctx: AppContext) {
  const party = trainOf(interaction, ctx);
  if (!party) {
    await interaction.respond([]);
    return;
  }
  const typed = String(interaction.options.getFocused()).trim().toLowerCase();
  const mine = await ctx.trains.savedRoutes(party.id, interaction.user.id);
  await interaction.respond(
    mine
      .filter((route) => route.name.toLowerCase().includes(typed))
      .slice(0, MAX_CHOICES)
      .map((route) => {
        const stops = ` (${count(route.stops.length, 'stop')}${CHOICE_MODE[route.atEnd]})`;
        return {
          name: `${truncate(route.name || 'Without a name', 100 - stops.length)}${stops}`,
          value: `${ROUTE_CHOICE}${route.id}`,
        };
      }),
  );
}

const save: SubcommandPart = {
  data: new SlashCommandSubcommandBuilder()
    .setName('save')
    .setDescription('Save the route of this train under a name, to use it for another train')
    .addStringOption((option) =>
      option
        .setName('name')
        .setDescription('What to call the saved route')
        .setRequired(true)
        .setMaxLength(MAX_PARTY_NAME),
    ),
  help: {
    details:
      'The route is saved for you and for the region of this train, in the order it has now ' +
      'and with what the train does at its end (finish, loop or turn back); nobody else sees ' +
      'it. A route of yours with the same name is replaced. You can keep up to ' +
      `${MAX_SAVED_ROUTES} routes per region; \`/route forget\` removes one.`,
    examples: ['/route save name:Downtown loop'],
  },
  throttle: CHANGE_THROTTLE,
  // The database is asked before the first answer, in a transaction.
  defer: 'ephemeral',
  async execute(interaction, ctx) {
    const party = commandTrain(interaction, ctx);
    const name = interaction.options.getString('name', true);
    await afterwards(
      interaction,
      changed(await saveRouteAs(ctx, party, actingMember(interaction), name)),
    );
  },
};

const routeOption = (description: string) => (option: SlashCommandStringOption) =>
  option
    .setName('route')
    .setDescription(description)
    .setRequired(true)
    .setMaxLength(100)
    .setAutocomplete(true);

const load: SubcommandPart = {
  data: new SlashCommandSubcommandBuilder()
    .setName('load')
    .setDescription('Replace the route of this train by one you saved')
    .addStringOption(routeOption('One of your saved routes of this region: pick from the list')),
  help: {
    details:
      'Replaces the route of the train with one you saved, and puts the train at its first ' +
      'stop. That moves the train, so with a conductor only they and the moderators can do ' +
      'it; otherwise you must be signed up.\n\nThe train then does at the end what it did when ' +
      'the route was saved (finish, loop or turn back). Gyms and Power Spots that no longer ' +
      'exist are left out.',
    examples: ['/route load route:Downtown loop'],
  },
  throttle: CHANGE_THROTTLE,
  // The database is asked before the first answer.
  defer: 'ephemeral',
  async execute(interaction, ctx) {
    const party = commandTrain(interaction, ctx);
    const routeId = await typedRoute(interaction, ctx, party);
    await afterwards(
      interaction,
      changed(
        await loadRouteAs(
          ctx,
          party,
          actingMember(interaction),
          routeId,
          isStaff(interaction, ctx),
        ),
      ),
    );
  },
  autocomplete: respondWithRoutes,
};

const forget: SubcommandPart = {
  data: new SlashCommandSubcommandBuilder()
    .setName('forget')
    .setDescription('Delete one of the routes you saved')
    .addStringOption(routeOption('One of your saved routes of this region: pick from the list')),
  help: {
    details: 'Deletes a route you saved for the region of this train. No train is changed by it.',
    examples: ['/route forget route:Downtown loop'],
  },
  throttle: CHANGE_THROTTLE,
  // The database is asked before the first answer.
  defer: 'ephemeral',
  async execute(interaction, ctx) {
    const party = commandTrain(interaction, ctx);
    const routeId = await typedRoute(interaction, ctx, party);
    await afterwards(
      interaction,
      changed(await forgetRouteAs(ctx, party, interaction.user.id, routeId)),
    );
  },
  autocomplete: respondWithRoutes,
};

/**
 * `/route` (spec 4.2): the route of the train of this post, and the routes a member saved.
 * Anybody who is signed up may change the route; clearing it is for the conductor and the staff.
 */
export const route = commandGroup({
  data: new SlashCommandBuilder()
    .setName('route')
    .setDescription('The route of this train: its stops, and the routes you saved'),
  help: {
    category: 'train',
    details:
      'Use it in the post of the train. A stop is a gym or a Power Spot. When stops are ' +
      'added, removed or moved, the train stays at the stop it is at, unless its stop is ' +
      'removed or the route was finished.\n\nA saved route keeps ' +
      'the order of its stops and what the train does at its end (finish, loop or turn back); ' +
      'loading it sets both. The button "Manage…" on the post reverses or finishes the route.',
  },
  guards: [requireTrain],
  parts: [show, add, remove, move, clear, save, load, forget],
});
