import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { AppContext } from '../app-context.js';
import {
  CLOSE_KIND,
  CLOSE_THROTTLE,
  closePartyAs,
  closeWords,
  type CloseOutcome,
} from '../commands/parties/delete.js';
import { movedWords } from '../commands/parties/group-dialogs.js';
import {
  NO_REASON,
  refuseReportedBefore,
  REPORT_COMMAND,
  REPORT_THROTTLE,
  reportAnswer,
  reportFormWords,
} from '../commands/parties/report.js';
import { UserError } from '../discord/errors.js';
import { MAX_REPORT_REASON } from '../domain/moderation/reports.js';
import { MEET_THROTTLE, meetingWords } from '../commands/parties/meet.js';
import { RAID_IS_OVER } from '../commands/raids/raid-input.js';
import { meetRefusalOf, meetSubmitRefusal } from '../commands/parties/meet-dialog.js';
import { ACTION_THROTTLE, outcomeWords, partyOver } from '../commands/parties/reply.js';
import type { MemberStanding } from '../discord/member-directory.js';
import type { MemberAccess } from '../discord/party-gateway.js';
import { attendeeOf, isGroupId, partyWord, type Party } from '../domain/party/party.js';
import type { MapMeet, MapReport, PressAnswer } from '../domain/web/party-data.js';
import { meetOnTheMap } from '../render/meet-dialog.js';
import { PARTY_KIND } from '../render/party-controls.js';
import { unplain } from '../render/text.js';
import type { AttendanceOutcome, Member } from '../services/attendance-service.js';
import {
  actingOnTheMap,
  countedOnTheMap,
  DELETE_NEEDS_MANAGE_MESSAGES,
  mayDeleteOnTheMap,
  memberOrFailure,
  throttledOnTheMap,
  unreachableOnTheMap,
} from './acting.js';
import { sendFailure } from './answers.js';
import { shownAfter } from './post-drawn.js';
import { postGuard } from './csrf.js';
import { pageWords } from './page-words.js';
import { forumOnTheMap } from './party-routes.js';
import { limitedPerAddress, limitedPerMember, RateLimiter } from './rate-limit.js';
import type { WebDeps } from './server.js';

/*
 * The post's controls that open a dialog on Discord, as forms of the live map (plan 8M-8B):
 * Group… (`POST …/parties/<id>/regroup`). Each over the code path of its dialog's Submit, with
 * the checks of every write of `web.md` in their order: the per-address limit and `postGuard`
 * before the body is read; the session and the body; who writes (`actingOnTheMap`); the party as
 * the store has it (an active party of this server, else 409 in the button's words); how they
 * stand to its forum (barred 403, unreachable 503); only then the window its dialog counts in.
 */

/**
 * What staff's Delete… and the report to the moderators read and call on the map (plan 8M-8B):
 * exactly what `/delete`'s dialog (`closePartyAs`) and `/report`'s form use.
 */
export type PostWebContext = Pick<AppContext, 'partyService' | 'reports'>;

/** What the forms of the post's controls need beyond the parties' own (`PartyWebDeps`). */
export interface PostWebDeps {
  ctx: PostWebContext;
  /**
   * The ids of a server's staff roles (`managementRoleIdsOf`), which a report pings where the
   * server has no moderators' channel, as `/report` pings them.
   */
  staffRoles(guildId: string): string[];
}

/** Group…'s moves one address may send in a minute, whoever sends them. */
export const GROUP_WRITES_PER_ADDRESS_MINUTE = 30;

/** The status of each outcome of the attendance service, as a press answers it. */
const OUTCOME_STATUS: Readonly<Record<AttendanceOutcome['kind'], number>> = {
  ok: 200,
  refused: 422,
  gone: 409,
};

/**
 * The body of Group…'s move: the group by its letter and stamp as the list gave it, and whether
 * the form was drawn for a member signed up (`MapRegroup.signedUp`: one who left since is
 * refused, not signed up again).
 */
const regroupBodySchema = z
  .object({
    group: z.string().regex(/^[A-E]$/u),
    stamp: z.string().min(1).max(40),
    signedUp: z.boolean(),
  })
  .strict();

/** Meet…'s openings and Submits one address may send in a minute, whoever sends them. */
export const MEET_PER_ADDRESS_MINUTE = 30;

/** How the map names Meet… in its refusals (the post names it by its icon). */
const MEET_ON_THE_MAP = 'Meet…';

/**
 * The body of Meet…'s Submit: the group the form was drawn for, by its letter and stamp, and the
 * time chosen (epoch milliseconds, one the form offered), null for "No meeting time".
 */
const meetBodySchema = z
  .object({
    group: z.string().regex(/^[A-E]$/u),
    stamp: z.string().min(1).max(40),
    time: z.number().int().nonnegative().nullable(),
  })
  .strict();

/** Staff's closings one address may send in a minute, whoever sends them (a clean-up is many). */
export const CLOSE_PER_ADDRESS_MINUTE = 30;

/** Reports one address may open and send in a minute, whoever sends them. */
export const REPORT_PER_ADDRESS_MINUTE = 30;

/** The body of a report: the reason, as `/report`'s form takes it (white space is refused). */
const reportBodySchema = z.object({ reason: z.string().max(MAX_REPORT_REASON) }).strict();

/** The body of Delete…: archive the post or delete it, as `/delete`'s dialog asks. */
const closeBodySchema = z.object({ removal: z.enum(['archive', 'delete']) }).strict();

/** A control's address: `/api/parties/<party id>/<control>`. */
type ControlRequest = FastifyRequest<{ Params: { guild: string; party: string } }>;

/** Who writes, as Discord has them now, and the party they write to, as the store has it. */
type Target =
  | { member: Member; standing: MemberStanding; party: Party; row: number; access: Access }
  | { sent: FastifyReply };

/**
 * How the member stands to the party's forum (`memberAccess`; none for a party without one):
 * `hidden` is shown on the map, but not theirs to report (review W-7).
 */
type Access = MemberAccess | undefined;

export function postControlRoutes(scope: FastifyInstance, deps: WebDeps): void {
  const { parties, sessions } = deps;

  /**
   * Who writes and to which party, by the checks of every write (spec 2.5): a member who may act
   * (`actingOnTheMap`), an active party of this server in the store (else 409 "This has ended.":
   * an ended party is not there, nor read from anywhere), a forum they are not kept out of
   * (barred 403; Discord unreachable 503). Nothing of it counts against a throttle.
   */
  const target = async (
    request: ControlRequest,
    reply: FastifyReply,
    userId: string,
    doing: string,
  ): Promise<Target> => {
    const { guild } = request.params;
    const acting = await actingOnTheMap(deps, request, reply, guild, userId, doing);
    if ('sent' in acting) return acting;
    const found = await partyFor(request, reply, userId, doing);
    return 'sent' in found ? found : { ...acting, ...found };
  };

  /**
   * The party a control names, as the store has it, for a member it may concern: an active party
   * of this server (else 409 "This has ended."), in a forum they are not kept out of (barred 403;
   * Discord unreachable 503).
   */
  const partyFor = async (
    request: ControlRequest,
    reply: FastifyReply,
    userId: string,
    doing: string,
  ): Promise<{ party: Party; row: number; access: Access } | { sent: FastifyReply }> => {
    const { guild, party: partyId } = request.params;
    const row = await parties.guilds.idFor(guild);
    const party = parties.store.get(partyId);
    if (row === undefined || party?.guildId !== row || party.status !== 'active') {
      const gone: PressAnswer = { ok: false, text: partyOver() };
      return { sent: reply.code(409).send(gone) };
    }
    let access: Access;
    try {
      access =
        party.forumChannelId === null
          ? undefined
          : await parties.forums.memberAccess(party.forumChannelId, userId);
      if (access === 'barred') return { sent: sendFailure(request, reply, 403) };
    } catch (err) {
      return { sent: unreachableOnTheMap(deps, reply, err, guild, userId, doing) };
    }
    return { party, row, access };
  };

  /**
   * Who opens a form and of which party, for a form that asks the server what it offers (Meet…,
   * the report): a member by the directory (`memberOrFailure`: 401, 403, 503), then `partyFor`.
   */
  const reader = async (
    request: ControlRequest,
    reply: FastifyReply,
    doing: string,
  ): Promise<
    { userId: string; party: Party; row: number; access: Access } | { sent: FastifyReply }
  > => {
    void reply.header('cache-control', 'private, no-store');
    const session = await sessions.of(request, reply);
    if (!session) return { sent: sendFailure(request, reply, 401) };
    const { userId } = session;
    const refused = await memberOrFailure(deps, request, reply, request.params.guild, userId);
    if (refused) return { sent: refused };
    const found = await partyFor(request, reply, userId, doing);
    return 'sent' in found ? found : { userId, ...found };
  };

  /** The words of a command as text of the page, in the posts' zone. */
  const words = (text: string): string => pageWords(text, parties.zone, deps.now());

  /** Logged as a press of the post is: who, where, which party, what; never a text. */
  const noted = (request: ControlRequest, userId: string, action: string, outcome: string) => {
    deps.log.info(
      { user: userId, guild: request.params.guild, party: request.params.party, action, outcome },
      'a party was pressed on the map',
    );
  };

  // Group… (plan 8M-8B): a move to the group picked, by its letter and stamp, as the dialog's
  // Submit moves (`joinStamped`, `movedWords`): one use in the window of the post's controls
  // (`ACTION_THROTTLE`), counted at the move only (the map's form opens from the list, which
  // carries its choices). A new group stays on Discord.
  const groupLimiter = new RateLimiter({ uses: GROUP_WRITES_PER_ADDRESS_MINUTE, perMs: 60_000 });
  scope.post(
    '/api/parties/:party/regroup',
    {
      onRequest: [
        limitedPerAddress(groupLimiter, { now: deps.now }),
        postGuard(sessions, deps.settings.publicUrl),
      ],
    },
    async (request: ControlRequest, reply) => {
      void reply.header('cache-control', 'no-store');
      const session = await sessions.of(request, reply);
      if (!session) return sendFailure(request, reply, 403);
      const body = regroupBodySchema.safeParse(request.body ?? {});
      if (!body.success || !isGroupId(body.data.group)) return sendFailure(request, reply, 400);
      const { group, stamp, signedUp } = body.data;
      const { userId } = session;
      const found = await target(request, reply, userId, 'moved to another group');
      if ('sent' in found) return found.sent;
      const counted = { control: PARTY_KIND };
      const throttled = throttledOnTheMap(deps, reply, counted, userId, ACTION_THROTTLE);
      if (throttled) return throttled;
      const { kind, said } = await countedOnTheMap(
        deps,
        counted,
        userId,
        ACTION_THROTTLE,
        async () => {
          const outcome = await parties.attendance.joinStamped(
            found.party.id,
            found.member,
            group,
            stamp,
            { signedUp },
          );
          return {
            kind: outcome.kind,
            said: movedWords(parties.attendance.limits(), found.party, group, outcome),
          };
        },
      );
      noted(request, userId, 'regroup', kind);
      await shownAfter(parties.drawn, found.party.id, kind === 'ok');
      const answer: PressAnswer = { ok: said.ok, text: unplain(said.text) };
      return reply.code(OUTCOME_STATUS[kind]).send(answer);
    },
  );

  // Meet… (plan 8M-8B, X4), a raid's and a max battle's: the form asks what the dialog offers
  // now (`GET`: `meetOnTheMap`), refused as the press is (`meetRefusalOf`) and while `/meet`'s
  // window is full (counting nothing, as the post's `checks`); its Submit (`POST`) counts once in
  // that window (`MEET_WINDOW`: one budget with `/meet` and the dialog), decides again, and sets
  // the time as the dialog's Submit does (`setMeetingTime` with the group drawn), in `/meet`'s
  // words, Meet… named in words (`meetSubmitRefusal`). One per-address limit for both.
  const meetLimiter = new RateLimiter({ uses: MEET_PER_ADDRESS_MINUTE, perMs: 60_000 });
  const meetOpenings = new RateLimiter({ uses: MEET_PER_ADDRESS_MINUTE, perMs: 60_000 });
  const meetWindow = { command: 'meet', varies: true } as const;
  scope.get(
    '/api/parties/:party/meet',
    {
      onRequest: [
        limitedPerAddress(meetLimiter, { now: deps.now }),
        limitedPerMember(meetOpenings, deps),
      ],
    },
    async (request: ControlRequest, reply) => {
      const found = await reader(request, reply, 'opened Meet…');
      if ('sent' in found) return found.sent;
      const { userId, party } = found;
      const full = throttledOnTheMap(deps, reply, meetWindow, userId, MEET_THROTTLE, {
        count: false,
      });
      if (full) return full;
      const now = deps.now();
      const battle = meetRefusalOf(parties.attendance.limits(), party, userId, now);
      if (typeof battle === 'string') return reply.code(422).send({ error: words(battle) });
      const groupId = attendeeOf(battle, userId)?.group ?? battle.defaultGroupId;
      const view: MapMeet = meetOnTheMap({ party: battle, groupId, zone: parties.zone, now });
      return view;
    },
  );
  scope.post(
    '/api/parties/:party/meet',
    {
      onRequest: [
        limitedPerAddress(meetLimiter, { now: deps.now }),
        postGuard(sessions, deps.settings.publicUrl),
      ],
    },
    async (request: ControlRequest, reply) => {
      void reply.header('cache-control', 'no-store');
      const session = await sessions.of(request, reply);
      if (!session) return sendFailure(request, reply, 403);
      const body = meetBodySchema.safeParse(request.body ?? {});
      if (!body.success || !isGroupId(body.data.group)) return sendFailure(request, reply, 400);
      const { group, stamp, time } = body.data;
      const { userId } = session;
      const found = await target(request, reply, userId, 'set a meeting time');
      if ('sent' in found) return found.sent;
      const throttled = throttledOnTheMap(deps, reply, meetWindow, userId, MEET_THROTTLE);
      if (throttled) return throttled;
      const { kind, said } = await countedOnTheMap(
        deps,
        meetWindow,
        userId,
        MEET_THROTTLE,
        async () => {
          const limits = parties.attendance.limits();
          const now = parties.store.get(found.party.id);
          const battle = meetRefusalOf(limits, now, userId, deps.now());
          if (typeof battle === 'string') {
            // Over (gone from the store, or by the clock): gone, 409, as `partyFor` answers it
            // (review B-3); anything else a refusal.
            const over =
              battle === partyOver() ||
              battle === partyOver(found.party) ||
              battle === RAID_IS_OVER;
            return {
              kind: over ? ('gone' as const) : ('refused' as const),
              said: { ok: false, text: battle },
            };
          }
          const outcome = await parties.attendance.setMeetingTime(battle.id, found.member, time, {
            group,
            stamp,
          });
          const refusal =
            outcome.kind === 'refused'
              ? meetSubmitRefusal(outcome.reason, MEET_ON_THE_MAP, group)
              : undefined;
          return {
            kind: outcome.kind,
            said:
              refusal === undefined
                ? outcomeWords(limits, battle, outcome, (ok) => meetingWords(ok, userId))
                : { ok: false, text: refusal },
          };
        },
      );
      noted(request, userId, 'meet', kind);
      await shownAfter(parties.drawn, found.party.id, kind === 'ok');
      const answer: PressAnswer = { ok: said.ok, text: words(said.text) };
      return reply.code(OUTCOME_STATUS[kind]).send(answer);
    },
  );

  // Staff's Delete… (plan 8M-8B, X1): `/delete`'s dialog on the map, for staff alone (as its
  // `requireManagement`, of the member fetched fresh: 403 in its words, uncounted), in the window
  // of its Submit (`CLOSE_THROTTLE` of the controls `pclose`), then `closePartyAs`, the dialog's
  // own way, and its words (`closeWords`, the forum named `#name`).
  const closeLimiter = new RateLimiter({ uses: CLOSE_PER_ADDRESS_MINUTE, perMs: 60_000 });
  scope.post(
    '/api/parties/:party/close',
    {
      onRequest: [
        limitedPerAddress(closeLimiter, { now: deps.now }),
        postGuard(sessions, deps.settings.publicUrl),
      ],
    },
    async (request: ControlRequest, reply) => {
      void reply.header('cache-control', 'no-store');
      const session = await sessions.of(request, reply);
      if (!session) return sendFailure(request, reply, 403);
      const body = closeBodySchema.safeParse(request.body ?? {});
      if (!body.success) return sendFailure(request, reply, 400);
      const { removal } = body.data;
      const { userId } = session;
      const found = await target(request, reply, userId, 'closed a party');
      if ('sent' in found) return found.sent;
      if (!mayDeleteOnTheMap(found.standing, userId, parties.ownerId)) {
        return reply.code(403).send({ error: DELETE_NEEDS_MANAGE_MESSAGES });
      }
      const counted = { control: CLOSE_KIND };
      const throttled = throttledOnTheMap(deps, reply, counted, userId, CLOSE_THROTTLE);
      if (throttled) return throttled;
      const outcome = await countedOnTheMap(deps, counted, userId, CLOSE_THROTTLE, () =>
        closePartyAs(deps.posts.ctx, found.party, found.member, removal),
      );
      noted(request, userId, 'close', outcome.kind);
      const { text } = closeWords(
        outcome,
        found.party,
        forumOnTheMap(parties, found.party.forumChannelId),
      );
      const ok = outcome.kind !== 'may-not-delete' && outcome.kind !== 'over';
      const answer: PressAnswer = { ok, text: unplain(text) };
      return reply.code(CLOSE_STATUS[outcome.kind]).send(answer);
    },
  );

  // Report… (plan 8M-8B, X2): `/report`'s form on the map, for every member. Its opening (`GET`)
  // asks what `/report` asks before its form (uncounted: its window, `REPORT_WINDOW`, and whether
  // the member's reason is on the open report already, `refuseReportedBefore`) and answers its
  // words (`reportFormWords`); its Submit (`POST`) refuses a reason of white space alone uncounted
  // (the forms' guard), counts once in `/report`'s window, and reports as the form's Submit does
  // (`reportParty`, `reportAnswer`): without the moderators' channel into the post, pinging the
  // server's staff roles (`PostWebDeps.staffRoles`). A report the moderators could not be told of
  // gives the use back. One per-address limit for both.
  const reportLimiter = new RateLimiter({ uses: REPORT_PER_ADDRESS_MINUTE, perMs: 60_000 });
  const reportOpenings = new RateLimiter({ uses: REPORT_PER_ADDRESS_MINUTE, perMs: 60_000 });
  const reportWindow = { command: REPORT_COMMAND } as const;
  scope.get(
    '/api/parties/:party/report',
    {
      onRequest: [
        limitedPerAddress(reportLimiter, { now: deps.now }),
        limitedPerMember(reportOpenings, deps),
      ],
    },
    async (request: ControlRequest, reply) => {
      const found = await reader(request, reply, 'opened a report');
      if ('sent' in found) return found.sent;
      // Only from a forum the member sees on Discord (review W-7).
      if (found.access === 'hidden') return sendFailure(request, reply, 403);
      const { userId, party } = found;
      const full = throttledOnTheMap(deps, reply, reportWindow, userId, REPORT_THROTTLE, {
        count: false,
      });
      if (full) return full;
      try {
        await refuseReportedBefore(deps.posts.ctx, { kind: 'party', partyId: party.id }, userId);
      } catch (err) {
        if (!(err instanceof UserError)) throw err;
        return reply.code(422).send({ error: err.message });
      }
      const view: MapReport = reportFormWords(partyWord(party));
      return view;
    },
  );
  scope.post(
    '/api/parties/:party/report',
    {
      onRequest: [
        limitedPerAddress(reportLimiter, { now: deps.now }),
        postGuard(sessions, deps.settings.publicUrl),
      ],
    },
    async (request: ControlRequest, reply) => {
      void reply.header('cache-control', 'no-store');
      const session = await sessions.of(request, reply);
      if (!session) return sendFailure(request, reply, 403);
      const body = reportBodySchema.safeParse(request.body ?? {});
      if (!body.success) return sendFailure(request, reply, 400);
      const { reason } = body.data;
      const { userId } = session;
      const { guild } = request.params;
      const found = await target(request, reply, userId, 'reported a party');
      if ('sent' in found) return found.sent;
      if (found.access === 'hidden') return sendFailure(request, reply, 403);
      if (reason.trim() === '') {
        const refused: PressAnswer = { ok: false, text: NO_REASON };
        return reply.code(422).send(refused);
      }
      const throttled = throttledOnTheMap(deps, reply, reportWindow, userId, REPORT_THROTTLE);
      if (throttled) return throttled;
      const word = partyWord(found.party);
      let text: string;
      try {
        text = await countedOnTheMap(deps, reportWindow, userId, REPORT_THROTTLE, async () =>
          reportAnswer(
            await deps.posts.ctx.reports.reportParty({
              serverId: guild,
              partyId: found.party.id,
              reporter: { id: userId, name: found.member.name },
              reason,
              roleIds: deps.posts.staffRoles(guild),
            }),
            word,
          ),
        );
      } catch (err) {
        if (!(err instanceof UserError)) throw err;
        noted(request, userId, 'report', 'refused');
        const refused: PressAnswer = { ok: false, text: unplain(err.message) };
        return reply.code(err.message === partyOver() ? 409 : 422).send(refused);
      }
      noted(request, userId, 'report', 'sent');
      const answer: PressAnswer = { ok: true, text: unplain(text) };
      return answer;
    },
  );
}

/** The status of each outcome of a closing. */
const CLOSE_STATUS: Readonly<Record<CloseOutcome['kind'], number>> = {
  closed: 200,
  'refused-deletion': 200,
  'deletion-pending': 200,
  'deleted-over': 200,
  over: 409,
  'may-not-delete': 422,
};
