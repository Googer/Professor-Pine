"use strict";

const moment = require('moment'),
	settings = require('./../data/settings'),
	EndTimeType = require('../types/time');

class Raid {
	constructor() {
		// maps channel ids to raid info for that channel
		this.raids = Object.create(null);

		// cache of roles, populated on client login
		this.roles = Object.create(null);

		// cache of channel id's to actual channels
		this.channels = new Map();

		// cache of member id's to actual members
		this.members = new Map();

		// cache of channel + message id's to actual messages
		this.messages = new Map();

		// loop to clean up raids periodically
		this.update = setInterval(() => {
			const now = moment().valueOf(),
				deletion_time = now + (settings.deletion_warning_time * 60 * 1000);

			Object.entries(this.raids)
				.forEach(([channel_id, raid]) => {
					if (((raid.end_time !== EndTimeType.UNDEFINED_END_TIME && now > raid.end_time) || now > raid.last_possible_time) &&
						!raid.deletion_time) {
						// raid's end time is set and in the past or its last possible time has passed,
						// so schedule its deletion and send a warning message saying raid channel will
						// be deleted
						raid.deletion_time = deletion_time;
						this.getChannel(raid.channel_id)
							.send('***WARNING*** - this channel will be deleted automatically at ' + moment(deletion_time).format('h:mm a') + '!')
							.catch(err => console.log(err));
					} else if (raid.deletion_time && (now > raid.deletion_time)) {
						// actually delete the channel and announcement message
						const channel_id = raid.channel_id;

						this.getMessage(raid.announcement_message.channel_id, raid.announcement_message.message_id, false)
							.then(message => message.delete())
							.catch(err => console.log(err));

						this.getChannel(channel_id, false).delete()
							.catch(err => console.log(err));

						// clean message and channels caches
						raid.messages.forEach(message_cache_id => this.messages.delete(message_cache_id));
						this.channels.delete(channel_id);

						delete this.raids[channel_id];
					}
				});
		}, settings.cleanup_interval);
	}

	async getMember(member_id, cache) {
		if (this.members.has(member_id)) {
			return new Promise(() => this.members.get(member_id));
		}

		return this.guild.fetchMember(member_id)
			.then(member => {
				if (cache) {
					this.members.set(member_id, member)
				}
				return member;
			})
	}

	getChannel(channel_id, cache) {
		if (this.channels.has(channel_id)) {
			return this.channels.get(channel_id);
		}

		if (cache) {
			this.channels.set(channel_id, this.guild.channels.get(channel_id));
		}
		return this.guild.channels.get(channel_id);
	}

	async getMessage(channel_id, message_id, cache = true) {
		const message_cache_id = {channel_id: channel_id, message_id: message_id};

		if (this.messages.has(message_cache_id)) {
			return new Promise(() => this.messages.get(message_cache_id));
		}

		return this.getChannel(channel_id, cache)
			.fetchMessage(message_id)
			.then(message => {
				if (cache) {
					this.messages.set(message_cache_id, message);
				}

				return message;
			});
	}

	async cleanupAllRaids() {
		console.log('Deleting all channels and messages...');

		const raids = Object.values(this.raids),
			promises = Array.of();

		raids.forEach(raid => {
			console.log('Deleting announcement message for ' + raid.channel_name);
			promises.push(this.getMessage(raid.announcement_message.channel_id, raid.announcement_message.message_id, false)
				.then(message => message.delete()));

			console.log('Deleting channel for raid ' + raid.channel_name);
			promises.push(this.getChannel(raid.channel_id, false).delete());
		});

		await Promise.all(promises)
			.then(() => this.client.destroy())
			.catch(err => console.log(err));

		return '...done';
	}

	setClient(client, guild) {
		this.client = client;
		this.guild = guild;

		this.roles.mystic = guild.roles.find('name', 'Mystic');
		this.roles.valor = guild.roles.find('name', 'Valor');
		this.roles.instinct = guild.roles.find('name', 'Instinct');
		this.roles.admin = guild.roles.find('name', 'Admin');
		this.roles.moderator = guild.roles.find('name', 'Moderator') || member.guild.roles.find('name', 'Mod');
	}

	createRaid(channel_id, member_id, pokemon, gym, end_time) {
		const raid_data = Object.create(null);

		// add some extra raid data to remember
		raid_data.source_channel_id = channel_id;
		raid_data.creation_time = moment().valueOf();
		raid_data.last_possible_time = raid_data.creation_time + (settings.default_raid_length * 60 * 1000);

		raid_data.pokemon = pokemon;
		raid_data.gym = gym;

		raid_data.end_time = end_time === EndTimeType.UNDEFINED_END_TIME
			? EndTimeType.UNDEFINED_END_TIME
			: raid_data.creation_time + end_time;

		raid_data.additional_attendees = Object.create(null);
		raid_data.additional_attendees[member_id] = 0;

		raid_data.attendees = [member_id];
		raid_data.has_arrived = {};

		raid_data.channel_name = Raid.generateChannelName(raid_data);

		return this.getChannel(channel_id).clone(raid_data.channel_name, true, false)
			.then(new_channel => {
				raid_data.channel_id = new_channel.id;
				this.channels.set(new_channel.id, new_channel);
				this.raids[new_channel.id] = raid_data;
				return {raid: raid_data};
			});
	}

	validRaid(channel_id) {
		return !!this.raids[channel_id];
	}

	getRaid(channel_id) {
		return this.raids[channel_id];
	}

	getAllRaids(channel_id) {
		return Object.values(this.raids)
			.filter(raid => raid.source_channel_id === channel_id);
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
			attendees = this.getRaid(options.channel.id).attendees;
		}

		let length = attendees.length;

		for (let i = 0; i < attendees.length; i++) {
			const attendee = attendees[i];
			length += options.raid.additional_attendees[attendee];
		}

		return length;
	}

	setAnnouncementMessage(channel_id, message) {
		const raid = this.getRaid(channel_id);

		raid.announcement_message = {channel_id: raid.source_channel_id, message_id: message.id};
		this.messages.set(raid.announcement_message, message);

		return message.pin();
	}

	addMessage(channel_id, message, pin = false) {
		const raid = this.getRaid(channel_id);

		if (!raid.messages) {
			raid.messages = [];
		}

		const message_cache_id = {channel_id: channel_id, message_id: message.id};

		raid.messages.push(message_cache_id);
		this.messages.set(message_cache_id, message);

		if (pin) {
			return message.pin();
		}
	}

	addAttendee(channel_id, member_id, additional_attendees) {
		const raid_data = this.getRaid(channel_id),
			// first check if member is already in list, don't join again if they already have
			index = raid_data.attendees.findIndex(m_id => m_id === member_id);

		// add some additional information to "member" joining the raid
		raid_data.additional_attendees[member_id] = additional_attendees;

		if (index < 0) {
			this.members.set(member_id, member);
			raid_data.attendees.push(member_id);
		}

		return {raid: raid_data};
	}

	removeAttendee(channel_id, member_id) {
		const raid_data = this.getRaid(channel_id);

		const index = raid_data.attendees.findIndex(m_id => m_id === member_id);

		if (index < 0) {
			return {error: 'You are not signed up for this raid.'};
		}

		// remove attendee from list of people who have arrived & remove attendee from raid all together
		delete raid_data.has_arrived[raid_data.attendees[index]];
		delete raid_data.additional_attendees[raid_data.attendees[index]];
		raid_data.attendees.splice(index, 1);

		return {raid: raid_data};
	}

	setArrivalStatus(channel_id, member_id, status) {
		const raid_data = this.getRaid(channel_id);

		raid_data.has_arrived[member_id] = status;

		return {raid: raid_data};
	}

	setRaidStartTime(channel_id, start_time) {
		const raid_data = this.getRaid(channel_id);

		raid_data.start_time = moment().add(start_time, 'milliseconds').valueOf();

		return {raid: raid_data};
	}

	setRaidEndTime(channel_id, end_time) {
		const raid_data = this.getRaid(channel_id);

		raid_data.end_time = moment().add(end_time, 'milliseconds').valueOf();

		return {raid: raid_data};
	}

	setRaidPokemon(channel_id, pokemon) {
		const raid_data = this.getRaid(channel_id);
		raid_data.pokemon = pokemon;

		const new_channel_name = Raid.generateChannelName(raid_data);
		raid_data.channel_name = new_channel_name;

		this.getChannel(channel_id)
			.setName(new_channel_name)
			.catch(err => console.log(err));

		return {raid: raid_data};
	}

	setRaidLocation(channel_id, gym) {
		const raid_data = this.getRaid(channel_id);
		raid_data.gym = gym;

		const new_channel_name = Raid.generateChannelName(raid_data);
		raid_data.channel_name = new_channel_name;

		this.getChannel(channel_id)
			.setName(new_channel_name)
			.catch(err => console.log(err));

		return {raid: raid_data};
	}

	getRaidsFormattedMessage(channel_id) {
		const raids = this.getAllRaids(channel_id);

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
			start_time = (raid.start_time) ? `starting at ${moment(raid.start_time).format('h:mm a')}` : 'start time to be announced',
			total_attendees = this.getAttendeeCount({raid}),
			gym = (raid.gym) ? ` Located at ${raid.gym.gymName}` : '';

		return `**__${pokemon}__**\n` +
			`<#${raid.channel_id}> raid ${start_time}. ${total_attendees} potential trainer(s).${gym}\n`;
	}

	getRaidChannelMessage(raid) {
		return `Use <#${raid.channel_id}> for the following raid:`;
	}

	getRaidSourceChannelMessage(raid) {
		return `Use <#${raid.source_channel_id}> to return to this raid\'s regional channel.`;
	}

	async getFormattedMessage(raid_data) {
		const pokemon = raid_data.pokemon.name ?
			raid_data.pokemon.name.charAt(0).toUpperCase() + raid_data.pokemon.name.slice(1) :
			'????',
			tier = raid_data.pokemon.tier,
			end_time = raid_data.end_time !== EndTimeType.UNDEFINED_END_TIME ?
				moment(raid_data.end_time).format('h:mm a') :
				'????',
			start_time = raid_data.start_time ?
				moment(raid_data.start_time).format('h:mm a') :
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
			const member_id = raid_data.attendees[i],
				member = await this.getMember(member_id);

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
			if (raid_data.additional_attendees[member_id] > 0) {
				attendees_list += ' +' + raid_data.additional_attendees[member_id];
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

	async refreshStatusMessages(raid_data) {
		const formatted_message = await this.getFormattedMessage(raid_data);

		this.getMessage(raid_data.announcement_message.channel_id, raid_data.announcement_message.message_id)
			.then(announcement_message => announcement_message.edit(this.getRaidChannelMessage(raid_data), formatted_message))
			.catch(err => console.log(err));

		raid_data.messages
			.forEach(message_cache_id => {
				this.getMessage(message_cache_id.channel_id, message_cache_id.message_id)
					.then(message => message.edit(this.getRaidSourceChannelMessage(raid_data), formatted_message))
					.catch(err => console.log(err));
			});
	}
3;
	raidExistsForGym(gym) {
		return this.raids.length > 0 && Object.values(this.raids)
			.map(raid => raid.gym.gymId)
			.filter(raid_gym_id => raid_gym_id === gym.gymId)
			.length > 0;
	}

	getCreationChannelName(channel_id) {
		return this.validRaid(channel_id) ?
			this.getChannel(this.getRaid(channel_id).source_channel_id).name :
			this.getChannel(channel_id).name;
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
