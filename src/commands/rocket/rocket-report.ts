import type { AppContext } from '../../app-context.js';
import { channelsWithBoards } from '../../domain/regions/board.js';
import type { RocketChoice } from '../../domain/rocket/lineups.js';
import type { Reporter, ReportedStop, RocketReport } from '../../domain/stops/report.js';
import { periodEndWords, type ChannelNamer } from '../../render/research.js';
import type { RocketAnswerView } from '../../render/rocket.js';
import { plain } from '../../render/text.js';
import type { PostedGrunt } from '../../services/grunt-messages.js';
import { rocketSubject } from '../../services/rocket-reports.js';
import { isHideoutReport } from '../../services/stop-reports.js';

/*
 * What `/rocket report` does beyond reading its interaction (plan 8R-3; web.md's one code path per
 * command, spec 3.5): the report as the member through `RocketService` (the one way to report:
 * the grunt's messages, the DMs), each outcome for the caller to word or answer. `/rocket`, its
 * dialog's Submit and the map call it.
 */

/** What a Rocket report from a member reads and calls (`/rocket` and the map). */
export type RocketReporting = Pick<
  AppContext,
  'rocket' | 'rehearsal' | 'config' | 'regions' | 'servers'
>;

/**
 * What a Rocket report from a member is: who (a choice of the lineups), at which stop, who
 * reports, and the hideout the member said Replace to (`replacing`, its report's id).
 */
export interface RocketAsk {
  choice: RocketChoice;
  stop: ReportedStop;
  reporter: Reporter;
  replacing?: number;
}

/** What came of a Rocket report, for the caller to answer. */
export type RocketAs =
  /** Reported: the report and the view of its answer's words (`rocketWords`). */
  | { kind: 'reported'; report: RocketReport; view: RocketAnswerView }
  /** The same grunt stands (Matt's answer 4), with its messages for a link. */
  | { kind: 'already'; standing: RocketReport; posted: PostedGrunt[] }
  /**
   * A hideout stands at the stop that the member did not say Replace to (one reported meanwhile,
   * or another since the question): asked again, or refused; the use goes back.
   */
  | { kind: 'asks'; standing: RocketReport }
  /**
   * None of the member's doing, worded by the caller's namer: the grunt could be posted in none
   * of its region channels (`unposted`), or a newer report took its place while it was posted
   * (`overtaken`). Nothing is reported; the use goes back.
   */
  | { kind: 'unposted' | 'overtaken'; text: string };

/**
 * The question before a grunt replaces a hideout (design 5.2, 9.4): the dialog's words on
 * Discord, the map's 422 (plan 8R-3). Names as shown, made plain.
 */
export function hideoutQuestion(hideout: string, grunt: string): string {
  const there = plain(hideout);
  return (
    `${there} was reported here today, and a hideout keeps grunts away all day. Replace ` +
    `${there}’s report with the ${plain(grunt)}?`
  );
}

/**
 * `/rocket report` as the member (plan 8R-3: the command, its dialog's Submit and the map): the
 * report through `ctx.rocket.report` (decided with the stop's row locked; a grunt's messages
 * posted, who wants it told), and each outcome for the caller: the view of the answer's words,
 * the grunt that stands already, the hideout to ask about, or what went wrong in words whose
 * channels `channel` names. Throws what storing throws.
 */
export async function reportRocketAs(
  ctx: RocketReporting,
  serverId: string,
  ask: RocketAsk,
  channel: ChannelNamer,
): Promise<RocketAs> {
  const outcome = await ctx.rocket.report({
    serverId,
    stop: ask.stop,
    subject: rocketSubject(ask.choice),
    reporter: ask.reporter,
    ...(ask.replacing === undefined ? {} : { replacing: ask.replacing }),
  });
  switch (outcome.kind) {
    case 'asks':
      return { kind: 'asks', standing: outcome.standing };
    case 'already':
      return { kind: 'already', standing: outcome.standing, posted: outcome.posted };
    case 'unposted': {
      // Taken back by the service (fix A5). What it had replaced: a hideout is back, a grunt is
      // gone for good (fix R2).
      const before = outcome.restored
        ? `; **${plain(outcome.restored.rocket.name)}** stands as before`
        : outcome.lost
          ? `, and the **${plain(outcome.lost.rocket.name)}** reported before was taken off`
          : '';
      return {
        kind: 'unposted',
        text:
          `I could not post the grunt in ${outcome.channels.map(channel).join(', ')}, ` +
          `so nothing was reported${before}. Try again in a moment.`,
      };
    }
    case 'overtaken':
      // Replaced while its messages went out (fix F3).
      return {
        kind: 'overtaken',
        text:
          `A newer report at that PokéStop took the place of your **${plain(ask.choice.name)}** ` +
          'while it was being posted, so it was not reported.',
      };
    case 'reported':
      return {
        kind: 'reported',
        report: outcome.report,
        view: {
          report: outcome.report,
          replaced: outcome.replaced,
          hideout: isHideoutReport(outcome.report),
          channels: outcome.channels,
          // Only the boards recorded are named (review W4).
          boards: channelsWithBoards(outcome.channels, (id) => ctx.regions.byChannel(id)),
          posted: outcome.posted,
          rehearsal: ctx.rehearsal !== undefined,
          until: periodEndWords(outcome.report.endsAt, Date.now(), ctx.servers.zoneOf(serverId)),
          ...(outcome.changed === true ? { changed: true } : {}),
        },
      };
  }
}
