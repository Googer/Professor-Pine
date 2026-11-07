import { partyStartWords, type PlannedCounts } from '../domain/party/event-parties.js';
import { fitLines } from './summary.js';

/*
 * The trains and meetups planned during an event, as the events forum shows them (Matt,
 * 2026-11-07): a count on the event's line of the listing, and a section of the event's post. Which
 * parties count is the domain's (`plannedDuring`); which may be named, the service's (only those
 * of a region every member who sees the forum sees, `PartyGateway.shareKeeps`). Times are plain
 * local text, as the forum says them (ruling A of plan 8V-1).
 */

/** The heading of the section of an event's post. */
export const PLANNED_HEADING = 'Trains and meetups planned';

/** What an event's post shows of its trains and meetups. */
export interface EventPlannedView {
  /** Every one planned, in every region of the server. */
  counts: PlannedCounts;
  /**
   * Those it may name (their post and start), by start; undefined where who sees the regions could
   * not be told (review EP-1): then nobody is named and nothing is said of the others.
   */
  named: ReadonlyArray<{ postId: string; start: number }> | undefined;
}

/** "3 trains, 1 meetup" (a kind of none left out); undefined for none at all. */
export function plannedCountWords(counts: PlannedCounts): string | undefined {
  const parts = [
    ...(counts.trains === 0
      ? []
      : [`${String(counts.trains)} ${counts.trains === 1 ? 'train' : 'trains'}`]),
    ...(counts.meetups === 0
      ? []
      : [`${String(counts.meetups)} ${counts.meetups === 1 ? 'meetup' : 'meetups'}`]),
  ];
  return parts.length === 0 ? undefined : parts.join(', ');
}

/**
 * The section of an event's post: the heading, the counts, a line per party it may name (its
 * post, which shows the post's title, and its start), cut to `room` with "…and N more", and in
 * small print how many are in regions not everyone may see (with `named` undefined, the counts
 * alone); undefined without a party.
 */
export function plannedSection(
  view: EventPlannedView,
  zone: string,
  room: number,
): string | undefined {
  const counted = plannedCountWords(view.counts);
  if (counted === undefined) return undefined;
  const head = `**${PLANNED_HEADING}**\n${counted}`;
  if (view.named === undefined) return head;
  const hidden = view.counts.trains + view.counts.meetups - view.named.length;
  const foot =
    hidden <= 0
      ? undefined
      : view.named.length === 0
        ? `-# ${hidden === 1 ? 'It is in a region' : 'They are in regions'} not everyone here can see.`
        : `-# ${String(hidden)} more ${hidden === 1 ? 'is in a region' : 'are in regions'} not everyone here can see.`;
  const lines = view.named.map(
    (party) => `<#${party.postId}> · ${partyStartWords(party.start, zone)}`,
  );
  const left = room - head.length - 1 - (foot === undefined ? 0 : foot.length + 1);
  return [head, ...fitLines(lines, left), ...(foot === undefined ? [] : [foot])].join('\n');
}
