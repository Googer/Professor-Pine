"use strict";

const Commando = require('discord.js-commando'),
	moment = require('moment'),
	{TimeMode} = require('../app/constants'),
	settings = require('../data/settings.json');

class TimeType extends Commando.ArgumentType {
	constructor(client) {
		super(client, 'time');
	}

	validate(value, message, arg) {
		const Raid = require('../app/raid'),
			is_ex_raid = this.isExclusiveRaid(value, message, arg),
			raid_exists = Raid.validRaid(message.channel.id),
			now = moment(),
			raid_creation_time = raid_exists ?
				moment(Raid.getRaid(message.channel.id).creation_time) :
				now,
			hatched_duration = is_ex_raid ?
				settings.exclusive_raid_hatched_duration :
				settings.standard_raid_hatched_duration,
			last_possible_time = raid_creation_time.clone().add(is_ex_raid ?
				settings.exclusive_raid_duration :
				settings.default_raid_duration, 'minutes');

		let value_to_parse = value.trim(),
			possible_times = [],
			time_mode = TimeMode.AUTODETECT;

		if (value_to_parse.match(/^in/i)) {
			value_to_parse = value_to_parse.substring(2).trim();
			time_mode = TimeMode.RELATIVE;
		} else if (value_to_parse.match(/^at/i)) {
			value_to_parse = value_to_parse.substring(2).trim();
			time_mode = TimeMode.ABSOLUTE;
		}

		if (time_mode !== TimeMode.ABSOLUTE) {
			let duration;

			if (value_to_parse.indexOf(':') === -1) {
				duration = moment.duration(Number.parseInt(value_to_parse), 'minutes');
			} else {
				const any_duration = value_to_parse.split(':')
					.map(part => Number.parseInt(part))
					.find(number => number !== 0) !== undefined;

				if (any_duration) {
					duration = moment.duration(value_to_parse);

					if (duration.isValid() && duration.asMilliseconds() === 0) {
						// set to invalid duration
						duration = moment.duration.invalid();
					}
				} else {
					duration = moment.duration(0);
				}
			}

			if (moment.isDuration(duration) && duration.isValid() && duration.asMinutes() < hatched_duration) {
				possible_times.push(now.clone().add(duration));
			}
		}

		if (time_mode !== TimeMode.RELATIVE) {
			const entered_date = moment(value_to_parse, ['hmm a', 'Hmm', 'h:m a', 'H:m', 'M-D hmm a', 'M-D Hmm', 'M-D h:m a', 'M-D H:m', 'M-D h a', 'M-D H']);

			if (entered_date.isValid()) {
				possible_times.push(...TimeType.generateTimes(entered_date));
			}
		}

		if (possible_times.length === 0) {
			return `"${value}" is not a valid duration or time!\n\n${arg.prompt}`;
		}

		if (possible_times.find(possible_time =>
				this.isValidTime(possible_time, now, raid_creation_time, last_possible_time))) {
			return true;
		}

		return `"${value}" is not valid for this raid!\n\n${arg.prompt}`;
	}

	parse(value, message, arg) {
		const Raid = require('../app/raid'),
			is_ex_raid = this.isExclusiveRaid(value, message, arg),
			raid_exists = Raid.validRaid(message.channel.id),
			now = moment(),
			raid_creation_time = raid_exists ?
				moment(Raid.getRaid(message.channel.id).creation_time) :
				now,
			hatched_duration = is_ex_raid ?
				settings.exclusive_raid_hatched_duration :
				settings.standard_raid_hatched_duration,
			last_possible_time = raid_creation_time.clone().add(is_ex_raid ?
				settings.exclusive_raid_duration :
				settings.default_raid_duration, 'minutes');

		let value_to_parse = value.trim(),
			possible_times = [],
			time_mode = TimeMode.AUTODETECT;

		if (value_to_parse.match(/^in/i)) {
			value_to_parse = value_to_parse.substring(2).trim();
			time_mode = TimeMode.RELATIVE;
		} else if (value_to_parse.match(/^at/i)) {
			value_to_parse = value_to_parse.substring(2).trim();
			time_mode = TimeMode.ABSOLUTE;
		}

		if (time_mode !== TimeMode.ABSOLUTE) {
			let duration;

			if (value_to_parse.indexOf(':') === -1) {
				duration = moment.duration(Number.parseInt(value_to_parse), 'minutes');
			} else {
				const any_duration = value_to_parse.split(':')
					.map(part => Number.parseInt(part))
					.find(number => number !== 0) !== undefined;

				if (any_duration) {
					duration = moment.duration(value_to_parse);

					if (duration.isValid() && duration.asMilliseconds() === 0) {
						// set to invalid duration
						duration = moment.duration.invalid();
					}
				} else {
					duration = moment.duration(0);
				}
			}

			if (moment.isDuration(duration) && duration.isValid() && duration.asMinutes() < hatched_duration) {
				possible_times.push(now.clone().add(duration));
			}
		}

		if (time_mode !== TimeMode.RELATIVE) {
			const entered_date = moment(value_to_parse, ['hmm a', 'Hmm', 'h:m a', 'H:m', 'M-D hmm a', 'M-D Hmm', 'M-D h:m a', 'M-D H:m', 'M-D h a', 'M-D H']);

			if (entered_date.isValid()) {
				possible_times.push(...TimeType.generateTimes(entered_date));
			}
		}

		return possible_times.find(possible_time =>
			this.isValidTime(possible_time, now, raid_creation_time, last_possible_time)).valueOf();
	}

	isExclusiveRaid(value, message, arg) {
		// first check is message has is_exclusive set - the create command embeds it in the
		// CommandMessage for the sole purpose of checking it here from outside the raid channel
		return message.is_exclusive !== undefined ?
			message.is_exclusive :
			require('../app/raid').isExclusive(message.channel.id);
	}

	static generateTimes(possible_date) {
		const possible_dates = [],
			date_format = possible_date.creationData().format,
			hour = possible_date.hour(),
			ambiguously_am = hour < 12 && !date_format.endsWith('a');

		if (hour > settings.default_raid_duration / 60) {
			possible_dates.push(possible_date);

			// try next year to allow for year wrap
			possible_dates.push(possible_date.clone()
				.year(possible_date.year() + 1));
		}

		if (ambiguously_am) {
			// try pm time as well
			possible_dates.push(possible_date.clone()
				.hour(possible_date.hour() + 12));

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