"use strict";

const moment = require('moment');
const Commando = require('discord.js-commando');
const Raid = require('../../app/raid');
const PokemonSearch = require('../../app/pokemon-search');

class RaidCommand extends Commando.Command {
	constructor(client) {
		super(client, {
			name: 'raid',
			group: 'raids',
			memberName: 'raid',
			description: 'Create a new raid group!'
		});
	}

	run(message, args) {
		if (message.channel.type !== 'text') {
			message.reply('Please create a raid from a public channel.');
			return;
		}

		const params = args.split(' ');
		const times = args.match(/([0-9]{1,2}\:[0-9]{1,2}(\s?([pa])m)?)|([0-9]\sh(ours?),?\s?(and\s)?[0-9]{1,2}\sminutes?)|([0-9]\s?h?,?\s?[0-9]{1,2}\s?m?)|([0-9]\s?(h(ours?)?|m(inutes?)?))/g);
		const links = args.match(/(http(s)?:\/\/.)?(www\.)?[-a-zA-Z0-9@:%._+~#=]{2,256}\.[a-z]{2,6}\b([-a-zA-Z0-9@:%_+.~#?&//=]*(,[-a-zA-Z0-9@:%_+.~#!?&//=]+)?)/g);
		const now = moment();
		const pokemon_term = params[0];
		const location = (links) ? links[0] : '';
		const start_time = '';
		let end_time = '';
		let hours, minutes;
		let info = {};

		if (!pokemon_term.length) {
			message.reply('Please enter a raid boss (i.e. lugia) or a tier level (i.e. t5).');
			return;
		}

		const pokemon = PokemonSearch.search([pokemon_term]);

		if (!pokemon) {
			message.reply('Please enter a raid boss (i.e. lugia) or a tier level (i.e. t5).');
			return;
		}

		// assume the first time is the end time
		if (times && times[0]) {
			// check if am/pm was given on time, which indicates that the user found the end time theirselves and we don't have to caculate it
			if (times[0].search(/([ap])m/) >= 0) {
				time = (new moment(times[0], 'h:mm:ss a')).format('h:mma');
			} else if (times[0].search(/\:/) >= 0) {
				// special scenario if the user entered a time like "1:20" without am/pm or at least it couldn't be found via regex
				//		need to figure out whether it should be am or pm based on current time
				const now = moment();
				let possible_time_1, possible_time_2;
				let diff_time_1, diff_time_2;
				let am_or_pm = '';

				[hours, minutes] = times[0].split(':');
				hours = parseInt(hours);
				minutes = parseInt(minutes);

				possible_time_1 = moment().set({hours, minutes});
				possible_time_2 = moment().set({hours: hours + 12, minutes});

				diff_time_1 = possible_time_1.diff(moment());
				diff_time_2 = possible_time_2.diff(moment());

				// if time is greater than 3 hours, the user likely entered incorrect information
				if (diff_time_1 / 3600000 > 3 || diff_time_2 / 3600000 > 3) {
					message.reply('Please enter a raid end time that is within 3 hours and looks something like `2:00pm`.');
					return;
				}

				if (diff_time_1 >= 0) {
					am_or_pm = possible_time_1.format('a');
				} else if (diff_time_2 >= 0) {
					am_or_pm = possible_time_2.format('a');
				} else {
					message.reply('Please enter a raid end time that in the future, rather than in the past.');
					return;
				}

				end_time = times[0].trim() + am_or_pm;
			} else {
				// user has not given an end time, but rather time remaining, so need to calculate end time based off current time + time remaining
				[hours, minutes] = times[0].match(/[0-9]{1,2}/g);
				hours = parseInt(hours);
				minutes = parseInt(minutes);

				// if only 1 number given (no available minutes), need to figure out if that number is minutes or hours
				//		default is hours per how regex works
				if (!minutes && times[0].search(/m(inutes?)?/) >= 0) {
					hours = 0;
					minutes = hours;
				}

				end_time = moment(Date.now()).add({hours, minutes}).format('h:hha');
			}
		}

		info = Raid.createRaid(message.channel, message.member, {
			pokemon,
			end_time,
			start_time,
			location
		});

		message.channel.send(Raid.getFormattedMessage(info.raid)).then((bot_message) => {
			Raid.setMessage(message.channel, message.member, info.raid.id, bot_message);
		});
	}
}

module.exports = RaidCommand;
