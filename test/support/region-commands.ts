import {
  ComponentType,
  MessageFlags,
  PermissionFlagsBits,
  type APIModalInteractionResponseCallbackData,
} from 'discord.js';
import { admin } from '../../src/commands/admin/index.js';
import { bounds } from '../../src/commands/regions/bounds.js';
import { regionControls } from '../../src/commands/regions/controls.js';
import { region } from '../../src/commands/regions/index.js';
import { pendingRegions } from '../../src/commands/regions/shared.js';
import { InteractionRouter } from '../../src/discord/router.js';
import type { Party } from '../../src/domain/party/party.js';
import type { MapProvider } from '../../src/services/static-maps.js';
import { FakeAttachments } from './attachments.js';
import {
  fakeAutocomplete,
  fakeButton,
  fakeChatInput,
  fakeModal,
  type FakeInteraction,
  type FakeOptions,
  type SentPayload,
} from './fake-interactions.js';
import { OTHER_STAFF } from './gym-admin.js';
import { MEMBER, MODERATOR } from './gym-commands.js';
import { NORTH_CHANNEL, OTHER_GUILD_ID, OTHER_GUILD_ROW, WEST_CHANNEL } from './gyms.js';
import { regionAdminWith } from './region-admin.js';
import type { Rehearsal } from '../../src/services/rehearsal.js';
import { createTestContext } from './test-context.js';

export { MEMBER, MODERATOR };

/** A moderator of the second server, in the channel of its region North. */
export const OTHER_SERVER: FakeOptions = {
  userId: OTHER_STAFF,
  displayName: 'Noor',
  guildId: OTHER_GUILD_ID,
  channelId: NORTH_CHANNEL,
};

/** The text displays of a components-v2 payload, nested ones included, in order. */
function texts(payload: SentPayload): string[] {
  const found: string[] = [];
  const visit = (component: unknown): void => {
    const one = component as { type?: unknown; content?: unknown; components?: unknown[] };
    if (one.type === ComponentType.TextDisplay && typeof one.content === 'string') {
      found.push(one.content);
    }
    for (const inner of one.components ?? []) visit(inner);
  };
  for (const component of payload.components ?? []) visit(component);
  return found;
}

const isV2 = (payload: SentPayload): boolean =>
  ((payload.flags ?? 0) & MessageFlags.IsComponentsV2) !== 0;

/**
 * What an answer of `/region` says in sentences: of a components-v2 one its first text without
 * a heading (`### Import regions`), of a classic one (a refusal) its content.
 */
export function regionSaid(payload: SentPayload): string {
  if (!isV2(payload)) return payload.content ?? '';
  return (texts(payload)[0] ?? '').replace(/^### [^\n]*\n?/u, '');
}

/** Everything an answer of `/region` says: all its texts (or its content), joined by lines. */
export function regionTexts(payload: SentPayload): string {
  return isV2(payload) ? texts(payload).join('\n') : (payload.content ?? '');
}

/** The lines of the list of an answer under this heading (`**Would be imported**`). */
export function regionListed(payload: SentPayload, title: string): string[] {
  const list = texts(payload).find((text) => text.startsWith(`**${title}**\n`));
  if (list === undefined) throw new Error(`no list "${title}" in ${regionTexts(payload)}`);
  return list.split('\n').slice(1);
}

/** The text of a file that an answer attached, by its name. */
export function attachedText(payload: { files?: readonly unknown[] }, name: string): string {
  for (const file of payload.files ?? []) {
    const one = file as { name?: string; attachment?: unknown };
    if (one.name === name && Buffer.isBuffer(one.attachment)) {
      return one.attachment.toString('utf8');
    }
  }
  throw new Error(`no file "${name}" among ${JSON.stringify(payload.files)}`);
}

/**
 * `/region`, `/bounds` and `/admin` over the fakes of `regionAdminWith`, routed like in the
 * bot, used by a moderator in the channel of West unless a call says otherwise. `use` runs a
 * subcommand of `/region`, `typing` asks for the list of its `region` option, `press` presses
 * a button, `submit` sends a dialog the bot showed; each goes through the router and answers the
 * fake interaction to read back.
 * `file` puts a file where an attachment option finds it (`attachments`).
 */
export async function regionCommandsWith(
  parties: readonly Party[] = [],
  overrides: { maps?: MapProvider; rehearsal?: Rehearsal } = {},
) {
  const made = await regionAdminWith(parties);
  const attachments = new FakeAttachments();
  const { ctx, entries } = createTestContext({
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
    regionAdmin: made.regionAdmin,
    gymAdmin: made.admin,
    gyms: made.directory,
    regions: made.regions,
    parties: made.store,
    partyService: made.service,
    attendance: made.attendance,
    raids: made.raids,
    trains: made.trains,
    attachments,
    ...(overrides.maps ? { maps: overrides.maps } : {}),
    ...(overrides.rehearsal ? { rehearsal: overrides.rehearsal } : {}),
  });
  const router = new InteractionRouter(ctx, [region, bounds, admin], [regionControls]);
  const staff: FakeOptions = {
    userId: MODERATOR,
    roleNames: ['Moderator'],
    // Creating and deleting channels for a region takes what it takes by hand.
    permissions: PermissionFlagsBits.ManageChannels,
    displayName: 'Morgan',
    channelId: WEST_CHANNEL,
    guildId: made.gateway.guildId,
  };
  const handled = async (interaction: FakeInteraction): Promise<FakeInteraction> => {
    await router.handle(interaction as never);
    return interaction;
  };
  return {
    ...made,
    ctx,
    logged: entries,
    router,
    attachments,
    staff,
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
    ) => handled(fakeChatInput({ commandName: 'region', subcommand, options, ...staff, ...extra })),
    /** Runs a command that has no subcommands (`/bounds`). */
    run: (commandName: string, extra: FakeOptions = {}) =>
      handled(fakeChatInput({ commandName, ...staff, ...extra })),
    typing: (subcommand: string, focused: string, extra: FakeOptions = {}) =>
      handled(
        fakeAutocomplete({
          commandName: 'region',
          subcommand,
          focused,
          focusedName: 'region',
          ...staff,
          ...extra,
        }),
      ),
    // The questions of `/region` are components-v2 messages (plan 8B-4), unless a test says
    // the message is one from before (`v2Message: false`).
    press: (customId: string, extra: FakeOptions = {}) =>
      handled(fakeButton({ customId, ...staff, v2Message: true, ...extra })),
    /** Submits a dialog the bot showed (`/region remove`'s), with these choices picked. */
    submit: (
      dialog: APIModalInteractionResponseCallbackData,
      picked: Record<string, string> = {},
      extra: FakeOptions = {},
    ) =>
      handled(
        fakeModal({
          customId: dialog.custom_id,
          form: dialog,
          picked,
          ...staff,
          modalFromCommand: true,
          ...extra,
        }),
      ),
    /** Lets everything that is under way go out. */
    settle: async () => {
      await made.trains.flush();
      await made.attendance.flush();
      await made.access.flush();
      await made.service.flush();
    },
    /** How many questions of `/region` wait for their answer, over all tests. */
    pending: () => pendingRegions.size,
  };
}
