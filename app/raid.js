"use strict";

const moment = require('moment');
const settings = require('./../data/settings');

class Raid {
	constructor() {
		// channel maps of raid maps
		this.raids = new Map();

		// users map to last raid id for that user
		this.users = new Map();

		this.raids_counter = 0;

		this.roles = {
			mystic: '',
			valor: '',
			instinct: '',
			admin: '',
			moderator: ''
		};

		// loop to clean up raids every 1 minute
		this.update = setInterval(() => {
			const now = moment();

			this.raids.forEach((raids_map, channel_id, channel_map) => {
				raids_map.forEach((raid, raid_id, raids_map) => {
					const end_time = raid.end_time;

					// if end time exists, is valid, and is in the past, remove raid
					if (end_time.isValid() && now > end_time) {
						raids_map.delete(raid_id);
						return;
					}

					// if end time isn't valid, remove raid
					if (!end_time.isValid()) {
						raids_map.delete(raid_id);

						for (let i = 0; i < raid.attendees.length; i++) {
							this.users.delete(raid.attendees[i].id);
						}
					}
				});
			});
		}, 6000);
	}

	setUserRaidId(member, raid_id) {
		if (raid_id !== 'current') {
			this.users.set(member.id, raid_id);
		}
	}

	createRaid(channel, member, raid_data) {
		let channel_raid_map = this.raids.get(channel.id);
		const id = raid_data.pokemon.name + '-' + this.raids_counter;

		// one time setup for getting role id's by name
		if (!this.roles.mystic) {
			this.roles.mystic = member.guild.roles.find('name', 'Mystic');
		}
		if (!this.roles.valor) {
			this.roles.valor = member.guild.roles.find('name', 'Valor');
		}
		if (!this.roles.instinct) {
			this.roles.instinct = member.guild.roles.find('name', 'Instinct');
		}
		if (!this.roles.admin) {
			this.roles.admin = member.guild.roles.find('name', 'Admin');
		}
		if (!this.roles.moderator) {
			this.roles.moderator = member.guild.roles.find('name', 'Moderator') || member.guild.roles.find('name', 'Mod');
		}

		// add extra data to "member"
		member.additional_attendees = 0;

		// add some extra raid data to remember
		raid_data.id = id;
		raid_data.creation_time = new moment();
		raid_data.end_time = raid_data.creation_time.add(raid_data.end_time, 'minutes');
		raid_data.attendees = [member];
		raid_data.has_arrived = {};

		if (channel_raid_map) {
			channel_raid_map.set(id, raid_data);
		} else {
			channel_raid_map = new Map();
			channel_raid_map.set(id, raid_data);
			this.raids.set(channel.id, channel_raid_map);
		}

		this.raids_counter++;

		this.setUserRaidId(member, id);

		return {raid: raid_data};
	}

	getRaid(channel, member, raid_id) {
		const channel_raid_map = this.raids.get(channel.id);

		// if no channel exists, automatically fail out with undefined status
		if (!channel_raid_map) {
			return;
		}

		// if a raid id doesn't exist, attempt to get the users' last interacted with raid
		if (!raid_id || raid_id === 'current') {
			raid_id = this.users.get(member.id);
		}

		// returns a non-case sensitive raid from map
		return channel_raid_map.get(raid_id.toLowerCase());
	}

	getAllRaids(channel, member) {
		return this.raids.get(channel.id);
	}

	findRaid(channel, member, args) {
		// take every argument given, and filter it down to only raids that exist
		const raids = args
			.map(arg => this.getRaid(channel, member, arg))
			.filter(raid => {
				return !!raid;
			});

		// get first raid in array of found raids
		let raid;
		if (raids.length > 0) {
			raid = raids[0];
		} else {
			// if raid could not be found (likely due to user entering garbage for the raid id),
			//		attempt to get raid from their last interacted with raid
			raid = this.getRaid(channel, member);
		}

		// strip out args that aren't active raids and send back
		const nonRaidArgs = args
			.filter(arg => {
				return !this.getRaid(channel, member, arg);
			});

		// if after all this, a raid still can not be found, return an error message
		if (!raid) {
			return {error: `<@${member.id}> No raid exists for ${args.join(' ')}.`}
		}

		return {raid: raid, args: nonRaidArgs};
	}

	getAttendeeCount(options) {
		let attendees = [];

		// get attendee data via given raid data, or map data in order to find the attendee data
		if (options.raid) {
			attendees = options.raid.attendees;
		} else {
			if (!options.channel || !options.member || isNaN(options.raid_id)) {
				throw ('Need raid data in order to get attendee count.');
			}
			attendees = this.getRaid(options.channel, options.member, options.raid_id).attendees;
		}

		let length = attendees.length;

		for (let i = 0; i < attendees.length; i++) {
			const attendee = attendees[i];
			length += attendee.additional_attendees;
		}

		return length;
	}

	getMessage(channel, member, raid_id) {
		return this.getRaid(channel, member, raid_id).message;
	}

	setMessage(channel, member, raid_id, message) {
		this.getRaid(channel, member, raid_id).message = message;
	}

	addAttendee(channel, member, raid_id, additional_attendees = 0) {
		const raid_data = this.getRaid(channel, member, raid_id);
		let index;

		if (!raid_data) {
			return {error: `<@${member.id}> The raid you entered (${raid_id}) was not found.`}
		}

		// first check if member is already in list, and if they are, ignore their request to join again
		index = raid_data.attendees.findIndex(m => m.id === member.id);

		if (index >= 0) {
			return {error: `<@${member.id}> You\'ve already joined this raid.`}
		}

		// add some additional information to "member" joining the raid
		member.additional_attendees = additional_attendees;

		// message.member.displayName, message.guild
		raid_data.attendees.push(member);

		this.setUserRaidId(member, raid_id);

		return {raid: raid_data};
	}

	removeAttendee(channel, member, raid_id) {
		const raid_data = this.getRaid(channel, member, raid_id);

		// message.member.displayName, message.guild
		const index = raid_data.attendees.findIndex((m) => {
			return m.id === member.id;
		});

		// remove attendee from list of people who have arrived & remove attendee from raid all together
		delete raid_data.has_arrived[raid_data.attendees[index].id];
		raid_data.attendees.splice(index, 1);

		this.setUserRaidId(member, raid_id);

		return {raid: raid_data};
	}

	setArrivalStatus(channel, member, raid_id, status) {
		const raid_data = this.getRaid(channel, member, raid_id);

		raid_data.has_arrived[member.id] = status;

		this.setUserRaidId(member, raid_id);

		return {raid: raid_data};
	}

	setRaidStartTime(channel, member, raid_id, start_time) {
		const raid_data = this.getRaid(channel, member, raid_id);

		raid_data.start_time = start_time;

		this.setUserRaidId(member, raid_id);

		return {raid: raid_data};
	}

	setRaidEndTime(channel, member, raid_id, end_time) {
		const raid_data = this.getRaid(channel, member, raid_id);

		raid_data.end_time = new moment().add(end_time, 'minutes');

		this.setUserRaidId(member, raid_id);

		return {raid: raid_data};
	}

	setRaidLocation(channel, member, raid_id, gym) {
		const raid_data = this.getRaid(channel, member, raid_id);

		raid_data.gym = gym;

		this.setUserRaidId(member, raid_id);

		return {raid: raid_data};
	}


	getShortFormattedMessage(raids_map) {
		if (!raids_map) {
			return 'No raids exist on this channel.  Create one with \`!raid \<pokemon\> \[end time\]\`!';
		}

		const raid_string = [];

		raids_map.forEach((raid, raid_id, raids_map) => {
			const pokemon = raid.pokemon.name.charAt(0).toUpperCase() + raid.pokemon.name.slice(1);
			const total_attendees = this.getAttendeeCount({raid});
			const gym = (raid.gym) ? `Located at ${raid.gym.gymName}` : '';

			raid_string.push(`**__${pokemon}__**`);
			raid_string.push(`${raid_id} raid. ${total_attendees} potential trainer(s). ${gym}\n`);
		});

		return ' ' + raid_string.join('\n');
	}

	getFormattedMessage(raid_data) {
		const pokemon = raid_data.pokemon.name.charAt(0).toUpperCase() + raid_data.pokemon.name.slice(1);
		const tier = (raid_data.pokemon.tier) ? raid_data.pokemon.tier : '????';
		const end_time = (raid_data.end_time) ? raid_data.end_time.format('h:mm a') : '????';
		const total_attendees = this.getAttendeeCount({raid: raid_data});
		const gym = (raid_data.gym) ? raid_data.gym : {gymName: '????'};

		const gym_name = gym.gymName;

		const location = gym_name !== '????' ?
			'https://www.google.com/maps/dir/Current+Location/' + gym.gymInfo.latitude + ',' + gym.gymInfo.longitude :
			undefined;

		// generate string of attendees
		let attendees_list = '';
		for (let i = 0; i < raid_data.attendees.length; i++) {
			let member = raid_data.attendees[i];

			// member list
			attendees_list += '';
			if (((this.roles.admin && member.roles.has(this.roles.admin.id)) ||
					(this.roles.moderator && member.roles.has(this.roles.moderator.id))) && !!raid_data.has_arrived[member.id]) {
				// if member role is admin or moderator, and they have arrived, use "masterball" icon
				attendees_list += '<:MasterBall:347218482078810112>';
			}
			else if (!!raid_data.has_arrived[member.id]) {
				attendees_list += '<:PokeBall:347218482296782849>';
			}
			else {
				attendees_list += '<:PremierBall:347221891263496193>';
			} //◻️, \t\t
			attendees_list += '  ' + member.displayName;

			// show how many additional attendees this user is bringing with them
			if (member.additional_attendees > 0) {
				attendees_list += ' +' + member.additional_attendees;
			}

			// add role emoji indicators if role exists
			if (this.roles.mystic && member.roles.has(this.roles.mystic.id)) {
				attendees_list += ' <:mystic:346183029171159041>';
			} else if (this.roles.valor && member.roles.has(this.roles.valor.id)) {
				attendees_list += ' <:valor:346182738652561408>';
			} else if (this.roles.instinct && member.roles.has(this.roles.instinct.id)) {
				attendees_list += ' <:instinct:346182737566105600>';
			}

			attendees_list += '\n';
		}

		return {
			"embed": {
				"title": `Level ${tier} Raid against ${pokemon}`,
				"description": `Raid available until ${end_time}\n` +
				`Location **${gym_name}**\n\n` +
				`Join this raid by typing the command \`\`\`!join ${raid_data.id}\`\`\`\n\n` +
				`Potential Trainers:\n` +
				`${attendees_list}\n` +
				`Trainers: **${total_attendees} total**\n`,
				"url": (location) ? location : 'https://discordapp.com',
				"color": 4437377,
				"thumbnail": {
					"url": "https://rankedboost.com/wp-content/plugins/ice/pokemon-go/" + pokemon + "-Pokemon-Go.png"
				},
				// "author": {
				// 	"name": "author name",
				// 	"url": "https://discordapp.com",
				// 	"icon_url": "https://cdn.discordapp.com/embed/avatars/0.png"
				// },
				// "fields": [
				// 	{
				// 		"name": raid_data.attendees.length + " will be attending @ " + ((raid_data.start_time)? (raid_data.start_time): '????'),
				// 		"value": attendees_list
				// 	}
				// ],
				// "footer": {
				// 	"text": (raid_data.start_time)? "Raid Begining @ " + raid_data.start_time: "Still determining a start time..."
				// }
			}
		};
	}
}

module.exports = new Raid();
