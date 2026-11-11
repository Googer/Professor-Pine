import { ButtonStyle, ComponentType, type APIComponentInContainer } from 'discord.js';
import { encodeCustomId } from '../discord/custom-id.js';
import type { V2Message } from '../discord/party-gateway.js';
import type { PlaceAskRecord, PlaceRulingRecord, RulingSource } from '../domain/meetups/records.js';
import { askableAt } from '../domain/meetups/safety.js';
import {
  APPROVED_ACCENT,
  EXPIRED_ACCENT,
  PENDING_ACCENT,
  REFUSED_ACCENT,
  placeLine,
} from './meetup-safety.js';
import { postLink } from './notify-dm.js';
import {
  endSentence,
  memberText,
  memberTextOrFormer,
  plainLines,
  plainNoLinks,
  timestamp,
} from './text.js';
import { actionRow, container, textDisplay, textMessage } from './v2.js';

/**
 * The custom-id kind of asks about refused places (plan 8S-2): `mplace:<kind>:open:<place id>`
 * (Ask the moderators under `/meetup`'s refusal of a place; the server is the presser's, nothing
 * is kept, so it works after a restart), `mplace:<kind>:form:<place id>` (its form), and
 * `mplace:<ask id>:allow|keep` on the
 * moderators' post of an ask.
 */
export const ASK_KIND = 'mplace';

/** How long an ask waits for a moderator before it expires (as an appeal). */
export const ASK_OPEN_DAYS = 7;

const SOURCE_WORDS: Record<RulingSource['kind'], string> = {
  request: 'a meetup request',
  report: 'a report',
  ask: 'an ask',
};

/** Who ruled a place, when, and from which post: `Refused by **Mod** (<@…>) <t:…:F>, from […]`. */
export function rulingLine(ruling: PlaceRulingRecord, serverId: string): string {
  const who = memberText({ id: ruling.ruledBy, name: ruling.ruledByName ?? undefined });
  const verb = ruling.ruling === 'refuse' ? 'Refused' : 'Allowed';
  const from =
    ruling.source === null
      ? ''
      : `, from [${SOURCE_WORDS[ruling.source.kind]}](<${postLink(
          serverId,
          ruling.source.channelId,
          ruling.source.messageId,
        )}>)`;
  const kept = ruling.keptAt === null ? '' : `; kept refused ${timestamp(ruling.keptAt, 'F')}`;
  return `${verb} by ${who} ${timestamp(ruling.ruledAt, 'F')}${from}${kept}`;
}

/**
 * The moderators' post of an ask about a refused place (plan 8S-2): the member (`memberText`),
 * the place (its official name too), its ruling (who, when, from which post), their words
 * (`plainLines`, never cut), with Allow place and Keep refused while it is open, and what came of
 * it afterwards.
 */
export function askMessage(
  ask: PlaceAskRecord,
  ruling: PlaceRulingRecord | undefined,
  officialName?: string | null,
): V2Message {
  const member = memberTextOrFormer({ id: ask.memberId, name: ask.memberName }, { start: true });
  const components: APIComponentInContainer[] = [
    textDisplay(
      `### Ask to allow a refused place\n${member} asks for meetups to be allowed at this place again.`,
    ),
    textDisplay(`**Where**\n${placeLine(ask.place, { officialName })}`),
    ...(ruling === undefined
      ? []
      : [textDisplay(`**Ruling**\n${rulingLine(ruling, ask.serverId)}`)]),
    textDisplay(`**Their words**\n${plainLines(ask.text)}`),
  ];
  let accent = PENDING_ACCENT;
  if (ask.status === 'open') {
    const expires = ask.createdAt + ASK_OPEN_DAYS * 86_400_000;
    components.push(
      textDisplay(`-# Expires ${timestamp(expires, 'R')} unless a moderator decides first.`),
      actionRow(
        (
          [
            ['allow', 'Allow place', ButtonStyle.Success],
            ['keep', 'Keep refused', ButtonStyle.Danger],
          ] as const
        ).map(([action, label, style]) => ({
          type: ComponentType.Button,
          style,
          label,
          custom_id: encodeCustomId({ kind: ASK_KIND, id: ask.id, action }),
        })),
      ),
    );
  } else {
    const by =
      ask.decidedBy === null
        ? 'a moderator'
        : memberText({ id: ask.decidedBy, name: ask.decidedByName ?? undefined });
    const when = ask.decidedAt === null ? '' : ` ${timestamp(ask.decidedAt, 'R')}`;
    accent =
      ask.status === 'allowed'
        ? APPROVED_ACCENT
        : ask.status === 'expired'
          ? EXPIRED_ACCENT
          : REFUSED_ACCENT;
    const again = askableAt({ ruledAt: 0, keptAt: ask.decidedAt ?? ask.createdAt });
    components.push(
      textDisplay(
        ask.status === 'allowed'
          ? `**Allowed** by ${by}${when}: meetups can be held there from now on.`
          : ask.status === 'undone'
            ? '**Ruling undone** on `/places`: a meetup there is checked by its name again.'
            : ask.status === 'expired'
              ? '**Expired**: no moderator decided in time. Members can ask again.'
              : `**Kept refused** by ${by}${when}: members can ask again ${timestamp(again, 'R')}.`,
      ),
    );
  }
  return { v2: true, components: [container(accent, components)] };
}

/**
 * What a member is told of their ask, naming the place and the server (`serverName`, when
 * known): allowed, kept refused, or expired (nobody decided in time). Without links (a DM).
 */
export function askOutcomeDm(ask: PlaceAskRecord, serverName?: string): V2Message {
  const place = `**${plainNoLinks(ask.place.title)}**`;
  const on = serverName === undefined ? '' : ` on **${plainNoLinks(serverName)}**`;
  if (ask.status === 'allowed') {
    return textMessage(APPROVED_ACCENT, [
      `A moderator allowed meetups at ${place}${on}: use \`/meetup\` there again.`,
    ]);
  }
  if (ask.status === 'expired') {
    return textMessage(EXPIRED_ACCENT, [
      `No moderator decided on your ask about ${place}${on} in time. You can ask again: use ` +
        '`/meetup` there and press "Ask the moderators…".',
    ]);
  }
  return textMessage(REFUSED_ACCENT, [
    `${endSentence(`A moderator kept meetups refused at ${place}${on}`)} Members can ask again ` +
      `${timestamp(askableAt({ ruledAt: 0, keptAt: ask.decidedAt ?? ask.createdAt }), 'R')}.`,
  ]);
}
