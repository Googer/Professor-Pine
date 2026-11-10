import {
  ButtonStyle,
  ComponentType,
  type APIButtonComponent,
  type APIComponentInContainer,
} from 'discord.js';
import { encodeCustomId } from '../discord/custom-id.js';
import type { V2Message } from '../discord/party-gateway.js';
import type { Place } from '../domain/geo/place.js';
import type {
  MeetupAppeal,
  MeetupBlock,
  MeetupRequestRecord,
  PlaceAskRecord,
  PlaceRulingRecord,
} from '../domain/meetups/records.js';
import type { ModerationReport } from '../domain/moderation/reports.js';
import { partyWord } from '../domain/party/party.js';
import { placeLine } from './meetup-safety.js';
import { postLink } from './notify-dm.js';
import { PLACE_KIND_WORDS } from './place.js';
import { rulingLine } from './place-asks.js';
import { memberText, plain, plainNoLinks, timestamp } from './text.js';
import { actionRow, container, LIST_COLOUR, section, textDisplay } from './v2.js';

/**
 * The custom-id kind of the controls of `/places` (plan 8S-2): `places:list:page:<n>` (the
 * list's arrows), `places:<member id>:lift:<page>` (Lift block), `places:<kind>:undo:<place id>`
 * (Undo ruling on a place's page). Nothing is kept: a press reads the server's lists anew.
 */
export const PLACES_KIND = 'places';

/** As many entries as a page of the list shows. */
export const PLACES_PAGE = 10;

/** What `/places` lists of a server, each oldest first. */
export interface PlacesView {
  serverId: string;
  rulings: PlaceRulingRecord[];
  pending: MeetupRequestRecord[];
  asks: PlaceAskRecord[];
  blocks: MeetupBlock[];
  appeals: MeetupAppeal[];
  reports: ModerationReport[];
  /** The name a ruled place is shown by (its kept snapshot, else the gym as it is now). */
  titleOf(ruling: PlaceRulingRecord): string;
}

/** One line of the list, in its section; a block has Lift block beside it. */
interface Entry {
  section: string;
  text: string;
  lift?: string;
}

/** ` · [post](<…>)`: the way to a moderators' post, where its buttons are. */
function postOf(serverId: string, channelId: string | null, messageId: string | null): string {
  return channelId === null || messageId === null
    ? ''
    : ` · [post](<${postLink(serverId, channelId, messageId)}>)`;
}

function by(id: string, name: string | null): string {
  return memberText({ id, name: name ?? undefined });
}

/** Every entry of the list, section by section, in the order the page shows them. */
function entriesOf(view: PlacesView): Entry[] {
  const { serverId } = view;
  const ruled = (ruling: PlaceRulingRecord): string =>
    `**${plainNoLinks(view.titleOf(ruling))}** (${PLACE_KIND_WORDS[ruling.key.kind]}) · by ` +
    `${by(ruling.ruledBy, ruling.ruledByName)} ${timestamp(ruling.ruledAt, 'R')}` +
    (ruling.source === null
      ? ''
      : postOf(serverId, ruling.source.channelId, ruling.source.messageId));
  return [
    ...view.rulings
      .filter((one) => one.ruling === 'refuse')
      .map((one) => ({ section: 'Refused places', text: ruled(one) })),
    ...view.rulings
      .filter((one) => one.ruling === 'allow')
      .map((one) => ({ section: 'Allowed places', text: ruled(one) })),
    ...view.pending.map((one) => ({
      section: 'Pending requests',
      text:
        `**${plain(one.name)}** by ${by(one.makerId, one.makerName)} ` +
        `${timestamp(one.createdAt, 'R')}${postOf(serverId, one.channelId, one.messageId)}`,
    })),
    ...view.asks.map((one) => ({
      section: 'Open asks about places',
      text:
        `**${plainNoLinks(one.place.title)}** asked by ${by(one.memberId, one.memberName)} ` +
        `${timestamp(one.createdAt, 'R')}${postOf(serverId, one.channelId, one.messageId)}`,
    })),
    ...view.blocks.map((one) => ({
      section: 'Blocked members',
      text:
        `${by(one.memberId, one.memberName)} blocked by ${by(one.blockedBy, one.blockedByName)} ` +
        timestamp(one.blockedAt, 'R'),
      lift: one.memberId,
    })),
    ...view.appeals.map((one) => ({
      section: 'Open appeals',
      text:
        `${by(one.memberId, one.memberName)} ${timestamp(one.createdAt, 'R')}` +
        postOf(serverId, one.channelId, one.messageId),
    })),
    ...view.reports.map((one) => {
      const { subject } = one;
      const what =
        subject.kind === 'party'
          ? `${partyWord({ type: subject.partyType })} **${plain(subject.title)}**`
          : `message by ${by(subject.authorId, subject.authorName)}`;
      const reasons =
        one.reasons.length === 1 ? '1 reason' : `${String(one.reasons.length)} reasons`;
      return {
        section: 'Open reports',
        text:
          `Reported ${what} · ${reasons} ${timestamp(one.createdAt, 'R')}` +
          postOf(serverId, one.channelId, one.messageId),
      };
    }),
  ];
}

const button = (
  label: string,
  customId: string,
  style: ButtonStyle.Secondary | ButtonStyle.Danger,
): APIButtonComponent => ({
  type: ComponentType.Button,
  style,
  label,
  custom_id: customId,
});

/**
 * The list of `/places` (plan 8S-2), for the staff member alone: how many of each there are,
 * then a page of `PLACES_PAGE` entries under their sections (refused places, allowed places,
 * pending requests, open asks, blocked members with Lift block, open appeals, open reports),
 * each with the way to its moderators' post, and the arrows. `page` is cut to the last there is.
 */
export function placesList(view: PlacesView, page: number): V2Message {
  const entries = entriesOf(view);
  const pages = Math.max(1, Math.ceil(entries.length / PLACES_PAGE));
  const shown = Math.min(Math.max(0, page), pages - 1);
  const counts = new Map<string, number>();
  for (const entry of entries) counts.set(entry.section, (counts.get(entry.section) ?? 0) + 1);
  const head =
    entries.length === 0
      ? '### Places and what waits for the moderators\nNo rulings, and nothing open.'
      : `### Places and what waits for the moderators\nPage ${String(shown + 1)} of ${String(pages)}`;
  const components: APIComponentInContainer[] = [textDisplay(head)];
  const onPage = entries.slice(shown * PLACES_PAGE, (shown + 1) * PLACES_PAGE);
  let current: string | undefined;
  let lines: string[] = [];
  const flush = () => {
    if (lines.length > 0) components.push(textDisplay(lines.join('\n')));
    lines = [];
  };
  for (const entry of onPage) {
    if (entry.section !== current) {
      flush();
      current = entry.section;
      lines.push(`**${entry.section}** (${String(counts.get(entry.section) ?? 0)})`);
    }
    if (entry.lift === undefined) {
      lines.push(entry.text);
    } else {
      flush();
      components.push(
        section(
          entry.text,
          button(
            'Lift block',
            encodeCustomId({
              kind: PLACES_KIND,
              id: entry.lift,
              action: 'lift',
              args: [String(shown)],
            }),
            ButtonStyle.Secondary,
          ),
        ),
      );
    }
  }
  flush();
  const arrows: APIButtonComponent[] = [];
  const to = (n: number) =>
    encodeCustomId({ kind: PLACES_KIND, id: 'list', action: 'page', args: [String(n)] });
  if (shown > 0) arrows.push(button('◀ Previous', to(shown - 1), ButtonStyle.Secondary));
  if (shown < pages - 1) arrows.push(button('Next ▶', to(shown + 1), ButtonStyle.Secondary));
  if (arrows.length > 0) components.push(actionRow(arrows));
  return { v2: true, components: [container(LIST_COLOUR, components)] };
}

/**
 * The page of one place (`/places place:`, plan 8S-2): where it is (its official name too), its
 * ruling (who, when, from which post) with Undo ruling, or that it has none; `said` a line of what
 * was just done (an undone ruling).
 */
export function placePage(
  place: Place,
  ruling: PlaceRulingRecord | undefined,
  serverId: string,
  more: { officialName?: string | null; said?: string } = {},
): V2Message {
  const title = place.kind === 'pin' ? 'A pin' : plainNoLinks(place.title);
  const texts = [
    `### ${title}\n${placeLine(place, { officialName: more.officialName })}`,
    place.kind === 'pin'
      ? 'A pin has no ruling: each meetup at one waits for a moderator.'
      : ruling === undefined
        ? 'No ruling: a meetup there is checked by its name.'
        : `**Ruling**\n${rulingLine(ruling, serverId)}`,
    ...(more.said === undefined ? [] : [more.said]),
  ];
  const components: APIComponentInContainer[] = texts.map((text) => textDisplay(text));
  if (ruling !== undefined && place.kind !== 'pin') {
    components.push(
      actionRow([
        button(
          'Undo ruling',
          encodeCustomId({ kind: PLACES_KIND, id: place.kind, action: 'undo', args: [place.id] }),
          ButtonStyle.Danger,
        ),
      ]),
    );
  }
  return { v2: true, components: [container(LIST_COLOUR, components)] };
}
