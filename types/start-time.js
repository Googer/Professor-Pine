"use strict";

const Commando = require('discord.js-commando'),
	Raid = require('../app/raid'),
	moment = require('moment');

class StartTimeType extends Commando.ArgumentType {
	constructor(client) {
		super(client, 'starttime');
	}

	validate(value, message, arg) {
		const now = moment();

		let times = value.match(/([0-9]{1,2}:[0-9]{1,2}(\s?([pa])m)?)|([0-9]\sh(ours?),?\s?(and\s)?[0-9]{1,2}\sminutes?)|([0-9]\s?h?,?\s?[0-9]{1,2}\s?m?)|([0-9]\s?(h(ours?)?|m(inutes?)?))/gi),
			time, hours, minutes;

		// I'm terrible with regex, but if a time can't be found, check for a number which might represent time
		if (!times) {
			times = value.match(/\b[0-9](\s?([pa])m)?\b/gi);
		}

		if (!times) {
			message.reply('Time could not be determined, please try something like 5:20pm');
			return false;
		}

		// check if am/pm was given on time, which indicates that the user has given an exact time themselves, nothing further is needed
		if (times[0].search(/([ap])m/i) >= 0) {
			const moment_time = new moment(times[0]);

			if (moment_time <= now) {
				message.reply('Please enter a raid start time in the future.');
				return false;
			}

			time = moment_time;
		} else if (times[0].search(/:/) >= 0) {
			// special scenario if the user entered a time like "1:20" without am/pm or at least it couldn't be found via regex
			//		need to figure out whether it should be am or pm based on current time
			[hours, minutes] = times[0].split(':');
			hours = parseInt(hours);
			minutes = parseInt(minutes);

			const possible_time_1 = now.clone().set({hours, minutes}),
				possible_time_2 = now.clone().set({hours: hours + 12, minutes}),

				diff_time_1 = possible_time_1.diff(now),
				diff_time_2 = possible_time_2.diff(now);

			// if time is greater than 3 hours, the user likely entered incorrect information
			if (diff_time_1 / 3600000 > 3 || diff_time_2 / 3600000 > 3) {
				message.reply('Please enter a raid start time that is within 3 hours and looks something like `2:00pm`.');
				return false;
			}

			if (diff_time_1 >= 0) {
				time = possible_time_1;
			} else if (diff_time_2 >= 0) {
				time = possible_time_2;
			} else {
				message.reply('Please enter a raid start time in the future.');
				return false;
			}
		} else {
			// user has not given a time, but rather time remaining, so need to calculate time based off current time + time remaining
			[hours, minutes] = times[0].match(/[0-9]{1,2}/g);
			hours = parseInt(hours);
			minutes = parseInt(minutes);

			// if only 1 number given (no available minutes), need to figure out if that number is minutes or hours
			//		default is hours per how regex works
			if (!minutes) {// && times[0].search(/m(inutes?)?/i) >= 0) {
				minutes = hours;
				hours = 0;
			}

			time = now.clone().add({hours, minutes});
		}

		const raid = Raid.getRaid(message.channel);

		// if end time exists, check to make sure start time entered is before the end time
		if (!!raid.end_time && time > raid.end_time) {
			message.reply('Please enter a start time that is before the end time of the raid.');
			return false;
		}

		return true;
	}

	parse(value, message, arg) {
		const now = moment();

		let times = value.match(/([0-9]{1,2}:[0-9]{1,2}(\s?([pa])m)?)|([0-9]\sh(ours?),?\s?(and\s)?[0-9]{1,2}\sminutes?)|([0-9]\s?h?,?\s?[0-9]{1,2}\s?m?)|([0-9]\s?(h(ours?)?|m(inutes?)?))/gi),
			time, hours, minutes;

		// I'm terrible with regex, but if a time can't be found, check for a number which might represent time
		if (!times) {
			times = value.match(/\b[0-9](\s?([pa])m)?\b/gi);
		}

		// check if am/pm was given on time, which indicates that the user has given an exact time themselves, nothing further is needed
		if (times[0].search(/([ap])m/i) >= 0) {
			const moment_time = new moment(times[0]);

			time = moment_time;
		} else if (times[0].search(/:/) >= 0) {
			// special scenario if the user entered a time like "1:20" without am/pm or at least it couldn't be found via regex
			//		need to figure out whether it should be am or pm based on current time
			[hours, minutes] = times[0].split(':');
			hours = parseInt(hours);
			minutes = parseInt(minutes);

			const possible_time_1 = now.clone().set({hours, minutes}),
				possible_time_2 = now.clone().set({hours: hours + 12, minutes}),

				diff_time_1 = possible_time_1.diff(now),
				diff_time_2 = possible_time_2.diff(now);

			if (diff_time_1 >= 0) {
				time = possible_time_1;
			} else if (diff_time_2 >= 0) {
				time = possible_time_2;
			}
		} else {
			// user has not given a time, but rather time remaining, so need to calculate time based off current time + time remaining
			[hours, minutes] = times[0].match(/[0-9]{1,2}/g);
			hours = parseInt(hours);
			minutes = parseInt(minutes);

			// if only 1 number given (no available minutes), need to figure out if that number is minutes or hours
			//		default is hours per how regex works
			if (!minutes) {// && times[0].search(/m(inutes?)?/i) >= 0) {
				minutes = hours;
				hours = 0;
			}

			time = now.clone().add({hours, minutes});
		}

		return time;
	}
}

module.exports = StartTimeType;