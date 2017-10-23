const Commando = require('discord.js-commando'),
	{MessageEmbed} = require('discord.js'),
	{stripIndents, oneLine} = require('common-tags');

class HelpCommand extends Commando.Command {
	constructor(client) {
		super(client, {
			name: 'help',
			group: 'util',
			memberName: 'help',
			aliases: ['commands'],
			description: 'Displays a list of available commands, or detailed information for a specified command.',
			details: oneLine`
				The command may be part of a command name or a whole command name.
				If it isn't specified, all available commands will be listed.
			`,
			examples: ['help', 'help prefix'],
			guarded: true,

			args: [
				{
					key: 'command',
					prompt: 'Which command would you like to view the help for?',
					type: 'string',
					default: ''
				}
			]
		});
	}

	async run(message, args) {
		const groups = this.client.registry.groups,
			commands = this.client.registry.findCommands(args.command, false, message),
			showAll = args.command && args.command.toLowerCase() === 'all',
			embed = new MessageEmbed();

		embed.setColor(4437377);

		if (args.command && !showAll) {
			if (commands.length === 1) {
				embed.setTitle(`Command: ${commands[0].name}`);
				embed.setDescription(stripIndents`
					${oneLine`
						${commands[0].description}
						${commands[0].guildOnly ? ' (usable only in public channels)' : ''}
					`}`);

				embed.addField('**Format**',
					`${message.anyUsage(`${commands[0].name}${commands[0].format ? ` ${commands[0].format}` : ''}`,
						message.guild ? message.guild.commandPrefix : null,
						null)}`);

				if (commands[0].aliases.length > 0) {
					embed.addField('**Aliases**', commands[0].aliases.join('\n'));
				}

				if (commands[0].details) {
					embed.addField('**Details**', commands[0].details);
				}

				/*
				embed.addField('**Group**',
					`${oneLine`${commands[0].group.name}
					(\`${commands[0].groupID}:${commands[0].memberName}\`)
				`}`);
				*/

				if (commands[0].examples) {
					embed.addField('**Examples**', commands[0].examples
						.map(example => example.trim())
						.join('\n'));
				}

				const messages = [];
				try {
					messages.push(await message.direct({embed}));
					if (message.channel.type !== 'dm') messages.push(await message.reply('Sent you a DM with information.'));
				} catch (err) {
					messages.push(await message.reply('Unable to send you the help DM. You probably have DMs disabled.'));
				}
				return messages;
			} else if (commands.length > 1) {
				return message.reply(Commando.util.disambiguation(commands, 'commands'));
			} else {
				return message.reply(
					`Unable to identify command. Use ${message.usage(
						null, message.channel.type === 'dm' ? null : undefined, message.channel.type === 'dm' ? null : undefined
					)} to view the list of all commands.`
				);
			}
		} else {
			const messages = [];
			try {
				embed.setDescription(stripIndents`
					${oneLine`
						To run a command in ${message.guild || 'any server'},
						use ${Commando.Command.usage('command',
					message.guild ?
						message.guild.commandPrefix :
						null, this.client.user)}.
						For example, ${Commando.Command.usage('join',
					message.guild ?
						message.guild.commandPrefix :
						null, this.client.user)}.
					`}
					To run a command in this DM, simply use ${Commando.Command.usage('command', null, null)} with no prefix.

					Use ${this.usage('<command>', null, null)} to view detailed information about a specific command.
					Use ${this.usage('all', null, null)} to view a list of *all* commands, not just available ones.

					**${showAll ?
					'All commands' :
					`Available commands in ${message.guild || 'this DM'}`}**`);

				const groupsToShow = showAll ?
					groups :
					groups.filter(group => group.commands.some(cmd => cmd.isUsable(message)));

				groupsToShow.forEach(group => {
					embed.addField(`**${group.name}**`, `${
						(showAll ?
							group.commands :
							group.commands.filter(command => command.isUsable(message)))
							.map(command => '**' + command.name + '**: ' + command.description).join('\n')}`);
				});

				messages.push(await message.direct({embed}));

				if (message.channel.type !== 'dm') messages.push(await message.reply('Sent you a DM with information.'));
			} catch (err) {
				messages.push(await message.reply('Unable to send you the help DM. You probably have DMs disabled.'));
			}
			return messages;
		}
	}
}

module.exports = HelpCommand;
