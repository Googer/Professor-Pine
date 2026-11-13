import { ApplicationCommandOptionType } from 'discord.js';
import { describe, expect, it } from 'vitest';
import { MAX_OPTION_TEXT } from '../discord/command.js';
import { buildCommandPayload } from '../discord/deploy.js';
import { commands, messageCommands } from './index.js';

/** A command, subcommand, group or option as Discord is sent it. */
interface Declared {
  name: string;
  type?: number;
  options?: Declared[];
  autocomplete?: boolean;
  choices?: unknown[];
  max_length?: number;
}

const NESTING = new Set<number | undefined>([
  ApplicationCommandOptionType.Subcommand,
  ApplicationCommandOptionType.SubcommandGroup,
]);

/** The options of every command and subcommand, by the path a member types (`/operator boss add`). */
function optionLists(node: Declared, path: string): [string, Declared[]][] {
  const options = node.options ?? [];
  const parts = options.filter((option) => NESTING.has(option.type));
  if (parts.length === 0) return [[path, options]];
  return parts.flatMap((part) => optionLists(part, `${path} ${part.name}`));
}

/** Every option list of the commands as they are deployed. */
function deployedLists(): [string, Declared[]][] {
  const payload = buildCommandPayload(commands, messageCommands) as Declared[];
  return payload.flatMap((command) => optionLists(command, `/${command.name}`));
}

/** Whether an option is a text option with a fixed list of choices. */
const hasChoices = (option: Declared): boolean =>
  option.type === ApplicationCommandOptionType.String && (option.choices?.length ?? 0) > 0;

describe('the lengths of the commands’ text options', () => {
  // The router answers autocomplete with no choices once any text option holds more than
  // `MAX_OPTION_TEXT` (the audit of 2026-11-10, M5): an option that declared more, or none
  // (Discord's own limit is then 6,000), would lose its list for texts Discord's own client lets
  // a member type. Fix round F-A7: an undeclared maximum counts as too long. An option with fixed
  // choices takes no free text (Discord holds its value to the list) and needs none (fix round
  // F-A8).
  it('are declared no longer than the router lets autocomplete read, in every command that offers choices', () => {
    const offering = deployedLists().filter(([, options]) =>
      options.some((option) => option.autocomplete),
    );
    // Most of the commands that take a boss, a gym or a place.
    expect(offering.length).toBeGreaterThan(20);
    const tooLong = offering.flatMap(([path, options]) =>
      options
        .filter(
          (option) =>
            option.type === ApplicationCommandOptionType.String &&
            !hasChoices(option) &&
            (option.max_length === undefined || option.max_length > MAX_OPTION_TEXT),
        )
        .map((option) => `${path} ${option.name}: ${String(option.max_length)}`),
    );
    expect(tooLong).toEqual([]);
  });

  // Whether Discord takes `max_length` beside `choices` is not known (fix round F-A8): a command
  // it refused would fail the whole deploy.
  it('declare no maximum where they have fixed choices', () => {
    const both = deployedLists().flatMap(([path, options]) =>
      options
        .filter((option) => hasChoices(option) && option.max_length !== undefined)
        .map((option) => `${path} ${option.name}`),
    );
    expect(both).toEqual([]);
  });
});
