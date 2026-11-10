import {
  InteractionContextType,
  SlashCommandBuilder,
  SlashCommandSubcommandBuilder,
} from 'discord.js';
import type { AppContext } from '../../app-context.js';
import { commandGroup, type SubcommandPart } from '../../discord/command-group.js';
import { UserError } from '../../discord/errors.js';
import { guildIdOf, requireGuild } from '../../discord/guards.js';
import type { ServerMember } from '../../discord/member-directory.js';
import { MEMBER_WRITE_THROTTLE, type Throttle } from '../../discord/throttle.js';
import {
  count,
  fitItems,
  LIMITS,
  memberText,
  plain,
  plainNoLinks,
  truncate,
} from '../../render/text.js';
import { answer } from '../../discord/late-reply.js';

const FRIEND_CODE_DIGITS = 12;

/**
 * A friend code as it is stored and shown, `1234 5678 9012` (as the legacy bot stored it): the
 * twelve digits of what was typed, whatever stood between them. Undefined when the text does
 * not hold exactly twelve digits.
 */
export function friendCodeOf(text: string): string | undefined {
  const digits = text.replace(/\D/g, '');
  if (digits.length !== FRIEND_CODE_DIGITS) return undefined;
  return `${digits.slice(0, 4)} ${digits.slice(4, 8)} ${digits.slice(8)}`;
}

/**
 * A stored friend code as a message shows it: on a line of its own as code, which is easy to
 * copy. A legacy value that is no friend code is shown as plain text.
 */
function shownCode(stored: string): string {
  const code = friendCodeOf(stored);
  // The column holds up to 255 characters of whatever the legacy bot was given.
  return code === undefined ? plain(truncate(stored.trim(), SHOWN_VALUE)) : `\`${code}\``;
}

/** As much of a legacy value that is no friend code as a message shows. */
const SHOWN_VALUE = 60;

/** How often one member may look somebody up: each use may ask Discord for members. */
const LOOKUP_THROTTLE: Throttle = { uses: 10, perSeconds: 60 };

/**
 * A member of this server by their id, or undefined: also when Discord could not be asked or
 * refused the id (a stored id that is no snowflake is refused as an invalid form body). Such a
 * failure is logged and counts as "not a member" for that one id; it does not fail the command.
 */
async function memberOfServer(
  ctx: AppContext,
  guildId: string,
  userId: string,
): Promise<ServerMember | undefined> {
  try {
    return await ctx.members.find(guildId, userId);
  } catch (err) {
    ctx.log.warn({ err, guild: guildId, user: userId }, 'could not look a member up');
    return undefined;
  }
}

/** In-game names are letters and digits; the game allows 4 to 15, this is lenient on length. */
const IN_GAME_NAME = /^[\p{L}\p{N}]{3,32}$/u;

/**
 * An in-game name as it is stored: as typed, without the white space around it. Undefined for
 * what cannot be a name in Pokémon GO.
 */
export function inGameNameOf(text: string): string | undefined {
  const name = text.normalize('NFC').trim();
  return IN_GAME_NAME.test(name) ? name : undefined;
}

/** As many members of a server with one in-game name as are named. */
const MAX_NAMESAKES = 20;
/** As many holders of a name as Discord is asked about at once. */
const LOOKUPS_AT_ONCE = 5;

const registerCode: SubcommandPart = {
  data: new SlashCommandSubcommandBuilder()
    .setName('register')
    .setDescription('Register your Pokémon GO friend code, or replace it')
    .addStringOption((option) =>
      option
        .setName('code')
        .setDescription('Your 12-digit friend code, with or without spaces')
        .setRequired(true)
        .setMaxLength(40),
    ),
  help: {
    details:
      'Stores your friend code so that others can ask for it with `/friend-code show`. Type ' +
      'the twelve digits any way you like: spaces and dashes are ignored.',
    examples: ['/friend-code register code:1234 5678 9012'],
  },
  defer: 'late',
  throttle: MEMBER_WRITE_THROTTLE,
  async execute(interaction, ctx) {
    const typed = interaction.options.getString('code', true);
    const code = friendCodeOf(typed);
    if (code === undefined) {
      const digits = typed.replace(/\D/g, '').length;
      throw new UserError(
        `A friend code has ${String(FRIEND_CODE_DIGITS)} digits; what you typed has ${String(digits)}.`,
      );
    }
    await ctx.users.update(interaction.user.id, { friendCode: code });
    await answer(interaction, {
      content:
        `Your friend code is registered:\n\`${code}\`\n` +
        'Anybody in a server you share with me can ask for it with `/friend-code show`; ' +
        '`/friend-code remove` takes it back.',
    });
  },
};

const showCode: SubcommandPart = {
  data: new SlashCommandSubcommandBuilder()
    .setName('show')
    .setDescription('Show a member’s friend code, or your own')
    .addUserOption((option) =>
      option.setName('member').setDescription('Whose friend code; yours when left out'),
    ),
  help: {
    details:
      'Shows you the friend code a member of this server registered, on a line of its own so ' +
      'that it is easy to copy. Without a member it shows your own.',
    examples: ['/friend-code show member:@Ash', '/friend-code show'],
  },
  defer: 'late',
  throttle: LOOKUP_THROTTLE,
  async execute(interaction, ctx) {
    const user = interaction.options.getUser('member');
    if (user === null || user.id === interaction.user.id) {
      const own = (await ctx.users.get(interaction.user.id)).friendCode;
      await answer(interaction, {
        content:
          own === null || own.trim() === ''
            ? 'You have not registered a friend code. `/friend-code register` does that.'
            : `Your friend code:\n${shownCode(own)}`,
      });
      return;
    }
    if (user.bot) throw new UserError('That is a bot: it has no friend code.');
    const { guildId } = interaction;
    if (guildId === null) {
      throw new UserError('Somebody else’s friend code can only be asked for in a server.');
    }
    // Only of somebody who is in this server: a code is not handed to whoever knows an id.
    // Discord sends the member with the option exactly when the user is in this server; the
    // directory is asked only when that came without a name.
    const sent = interaction.options.getMember('member');
    if (sent === null) throw new UserError('They are not in this server.');
    const member =
      'displayName' in sent && typeof sent.displayName === 'string'
        ? { id: user.id, name: sent.displayName }
        : await memberOfServer(ctx, guildId, user.id);
    if (!member) throw new UserError('They are not in this server.');
    const code = (await ctx.users.get(user.id)).friendCode;
    await answer(interaction, {
      content:
        code === null || code.trim() === ''
          ? `${memberText(member)} has not registered a friend code.`
          : `The friend code of ${memberText(member)}:\n${shownCode(code)}`,
    });
  },
};

const removeCode: SubcommandPart = {
  data: new SlashCommandSubcommandBuilder()
    .setName('remove')
    .setDescription('Remove your friend code'),
  help: {
    details: 'Forgets the friend code you registered: nobody can ask for it any more.',
    examples: ['/friend-code remove'],
  },
  defer: 'late',
  throttle: MEMBER_WRITE_THROTTLE,
  async execute(interaction, ctx) {
    const had = (await ctx.users.get(interaction.user.id)).friendCode;
    // A legacy row may hold an empty text: that is no code, as `show` reads it.
    if (had === null || had.trim() === '') {
      await answer(interaction, { content: 'You have no friend code registered.' });
      return;
    }
    await ctx.users.update(interaction.user.id, { friendCode: null });
    await answer(interaction, { content: 'Your friend code is removed.' });
  },
};

/**
 * `/friend-code` (spec 4.2): a member's Pokémon GO friend code, registered by themself and shown
 * to whoever asks in a server both are in. Every answer is for the asker alone. Registering and
 * removing also work in a DM with the bot.
 */
export const friendCode = commandGroup({
  data: new SlashCommandBuilder()
    .setName('friend-code')
    .setDescription('Pokémon GO friend codes: register yours, look up a member’s')
    .setContexts(InteractionContextType.Guild, InteractionContextType.BotDM),
  help: {
    category: 'friends',
    details:
      'Register your Pokémon GO friend code once, and members of the servers you are in can ' +
      'look it up instead of asking you. Only you see the answers of these commands.',
    examples: ['/friend-code register code:1234 5678 9012', '/friend-code show member:@Ash'],
  },
  parts: [registerCode, showCode, removeCode],
});

const registerName: SubcommandPart = {
  data: new SlashCommandSubcommandBuilder()
    .setName('register')
    .setDescription('Register your Pokémon GO name, or replace it')
    .addStringOption((option) =>
      option
        .setName('name')
        .setDescription('Your name in the game')
        .setRequired(true)
        .setMaxLength(40),
    ),
  help: {
    details:
      'Stores your in-game name as you type it, so that others can find out who you are on ' +
      'Discord with `/nickname find`. An in-game name is letters and digits only.',
    examples: ['/nickname register name:PineTrainer42'],
  },
  defer: 'late',
  throttle: MEMBER_WRITE_THROTTLE,
  async execute(interaction, ctx) {
    const typed = interaction.options.getString('name', true);
    const name = inGameNameOf(typed);
    if (name === undefined) {
      throw new UserError(
        `"${plain(truncate(typed.trim(), 40))}" cannot be an in-game name: an in-game name ` +
          'is 3 to 32 letters and digits, without spaces or other signs.',
      );
    }
    await ctx.users.update(interaction.user.id, { nickname: name });
    await answer(interaction, {
      content:
        `Your in-game name is registered: **${plain(name)}**. Members of a server you share ` +
        'with me can find you by it with `/nickname find`; `/nickname remove` takes it back.',
    });
  },
};

const removeName: SubcommandPart = {
  data: new SlashCommandSubcommandBuilder()
    .setName('remove')
    .setDescription('Remove your in-game name'),
  help: {
    details: 'Forgets the in-game name you registered: nobody finds you by it any more.',
    examples: ['/nickname remove'],
  },
  defer: 'late',
  throttle: MEMBER_WRITE_THROTTLE,
  async execute(interaction, ctx) {
    const had = (await ctx.users.get(interaction.user.id)).nickname;
    if (had === null || had.trim() === '') {
      await answer(interaction, { content: 'You have no in-game name registered.' });
      return;
    }
    await ctx.users.update(interaction.user.id, { nickname: null });
    await answer(interaction, { content: 'Your in-game name is removed.' });
  },
};

const findName: SubcommandPart = {
  data: new SlashCommandSubcommandBuilder()
    .setName('find')
    .setDescription('Find out which member of this server has an in-game name')
    .addStringOption((option) =>
      option
        .setName('name')
        .setDescription('The in-game name, in full')
        .setRequired(true)
        .setMaxLength(40),
    ),
  help: {
    details:
      'Tells you who in this server registered an in-game name. The name must be given in ' +
      'full, but capital letters and accents do not matter: `pinetrainer42` finds ' +
      '`PineTrainer42`. Several members can have registered the same name; all are shown.',
    examples: ['/nickname find name:PineTrainer42'],
  },
  guards: [requireGuild],
  defer: 'late',
  throttle: LOOKUP_THROTTLE,
  async execute(interaction, ctx) {
    const guildId = guildIdOf(interaction);
    const typed = interaction.options.getString('name', true).normalize('NFC').trim();
    if (typed === '') throw new UserError('Say which in-game name to look for.');
    /**
     * A name as an answer shows it. A registered name is another member's text (legacy rows
     * hold anything), so it carries no working link.
     */
    const bold = (name: string): string => `**${plainNoLinks(truncate(name, 40))}**`;
    const shown = bold(typed);
    // Legacy rows hold any text, so the name is looked for as typed, not only when it could
    // be registered today.
    const registered = await ctx.users.withNickname(typed);
    // Each is asked for at Discord, a few at a time: only who is in this server is named. It
    // goes on until enough of them are found or the list ends, however many others (members
    // of other servers) registered the name.
    const members: { member: ServerMember; nickname: string }[] = [];
    for (
      let start = 0;
      start < registered.length && members.length < MAX_NAMESAKES;
      start += LOOKUPS_AT_ONCE
    ) {
      const asked = registered.slice(start, start + LOOKUPS_AT_ONCE);
      const found = await Promise.all(
        asked.map(async ({ snowflake, nickname: name }) => ({
          member: await memberOfServer(ctx, guildId, snowflake),
          nickname: name,
        })),
      );
      members.push(
        ...found.flatMap(({ member, nickname: name }) =>
          member ? [{ member, nickname: name }] : [],
        ),
      );
    }
    members.splice(MAX_NAMESAKES);
    if (members.length === 0) {
      await answer(interaction, {
        content: `Nobody in this server has registered the in-game name ${shown}.`,
      });
      return;
    }
    // The name is said as it was registered, not as it was typed: capital letters and accents
    // do not matter for finding it, but they are part of the name in the game.
    const [only] = members;
    const spellings = new Set(members.map((found) => found.nickname));
    let content: string;
    if (only && members.length === 1) {
      content = `${bold(only.nickname)} is ${memberText(only.member)}.`;
    } else {
      // Several members under one spelling are listed under it; where they spell it
      // differently each is listed with their own.
      const [spelling] = spellings;
      const same = spellings.size === 1 && spelling !== undefined;
      const listed = members.map((found) =>
        same ? memberText(found.member) : `${memberText(found.member)} as ${bold(found.nickname)}`,
      );
      content =
        `${count(members.length, 'member')} of this server registered the in-game name ` +
        `${same ? bold(spelling) : shown}: ${fitItems(listed, LIMITS.content - 200)}.`;
    }
    await answer(interaction, { content });
  },
};

/**
 * `/nickname` (spec 4.2): a member's in-game name in Pokémon GO (the `User.nickname` column),
 * registered by themself, and the look-up from an in-game name to the member of this server.
 * Every answer is for the asker alone. Registering and removing also work in a DM with the bot.
 */
export const nickname = commandGroup({
  data: new SlashCommandBuilder()
    .setName('nickname')
    .setDescription('Pokémon GO names: register yours, find a member by theirs')
    .setContexts(InteractionContextType.Guild, InteractionContextType.BotDM),
  help: {
    category: 'friends',
    details:
      'Register the in-game name you have in Pokémon GO, and members of this server can find ' +
      'out who a trainer they met in a raid is on Discord. Names are compared without regard ' +
      'to capital letters and accents. Only you see the answers of these commands.',
    examples: ['/nickname register name:PineTrainer42', '/nickname find name:PineTrainer42'],
  },
  parts: [registerName, findName, removeName],
});
