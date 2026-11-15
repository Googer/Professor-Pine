import {
  ButtonStyle,
  ComponentType,
  type APIActionRowComponent,
  type APIComponentInMessageActionRow,
  type ButtonInteraction,
} from 'discord.js';
import type { AppContext } from '../../app-context.js';
import { encodeCustomId } from '../../discord/custom-id.js';
import { ListChanged } from '../../discord/errors.js';
import { partyOfServer } from '../../discord/guards.js';
import type { ScreenshotRaid } from '../../domain/ocr/screenshot-decision.js';
import type { StoredBoss } from '../../domain/ocr/screenshot-record.js';
import { isRaid } from '../../domain/party/party.js';
import { plain, truncate } from '../../render/text.js';
import { partyOver } from '../parties/reply.js';
import { changingMember } from '../raids/change.js';
import { changeRaidBoss } from '../raids/raid-changes.js';
import { bossChoiceValue } from '../raids/raid-input.js';

/**
 * The question which boss a raid made from a screenshot is, when its CP and name fit several
 * bosses of its tier (Black and White Kyurem; Matt, 2026-11-15): the raid is made first, without
 * its boss, and only then is the member who sent the screenshot asked, a button per boss and
 * Cancel. The answer sets the boss as Manage… of the post does (`changeRaidBoss`), only while the
 * raid is still hatched, of that tier and without a boss. The mention's question (kind `shot`)
 * and `/raid`'s (kind `raid`) share the words and the answer; each keeps its own question.
 */

type Row = APIActionRowComponent<APIComponentInMessageActionRow>;

/** What a question about a raid's boss keeps until it is answered. */
export interface BossQuestion {
  /** The raid made from the screenshot. */
  partyId: string;
  /** The bosses its CP fits, in the order of the buttons. */
  choices: StoredBoss[];
  /** The gym's name, as the question and the answer say it. */
  gymName: string;
  /** The kept screenshot, whose record keeps the boss chosen. */
  screenshotId: string | undefined;
}

/** The action of a boss's button, `<kind>:<token>:boss:<n>`. */
export const BOSS_ACTION = 'boss';

/** The question of a raid a screenshot made whose CP fits several bosses, if it was asked. */
export function bossQuestionOf(
  raid: Pick<ScreenshotRaid, 'bossChoices'>,
  party: { id: string },
  gymName: string,
  screenshotId: string | undefined,
): BossQuestion | undefined {
  if (raid.bossChoices.length < 2) return undefined;
  return {
    partyId: party.id,
    choices: raid.bossChoices.map((boss) => ({ key: boss.key, name: boss.name, tier: boss.tier })),
    gymName,
    screenshotId,
  };
}

/** How the question which boss it is starts, by which an answer that asked it is known. */
export const BOSS_QUESTION_START = 'Which boss is the raid at ';

/** "Which boss is the raid at <gym>?" */
export function bossQuestionText(question: Pick<BossQuestion, 'gymName'>): string {
  return `${BOSS_QUESTION_START}${question.gymName}?`;
}

/**
 * The question's buttons: one per boss (at most five, `MAX_BOSS_CHOICES`), its name the label,
 * `<kind>:<token>:boss:<n>`; Cancel (`cancel`, the action of the kind's Cancel) in a row of its
 * own.
 */
export function bossRows(
  kind: string,
  token: string,
  question: BossQuestion,
  cancel: string,
): Row[] {
  return [
    {
      type: ComponentType.ActionRow,
      components: question.choices.map((boss, n) => ({
        type: ComponentType.Button,
        custom_id: encodeCustomId({ kind, id: token, action: BOSS_ACTION, args: [String(n)] }),
        label: truncate(boss.name, 80),
        style: ButtonStyle.Primary,
      })),
    },
    {
      type: ComponentType.ActionRow,
      components: [
        {
          type: ComponentType.Button,
          custom_id: encodeCustomId({ kind, id: token, action: cancel }),
          label: 'Cancel',
          style: ButtonStyle.Secondary,
        },
      ],
    },
  ];
}

/** The boss a button names, by its place among the question's bosses; undefined for none. */
export function chosenBoss(
  question: BossQuestion,
  arg: string | undefined,
): StoredBoss | undefined {
  return arg !== undefined && /^\d$/.test(arg) ? question.choices[Number(arg)] : undefined;
}

/** Said when the boss chosen is no longer on the list of raid bosses. */
const NO_LONGER_LISTED =
  'That boss is no longer on the list of raid bosses, so I left the raid as it is.';

/**
 * Sets the boss chosen as Manage… sets one (`changeRaidBoss` with the boss's value of the pick
 * lists, `b:<key>:<tier>`, so a list rotated since answers that it is no longer on it), only while
 * the raid is still hatched, of that tier and without a boss (`open`); the record of the
 * screenshot keeps it. The party is read for the press's server (`partyOfServer`). Answers what
 * to say in the question's place.
 */
export async function setChosenBoss(
  interaction: ButtonInteraction,
  ctx: AppContext,
  question: BossQuestion,
  boss: StoredBoss,
): Promise<string> {
  const party = partyOfServer(interaction, ctx, question.partyId);
  if (!party || !isRaid(party)) return partyOver({ type: 'raid' });
  let answer;
  try {
    answer = await changeRaidBoss(
      ctx,
      party,
      changingMember(interaction),
      bossChoiceValue(boss),
      undefined,
      { tier: boss.tier },
    );
  } catch (err) {
    // Only the list rotated since: any other refusal is said in its own words.
    if (err instanceof ListChanged) return NO_LONGER_LISTED;
    throw err;
  }
  if (answer.kind !== 'ok') return answer.text;
  if (question.screenshotId !== undefined) {
    await ctx.screenshots.pickedBoss(question.screenshotId, boss.key);
  }
  return `Set the boss of the raid at ${question.gymName} to ${plain(boss.name)}.`;
}
