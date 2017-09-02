"use strict";

const moment = require('moment'),
	settings = require('./../data/settings'),
	EndTimeType = require('../types/time');

class Raid {
	constructor() {
		// maps channel ids to raid info for that channel
		this.raids = new Map();

		// maps raid deletion times to their channels
		this.raids_to_delete = new Map();

		this.roles = {
			mystic: '',
			valor: '',
			instinct: '',
			admin: '',
			moderator: ''
		};

		// loop to clean up raids periodically
		this.update = setInterval(() => {
			const now = moment(),
				deletion_time = now.clone().add(settings.deletion_warning_time, 'minutes');

			this.raids.forEach((raid, channel_id, raids) => {
				const end_time = raid.end_time,
					last_possible_time = raid.last_possible_time;

				// if end time exists, is valid, and is in the past, schedule raid deletion
				if (((end_time !== EndTimeType.UNDEFINED_END_TIME && now > end_time) || now > last_possible_time) &&
					!this.raids_to_delete.has(raid)) {
					this.raids_to_delete.set(raid, deletion_time);
					raid.channel.send('***WARNING*** - this channel will be deleted automatically at ' + deletion_time.format('h:mm a') + '!')
						.catch(err => console.log(err));
				}
			});

			Array.from(this.raids_to_delete.entries())
				.filter(entry => {
					return now > entry[1];
				})
				.forEach(entry => {
					const raid = entry[0],
						channel = raid.channel;

					this.raids.delete(channel.id);
					this.raids_to_delete.delete(raid);

					raid.announcement_message.delete()
						.catch(err => console.log(err));

					channel.delete()
						.catch(err => console.log(err));
				});
		}, settings.cleanup_interval);
	}

	async cleanupAllRaids() {
		console.log('Deleting all channels and messages...');

		const raids = this.raids.values(),
			promises = Array.of();

		Array.from(raids).forEach(raid => {
			console.log('Deleting announcement message for ' + raid.id);

			promises.push(raid.announcement_message.delete());

			console.log('Deleting channel for raid ' + raid.id);
			promises.push(raid.channel.delete());
		});

		await Promise.all(promises)
			.then(() => this.client.destroy())
			.catch(err => console.log(err));

		return '...done';
	}

	setClient(client) {
		this.client = client;
	}

	createRaid(channel, member, raid_data) {
		const id = Raid.generateChannelName(raid_data);

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
		raid_data.additional_attendees = Object.create(null);
		raid_data.additional_attendees[member.id] = 0;

		// add some extra raid data to remember
		raid_data.id = id;
		raid_data.source_channel = channel;
		raid_data.creation_time = moment();
		raid_data.last_possible_time = raid_data.creation_time.clone().add(settings.default_raid_length, 'minutes');
		if (raid_data.end_time !== EndTimeType.UNDEFINED_END_TIME) {
			raid_data.end_time = raid_data.creation_time.clone().add(raid_data.end_time, 'minutes');
		}
		raid_data.attendees = [member];
		raid_data.has_arrived = {};

		return channel.clone(id, true, false)
			.then(new_channel => {
				raid_data.channel = new_channel;
				this.raids.set(new_channel.id, raid_data);
				return {raid: raid_data};
			});
	}

	validRaid(channel) {
		return this.raids.has(channel.id);
	}

	getRaid(channel) {
		return this.raids.get(channel.id);
	}

	getAllRaids(channel) {
		return Array.from(this.raids.values())
			.filter(raid => raid.source_channel === channel);
	}

	getAttendeeCount(options) {
		let attendees = [];

		// get attendee data via given raid data, or map data in order to find the attendee data
		if (options.raid) {
			attendees = options.raid.attendees;
		} else {
			if (!options.channel) {
				throw ('Need raid data in order to get attendee count.');
			}
			attendees = this.getRaid(options.channel).attendees;
		}

		let length = attendees.length;

		for (let i = 0; i < attendees.length; i++) {
			const attendee = attendees[i];
			length += options.raid.additional_attendees[attendee.id];
		}

		return length;
	}

	setAnnouncementMessage(channel, message) {
		const raid = this.getRaid(channel);

		if (!raid) {
			return;
		}

		raid.announcement_message = message;

		return message.pin();
	}

	addMessage(channel, message, pin = false) {
		const raid = this.getRaid(channel);

		if (!raid) {
			return;
		}

		if (!raid.messages) {
			raid.messages = [];
		}

		raid.messages.push(message);

		if (pin) {
			return message.pin();
		}
	}

	addAttendee(channel, member, additional_attendees) {
		const raid_data = this.getRaid(channel),
			// first check if member is already in list, don't join again if they already have
			index = raid_data.attendees.findIndex(m => m.id === member.id);

		// add some additional information to "member" joining the raid
		raid_data.additional_attendees[member.id] = additional_attendees;

		if (index < 0) {
			raid_data.attendees.push(member);
		}

		return {raid: raid_data};
	}

	removeAttendee(channel, member) {
		const raid_data = this.getRaid(channel);

		const index = raid_data.attendees.findIndex((m) => {
			return m.id === member.id;
		});

		if (index < 0) {
			return {error: 'You are not signed up for this raid.'};
		}

		// remove attendee from list of people who have arrived & remove attendee from raid all together
		delete raid_data.has_arrived[raid_data.attendees[index].id];
		delete raid_data.additional_attendees[raid_data.attendees[index].id];
		raid_data.attendees.splice(index, 1);

		return {raid: raid_data};
	}

	setArrivalStatus(channel, member, status) {
		const raid_data = this.getRaid(channel);

		raid_data.has_arrived[member.id] = status;

		return {raid: raid_data};
	}

	setRaidStartTime(channel, start_time) {
		const raid_data = this.getRaid(channel);

		raid_data.start_time = moment().add(start_time, 'minutes');

		return {raid: raid_data};
	}

	setRaidEndTime(channel, end_time) {
		const raid_data = this.getRaid(channel);

		raid_data.end_time = moment().add(end_time, 'minutes');

		return {raid: raid_data};
	}

	setRaidPokemon(channel, pokemon) {
		const raid_data = this.getRaid(channel);
		raid_data.pokemon = pokemon;

		channel.setName(Raid.generateChannelName(raid_data))
			.catch(err => console.log(err));

		return {raid: raid_data};
	}

	setRaidLocation(channel, gym) {
		const raid_data = this.getRaid(channel);
		raid_data.gym = gym;

		channel.setName(Raid.generateChannelName(raid_data))
			.catch(err => console.log(err));

		return {raid: raid_data};
	}

	getRaidsFormattedMessage(channel) {
		const raids = this.getAllRaids(channel);

		if (!raids || raids.length === 0) {
			return 'No raids exist for this channel.  Create one with \`!raid \<pokemon\> \'\<location\>\'\`!';
		}

		const raid_string = [];

		raids.forEach(raid => {
			raid_string.push(this.getRaidShortMessage(raid));
		});

		return ' ' + raid_string.join('\n');
	}

	getRaidShortMessage(raid) {
		const pokemon = raid.pokemon.name ?
			raid.pokemon.name.charAt(0).toUpperCase() + raid.pokemon.name.slice(1) :
			'????',
			start_time = (raid.start_time) ? `starting at ${raid.start_time}` : 'start time to be announced',
			total_attendees = this.getAttendeeCount({raid}),
			gym = (raid.gym) ? ` Located at ${raid.gym.gymName}` : '';

		return `**__${pokemon}__**\n` +
			`<#${raid.channel.id}> raid ${start_time}. ${total_attendees} potential trainer(s).${gym}\n`;
	}

	getRaidChannelMessage(raid) {
		return `Use <#${raid.channel.id}> for the following raid:`;
	}

	getRaidSourceChannelMessage(raid) {
		return `Use <#${raid.source_channel.id}> to return to this raid\'s regional channel.`;
	}

	getFormattedMessage(raid_data) {
		const pokemon = raid_data.pokemon.name ?
			raid_data.pokemon.name.charAt(0).toUpperCase() + raid_data.pokemon.name.slice(1) :
			'????',
			tier = raid_data.pokemon.tier,
			end_time = raid_data.end_time !== EndTimeType.UNDEFINED_END_TIME ?
				raid_data.end_time.format('h:mm a') :
				'????',
			start_time = raid_data.start_time ?
				raid_data.start_time.format('h:mm a') :
				'????',
			total_attendees = this.getAttendeeCount({raid: raid_data}),
			gym = raid_data.gym,
			gym_name = gym.nickname ?
				gym.nickname :
				gym.gymName,
			location = 'https://www.google.com/maps/dir/Current+Location/' + gym.gymInfo.latitude + ',' + gym.gymInfo.longitude,
			additional_information = gym.additional_information ?
				`\n\n**Location Notes**:\n${gym.additional_information}` :
				'';

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
			}
			attendees_list += '  ' + member.displayName;

			// show how many additional attendees this user is bringing with them
			if (raid_data.additional_attendees[member.id] > 0) {
				attendees_list += ' +' + raid_data.additional_attendees[member.id];
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
				`Potential Trainers:\n` +
				`${attendees_list}\n` +
				`Trainers: **${total_attendees} total**\n` +
				`Starting @ **${start_time}**` +
				`${additional_information}`,
				"url": location,
				"color": 4437377,
				"thumbnail": {
					"url": "https://rankedboost.com/wp-content/plugins/ice/pokemon-go/" + pokemon + "-Pokemon-Go.png"
				},
				"provider": {
					"name": gym_name,
					"url": location
				}
			}
		};
	}

	refreshStatusMessages(raid_data) {
		raid_data.announcement_message
			.edit(this.getRaidChannelMessage(raid_data), this.getFormattedMessage(raid_data))
			.catch(err => console.log(err));

		raid_data.messages
			.forEach(message =>
				message.edit(this.getRaidSourceChannelMessage(raid_data), this.getFormattedMessage(raid_data))
					.catch(err => console.log(err)));
	}

	raidExistsForGym(gym) {
		return this.raids.size > 0 && Array.from(this.raids.values())
			.map(raid => raid.gym.gymId)
			.filter(raid_gym_id => raid_gym_id === gym.gymId)
			.length > 0;
	}

	getCreationChannelName(channel) {
		const raid = this.getRaid(channel);

		return raid ?
			raid.source_channel.name :
			channel.name;
	}

	static generateChannelName(raid_data) {
		const nonCharCleaner = new RegExp(/[^\w]/, 'g'),
			pokemon_name = (raid_data.pokemon.name ?
				raid_data.pokemon.name :
				('tier ' + raid_data.pokemon.tier))
				.replace(nonCharCleaner, ' ')
				.split(' ')
				.filter(token => token.length > 0)
				.join('-'),
			gym_name = (raid_data.gym.nickname ?
				raid_data.gym.nickname :
				raid_data.gym.gymName).toLowerCase()
				.replace(nonCharCleaner, ' ')
				.split(' ')
				.filter(token => token.length > 0)
				.join('-');

		return pokemon_name + '-' + gym_name;
	}
}

module.exports = new Raid();

