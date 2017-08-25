"use strict";

const moment = require('moment');
const Commando = require('discord.js-commando');
const Raid = require('../../app/raid');

class StartTimeCommand extends Commando.Command {
	constructor(client) {
		super(client, {
			name: 'start-time',
			group: 'raids',
			memberName: 'start-time',
			aliases: ['start', 'starts'],
			description: 'Set the time the raid will begin.',
			details: '?????',
			examples: ['\t!start lugia-0 2:20pm', '\t!start-time 2:20pm lugia-0'],
			argsType: 'multiple'
		});
	}

	run(message, args) {
		if (message.channel.type !== 'text') {
			message.reply('Please set time for a raid from a public channel.');
			return;
		}

		const raid = Raid.findRaid(message.channel, message.member, args);

		if (!raid.raid) {
			message.reply('Please enter a raid id which can be found on the raid post.  If you do not know the id you can ask for a list of raids in your area via `!status`.');
			return;
		}

		const string = raid.args.join(' ');
		const now = moment();
		let times = string.match(/([0-9]{1,2}\:[0-9]{1,2}(\s?([pa])m)?)|([0-9]\sh(ours?),?\s?(and\s)?[0-9]{1,2}\sminutes?)|([0-9]\s?h?,?\s?[0-9]{1,2}\s?m?)|([0-9]\s?(h(ours?)?|m(inutes?)?))/g);
		let time, hours, minutes;

		// I'm terrible with regex, but if a time can't be found, check for a number which might represent time
		if (!times) {
			times = string.match(/\b[0-9](\s?([pa])m)?\b/g);
		}

		if (!times) {
			message.reply('Time could not be determined, please try something like 5:20pm');
			return;
		}

		// check if am/pm was given on time, which indicates that the user has given an exact time themselves, nothing further is needed
		if (times[0].search(/([ap])m/) >= 0) {
			const moment_time = new moment(times[0], 'h:mm:ss a');

			if (moment_time <= now) {
				message.reply('Please enter a raid start time in the future.');
				return;
			}

			time = moment_time.format('h:mma');
		} else if (times[0].search(/\:/) >= 0) {
			// special scenario if the user entered a time like "1:20" without am/pm or at least it couldn't be found via regex
			//		need to figure out whether it should be am or pm based on current time
			let possible_time_1, possible_time_2;
			let diff_time_1, diff_time_2;
			let am_or_pm = '';

			[hours, minutes] = times[0].split(':');
			hours = parseInt(hours);
			minutes = parseInt(minutes);

			possible_time_1 = moment().set({hours, minutes});
			possible_time_2 = moment().set({hours: hours + 12, minutes});

			diff_time_1 = possible_time_1.diff(now);
			diff_time_2 = possible_time_2.diff(now);

			// if time is greater than 3 hours, the user likely entered incorrect information
			if (diff_time_1 / 3600000 > 3 || diff_time_2 / 3600000 > 3) {
				message.reply('Please enter a raid start time that is within 3 hours and looks something like `2:00pm`.');
				return;
			}

			if (diff_time_1 >= 0) {
				am_or_pm = possible_time_1.format('a');
			} else if (diff_time_2 >= 0) {
				am_or_pm = possible_time_2.format('a');
			} else {
				message.reply('Please enter a raid start time in the future.');
				return;
			}

			time = times[0].trim() + am_or_pm;
		} else {
			// user has not given a time, but rather time remaining, so need to calculate time based off current time + time remaining
			[hours, minutes] = times[0].match(/[0-9]{1,2}/g);
			hours = parseInt(hours);
			minutes = parseInt(minutes);

			// if only 1 number given (no available minutes), need to figure out if that number is minutes or hours
			//		default is hours per how regex works
			if (!minutes && times[0].search(/m(inutes?)?/) >= 0) {
				minutes = hours;
				hours = 0;
			}

			time = moment(Date.now()).add({hours, minutes}).format('h:mma');
		}


		// if end time exists, check to make sure start time entered is before the end time
		if (!!raid.raid.end_time) {
			if (new moment(time, 'h:mm:ss a') > new moment(raid.raid.end_time, 'h:mm:ss a')) {
				message.reply('Please enter a start time that is before the end time of the raid.');
				return;
			}
		}

		const info = Raid.setRaidStartTime(message.channel, message.member, raid.raid.id, time);
		let total_attendees = Raid.getAttendeeCount({raid: info.raid});

		// notify all attendees that a time has been set
		for (let i = 0; i < info.raid.attendees.length; i++) {
			let member = info.raid.attendees[i];

			// no reason to spam the person who set the time, telling them the time being set haha
			if (member.id !== message.member.id) {
				member.send(`A start time has been set for **${info.raid.id}** @ **${info.raid.start_time}**. There are currently **${total_attendees}** Trainer(s) attending!`);
			}
		}

		// post a new raid message and replace/forget old bot message
		message.channel.send(Raid.getFormattedMessage(info.raid)).then((bot_message) => {
			Raid.setMessage(message.channel, message.member, info.raid.id, bot_message);
		});
	}
}

module.exports = StartTimeCommand;
