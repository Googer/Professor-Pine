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
			'',
			Raid = require('../app/raid'),
			is_ex_raid = this.isExclusiveRaid(value, message, arg),
			raid_exists = Raid.validRaid(message.message.channel.id),
			now = moment(),
			raid_creation_time = raid_exists ?
				moment(Raid.getRaid(message.message.channel.id).creation_time) :
				now,
			last_possible_time = raid_creation_time.clone().add(is_ex_raid ?
				settings.exclusive_raid_duration :
				settings.default_raid_duration, 'minutes');

		let mode = arg.min, // hacky way to get a preferred mode out of the argument definition
			value_to_parse = value.trim();

		if (!raid_exists && is_ex_raid) {
			mode = 'absolute';
		}

		if (value_to_parse.match(/^[at|@]/i)) {
			mode = 'absolute';
			value_to_parse = value_to_parse.substring(2).trim();
		} else if (value_to_parse.match(/^in/i)) {
			mode = 'relative';
			value_to_parse = value_to_parse.substring(2).trim();
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

			if (this.isValidTime(moment().add(duration), now, raid_creation_time, last_possible_time)) {
				return true;
			}

			return `Entered time is not valid for raid.${extra_error_message}`;
		} else {
			const entered_date = moment(value_to_parse, ['hmm a', 'Hmm', 'h:m a', 'H:m', 'M-D hmm a', 'M-D Hmm', 'M-D h:m a', 'M-D H:m', 'M-D h a', 'M-D H']);

			if (!entered_date.isValid()) {
				return `Please enter a date in the form \`MM-dd HH:mm\` (month and day optional).${extra_error_message}`;
			}

			const possible_times = TimeType.generateTimes(entered_date);

			if (possible_times.find(possible_time =>
					this.isValidTime(possible_time, now, raid_creation_time, last_possible_time))) {
				return true;
			}

			return `Entered time is not valid for raid!${extra_error_message}`;
		}
	}

	parse(value, message, arg) {
		const Raid = require('../app/raid'),
			is_ex_raid = this.isExclusiveRaid(value, message, arg),
			raid_exists = Raid.validRaid(message.message.channel.id),
			now = moment(),
			raid_creation_time = raid_exists ?
				moment(Raid.getRaid(message.message.channel.id).creation_time) :
				now,
			last_possible_time = raid_creation_time.clone().add(is_ex_raid ?
				settings.exclusive_raid_duration :
				settings.default_raid_duration, 'minutes');

		let mode = arg.min, // hacky way to get a preferred mode out of the argument definition
			value_to_parse = value.trim();

		if (!raid_exists && is_ex_raid) {
			mode = 'absolute';
		}

		if (value_to_parse.match(/^[at|@]/i)) {
			mode = 'absolute';
			value_to_parse = value_to_parse.substring(2).trim();
		} else if (value_to_parse.match(/^in/i)) {
			mode = 'relative';
			value_to_parse = value_to_parse.substring(2).trim();
		}

		if (mode === 'relative') {
			let duration;

			if (value_to_parse.indexOf(':') === -1) {
				duration = moment.duration(value_to_parse * 60 * 1000);
			} else {
				duration = moment.duration(value_to_parse);
			}

			return now.add(duration).valueOf();
		} else {
			const entered_date = moment(value_to_parse, ['hmm a', 'Hmm', 'h:m a', 'H:m', 'M-D hmm a', 'M-D Hmm', 'M-D h:m a', 'M-D H:m', 'M-D h a', 'M-D H']),
				possible_times = TimeType.generateTimes(entered_date),
				actual_time = possible_times.find(possible_time =>
					this.isValidTime(possible_time, now, raid_creation_time, last_possible_time));

			return actual_time.valueOf();
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

			return !!pokemon && !!pokemon.exclusive;
		}
	}

	static generateTimes(possible_date) {
		const possible_dates = [possible_date],
			ambiguously_am = possible_date.hour() < 12 &&
				!possible_date.creationData().format.endsWith('a');

		if (ambiguously_am) {
			// try pm time as well
			possible_dates.push(possible_date.clone()
				.hour(possible_date.hour() + 12));
		}

		// try next year to allow for year wrap
		possible_dates.push(possible_date.clone()
			.year(possible_date.year() + 1));

		if (ambiguously_am) {
			// try next year pm time as well
			possible_dates.push(possible_date.clone()
				.hour(possible_date.hour() + 12)
				.year(possible_date.year() + 1));
		}

		return possible_dates;
	}

	isValidTime(date_to_check, current_time, raid_creation_time, last_possible_time) {
		// TODO items:
		// 1. if this is a start time, verify it's before end time for raid if that's set
		return date_to_check.isSameOrAfter(current_time) &&
			date_to_check.isBetween(raid_creation_time, last_possible_time, undefined, '[]') &&
			date_to_check.hours() >= settings.min_raid_hour && date_to_check.hours() < settings.max_raid_hour;
	}

	static get UNDEFINED_END_TIME() {
		return 'unset';
	}
}

module.exports = TimeType;