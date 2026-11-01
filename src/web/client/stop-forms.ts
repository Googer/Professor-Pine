import type {
  HiddenReport,
  MapGrunt,
  MapHideout,
  MapResearch,
  StopReportAnswer,
} from '../../domain/web/stop-report-data.js';
import { pressParty, type Pressed, type PressSteps } from './parties.js';
import type { StopReport } from './stop-reports.js';

/*
 * What the page sends of the reports at stops (plan 8M-9B) and reads of the answers, the parts with
 * no page in them: every report and take-back goes through the routes of plan 8R-3 with the page's
 * CSRF token as a press does (`pressParty`: a stale token's 403 tried once more with a new one,
 * B16), and the page acts only on what the answer says by its machine parts (`reason`, `asks`),
 * never on its words (B4).
 */

/** What a POST of the page needs: the request with this token, and `/api/me` again. */
export type StopSteps = PressSteps;

/** What the page reads of an answer (`StopReportAnswer`), only what it can read. */
export interface StopAnswered {
  ok: boolean;
  /** The HTTP status, which says what kind of refusal it is (403, 404, 409, 422, 429, 503). */
  status: number;
  text?: string;
  research?: MapResearch[];
  already?: MapResearch[];
  grunt?: MapGrunt;
  hideout?: MapHideout;
  asks?: { replacing?: number; reports?: MapResearch[]; hidden?: HiddenReport[] };
  reason?: StopReportAnswer['reason'];
}

/** An answer's body as the page may read it (anything else left out). */
export function stopAnswerOf(status: number, body: unknown): StopAnswered {
  if (typeof body !== 'object' || body === null) return { ok: false, status };
  const read = body as Partial<StopReportAnswer> & { error?: unknown };
  const answered: StopAnswered = { ok: read.ok === true, status };
  if (typeof read.text === 'string') answered.text = read.text;
  else if (typeof read.error === 'string') answered.text = read.error;
  if (Array.isArray(read.research)) answered.research = read.research;
  if (Array.isArray(read.already)) answered.already = read.already;
  if (typeof read.grunt === 'object') answered.grunt = read.grunt;
  if (typeof read.hideout === 'object') answered.hideout = read.hideout;
  if (typeof read.asks === 'object') answered.asks = read.asks;
  if (read.reason === 'ended' || read.reason === 'list-changed' || read.reason === 'already') {
    answered.reason = read.reason;
  }
  return answered;
}

/**
 * Sends a report or a take-back with the page's CSRF token as a press is sent (`pressParty`): the
 * words to say (the answer's `text`, else its `error`, else that it did not get through), the
 * token now, and what the answer says.
 */
export async function sendStop(
  csrf: string,
  steps: StopSteps,
): Promise<Pressed & { answer: StopAnswered }> {
  let last: { status: number; body: unknown } = { status: 0, body: undefined };
  const pressed = await pressParty(csrf, {
    post: async (token) => {
      last = await steps.post(token);
      return last;
    },
    me: () => steps.me(),
  });
  return { ...pressed, answer: stopAnswerOf(last.status, last.body) };
}

/** Where a report is taken back: `POST /s/<guild>/api/stop-reports/<id>/remove`. */
export function takeBackPath(guild: string, report: Pick<StopReport, 'id'>): string {
  return `/s/${guild}/api/stop-reports/${encodeURIComponent(String(report.id))}/remove`;
}

/**
 * A take-back's body: always the version the popup showed, its Take back's `data-made-at`
 * (`madeAt`, plan 8R-4L's follow-up: a grunt refined in place since keeps its id, and is not taken
 * back by an older popup; review F4: never the version of a poll that came since).
 */
export function takeBackBody(shown: { madeAt?: string | undefined }): { madeAt: number } {
  return { madeAt: Number(shown.madeAt) };
}
