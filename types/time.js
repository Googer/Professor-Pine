"use strict";

const Commando = require('discord.js-commando'),
	moment = require('moment'),
	Utility = require('../app/utility'),
	settings = require('../data/settings.json');

class TimeType extends Commando.ArgumentType {
	constructor(client) {
		super(client, 'time');
	}

	validate(value, message, arg) {
		const extra_error_message = Utility.isOneLiner(message) ?
			'  Do **not** re-enter the `' + arg.command.name + '` command.' :
			'';

		let mode = arg.min; // hacky way to get a preferred mode out of the argument definition

		if (value.trim().match(/^[at|@]/i)) {
			mode = 'absolute';
		} else if (value.trim().match(/^in/i)) {
			mode = 'relative';
		}

		const matches = value.match(/(\d+)([^\d]+)?/g);

		if (!matches) {
			return '\'' + value + '\' is not a valid time.  Try something in h:mm format (such as `1:43`).' + extra_error_message;
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
				return '\'' + value + '\' is too far in the future.  Try something in h:mm format (such as `1:43`).' + extra_error_message;
			}

			return true;
		} else {
			// absolute, only deal with h:mm for now
			const now = moment(),
				hours = parseInt(matches[0].match(/^(\d+)/)[1]),
				minutes = matches.length > 1 ?
					parseInt(matches[1].match(/^(\d+)/)[1]) :
					0;

			const possible_time = now.clone().set({hours, minutes});

			if (possible_time.diff(now) < 0) {
				possible_time.add(12, 'hours');
			}

			if (possible_time.diff(now) < 0) {
				return 'Please enter a time in the future.' + extra_error_message;
			}

			// if time is greater than 3 hours, the user likely entered incorrect information
			if (arg.command.name === 'start-time') {
				const raid = require('../app/raid').getRaid(message.channel.id),
					end_time = raid.end_time;

				if (end_time !== TimeType.UNDEFINED_END_TIME && possible_time > end_time) {
					return value + ' is after this raid\'s end time!' + extra_error_message;
				}
			}

			return true;
		}
	}

	parse(value, message, arg) {
		let mode = arg.min; // hacky way to get a preferred mode out of the argument definition

		if (value.trim().match(/^[at|@]/i)) {
			mode = 'absolute';
		} else if (value.trim().match(/^in/i)) {
			mode = 'relative';
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

			return minutes * 60 * 1000; // time is in milliseconds
		} else {
			// absolute, only deal with h:mm for now
			const now = moment(),
				hours = parseInt(matches[0].match(/^(\d+)/)[1]),
				minutes = matches.length > 1 ?
					parseInt(matches[1].match(/^(\d+)/)[1]) :
					0;

			const possible_time = now.clone().set({hours, minutes});

			if (possible_time.diff(now) < 0) {
				possible_time.add(12, 'hours');
			}

			return possible_time.diff(now);
		}
	}

	static get UNDEFINED_END_TIME() {
		return "unset";
	}
}

module.exports = TimeType;