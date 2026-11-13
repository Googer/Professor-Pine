import { admin } from '../../src/commands/admin/index.js';
import { operator } from '../../src/commands/operator/index.js';
import type { AppContext } from '../../src/app-context.js';
import { subcommandPath } from '../../src/discord/command.js';
import { InteractionRouter } from '../../src/discord/router.js';
import type { NewBossOverride } from '../../src/domain/pogo/raid-bosses.js';
import {
  fakeAutocomplete,
  fakeChatInput,
  type FakeInteraction,
  type FakeOptions,
  type SentPayload,
} from './fake-interactions.js';
import { MEMBER, MODERATOR } from './gym-commands.js';
import { WEST_CHANNEL } from './gyms.js';
import { nicknameSearchWith } from './nicknames.js';
import { maxBossServiceWith } from './max-boss-service.js';
import { raidBossServiceWith } from './raid-bosses.js';
import { createTestContext } from './test-context.js';

export { MEMBER, MODERATOR };

type OptionValue = string | number | boolean;

/**
 * `/operator` and `/admin` (its nicknames) over a real `RaidBossService` (`raidBossServiceWith`) and a real Pokémon search with
 * stored nicknames (`nicknameSearchWith`), routed like in the bot, used by a moderator in the
 * channel of West unless a call says otherwise. `use(group, subcommand, options)` runs a
 * subcommand (`group` null for one outside a group); `typing` asks for the list of an option.
 * `Date` is not faked: tests that read dates fake it themselves; the service has its own clock
 * (`bosses.state.now`). Max battles are always on: a real `MaxBossService` (`maxBossServiceWith`,
 * its clock `max.state.now`); with `max` (plan 8X-2) it has read the recorded Pokebattler feed, its
 * override ids counted with the raid bosses' as in the one table.
 */
export async function bossCommandsWith(
  options: {
    overrides?: readonly NewBossOverride[];
    empty?: boolean;
    nicknames?: Record<string, string[]>;
    context?: Partial<AppContext>;
    max?: boolean;
  } = {},
) {
  const ids = { next: 1 };
  const bosses = await raidBossServiceWith({
    ...(options.overrides ? { overrides: options.overrides } : {}),
    ...(options.empty ? { empty: true } : {}),
    ids,
  });
  const max = await maxBossServiceWith({ ids });
  if (options.max) await max.service.sync();
  const search = await nicknameSearchWith(options.nicknames ?? {});
  const { ctx, entries } = createTestContext({
    raidBosses: bosses.service,
    raidBossAdmin: bosses.service,
    pokemon: search.search,
    nicknames: search.search,
    maxBosses: max.service,
    maxBossAdmin: max.service,
    ...options.context,
  });
  const router = new InteractionRouter(ctx, [admin, operator], []);
  // `/operator` where it has the subcommand (plan 19B-1), else `/admin` (the nicknames).
  const commandOf = (group: string | null, subcommand: string): string =>
    operator.subcommands.has(subcommandPath(group, subcommand)) ? 'operator' : 'admin';
  const staff: FakeOptions = {
    userId: MODERATOR,
    roleNames: ['Moderator'],
    displayName: 'Morgan',
    channelId: WEST_CHANNEL,
  };
  const handled = async (interaction: FakeInteraction): Promise<FakeInteraction> => {
    await router.handle(interaction as never);
    return interaction;
  };
  return {
    bosses,
    max,
    search,
    ctx,
    logged: entries,
    staff,
    use: (
      group: string | null,
      subcommand: string,
      values: Record<string, OptionValue> = {},
      extra: FakeOptions = {},
    ) =>
      handled(
        fakeChatInput({
          commandName: commandOf(group, subcommand),
          ...(group === null ? {} : { subcommandGroup: group }),
          subcommand,
          options: values,
          ...staff,
          ...extra,
        }),
      ),
    typing: (
      group: string | null,
      subcommand: string,
      focusedName: string,
      focused: string,
      values: Record<string, OptionValue> = {},
      extra: FakeOptions = {},
    ) =>
      handled(
        fakeAutocomplete({
          commandName: commandOf(group, subcommand),
          ...(group === null ? {} : { subcommandGroup: group }),
          subcommand,
          focusedName,
          focused,
          options: values,
          ...staff,
          ...extra,
        }),
      ),
  };
}

/** The choices an autocomplete interaction responded with. */
export function choicesOf(interaction: FakeInteraction): { name: string; value: string }[] {
  return (interaction.respond.mock.calls[0]?.[0] ?? []) as { name: string; value: string }[];
}

/** Every text a command answered with: the reply or its edit, then the follow-ups, in order. */
export function textsOf(interaction: FakeInteraction): string[] {
  const calls = [
    ...interaction.reply.mock.calls,
    ...interaction.editReply.mock.calls,
    ...interaction.followUp.mock.calls,
  ] as unknown as [SentPayload][];
  return calls.map(([payload]) => payload.content ?? '');
}
