"use strict";

const Commando = require('discord.js-commando'),
	moment = require('moment'),
	{TimeMode, TimeParameter} = require('../app/constants'),
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
			incubation_duration = is_ex_raid ?
				settings.exclusive_raid_incubate_duration :
				settings.standard_raid_incubate_duration,
			hatched_duration = is_ex_raid ?
				settings.exclusive_raid_hatched_duration :
				settings.standard_raid_hatched_duration;

		let first_possible_time,
			max_duration,
			last_possible_time;

		// Figure out valid first and last possible times for this time
		switch (arg.key) {
			case TimeParameter.START:
				// Start time - valid range is now (or hatch time if it exists, whichever is later)
				// through raid's end time
				const raid = Raid.getRaid(message.channel.id),
					hatch_time = raid ?
						raid.hatch_time :
						undefined,
					end_time = raid ?
						raid.end_time :
						undefined;

				if (hatch_time) {
					const hatch_time_moment = moment(hatch_time);

					first_possible_time = now.isAfter(hatch_time_moment) ?
						now :
						hatch_time_moment;
				} else {
					first_possible_time = now;
				}

				const raid_end_time = end_time ?
					moment(end_time) :
					raid_creation_time.clone().add(incubation_duration + hatched_duration, 'minutes');

				max_duration = incubation_duration + hatched_duration;
				last_possible_time = raid_end_time;
				break;

			case TimeParameter.HATCH: {
				// Hatch time - valid range is up to hatched duration in the past
				// through incubation period past raid creation time
				first_possible_time = now.clone().add(-hatched_duration, 'minutes');
				max_duration = incubation_duration;
				last_possible_time = raid_creation_time.clone().add(max_duration, 'minutes');
				break;
			}

			case TimeParameter.END:
				// End time - valid range is now through incubation plus hatch duration past creation time
				first_possible_time = now;
				max_duration = incubation_duration + hatched_duration;
				last_possible_time = raid_creation_time.clone().add(max_duration, 'minutes');
				break;
		}

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

			if (moment.isDuration(duration) && duration.isValid() && duration.asMinutes() < max_duration) {
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
				this.isValidTime(possible_time, first_possible_time, last_possible_time))) {
			return true;
		}

		const calendar_format = {
				sameDay: 'LT',
				sameElse: 'l LT'
			},
			first_possible_formatted_time = first_possible_time.calendar(null, calendar_format),
			last_possible_formatted_time = last_possible_time.calendar(null, calendar_format);

		return `"${value}" is not valid for this raid - valid time range is between ${first_possible_formatted_time} and ${last_possible_formatted_time}!\n\n${arg.prompt}`;
	}

	parse(value, message, arg) {
		const Raid = require('../app/raid'),
			is_ex_raid = this.isExclusiveRaid(value, message, arg),
			raid_exists = Raid.validRaid(message.channel.id),
			now = moment(),
			raid_creation_time = raid_exists ?
				moment(Raid.getRaid(message.channel.id).creation_time) :
				now,
			incubation_duration = is_ex_raid ?
				settings.exclusive_raid_incubate_duration :
				settings.standard_raid_incubate_duration,
			hatched_duration = is_ex_raid ?
				settings.exclusive_raid_hatched_duration :
				settings.standard_raid_hatched_duration;

		let first_possible_time,
			max_duration,
			last_possible_time;

		// Figure out valid first and last possible times for this time
		switch (arg.key) {
			case TimeParameter.START:
				// Start time - valid range is now (or hatch time if it exists, whichever is later)
				// through raid's end time
				const raid = Raid.getRaid(message.channel.id),
					hatch_time = raid ?
						raid.hatch_time :
						undefined,
					end_time = raid ?
						raid.end_time :
						undefined;

				if (hatch_time) {
					const hatch_time_moment = moment(hatch_time);

					first_possible_time = now.isAfter(hatch_time_moment) ?
						now :
						hatch_time_moment;
				} else {
					first_possible_time = now;
				}

				const raid_end_time = end_time ?
					moment(end_time) :
					raid_creation_time.clone().add(incubation_duration + hatched_duration, 'minutes');

				max_duration = incubation_duration + hatched_duration;
				last_possible_time = raid_end_time;
				break;

			case TimeParameter.HATCH: {
				// Hatch time - valid range is up to hatched duration in the past
				// through incubation period past raid creation time
				first_possible_time = now.clone().add(-hatched_duration, 'minutes');
				max_duration = incubation_duration;
				last_possible_time = raid_creation_time.clone().add(max_duration, 'minutes');
				break;
			}

			case TimeParameter.END:
				// End time - valid range is now through incubation plus hatch duration past creation time
				first_possible_time = now;
				max_duration = incubation_duration + hatched_duration;
				last_possible_time = raid_creation_time.clone().add(max_duration, 'minutes');
				break;
		}

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

			if (moment.isDuration(duration) && duration.isValid() && duration.asMinutes() < max_duration) {
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
			this.isValidTime(possible_time, first_possible_time, last_possible_time)).valueOf();
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

		possible_dates.push(possible_date);

		// try next year to allow for year wrap
		possible_dates.push(possible_date.clone()
			.year(possible_date.year() + 1));

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

	isValidTime(date_to_check, first_possible_time, last_possible_time) {
		return date_to_check.isBetween(first_possible_time, last_possible_time, undefined, '[]');
	}

	static get UNDEFINED_END_TIME() {
		return 'unset';
	}
}

module.exports = TimeType;