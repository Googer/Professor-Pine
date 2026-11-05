import type { MemberStats } from '../domain/history/member-stats.js';

/** What a member's card shows beside their numbers, as the caller names it. */
export interface MemberStatsView {
  stats: MemberStats;
  /** The card's title: "Your Pine, all time", "Pine of **Ash** in 2026". */
  title: string;
  /** Whether it says how many of a count were anonymous (the private card; a shared one has none). */
  own: boolean;
  /** The busiest region as the card names it (its channel); undefined to leave it out. */
  region?: string;
  /** The catalogue's name of a boss by its key; one it does not name is left out. */
  bossName: (bossKey: string) => string | undefined;
}

const n = (count: number): string => `**${count.toLocaleString('en-US')}**`;

/** A member's card's title: "Your Pine, all time", "Your Pine in 2026"; `whose` for another's. */
export function memberStatsTitle(year: number | null, whose = 'Your Pine'): string {
  return year === null ? `${whose}, all time` : `${whose} in ${String(year)}`;
}

/**
 * A member's card as texts (plan 8H-6, design Part E): what others confirmed first, the counts
 * of the boards (with how many were anonymous, on no board, on their own card), then their own:
 * what they completed and came to, their busiest region, the bosses they did most, and what was
 * sent to how many members. Rule 2: a place only as a region.
 */
export function memberStatsTexts(view: MemberStatsView): string[] {
  const { stats } = view;
  const anonymous = (count: number): string =>
    view.own && count > 0 ? ` (${count.toLocaleString('en-US')} anonymous, on no board)` : '';
  const confirmations =
    stats.reports.confirmations === 0
      ? ''
      : ` (${stats.reports.confirmations.toLocaleString('en-US')} ${stats.reports.confirmations === 1 ? 'confirmation' : 'confirmations'})`;
  const confirmed = [
    `### ${view.title}`,
    `Raids and max battles reported that others completed: ${n(stats.raids.count)}${anonymous(stats.raids.anonymous)}`,
    `Trains conducted that others came to: ${n(stats.trains.count)}${anonymous(stats.trains.anonymous)}`,
    `Meetups hosted that others came to: ${n(stats.meetups.count)}${anonymous(stats.meetups.anonymous)}`,
    `Reports at stops that counted: ${n(stats.reports.count)}${confirmations}`,
  ].join('\n');
  const bosses = stats.bosses.flatMap((boss) => {
    const name = view.bossName(boss.bossKey);
    return name === undefined ? [] : [`${name} (${String(boss.count)})`];
  });
  const own = [
    `Raids and max battles completed: ${n(stats.completed)}`,
    `Trains ridden: ${n(stats.trainsCame)} · Meetups attended: ${n(stats.meetupsCame)}`,
    ...(view.region === undefined ? [] : [`Busiest region: ${view.region}`]),
    ...(bosses.length === 0 ? [] : [`Bosses done most: ${bosses.join(', ')}`]),
    `Raids, max battles, trains and reports sent to ${n(stats.sent)} ${stats.sent === 1 ? 'member' : 'members'}`,
  ].join('\n');
  return [confirmed, own];
}

/** What `/stats me` says to a member without the history opt-in (design Part E). */
export const NOT_OPTED_IN =
  'Your history opt-in is off in this server, so nothing kept here carries your name to count. ' +
  'With `/settings history enabled:True`, from then on I count the raids and max battles you ' +
  'report that others complete, the trains you conduct and the meetups you host that others ' +
  'come to, your reports at stops that count, what you complete and come to, and how many ' +
  'members what you report is sent to.';

/** What `/stats me` says of a year without anything of the member's. */
export function nothingInYear(year: number): string {
  return `Nothing of yours is in my history of this server for ${String(year)}.`;
}
