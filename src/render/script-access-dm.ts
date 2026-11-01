import { ButtonStyle, ComponentType } from 'discord.js';
import { encodeCustomId } from '../discord/custom-id.js';
import type { V2Message } from '../discord/party-gateway.js';
import type { ScriptAccess, ScriptAccessState } from '../domain/script-access/access.js';
import { plainNoLinks, timestamp } from './text.js';
import { actionRow, textMessage } from './v2.js';

/**
 * The custom-id kind of the owner's buttons under a request's DM
 * (`scriptaccess:<id>:<action>:<asked at>`, the asking's time in base 36).
 */
export const SCRIPT_ACCESS_KIND = 'scriptaccess';
/** The decisions the DM offers. */
export const DM_DECISIONS = ['approve', 'refuse'] as const;
export type DmDecision = (typeof DM_DECISIONS)[number];

/** The edge of a request waiting: Discord's blue; decided: grey. */
const ASKED_ACCENT = 0x5865f2;
const DECIDED_ACCENT = 0x99aab5;

/** How a decided DM names a state. */
const STATE_WORDS: Readonly<Record<ScriptAccessState, string>> = {
  asked: 'waiting',
  approved: 'approved',
  refused: 'refused',
  revoked: 'revoked',
};

const capitalised = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

/**
 * Who asks, for which community, when: as plain text, nobody mentioned. `askedAt`: the asking a
 * DM was drawn for, when the row has been asked again since. Its time is known (the buttons carry
 * it), its community line is not (the row keeps the newest asking's only), so it is left out
 * rather than given the newer asking's words.
 */
function requestLines(access: ScriptAccess, askedAt = access.askedAt): string[] {
  const own = askedAt === access.askedAt;
  return [
    '### Wayspot export tool: a request',
    `**${plainNoLinks(access.name)}** · ${access.userId}`,
    ...(own ? [`Community: ${plainNoLinks(access.community)}`] : []),
    `Asked ${timestamp(askedAt, 'f')}.`,
  ];
}

/**
 * The DM to the owner of a request for the Wayspot export tool (plan 8W-P): who asks (their
 * Discord name through `plainNoLinks` and their id as plain text: no mention), their community
 * line (through `plainNoLinks`), when, and Approve and Refuse
 * (`scriptaccess:<row id>:approve|refuse:<asked at>`: the asking's time in base 36, so that a
 * request asked again after a refusal is not decided by this DM). The owner's page lists the same
 * requests.
 */
export function accessRequestDm(access: ScriptAccess): V2Message {
  const id = String(access.id);
  const args = [access.askedAt.toString(36)];
  return textMessage(ASKED_ACCENT, requestLines(access), [
    actionRow([
      {
        type: ComponentType.Button,
        style: ButtonStyle.Success,
        label: 'Approve',
        custom_id: encodeCustomId({ kind: SCRIPT_ACCESS_KIND, id, action: 'approve', args }),
      },
      {
        type: ComponentType.Button,
        style: ButtonStyle.Secondary,
        label: 'Refuse',
        custom_id: encodeCustomId({ kind: SCRIPT_ACCESS_KIND, id, action: 'refuse', args }),
      },
    ]),
  ]);
}

/**
 * The DM once a press decided it: the request as it was, and what was decided and when, without
 * buttons. `before`: a press that came after a decision (on the page, or a second press) says
 * what it was decided as; a request asked again since the DM (waiting once more) is for its new
 * DM or the page. `askedAt`: the asking the DM was drawn for (its buttons'); when the row was
 * asked again since, the DM keeps its own asking's time, and the newer asking is named apart.
 */
export function accessDecidedDm(
  access: ScriptAccess,
  { before = false, askedAt = access.askedAt }: { before?: boolean; askedAt?: number } = {},
): V2Message {
  const state = STATE_WORDS[access.state];
  const when = access.decidedAt === null ? '' : ` ${timestamp(access.decidedAt, 'f')}`;
  const again = `Asked again since, ${timestamp(access.askedAt, 'f')}`;
  const line =
    access.state === 'asked'
      ? `${again}: decide it on its new DM or on the page.`
      : askedAt !== access.askedAt
        ? `${again}, and decided: **${state}**${when}.`
        : before
          ? `Decided already: **${state}**${when}.`
          : `**${capitalised(state)}**${when}.`;
  return textMessage(DECIDED_ACCENT, [...requestLines(access, askedAt), line]);
}
