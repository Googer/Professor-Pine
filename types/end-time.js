"use strict";

const Commando = require('discord.js-commando'),
	moment = require('moment'),
	settings = require('../data/settings.json');

class EndTimeType extends Commando.ArgumentType {
	constructor(client) {
		super(client, 'endtime');
	}

	validate(value, message, arg) {
		let mode = 'relative';

		if (value.trim().match(/^[at|@]/i)) {
			mode = 'absolute';
		}

		const matches = value.match(/(\d+)([^\d]+)?/g);

		if (!matches) {
			message.reply('Time entered is not valid.  Try something in h:mm format (such as `1:43`).');
			return false;
		}

		if (mode === 'relative') {
			const multipliers = [
					10080, // weeks
					1440, // days
					60, // hours
					1 // minutes
				],
				matches_length = matches.length;

			let minutes = 0;

			while (matches.length > 0 && minutes < settings.max_end_time) {
				minutes += parseInt(matches.pop().match(/^(\d+)/)[1]) * multipliers.pop();
			}

			if (matches_length === 1 && minutes < 5) {
				// User probably entered hours left, not minutes
				minutes *= multipliers.pop();
			}

			if (minutes > settings.max_end_time) {
				message.reply('Time entered is too far in the future.  Try something in h:mm format (such as `1:43`).');
				return false;
			}

			return true;
		} else {
			// absolute, only deal with h:mm for now
			const now = moment(),
				hours = parseInt(matches[0].match(/^(\d+)/)[1]),
				minutes = matches.length > 1 ?
					parseInt(matches[1].match(/^(\d+)/)[1]) :
					0,

				possible_time_1 = now.clone().set({hours, minutes}),
				possible_time_2 = now.clone().set({hours: hours + 12, minutes}),

				diff_time_1 = possible_time_1.diff(now, 'minutes'),
				diff_time_2 = possible_time_2.diff(now, 'minutes');

			// if time is greater than 3 hours, the user likely entered incorrect information
			if (diff_time_1 > settings.max_end_time || diff_time_2 > settings.max_end_time) {
				message.reply('Specified time is too far in the future!');
				return false;
			}

			if (diff_time_1 >= 0 || diff_time_2 >= 0) {
				return true;
			} else {
				message.reply('Please enter a time in the future.');
				return false;
			}
		}
	}

	parse(value, message, arg) {
		let mode = 'relative';

		if (value.trim().match(/^[at|@]/i)) {
			mode = 'absolute';
		}

		const matches = value.match(/(\d+)([^\d]+)?/g);

		if (mode === 'relative') {
			const multipliers = [
					10080, // weeks
					1440, // days
					60, // hours
					1 // minutes
				],
				matches_length = matches.length;

			let minutes = 0;

			while (matches.length > 0 && minutes < settings.max_end_time) {
				minutes += parseInt(matches.pop().match(/^(\d+)/)[1]) * multipliers.pop();
			}

			if (matches_length === 1 && minutes < 5) {
				// User probably entered hours left, not minutes
				minutes *= multipliers.pop();
			}

			return minutes;
		} else {
			// absolute, only deal with h:mm for now
			// special scenario if the user entered a time like "1:20" without am/pm or at least it couldn't be found via regex
			//		need to figure out whether it should be am or pm based on current time
			const now = moment(),
				hours = parseInt(matches[0].match(/^(\d+)/)[1]),
				minutes = matches.length > 1 ?
					parseInt(matches[1].match(/^(\d+)/)[1]) :
					0,

				possible_time_1 = now.clone().set({hours, minutes}),
				possible_time_2 = now.clone().set({hours: hours + 12, minutes}),

				diff_time_1 = possible_time_1.diff(now, 'minutes'),
				diff_time_2 = possible_time_2.diff(now, 'minutes');

			if (diff_time_1 >= 0) {
				return diff_time_1;
			} else {
				return diff_time_2;
			}
		}
	}

	static get UNDEFINED_END_TIME() {
		return "unset";
	}
}

module.exports = EndTimeType;