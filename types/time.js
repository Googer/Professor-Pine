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
			'  Do **not** re-enter the `' + message.command.name + '` command.' :
			'',
			Raid = require('../app/raid'),
			is_ex_raid = this.isExclusiveRaid(value, message, arg),
			raid_exists = Raid.validRaid(message.message.channel.id),
			raid_creation_time = raid_exists ?
				moment(Raid.getRaid(message.message.channel.id).creation_time) :
				moment(),
			last_possible_time = raid_creation_time.clone().add(is_ex_raid ?
				settings.exclusive_raid_duration :
				settings.default_raid_duration, 'minutes');

		let mode = arg.min, // hacky way to get a preferred mode out of the argument definition
			value_to_parse = value;

		if (!raid_exists && is_ex_raid) {
			mode = 'absolute';
		}

		if (value.trim().match(/^[at|@]/i)) {
			mode = 'absolute';
			value_to_parse = value.substring(2).trim();
		} else if (value.trim().match(/^in/i)) {
			mode = 'relative';
			value_to_parse = value.substring(2).trim();
		}

		if (mode === 'relative') {
			let duration;

			if (value_to_parse.indexOf(':') === -1) {
				duration = moment.duration(value_to_parse * 60 * 1000);
			} else {
				duration = moment.duration(value_to_parse);
			}

			if (!duration.isValid()) {
				return `Please enter a duration in form \`HH:mm\`${extra_error_message}`;
			}

			if (moment().add(duration).isBetween(raid_creation_time, last_possible_time)) {
				return true;
			}

			return `Entered time is not valid for raid.${extra_error_message}`;
		} else {
			const entered_date = moment(value_to_parse, ['H:m', 'h:m a', 'M-D H:m', 'M-D H', 'M-D h:m a', 'M-D h a']);

			if (!entered_date.isValid()) {
				return `Please enter a date in the form \`MM-dd HH:mm\` (month and day optional).${extra_error_message}`;
			}

			if (entered_date.isBetween(raid_creation_time, last_possible_time)) {
				return true;
			}

			// account for year rollover possibility before saying this date-time isn't valid
			entered_date.add(1, 'year');

			if (entered_date.isBetween(raid_creation_time, last_possible_time)) {
				return true;
			}

			return `Entered time is not valid for raid!${extra_error_message}`;
		}
	}

	parse(value, message, arg) {
		const Raid = require('../app/raid'),
			is_ex_raid = this.isExclusiveRaid(value, message, arg),
			raid_exists = Raid.validRaid(message.message.channel.id),
			raid_creation_time = raid_exists ?
				moment(Raid.getRaid(message.message.channel.id).creation_time) :
				moment(),
			last_possible_time = raid_creation_time.clone().add(is_ex_raid ?
				settings.exclusive_raid_duration :
				settings.default_raid_duration, 'minutes');

		let mode = arg.min, // hacky way to get a preferred mode out of the argument definition
			value_to_parse = value;

		if (!raid_exists && is_ex_raid) {
			mode = 'absolute';
		}

		if (value.trim().match(/^[at|@]/i)) {
			mode = 'absolute';
			value_to_parse = value.substring(2).trim();
		} else if (value.trim().match(/^in/i)) {
			mode = 'relative';
			value_to_parse = value.substring(2).trim();
		}

		if (mode === 'relative') {
			let duration;

			if (value_to_parse.indexOf(':') === -1) {
				duration = moment.duration(value_to_parse * 60 * 1000);
			} else {
				duration = moment.duration(value_to_parse);
			}

			return duration.asMilliseconds();
		} else {
			const entered_date = moment(value_to_parse, ['H:m', 'h:m a', 'M-D H:m', 'M-D H', 'M-D h:m a', 'M-D h a']);

			if (entered_date.isBetween(raid_creation_time, last_possible_time)) {
				return entered_date.diff(moment());
			}

			entered_date.add(1, 'year');

			return entered_date.diff(moment());
		}
	}

	isExclusiveRaid(value, message, arg) {
		const Raid = require('../app/raid'),
			raid_exists = Raid.validRaid(message.message.channel.id);

		if (raid_exists) {
			return Raid.isExclusive(message.message.channel.id);
		} else {
			const Pokemon = require('../app/pokemon'),
				pokemon = Pokemon.search(message.argString.trim().split(' ')[0]);

			return !!pokemon.exclusive;
		}
	}

	static get UNDEFINED_END_TIME() {
		return 'unset';
	}
}

module.exports = TimeType;