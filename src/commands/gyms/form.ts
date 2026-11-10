import {
  ComponentType,
  TextInputStyle,
  type APIModalInteractionResponseCallbackData,
  type APITextInputComponent,
  type ModalSubmitInteraction,
} from 'discord.js';
import { encodeCustomId } from '../../discord/custom-id.js';
import {
  GYM_TEXT_FIELDS,
  GYM_TEXT_LIMITS,
  KEYWORDS_LINE,
  keywordsLine,
  tidyGymTexts,
  type GymTextField,
  type GymTexts,
} from '../../domain/gyms/gym-text.js';
import { truncate } from '../../render/text.js';
import { GYM_KIND, type TypedTexts } from './shared.js';

type Input = Omit<APITextInputComponent, 'type' | 'custom_id' | 'value'>;

/** The inputs of the form, by the field each is for; the custom id of an input is its field. */
const INPUTS: Readonly<Record<GymTextField, Input>> = {
  name: {
    label: 'Name, as in the game',
    style: TextInputStyle.Short,
    required: true,
    max_length: GYM_TEXT_LIMITS.name,
  },
  nickname: {
    label: 'Nickname',
    style: TextInputStyle.Short,
    required: false,
    max_length: GYM_TEXT_LIMITS.nickname,
    placeholder: 'What members call it. Leave it empty for none.',
  },
  description: {
    label: 'Description',
    style: TextInputStyle.Paragraph,
    required: false,
    max_length: GYM_TEXT_LIMITS.description,
    placeholder: 'What helps to find it. Leave it empty for none.',
  },
  notice: {
    label: 'Notice, shown in every raid post here',
    style: TextInputStyle.Paragraph,
    required: false,
    max_length: GYM_TEXT_LIMITS.notice,
    placeholder: 'Warnings, parking, opening hours. Leave it empty for none.',
  },
  keywords: {
    label: 'Keywords, separated by commas',
    style: TextInputStyle.Short,
    required: false,
    max_length: KEYWORDS_LINE,
    placeholder: 'Other words members search by. Leave it empty for none.',
  },
};

function valueOf(field: GymTextField, texts: Partial<GymTexts>): string {
  if (field === 'keywords') return keywordsLine(texts.keywords ?? []);
  return texts[field] ?? '';
}

/**
 * A text cut to what an input takes, never in the middle of a character (a cut through a
 * surrogate pair leaves half an emoji, which Discord refuses).
 */
function cut(text: string, limit: number): string {
  if (text.length <= limit) return text;
  let kept = '';
  for (const character of text) {
    if (kept.length + character.length > limit) break;
    kept += character;
  }
  return kept;
}

/**
 * A form for texts of a gym: one input per field of `fields`, in the order of the form, each
 * filled with what `texts` has for it, or with what was typed into it before (`typed`: a form
 * that is opened again after a refusal shows exactly what was sent, not a tidied version of
 * it). The custom id is `gym:<token>:<action>`. A form holds five inputs, which is exactly the
 * fields a gym has.
 */
export function gymForm(options: {
  token: string;
  action: string;
  title: string;
  fields: readonly GymTextField[];
  texts: Partial<GymTexts>;
  typed?: TypedTexts | undefined;
}): APIModalInteractionResponseCallbackData {
  const { token, action, fields, texts, typed } = options;
  return {
    custom_id: encodeCustomId({ kind: GYM_KIND, id: token, action }),
    title: truncate(options.title, 45),
    components: GYM_TEXT_FIELDS.filter((field) => fields.includes(field)).map((field) => {
      // Never longer than the input takes (Discord refuses the whole form otherwise): what
      // was typed into the input fits it, and what a caller fills in is within it; this is
      // the guard.
      const value = cut(typed?.[field] ?? valueOf(field, texts), INPUTS[field].max_length ?? 4_000);
      return {
        type: ComponentType.ActionRow,
        components: [
          {
            type: ComponentType.TextInput,
            custom_id: field,
            ...INPUTS[field],
            ...(value === '' ? {} : { value }),
          },
        ],
      };
    }),
  };
}

/**
 * What a staff member sent with a form that has these fields: as it was typed (`typed`, for
 * the form when it is opened again) and tidied (`texts`, `tidyGymTexts`: what is checked and
 * stored).
 */
export function sentForm(
  interaction: ModalSubmitInteraction,
  fields: readonly GymTextField[],
): { typed: TypedTexts; texts: Partial<GymTexts> } {
  const typed: TypedTexts = {};
  for (const field of fields) typed[field] = interaction.fields.getTextInputValue(field);
  return { typed, texts: tidyGymTexts(typed) };
}
