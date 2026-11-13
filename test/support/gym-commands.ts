import { ComponentType, MessageFlags } from 'discord.js';
import { gymControls } from '../../src/commands/gyms/controls.js';
import { gymViewControls } from '../../src/commands/gyms/view-controls.js';
import { gymReviewControls } from '../../src/components/gym-review.js';
import { gym } from '../../src/commands/gyms/index.js';
import { pendingGyms } from '../../src/commands/gyms/shared.js';
import { admin } from '../../src/commands/admin/index.js';
import { operator } from '../../src/commands/operator/index.js';
import { InteractionRouter } from '../../src/discord/router.js';
import type { Party } from '../../src/domain/party/party.js';
import {
  fakeAutocomplete,
  fakeButton,
  fakeChatInput,
  fakeModal,
  sent,
  type FakeInteraction,
  type FakeOptions,
  type SentPayload,
} from './fake-interactions.js';
import { FakeAttachments } from './attachments.js';
import { OTHER_STAFF } from './gym-admin.js';
import { NORTH_CHANNEL, OTHER_GUILD_ID, OTHER_GUILD_ROW, WEST_CHANNEL } from './gyms.js';
import { MapBudget } from '../../src/services/map-budget.js';
import { createTestContext } from './test-context.js';
import { createTestLogger } from './test-logger.js';
import { wayfarerImportWith } from './wayfarer-import.js';

/** A moderator of the fakes' server, and a member who is none. */
export const MODERATOR = '200000000000000009';
export const MEMBER = '200000000000000008';

/**
 * A moderator of the second server, in the channel of its region North: pass it as `extra` to
 * `use`, `typing`, `press` and `submit` (after `withOtherServer`, which gives that server its
 * region and a gym).
 */
export const OTHER_SERVER: FakeOptions = {
  userId: OTHER_STAFF,
  displayName: 'Noor',
  guildId: OTHER_GUILD_ID,
  channelId: NORTH_CHANNEL,
};

/** A component as the API has it: a builder's JSON, or the plain object. */
function asJson(component: unknown): Record<string, unknown> {
  const json = (component as { toJSON?: () => unknown }).toJSON;
  return (typeof json === 'function' ? json.call(component) : component) as Record<string, unknown>;
}

/** Every component of a payload, nested ones (a section's accessory too), depth first. */
function componentsOf(components: readonly unknown[]): Record<string, unknown>[] {
  return components.flatMap((component) => {
    const json = asJson(component);
    const inner = Array.isArray(json.components) ? (json.components as unknown[]) : [];
    const accessory = json.accessory === undefined ? [] : [json.accessory];
    return [json, ...componentsOf([...inner, ...accessory])];
  });
}

/**
 * The buttons of a message (classic rows, or anywhere in a components-v2 message), as
 * `[label, custom id]`, in order; a link button has an empty custom id.
 */
export function buttonsOf(payload: SentPayload): [string, string][] {
  return componentsOf(payload.components ?? [])
    .filter((one) => one.type === ComponentType.Button)
    .map((one): [string, string] => [
      typeof one.label === 'string' ? one.label : '',
      typeof one.custom_id === 'string' ? one.custom_id : '',
    ]);
}

/**
 * What a message says: the text displays of a components-v2 one joined by line breaks (of one
 * that shows a gym, those above the view: what a change did), the content of a classic one ('' for
 * none). The view itself is read with `gymViewOf`.
 */
export function said(payload: SentPayload | undefined): string {
  if (!payload) return '';
  if (((payload.flags ?? 0) & MessageFlags.IsComponentsV2) === 0) return payload.content ?? '';
  const texts = componentsOf(payload.components ?? [])
    .filter((one) => one.type === ComponentType.TextDisplay)
    .map((one) => String(one.content));
  const view = texts.findIndex((text) => text.startsWith('### ['));
  return (view < 0 ? texts : texts.slice(0, view)).join('\n');
}

/** The small print of a view of a gym: `Gym #1 · 40.05, -80.05` (undefined without one). */
export function gymOf(payload: SentPayload): string | undefined {
  const line = componentsOf(payload.components ?? [])
    .filter((one) => one.type === ComponentType.TextDisplay)
    .flatMap((one) => String(one.content).split('\n'))
    .find((text) => text.startsWith('-# Gym #'));
  return line?.slice('-# '.length);
}

/** A view of a gym (`renderGymView`, `renderMemberGymView`) as a test reads it. */
export interface ShownGymView {
  /** The text of the heading's link: `Name (Nickname)`. */
  title: string | undefined;
  /** The lines under the heading: the address (staff), "Elite raid gym" (members), the regions. */
  lines: string[];
  /** The facts by name: `Keywords`, `Gym targets`, `Notice`, `Nearby places (from Google)`… */
  facts: Record<string, string>;
  /** The small print: `Gym #1 · 40.05, -80.05`. */
  smallPrint: string | undefined;
  /** The addresses of the map's gallery. */
  pictures: string[];
}

/** Reads a view of a gym from what was sent; fails the test when it holds none. */
export function gymViewOf(payload: SentPayload): ShownGymView {
  const all = componentsOf(payload.components ?? []);
  const texts = all
    .filter((one) => one.type === ComponentType.TextDisplay)
    .map((one) => String(one.content));
  const at = texts.findIndex((text) => text.startsWith('### ['));
  if (at < 0) throw new Error(`no view of a gym in ${JSON.stringify(texts)}`);
  const [heading = '', ...lines] = texts[at]?.split('\n') ?? [];
  const facts: Record<string, string> = {};
  let open: string | undefined;
  for (const line of texts.slice(at + 1).flatMap((text) => text.split('\n'))) {
    const fact = /^\*\*(.+?):\*\* (.*)$/.exec(line);
    const places = /^-# (Nearby places \(from Google\)): (.*)$/.exec(line);
    if (fact?.[1] !== undefined) {
      facts[fact[1]] = fact[2] ?? '';
      open = undefined;
    } else if (places?.[1] !== undefined) {
      facts[places[1]] = places[2] ?? '';
      open = undefined;
    } else if (/^\*\*(.+)\*\*$/.test(line)) {
      open = line.slice(2, -2);
      facts[open] = '';
    } else if (open !== undefined && !line.startsWith('-# ')) {
      facts[open] = facts[open] === '' ? line : `${facts[open] ?? ''}\n${line}`;
    }
  }
  return {
    title: /^### \[(.*)\]\(<[^>]*>\)$/.exec(heading)?.[1],
    lines,
    facts,
    smallPrint: gymOf(payload),
    pictures: all.flatMap((one) =>
      one.type === ComponentType.MediaGallery
        ? ((one.items ?? []) as { media: { url: string } }[]).map((item) => item.media.url)
        : [],
    ),
  };
}

/** The custom id of the button with this label under a message. */
export function buttonId(payload: SentPayload, label: string): string {
  const found = buttonsOf(payload).find(([text]) => text === label);
  if (!found) throw new Error(`no button "${label}" among ${JSON.stringify(buttonsOf(payload))}`);
  return found[1];
}

/** What a fake was last answered with: the newest edit of the reply, else the reply or update. */
export function answerOf(interaction: FakeInteraction): SentPayload {
  for (const mock of [
    interaction.editReply,
    interaction.update,
    interaction.followUp,
    interaction.reply,
  ]) {
    const calls = mock.mock.calls.length;
    if (calls > 0) return sent(mock, calls - 1);
  }
  throw new Error('the interaction was not answered');
}

/**
 * `/gym`, `/admin` and `/operator` over the fakes of `gymAdminWith` and the Wayfarer import of
 * `wayfarerImportWith`, routed like in the bot, used by a moderator in the channel of West
 * unless a call says otherwise. `use` runs a subcommand, `typing` asks for the list of its `gym`
 * option, `press` presses a button and `submit` sends a form (the form the bot showed under that
 * custom id, as Discord submits it), each through the router and each answering the fake
 * interaction to read back. `file` puts a file where an attachment option finds it
 * (`attachments`).
 */
export async function gymCommandsWith(parties: readonly Party[] = []) {
  const made = await wayfarerImportWith(parties);
  const attachments = new FakeAttachments();
  const { ctx, entries } = createTestContext({
    // The month's maps of places, over the counts `/gym google` reads (`made.googleUse`).
    mapBudget: new MapBudget({
      use: made.googleUse,
      perMonth: 500,
      log: createTestLogger().log,
    }),
    // The two servers of the fakes: the usual one (row 1) and the second (row 2).
    guilds: {
      idFor: (snowflake) =>
        Promise.resolve(
          snowflake === made.gateway.guildId
            ? 1
            : snowflake === OTHER_GUILD_ID
              ? OTHER_GUILD_ROW
              : undefined,
        ),
    },
    gymAdmin: made.admin,
    gyms: made.directory,
    regions: made.regions,
    parties: made.store,
    partyService: made.service,
    attendance: made.attendance,
    raids: made.raids,
    trains: made.trains,
    gymTargets: made.gymTargets,
    wayfarer: made.wayfarer,
    wayfarerReview: made.wayfarerReview,
    wayspots: made.wayspots,
    pineStops: made.pineStops,
    attachments,
  });
  const router = new InteractionRouter(
    ctx,
    [gym, admin, operator],
    [gymControls, gymViewControls, gymReviewControls],
  );
  const staff: FakeOptions = {
    userId: MODERATOR,
    roleNames: ['Moderator'],
    displayName: 'Morgan',
    channelId: WEST_CHANNEL,
    guildId: made.gateway.guildId,
  };
  /** The forms the bot showed, by their custom ids: a submit sends the form it was shown. */
  const forms = new Map<string, unknown>();
  const handled = async (interaction: FakeInteraction): Promise<FakeInteraction> => {
    await router.handle(interaction as never);
    for (const [form] of interaction.showModal.mock.calls) {
      const id = (form as { custom_id?: unknown } | undefined)?.custom_id;
      if (typeof id === 'string') forms.set(id, form);
    }
    return interaction;
  };
  return {
    ...made,
    ctx,
    logged: entries,
    router,
    attachments,
    /** An attachment as an option resolves it: a file of this name with this content. */
    file: (name: string, fileContent: Uint8Array | string, size?: number) => {
      const url = attachments.add(name, fileContent);
      const length =
        typeof fileContent === 'string' ? Buffer.byteLength(fileContent) : fileContent.byteLength;
      return { name, url, size: size ?? length };
    },
    use: (
      subcommand: string,
      options: Record<string, string | boolean> = {},
      extra: FakeOptions = {},
    ) => handled(fakeChatInput({ commandName: 'gym', subcommand, options, ...staff, ...extra })),
    typing: (subcommand: string, focused: string, extra: FakeOptions = {}) =>
      handled(
        fakeAutocomplete({
          commandName: 'gym',
          subcommand,
          focused,
          focusedName: 'gym',
          ...staff,
          ...extra,
        }),
      ),
    // The questions of `/gym` are components-v2 messages (plan 8B-4): a press is on one, unless
    // the test says the message is classic (`v2Message: false`, one from before the plan).
    press: (customId: string, extra: FakeOptions = {}) =>
      handled(fakeButton({ customId, ...staff, v2Message: true, ...extra })),
    submit: (customId: string, fields: Record<string, string>, extra: FakeOptions = {}) =>
      handled(
        fakeModal({
          customId,
          fields,
          form: forms.get(customId),
          ...staff,
          v2Message: true,
          ...extra,
        }),
      ),
    /** Lets everything that is under way go out. */
    settle: async () => {
      await made.upkeep.flush();
      await made.admin.flush();
      await made.trains.flush();
      await made.attendance.flush();
      await made.service.flush();
    },
    /** How many questions and forms of `/gym` wait for their answer, over all tests. */
    pending: () => pendingGyms.size,
  };
}
