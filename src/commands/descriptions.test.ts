import { describe, expect, it } from 'vitest';
import { buildCommandPayload } from '../discord/deploy.js';
import { commands, messageCommands } from './index.js';

/** A command, subcommand or option as Discord is sent it: its description, its options. */
interface Described {
  name: string;
  description?: string;
  options?: Described[];
  choices?: { name: string }[];
}

/** Every description and choice a member reads in Discord's command picker, by where it stands. */
function wordsOf(node: Described, path: string): [string, string][] {
  const here = `${path} ${node.name}`.trim();
  return [
    ...(node.description ? [[here, node.description] as [string, string]] : []),
    ...(node.choices ?? []).map((choice): [string, string] => [`${here} (choice)`, choice.name]),
    ...(node.options ?? []).flatMap((option) => wordsOf(option, here)),
  ];
}

describe('the descriptions Discord shows of the commands', () => {
  it('speak of raids, max battles, trains and meetups, never of "parties"', () => {
    const payload = buildCommandPayload(commands, messageCommands) as Described[];
    const said = payload.flatMap((command) =>
      wordsOf({ ...command, name: `/${command.name}` }, ''),
    );
    expect(said.length).toBeGreaterThan(100);
    expect(said.filter(([, text]) => /\bpart(y|ies)\b/i.test(text))).toEqual([]);
  });
});
