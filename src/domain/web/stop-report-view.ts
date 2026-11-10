import { isOneOf } from '../research/reports.js';
import { rewardLine, type TaskReward } from '../research/task.js';
import { isHideout, parseRocketKey, typeKeyOf, type RocketCatch } from '../rocket/lineups.js';
import {
  isResearchReport,
  isRocketReport,
  type ResearchReport,
  type RocketReport,
  type StopReport,
} from '../stops/report.js';
import type { ResearchPeriod } from '../time/research-periods.js';
import { AS_FED, researchPicture, rocketPicture, type PictureLookup } from '../stops/pictures.js';
import { reportSearch, type SearchFacts } from '../stops/report-search.js';
import { allowedPicture } from './picture.js';
import type {
  MapGrunt,
  MapHideout,
  MapResearch,
  MapReward,
  MapStop,
  StopReportsView,
} from './stop-report-data.js';

/** What the view of a member's reports at stops is made of (`stopReportView`). */
export interface StopReportViewInput {
  /** The server's reports that have not ended (`StopReportService.standing`), oldest first. */
  reports: readonly StopReport[];
  /** The research period on now: its reports are shown, those waiting under it counted. */
  period: Pick<ResearchPeriod, 'key' | 'event' | 'waiting'>;
  now: number;
  /** `settings.timezone`, sent with the view. */
  zone: string;
  /** Whether the member may see a report (the regions it lies in: not all kept from them). */
  shown(report: StopReport): boolean;
  memberId: string;
  /** Whether the member is staff (`isMapStaff`), who may take back any report. */
  staff: boolean;
  /** Discord cannot be asked: nothing may be done, only seen. */
  readOnly: boolean;
  /** Where a report is on Discord, that the member may see; undefined for nowhere. */
  link(report: StopReport): string | undefined;
  /** The origins the page may load pictures from (`pictureOrigins`). */
  pictureOrigins: readonly string[];
  /**
   * The address of a hideout's picture as the post of the stops names it (plan 8R-6,
   * `StopPictures.url`: the square picture Pine serves, none where the source is gone); the
   * source itself without it.
   */
  picture?: PictureLookup;
  /**
   * What Find reads beyond the report (plan 8M-12, `reportSearch`): how many lineups a grunt
   * type has today, so that only a type of two is "not sure which".
   */
  search: SearchFacts;
}

/** A coordinate to six decimals (about 10 cm), as the map's places are. */
const sixDecimals = (value: number): number => Math.round(value * 1e6) / 1e6;

/**
 * A picture's address as the post of the stops names it (`picture`: the square one Pine serves, none
 * where its source is gone; the source itself without a lookup), only where the page may load it.
 */
function shownPicture(
  source: string | null | undefined,
  origins: readonly string[],
  picture: PictureLookup = AS_FED,
): string | undefined {
  return allowedPicture(source == null ? undefined : picture(source), origins);
}

/** A picture the page may load, as an optional field. */
function pictured(
  image: string | null,
  origins: readonly string[],
  picture?: PictureLookup,
): { image?: string } {
  const allowed = shownPicture(image, origins, picture);
  return allowed === undefined ? {} : { image: allowed };
}

/**
 * A reward of a task as the map shows it, with the value a filter matches (`MapReward`); its
 * picture named as the post names it (plan 8M-9B: `StopPictures.url`, the square one).
 */
export function mapReward(
  reward: TaskReward,
  origins: readonly string[],
  lookup?: PictureLookup,
): MapReward {
  const picture = pictured(reward.image, origins, lookup);
  switch (reward.kind) {
    case 'encounter':
      return {
        kind: 'encounter',
        name: reward.name,
        value: reward.key === null ? null : `pokemon:${reward.key}`,
        quantity: 0,
        shiny: reward.shiny,
        ...picture,
      };
    case 'item':
      return {
        kind: 'item',
        name: reward.name,
        value: `item:${reward.item}`,
        quantity: reward.quantity,
        shiny: false,
        ...picture,
      };
    case 'energy':
      return {
        kind: 'energy',
        name: reward.name,
        value: reward.dex === null ? null : `energy:${String(reward.dex)}`,
        quantity: reward.quantity,
        shiny: false,
        ...picture,
      };
  }
}

/** A Pokémon a Rocket report can give, as the map shows a reward (its picture as `mapReward`'s). */
export function mapCatch(
  caught: RocketCatch,
  origins: readonly string[],
  lookup?: PictureLookup,
): MapReward {
  return {
    kind: 'encounter',
    name: caught.name,
    value: caught.key === null ? null : `pokemon:${caught.key}`,
    quantity: 0,
    shiny: caught.shiny,
    ...pictured(caught.image, origins, lookup),
  };
}

/** A report's stop as its snapshot has it, to six decimals. */
function mapStop(report: StopReport): MapStop {
  const { key, name, address, lat, lon } = report.stop;
  return { key, name, address, lat: sixDecimals(lat), lon: sixDecimals(lon) };
}

/**
 * What every report on the map has, for the member who asks; its search words and, where it is
 * not confirmed, why (plan 8M-12: `reportSearch`, one function over the stored report).
 */
function base(report: StopReport, input: StopReportViewInput) {
  const link = input.link(report);
  const { words, unconfirmed } = reportSearch(report, input.search);
  return {
    id: report.id,
    stop: mapStop(report),
    madeAt: report.madeAt,
    endsAt: report.endsAt,
    reporter: report.reporter.name.trim() === '' ? 'a member' : report.reporter.name,
    mayTakeBack: !input.readOnly && (input.staff || report.reporter.id === input.memberId),
    ...(link === undefined ? {} : { link }),
    words,
    ...(unconfirmed === undefined ? {} : { unconfirmed }),
  };
}

/** A report's own picture as an optional field (`picture`), only where the page may load it. */
function reportPicture(
  source: string | undefined,
  input: StopReportViewInput,
): { picture?: string } {
  const picture = shownPicture(source, input.pictureOrigins, input.picture);
  return picture === undefined ? {} : { picture };
}

/**
 * Research as the map shows it; its picture the reward line's in the post (plan 8M-9B, B2:
 * `researchPicture`, the one reward's, "one of" the encounter picture; none for a typed task
 * without its reward).
 */
function mapResearch(report: ResearchReport, input: StopReportViewInput): MapResearch {
  const { research } = report;
  return {
    ...base(report, input),
    task: report.subjectKey,
    text: research.text,
    category: research.category,
    typed: research.typed,
    oneOf: isOneOf(report),
    rewardText: rewardLine(research.rewards),
    rewards: research.rewards.map((reward) =>
      mapReward(reward, input.pictureOrigins, input.picture),
    ),
    ...reportPicture(researchPicture(research.rewards)?.source, input),
  };
}

/**
 * A grunt as the map shows it; its picture as its message's (plan 8M-9B, B2: `rocketPicture`, the
 * one catch's, else the encounter picture), which the popup shows (its marker the Rocket icon).
 */
function mapGrunt(report: RocketReport, input: StopReportViewInput): MapGrunt {
  return {
    ...base(report, input),
    who: report.subjectKey,
    typeKey: typeKeyOf(report.subjectKey),
    name: report.rocket.name,
    catches: report.rocket.catches.map((caught) =>
      mapCatch(caught, input.pictureOrigins, input.picture),
    ),
    ...(report.rocket.lineup === undefined ? {} : { lineup: report.rocket.lineup }),
    ...reportPicture(rocketPicture(report.subjectKey, report.rocket.catches)?.source, input),
  };
}

/**
 * A hideout as the map shows it; its picture as the post's (plan 8R-6, `rocketPicture`): a
 * leader's or Giovanni's portrait, a decoy's one catch or the encounter picture, named as the post
 * names it (`picture`: none where it is gone), only from a host the page may load.
 */
function mapHideout(report: RocketReport, input: StopReportViewInput): MapHideout {
  // A hideout is never unconfirmed (`reportSearch`: only a grunt type of two lineups is).
  return {
    ...base(report, input),
    who: report.subjectKey,
    name: report.rocket.name,
    catches: report.rocket.catches.map((caught) =>
      mapCatch(caught, input.pictureOrigins, input.picture),
    ),
    ...reportPicture(rocketPicture(report.subjectKey, report.rocket.catches)?.source, input),
  };
}

/** Whether a Rocket report is of a hideout (a leader, Giovanni, the decoy). */
function ofHideout(report: RocketReport): boolean {
  const who = parseRocketKey(report.subjectKey);
  return who !== undefined && isHideout(who);
}

/**
 * Today's reports at the stops of a server as a member may see them on the map (plan 8R-3;
 * design 8): the research of the period on now (design 9.2: an intra-day event's window shows
 * its own, and the day's that wait under it are counted with when they come back, as the pinned
 * post says it), the grunts until their half hour has passed, the day's hideouts; only reports
 * the member may see (`shown`), each with its stop's snapshot, its words, its rewards or catches
 * (pictures only from `pictureOrigins`), its reporter by name (never an id), whether the member
 * may take it back, and its link. Pure.
 */
export function stopReportView(input: StopReportViewInput): StopReportsView {
  const { now, period } = input;
  const standing = input.reports.filter((report) => report.endsAt > now && input.shown(report));
  const research = standing.filter(isResearchReport);
  const rocket = standing.filter(isRocketReport);
  const waiting =
    period.waiting === undefined
      ? 0
      : research.filter((report) => report.periodKey === period.waiting?.key).length;
  return {
    zone: input.zone,
    event: period.event?.name ?? null,
    research: research
      .filter((report) => report.periodKey === period.key)
      .map((report) => mapResearch(report, input)),
    waiting:
      period.waiting !== undefined && waiting > 0
        ? { stops: waiting, at: period.waiting.at }
        : null,
    grunts: rocket.filter((report) => !ofHideout(report)).map((report) => mapGrunt(report, input)),
    hideouts: rocket.filter(ofHideout).map((report) => mapHideout(report, input)),
    readOnly: input.readOnly,
  };
}
