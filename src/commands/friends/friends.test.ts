import { InteractionContextType, MessageFlags } from 'discord.js';
import { describe, expect, it } from 'vitest';
import { FAKE_GUILD_ID, fakeChatInput, sent } from '../../../test/support/fake-interactions.js';
import { FakeMemberDirectory } from '../../../test/support/members.js';
import { ALICE, BOB, CAROL } from '../../../test/support/parties.js';
import { createTestContext } from '../../../test/support/test-context.js';
import { MemoryUsers } from '../../../test/support/users.js';
import { declaredSubcommands } from '../../discord/command.js';
import { InteractionRouter } from '../../discord/router.js';
import { friendCode, friendCodeOf, inGameNameOf, nickname } from './friends.js';

const OTHER_GUILD = '499999999999999999';
const DAVE = '200000000000000099';

function setup() {
  const users = new MemoryUsers();
  const members = new FakeMemberDirectory().add(BOB, 'Bob').add(CAROL, 'Carol');
  const { ctx, entries } = createTestContext({ users, members });
  const router = new InteractionRouter(ctx, [friendCode, nickname], []);
  const run = async (
    commandName: string,
    subcommand: string,
    options: Record<string, string> = {},
    extra: object = {},
  ) => {
    const interaction = fakeChatInput({
      commandName,
      subcommand,
      userId: ALICE,
      displayName: 'Alice',
      options,
      ...extra,
    });
    await router.handle(interaction as never);
    return interaction;
  };
  /** What the member was answered: the deferred answer, or a refusal. */
  const answer = async (
    commandName: string,
    subcommand: string,
    options: Record<string, string> = {},
    extra: object = {},
  ) => {
    const used = await run(commandName, subcommand, options, extra);
    for (const mock of [used.editReply, used.followUp, used.reply]) {
      if (mock.mock.calls.length > 0) return sent(mock).content;
    }
    throw new Error('nothing was answered');
  };
  /** `/friend-code show member:<somebody>`. */
  const show = (user: { id: string; bot?: boolean }, extra: object = {}) =>
    answer('friend-code', 'show', {}, { resolved: { member: { bot: false, ...user } }, ...extra });
  return { ctx, entries, users, members, run, answer, show };
}

describe('friendCodeOf', () => {
  it('keeps the twelve digits of what was typed, in groups of four', () => {
    expect(friendCodeOf('123456789012')).toBe('1234 5678 9012');
    expect(friendCodeOf(' 1234-5678-9012 ')).toBe('1234 5678 9012');
    expect(friendCodeOf('code: 1234 5678 9012!')).toBe('1234 5678 9012');
  });

  it('is undefined for more or fewer digits', () => {
    for (const text of ['', '1234 5678 901', '1234 5678 9012 3', 'my code']) {
      expect(friendCodeOf(text)).toBeUndefined();
    }
  });
});

describe('inGameNameOf', () => {
  it('takes letters and digits, 3 to 32 of them, as typed', () => {
    expect(inGameNameOf('  PineTrainer42 ')).toBe('PineTrainer42');
    expect(inGameNameOf('abc')).toBe('abc');
    expect(inGameNameOf('Flabébé7')).toBe('Flabébé7');
    expect(inGameNameOf('a'.repeat(32))).toBe('a'.repeat(32));
  });

  it.each(['', 'ab', 'a'.repeat(33), 'Pine Trainer', 'pine_trainer', 'pine-42', '<@123>', '**x**'])(
    'refuses %j',
    (text) => {
      expect(inGameNameOf(text)).toBeUndefined();
    },
  );
});

describe('/friend-code and /nickname', () => {
  it('are offered in servers and in a DM with the bot, filed under friends, with help', () => {
    for (const command of [friendCode, nickname]) {
      const json = command.data.toJSON();
      expect(json.contexts).toEqual([InteractionContextType.Guild, InteractionContextType.BotDM]);
      expect(command.help.category).toBe('friends');
      expect(command.enabled).toBeUndefined();
      for (const handler of command.subcommands.values()) {
        expect(handler.help?.details).toBeTruthy();
        expect(handler.help?.examples?.length).toBeGreaterThan(0);
      }
    }
    expect(declaredSubcommands(friendCode.data.toJSON().options)).toEqual([
      'register',
      'show',
      'remove',
    ]);
    expect(declaredSubcommands(nickname.data.toJSON().options)).toEqual([
      'register',
      'find',
      'remove',
    ]);
    // The match of an in-game name is explained where members read about it.
    expect(nickname.subcommands.get('find')?.help?.details).toMatch(/capital letters and accents/);
  });

  it('answer the member alone', async () => {
    const made = setup();
    const used = await made.run('friend-code', 'register', { code: '123456789012' });
    expect(sent(used.reply).flags).toBe(MessageFlags.Ephemeral);
    expect(used.deferReply).not.toHaveBeenCalled();
  });
});

describe('/friend-code register and remove', () => {
  it('stores the code as the legacy bot did, and shows it', async () => {
    const made = setup();
    expect(await made.answer('friend-code', 'register', { code: '1234-5678-9012' })).toBe(
      'Your friend code is registered:\n`1234 5678 9012`\n' +
        'Anybody in a server you share with me can ask for it with `/friend-code show`; ' +
        '`/friend-code remove` takes it back.',
    );
    expect((await made.users.get(ALICE)).friendCode).toBe('1234 5678 9012');
    // A new one takes its place.
    await made.run('friend-code', 'register', { code: '999988887777' });
    expect((await made.users.get(ALICE)).friendCode).toBe('9999 8888 7777');
  });

  it('refuses what has not twelve digits, and stores nothing', async () => {
    const made = setup();
    expect(await made.answer('friend-code', 'register', { code: '1234 5678' })).toBe(
      'A friend code has 12 digits; what you typed has 8.',
    );
    expect(await made.answer('friend-code', 'register', { code: 'none' })).toBe(
      'A friend code has 12 digits; what you typed has 0.',
    );
    expect((await made.users.get(ALICE)).friendCode).toBeNull();
  });

  it('removes the code, and says when there was none', async () => {
    const made = setup();
    expect(await made.answer('friend-code', 'remove')).toBe('You have no friend code registered.');
    await made.run('friend-code', 'register', { code: '123456789012' });
    expect(await made.answer('friend-code', 'remove')).toBe('Your friend code is removed.');
    expect((await made.users.get(ALICE)).friendCode).toBeNull();
  });

  it('takes a stored empty or blank text for no code, as showing it does', async () => {
    const made = setup();
    for (const blank of ['', '   ']) {
      await made.users.update(ALICE, { friendCode: blank });
      expect(await made.answer('friend-code', 'remove')).toBe(
        'You have no friend code registered.',
      );
    }
  });

  it('works in a DM with the bot', async () => {
    const made = setup();
    await made.run('friend-code', 'register', { code: '123456789012' }, { isDm: true });
    expect((await made.users.get(ALICE)).friendCode).toBe('1234 5678 9012');
    expect(await made.answer('friend-code', 'show', {}, { isDm: true })).toBe(
      'Your friend code:\n`1234 5678 9012`',
    );
  });
});

describe('/friend-code show', () => {
  it('shows the member their own code, or how to register one', async () => {
    const made = setup();
    expect(await made.answer('friend-code', 'show')).toBe(
      'You have not registered a friend code. `/friend-code register` does that.',
    );
    await made.users.update(ALICE, { friendCode: '1234 5678 9012' });
    expect(await made.answer('friend-code', 'show')).toBe('Your friend code:\n`1234 5678 9012`');
    // Naming themself is the same, and asks Discord nothing.
    expect(await made.show({ id: ALICE })).toBe('Your friend code:\n`1234 5678 9012`');
    expect(made.members.asked).toEqual([]);
  });

  it('shows the code of a member of this server, named with the mention', async () => {
    const made = setup();
    await made.users.update(BOB, { friendCode: '1111 2222 3333' });
    expect(await made.show({ id: BOB })).toBe(
      `The friend code of **Bob** (<@${BOB}>):\n\`1111 2222 3333\``,
    );
    expect(await made.show({ id: CAROL })).toBe(
      `**Carol** (<@${CAROL}>) has not registered a friend code.`,
    );
    expect(made.members.asked).toEqual([`${FAKE_GUILD_ID}:${BOB}`, `${FAKE_GUILD_ID}:${CAROL}`]);
  });

  it('answers with a sentence for a bot and for somebody who is not in this server', async () => {
    const made = setup();
    await made.users.update(DAVE, { friendCode: '1111 2222 3333' });
    expect(await made.show({ id: '200000000000000050', bot: true })).toBe(
      'That is a bot: it has no friend code.',
    );
    // Dave registered a code but is no member here: it is not handed out.
    expect(await made.show({ id: DAVE })).toBe('They are not in this server.');
    // Bob is a member of the fakes' server, not of this other one.
    await made.users.update(BOB, { friendCode: '4444 5555 6666' });
    expect(await made.show({ id: BOB }, { guildId: OTHER_GUILD })).toBe(
      'They are not in this server.',
    );
    expect(await made.show({ id: BOB }, { isDm: true })).toBe(
      'Somebody else’s friend code can only be asked for in a server.',
    );
  });

  it('takes the member Discord sent with the option, and asks nothing more', async () => {
    const made = setup();
    await made.users.update(DAVE, { friendCode: '1111 2222 3333' });
    // Dave is not in the directory, but Discord says he is a member here and what he is called.
    const sentWith = {
      resolved: { member: { id: DAVE, bot: false } },
      resolvedMembers: { member: { displayName: 'Dave' } },
    };
    expect(await made.answer('friend-code', 'show', {}, sentWith)).toBe(
      `The friend code of **Dave** (<@${DAVE}>):\n\`1111 2222 3333\``,
    );
    // Without a member in the option the user is not in this server: nothing is asked either.
    await made.users.update(BOB, { friendCode: '4444 5555 6666' });
    const stranger = {
      resolved: { member: { id: BOB, bot: false } },
      resolvedMembers: { member: null },
    };
    expect(await made.answer('friend-code', 'show', {}, stranger)).toBe(
      'They are not in this server.',
    );
    expect(made.members.asked).toEqual([]);
  });

  it('answers that they are not here when Discord cannot be asked, and logs why', async () => {
    const made = setup();
    await made.users.update(BOB, { friendCode: '1111 2222 3333' });
    made.members.failing = new Error('Invalid Form Body');
    expect(await made.show({ id: BOB })).toBe('They are not in this server.');
    expect(made.entries).toContainEqual(
      expect.objectContaining({ level: 40, msg: 'could not look a member up', user: BOB }),
    );
  });

  it('cuts a long legacy value', async () => {
    const made = setup();
    await made.users.update(BOB, { friendCode: '*_~|>'.repeat(51) });
    const shown = (await made.show({ id: BOB })) ?? '';
    expect(shown.length).toBeLessThan(250);
    expect(shown.endsWith('…')).toBe(true);
  });

  it('allows ten look-ups a minute', async () => {
    const made = setup();
    for (let use = 0; use < 10; use++) await made.show({ id: BOB });
    expect(await made.show({ id: BOB })).toMatch(/^You can use \/friend-code show again in /);
  });

  it('shows a legacy value that is no friend code as plain text', async () => {
    const made = setup();
    await made.users.update(BOB, { friendCode: '**ask me** `x`' });
    expect(await made.show({ id: BOB })).toBe(
      `The friend code of **Bob** (<@${BOB}>):\n\\*\\*ask me\\*\\* \\\`x\\\``,
    );
  });
});

describe('/nickname register and remove', () => {
  it('stores the name as typed, tidied', async () => {
    const made = setup();
    expect(await made.answer('nickname', 'register', { name: '  PineTrainer42 ' })).toBe(
      'Your in-game name is registered: **PineTrainer42**. Members of a server you share ' +
        'with me can find you by it with `/nickname find`; `/nickname remove` takes it back.',
    );
    expect((await made.users.get(ALICE)).nickname).toBe('PineTrainer42');
  });

  it('refuses what cannot be a name in the game, and stores nothing', async () => {
    const made = setup();
    expect(await made.answer('nickname', 'register', { name: 'Pine **Trainer**' })).toBe(
      '"Pine \\*\\*Trainer\\*\\*" cannot be an in-game name: an in-game name is 3 to 32 ' +
        'letters and digits, without spaces or other signs.',
    );
    expect(await made.answer('nickname', 'register', { name: 'ab' })).toMatch(
      /cannot be an in-game name/,
    );
    expect((await made.users.get(ALICE)).nickname).toBeNull();
  });

  it('removes the name, and says when there was none', async () => {
    const made = setup();
    expect(await made.answer('nickname', 'remove')).toBe('You have no in-game name registered.');
    await made.run('nickname', 'register', { name: 'PineTrainer42' });
    expect(await made.answer('nickname', 'remove')).toBe('Your in-game name is removed.');
    expect((await made.users.get(ALICE)).nickname).toBeNull();
  });

  it('takes a stored empty or blank text for no name', async () => {
    const made = setup();
    for (const blank of ['', '   ']) {
      await made.users.update(ALICE, { nickname: blank });
      expect(await made.answer('nickname', 'remove')).toBe('You have no in-game name registered.');
    }
  });

  it('works in a DM with the bot', async () => {
    const made = setup();
    await made.run('nickname', 'register', { name: 'PineTrainer42' }, { isDm: true });
    expect((await made.users.get(ALICE)).nickname).toBe('PineTrainer42');
  });
});

describe('/nickname find', () => {
  it('names the member of this server who registered the name, whatever the case and accents', async () => {
    const made = setup();
    await made.users.update(BOB, { nickname: 'PinéTrainer' });
    expect(await made.answer('nickname', 'find', { name: ' pinetrainer ' })).toBe(
      // As Bob registered it, not as it was typed.
      `**PinéTrainer** is **Bob** (<@${BOB}>).`,
    );
  });

  it('says the name as it was registered: one spelling once, several each with its member', async () => {
    const made = setup();
    await made.users.update(BOB, { nickname: 'PineTrainer' });
    await made.users.update(CAROL, { nickname: 'PineTrainer' });
    expect(await made.answer('nickname', 'find', { name: 'PINETRAINER' })).toBe(
      `2 members of this server registered the in-game name **PineTrainer**: ` +
        `**Bob** (<@${BOB}>), **Carol** (<@${CAROL}>).`,
    );
    // Another member's text, and legacy rows hold anything: no working link comes out of it.
    await made.users.update(BOB, { nickname: 'see https://evil.example/x' });
    const linked = await made.answer('nickname', 'find', { name: 'see https://evil.example/x' });
    expect(linked).toContain('is **Bob**');
    expect(linked).not.toContain('https://evil');
    expect(linked).toContain('evil.');
    await made.users.update(BOB, { nickname: 'PineTrainer' });
    await made.users.update(CAROL, { nickname: 'pine**trainer' });
    expect(await made.answer('nickname', 'find', { name: 'pine**trainer' })).toBe(
      `**pine\\*\\*trainer** is **Carol** (<@${CAROL}>).`,
    );
  });

  it('names all members who registered one name, and only those who are in this server', async () => {
    const made = setup();
    await made.users.update(BOB, { nickname: 'pinetrainer' });
    await made.users.update(DAVE, { nickname: 'PineTrainer' });
    await made.users.update(CAROL, { nickname: 'PINETRAINER' });
    expect(await made.answer('nickname', 'find', { name: 'PineTrainer' })).toBe(
      `2 members of this server registered the in-game name **PineTrainer**: ` +
        `**Bob** (<@${BOB}>) as **pinetrainer**, **Carol** (<@${CAROL}>) as **PINETRAINER**.`,
    );
    // Dave is in no server the directory knows.
    expect(made.members.asked).toContain(`${FAKE_GUILD_ID}:${DAVE}`);
  });

  it('says so when nobody in this server has the name', async () => {
    const made = setup();
    await made.users.update(DAVE, { nickname: 'PineTrainer' });
    await made.users.update(BOB, { nickname: 'PineTrainer2' });
    expect(await made.answer('nickname', 'find', { name: 'PineTrainer' })).toBe(
      'Nobody in this server has registered the in-game name **PineTrainer**.',
    );
    expect(await made.answer('nickname', 'find', { name: '**nobody**' })).toBe(
      'Nobody in this server has registered the in-game name **\\*\\*nobody\\*\\***.',
    );
    expect(await made.answer('nickname', 'find', { name: '   ' })).toBe(
      'Say which in-game name to look for.',
    );
  });

  it('goes on past holders who are elsewhere, five at a time, until the list ends', async () => {
    const made = setup();
    // Thirty members of other servers registered the name before the two of this one.
    for (let index = 0; index < 30; index++) {
      await made.users.update(String(300000000000000000n + BigInt(index)), {
        nickname: 'PineTrainer',
      });
    }
    await made.users.update(BOB, { nickname: 'PineTrainer' });
    await made.users.update(CAROL, { nickname: 'PineTrainer' });
    expect(await made.answer('nickname', 'find', { name: 'pinetrainer' })).toBe(
      `2 members of this server registered the in-game name **PineTrainer**: ` +
        `**Bob** (<@${BOB}>), **Carol** (<@${CAROL}>).`,
    );
    expect(made.members.asked).toHaveLength(32);
  });

  it('stops asking once twenty members of this server are found', async () => {
    const made = setup();
    for (let index = 0; index < 60; index++) {
      const id = String(300000000000000000n + BigInt(index));
      await made.users.update(id, { nickname: 'PineTrainer' });
      made.members.add(id, `Trainer ${String(index)}`);
    }
    const said = (await made.answer('nickname', 'find', { name: 'PineTrainer' })) ?? '';
    expect(said).toMatch(/^20 members of this server registered the in-game name/);
    expect(said.length).toBeLessThanOrEqual(2_000);
    expect(made.members.asked).toHaveLength(20);
  });

  it('counts a holder Discord cannot be asked about as not here, and logs it', async () => {
    const made = setup();
    await made.users.update(BOB, { nickname: 'PineTrainer' });
    made.members.failing = new Error('Invalid Form Body');
    expect(await made.answer('nickname', 'find', { name: 'PineTrainer' })).toBe(
      'Nobody in this server has registered the in-game name **PineTrainer**.',
    );
    expect(made.entries).toContainEqual(
      expect.objectContaining({ level: 40, msg: 'could not look a member up', user: BOB }),
    );
  });

  it('allows ten searches a minute, and thirty changes', async () => {
    const made = setup();
    for (let use = 0; use < 10; use++) await made.run('nickname', 'find', { name: 'x' });
    expect(await made.answer('nickname', 'find', { name: 'x' })).toMatch(
      /^You can use \/nickname find again in /,
    );
    for (let use = 0; use < 30; use++) {
      await made.run('nickname', 'register', { name: 'PineTrainer' });
    }
    expect(await made.answer('nickname', 'register', { name: 'PineTrainer' })).toMatch(
      /^You can use \/nickname register again in /,
    );
    for (let use = 0; use < 30; use++) {
      await made.run('friend-code', 'register', { code: '123456789012' });
    }
    expect(await made.answer('friend-code', 'register', { code: '123456789012' })).toMatch(
      /^You can use \/friend-code register again in /,
    );
  });

  it('finds a legacy name that could not be registered today', async () => {
    const made = setup();
    await made.users.update(BOB, { nickname: 'pine trainer' });
    expect(await made.answer('nickname', 'find', { name: 'Pine Trainer' })).toBe(
      `**pine trainer** is **Bob** (<@${BOB}>).`,
    );
  });

  it('works in a server only', async () => {
    const made = setup();
    expect(await made.answer('nickname', 'find', { name: 'x' }, { isDm: true })).toBe(
      'This only works in a server.',
    );
  });
});
