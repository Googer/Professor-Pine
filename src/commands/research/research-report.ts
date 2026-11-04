import type { AppContext } from '../../app-context.js';
import { cutWhole } from '../../domain/geo/place.js';
import type {
  Reporter,
  ReportedStop,
  ResearchDetail,
  StopReport,
} from '../../domain/stops/report.js';
import {
  periodEndWords,
  reportSubject,
  rewardWords,
  stopLine,
  taskText,
  type ResearchWordsView,
} from '../../render/research.js';
import { channelsWithBoards } from '../../domain/regions/board.js';
import { postLink } from '../../render/notify-dm.js';
import { endSentence } from '../../render/text.js';
import type { ReportRef, ResearchOutcome, ResearchSubject } from '../../services/stop-reports.js';

/*
 * What `/research` does beyond reading its interaction (plan 8R-3; web.md's one code path per
 * command, spec 3.5): the stops a report names by their keys, the report as the member and the
 * view its words are made of, and taking a report back. `/research`, `/rocket` and the map call
 * them; each words the outcome with its own namer.
 */

/** Said to a member who would take back another's report. */
export const NOT_YOUR_REPORT = 'Only the member who reported it, or staff, can take that back.';

/**
 * Said where the report `/research remove` read at a stop was replaced or taken back before it
 * was taken back (review A1): nothing is taken back.
 */
export const REPORT_CHANGED =
  'The report at that PokéStop changed meanwhile: nothing was taken back. Look again.';

/**
 * Said of a report whose period has ended, or that is gone, under "Same task at more stops…" (and
 * the map's `sameAs`).
 */
export const REPORT_ENDED =
  'That report has ended or was taken back: report the task again with `/research report`.';

/**
 * Said of a dialog's Submit after the research period it was asked in ended (plan 8R-5, review
 * W2): yesterday's task is not reported into today.
 */
export const PERIOD_ENDED =
  'The research period of that report has ended: report the task again with `/research report`.';

/** Said where a Take back finds nothing: the report ended, was taken back or replaced. */
export const NOTHING_LEFT =
  'There was nothing left to take back: the report has ended, was taken back, or was ' +
  'replaced by a newer one.';

/** What a research report from a member reads and calls (`/research` and the map). */
export type ResearchReporting = Pick<
  AppContext,
  'stopReports' | 'stopPostLinks' | 'guilds' | 'regions' | 'wayspots' | 'config' | 'rehearsal'
>;

/** A reporter by id and the name shown (else the account's), cut to what is kept. */
export function reporterNamed(id: string, name: string | undefined, fallback: string): Reporter {
  return { id, name: cutWhole(name ?? fallback, 100) };
}

/** The channels of a server's regions that this server's channels are, by its row. */
async function ownChannels(
  ctx: Pick<AppContext, 'guilds' | 'regions'>,
  serverId: string,
): Promise<Set<string>> {
  const row = await ctx.guilds.idFor(serverId);
  return new Set(
    ctx.regions
      .all()
      .filter((region) => row !== undefined && region.guildId === row)
      .map((region) => region.channelId),
  );
}

/**
 * The PokéStops these keys name, as reports keep them, each once in the order given: a kept
 * Wayspot of kind `stop` with a title, or a stop of Pine's own (`pine-<id>`), that lies in a
 * region of this server. Any other key (gone, another kind, another server's) is left out.
 */
export async function stopsByKey(
  ctx: Pick<AppContext, 'guilds' | 'regions' | 'wayspots'>,
  serverId: string,
  keys: readonly string[],
): Promise<ReportedStop[]> {
  const ours = await ownChannels(ctx, serverId);
  return [...new Set(keys)].flatMap((key): ReportedStop[] => {
    const wayspot = ctx.wayspots.byId(key);
    if (
      wayspot?.kind !== 'stop' ||
      wayspot.title.trim() === '' ||
      !ctx.wayspots.regionsOf(key).some((id) => ours.has(id))
    ) {
      return [];
    }
    const address = ctx.wayspots.addressOf(wayspot);
    return [
      {
        key,
        name: wayspot.title,
        address: address === '' ? null : address,
        image: wayspot.image,
        lat: wayspot.lat,
        lon: wayspot.lon,
      },
    ];
  });
}

/** The channels of this server's regions the stops lie in, whose posts of the stops show them. */
async function postChannels(
  ctx: Pick<AppContext, 'guilds' | 'regions' | 'wayspots'>,
  serverId: string,
  stops: readonly ReportedStop[],
): Promise<string[]> {
  const ours = await ownChannels(ctx, serverId);
  return [
    ...new Set(
      stops.flatMap((stop) => ctx.wayspots.regionsOf(stop.key).filter((id) => ours.has(id))),
    ),
  ];
}

/**
 * What a research report from a member is: the version of a task, the stops (one to five), who
 * reports, and the reports the member said to replace (plan 8R-5, R7: the stops they ticked).
 */
export interface ResearchAsk {
  stops: readonly ReportedStop[];
  subject: ResearchSubject;
  reporter: Reporter;
  replacing?: readonly number[];
}

/** What came of it: the service's outcome, and the view its words are made of. */
export interface ResearchReported {
  outcome: ResearchOutcome;
  view: ResearchWordsView;
}

/**
 * `/research report` as the member (plan 8R-3: the command, "Same task at more stops…" and the
 * map): the task at the stops (`StopReportService.reportResearch`, which tells the posts of the stops
 * and who wants a reward), and the view of the answer's words (`researchWords`): the region
 * channels whose posts show it (none named in rehearsal mode, which makes no post) and until
 * when. Throws what storing throws.
 */
export async function reportResearchAs(
  ctx: ResearchReporting,
  serverId: string,
  ask: ResearchAsk,
  also = false,
): Promise<ResearchReported> {
  const outcome = await ctx.stopReports.reportResearch({ serverId, ...ask });
  const stops = outcome.saved.map(({ report }) => report.stop);
  // A contradiction met after the member was asked (or after the check before) keeps its report:
  // it is said as reported already (R7, R8).
  const already = await Promise.all(
    [...outcome.already, ...outcome.asks].map(async (report) => ({
      report,
      link: await postLinkOf(ctx, serverId, report),
    })),
  );
  const channels = await postChannels(ctx, serverId, stops);
  return {
    outcome,
    view: {
      saved: outcome.saved,
      already,
      channels,
      // Only the boards recorded are named (review W4).
      boards: channelsWithBoards(channels, (id) => ctx.regions.byChannel(id)),
      until: periodEndWords(outcome.period.end, Date.now(), ctx.config.settings.timezone),
      // Rehearsal mode makes no post of the stops (B10).
      posts: ctx.rehearsal === undefined,
      also,
    },
  };
}

/**
 * The question before a report contradicts other members' reports (plan 8R-5, R7): the dialog's
 * words on Discord (with what Submit does), the map's 422. The task and reward made plain; the
 * stops `picked` from "Same task at more stops…", else `named` (review L4).
 */
export function replaceQuestion(
  research: ResearchDetail,
  many: boolean,
  how: 'named' | 'picked' = 'named',
): string {
  const rewards = rewardWords(research.rewards);
  return (
    `Another member’s report stands at ${many ? 'stops' : 'a stop'} you ${how}. Tick ` +
    `${many ? 'each one' : 'it'} to replace that report with **${taskText(research)}**` +
    `${rewards === '' ? '' : ` · ${rewards}`}; a stop left unticked keeps its report.`
  );
}

/**
 * The link to the message of the post "Today’s Stops" that holds a report (R8), in the board of
 * the first region channel its stop lies in (plan 8R-9, B1); undefined where none holds it
 * (rehearsal mode: no posts).
 */
export async function postLinkOf(
  ctx: Pick<AppContext, 'guilds' | 'regions' | 'wayspots' | 'stopPostLinks'>,
  serverId: string,
  report: StopReport,
): Promise<string | undefined> {
  const [channelId] = await postChannels(ctx, serverId, [report.stop]);
  if (channelId === undefined) return undefined;
  const link = ctx.stopPostLinks.linkOf(channelId, report.subjectKey);
  return link === undefined ? undefined : postLink(serverId, link.channelId, link.messageId);
}

/** What a report taken back was: `Took back **Catch 7 Pokémon** at **Yellow Mural**.` */
export function tookBackWords(report: StopReport): string {
  return endSentence(`Took back **${reportSubject(report)}** at ${stopLine(report.stop)}`);
}

/** What came of taking a report back. */
export type TakenBackAs =
  | { kind: 'removed'; report: StopReport; text: string }
  | { kind: 'not-yours'; report: StopReport }
  /** Changed in place since the version given (review L1): nothing is taken back. */
  | { kind: 'changed'; report: StopReport }
  /** None of this server by that id stands (ended, taken back, replaced, or never was). */
  | { kind: 'gone' };

/**
 * Takes back a report of a server by its id (plan 8R-3: `/research remove`, `/rocket remove` and
 * the map): the member's own, or any for `staff`. A replacement is a report of its own, so a
 * report replaced since it was read is `gone`, and nothing is taken back. Given by its version
 * (`ReportRef`, review L1), a Rocket report refined in place since is `changed`.
 */
export async function takeBackAs(
  ctx: Pick<AppContext, 'stopReports'>,
  serverId: string,
  ref: ReportRef,
  by: string,
  staff: boolean,
): Promise<TakenBackAs> {
  const { removed, notYours, changed } = await ctx.stopReports.takeBack(serverId, [ref], by, staff);
  const [gone] = removed;
  if (gone) return { kind: 'removed', report: gone, text: tookBackWords(gone) };
  const [since] = changed;
  if (since) return { kind: 'changed', report: since };
  const [kept] = notYours;
  return kept ? { kind: 'not-yours', report: kept } : { kind: 'gone' };
}
