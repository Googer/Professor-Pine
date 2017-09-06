"use strict";

const moment = require('moment'),
	settings = require('../data/settings'),
	storage = require('node-persist'),
	Discord = require('discord.js'),
	Gym = require('./gym'),
	EndTimeType = require('../types/time');

class Raid {
	constructor() {
		this.active_raid_storage = storage.create({
			dir: 'raids/active'
		});
		this.active_raid_storage.initSync();

		this.completed_raid_storage = storage.create({
			dir: 'raids/complete'
		});
		this.completed_raid_storage.initSync();

		// maps channel ids to raid info for that channel
		this.raids = Object.create(null);

		this.active_raid_storage
			.forEach((channel_id, raid) => this.raids[channel_id] = raid);

		// cache of roles, populated on client login
		this.roles = Object.create(null);

		// cache of emoji ids, populated on client login
		this.emojis = Object.create(null);

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

						this.persistRaid(raid);

						this.getChannel(raid.channel_id)
							.send('**WARNING** - this channel will be deleted automatically at ' + moment(deletion_time).format('h:mm a') + '!')
							.catch(err => console.log(err));
					} else if (raid.deletion_time && (now > raid.deletion_time)) {
						// actually delete the channel and announcement message
						if (raid.announcement_message) {
							this.getMessage(raid.announcement_message.channel_id, raid.announcement_message.message_id, false)
								.then(message => message.delete())
								.then(result => this.messages.delete(raid.announcement_message))
								.catch(err => console.log(err));
						}

						this.getChannel(channel_id, false).delete()
							.catch(err => console.log(err));

						// clean message and channels caches
						raid.messages
							.forEach(message_cache_id => this.messages.delete(message_cache_id));
						this.channels.delete(channel_id);

						// delete messages from raid object before moving to completed raid
						// storage as they're no longer needed
						delete raid.announcement_message;
						delete raid.messages;

						this.completed_raid_storage.getItem(raid.gym_id.toString())
							.then(gym_raids => {
								if (!gym_raids) {
									gym_raids = [];
								}
								gym_raids.push(raid);

								return this.completed_raid_storage.setItem(raid.gym_id.toString(), gym_raids);
							})
							.then(result => this.active_raid_storage.removeItem(channel_id))
							.catch(err => console.log(err));

						delete this.raids[channel_id];
					}
				});
		}, settings.cleanup_interval);
	}

	async getMember(member_id, cache) {
		if (this.members.has(member_id)) {
			return Promise.resolve(this.members.get(member_id));
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
			return Promise.resolve(this.messages.get(message_cache_id));
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

	shutdown() {
		this.active_raid_storage.persistSync();
		this.completed_raid_storage.persistSync();

		this.client.destroy();
	}

	persistRaid(raid) {
		this.active_raid_storage.setItem(raid.channel_id, raid)
			.catch(err => console.log(err));
	}

	setClient(client, guild) {
		this.client = client;
		this.guild = guild;

		const
			roles = new Map(guild.roles.map(role => [role.name.toLowerCase(), role])),
			emojis = new Map(guild.emojis.map(emoji => [emoji.name.toLowerCase(), emoji.toString()]));

		this.roles.mystic = roles.get('mystic');
		this.roles.valor = roles.get('valor');
		this.roles.instinct = roles.get('instinct');
		this.roles.admin = roles.get('admin');
		this.roles.moderator = roles.get('moderator') || roles.get('mod');

		this.emojis.mystic = emojis.get('mystic') || '';
		this.emojis.valor = emojis.get('valor') || '';
		this.emojis.instinct = emojis.get('instinct') || '';

		this.emojis.pokeball = emojis.get('pokeball') || '';
		this.emojis.greatball = emojis.get('greatball') || '';
		this.emojis.ultraball = emojis.get('ultraball') || '';
		this.emojis.masterball = emojis.get('masterball') || '';
		this.emojis.premierball = emojis.get('premierball') || '';
	}

	createRaid(channel_id, member_id, pokemon, gym_id, end_time) {
		const raid = Object.create(null);

		// add some extra raid data to remember
		raid.source_channel_id = channel_id;
		raid.creation_time = moment().valueOf();
		raid.last_possible_time = raid.creation_time + (settings.default_raid_length * 60 * 1000);

		raid.pokemon = pokemon;
		raid.gym_id = gym_id;

		raid.end_time = end_time === EndTimeType.UNDEFINED_END_TIME
			? EndTimeType.UNDEFINED_END_TIME
			: raid.creation_time + end_time;

		raid.attendees = Object.create(Object.prototype);
		raid.attendees[member_id] = {number: 1, status: 0};

		const channel_name = Raid.generateChannelName(raid);

		return this.getChannel(channel_id).clone(channel_name, true, false)
			.then(new_channel => {
				raid.channel_id = new_channel.id;

				this.persistRaid(raid);

				this.channels.set(new_channel.id, new_channel);
				this.raids[new_channel.id] = raid;
				return {raid: raid};
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

	getAttendeeCount(raid) {
		return Object.keys(raid.attendees).length > 0 ?
			Object.values(raid.attendees)
			// complete attendees shouldn't count
				.filter(attendee => attendee.status !== 2)
				.map(attendee => attendee.number)
				.reduce((total, number) => total + number) :
			0;
	}

	setAnnouncementMessage(channel_id, message) {
		const raid = this.getRaid(channel_id);

		raid.announcement_message = {channel_id: raid.source_channel_id, message_id: message.id};

		this.persistRaid(raid);

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

		this.persistRaid(raid);

		this.messages.set(message_cache_id, message);

		if (pin) {
			return message.pin();
		}
	}

	addAttendee(channel_id, member_id, additional_attendees) {
		const raid = this.getRaid(channel_id);

		raid.attendees[member_id] =
			{number: (1 + additional_attendees), status: 0};

		this.persistRaid(raid);

		return {raid: raid};
	}

	removeAttendee(channel_id, member_id) {
		const raid = this.getRaid(channel_id),
			attendee = raid.attendees[member_id];

		if (!attendee) {
			return {error: 'You are not signed up for this raid.'};
		}

		delete raid.attendees[member_id];

		this.persistRaid(raid);

		return {raid: raid};
	}

	setArrivalStatus(channel_id, member_id, status) {
		const raid = this.getRaid(channel_id),
			attendee = raid.attendees[member_id];

		if (!attendee) {
			if (status === 0) {
				return {error: 'You are not signed up for this raid.'};
			}

			raid.attendees[member_id] = {number: 1, status: status}
		} else {
			attendee.status = status;
		}

		this.persistRaid(raid);

		return {raid: raid};
	}

	setRaidStartTime(channel_id, start_time) {
		const raid = this.getRaid(channel_id);

		raid.start_time = moment().add(start_time, 'milliseconds').valueOf();

		this.persistRaid(raid);

		return {raid: raid};
	}

	setRaidEndTime(channel_id, end_time) {
		const raid = this.getRaid(channel_id);

		raid.end_time = moment().add(end_time, 'milliseconds').valueOf();

		this.persistRaid(raid);

		return {raid: raid};
	}

	setRaidPokemon(channel_id, pokemon) {
		const raid = this.getRaid(channel_id);
		raid.pokemon = pokemon;

		this.persistRaid(raid);

		const new_channel_name = Raid.generateChannelName(raid);

		this.getChannel(channel_id)
			.setName(new_channel_name)
			.catch(err => console.log(err));

		return {raid: raid};
	}

	setRaidLocation(channel_id, gym_id) {
		const raid = this.getRaid(channel_id);
		raid.gym_id = gym_id;

		this.persistRaid(raid);

		const new_channel_name = Raid.generateChannelName(raid);

		this.getChannel(channel_id)
			.setName(new_channel_name)
			.catch(err => console.log(err));

		return {raid: raid};
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
			total_attendees = this.getAttendeeCount(raid),
			gym = Gym.getGym(raid.gym_id).gymName;

		return `**${pokemon}**\n` +
			`<#${raid.channel_id}> :: ${gym} :: ${total_attendees} interested trainer${total_attendees !== 1 ? 's' : ''}\n`;
	}

	getRaidChannelMessage(raid) {
		return `Use <#${raid.channel_id}> for the following raid:`;
	}

	getRaidSourceChannelMessage(raid) {
		return `Use <#${raid.source_channel_id}> to return to this raid\'s regional channel.`;
	}

	async getFormattedMessage(raid) {
		const pokemon = raid.pokemon.name ?
			raid.pokemon.name.charAt(0).toUpperCase() + raid.pokemon.name.slice(1) :
			'????',
			tier = raid.pokemon.tier,
			end_time = raid.end_time !== EndTimeType.UNDEFINED_END_TIME ?
				moment(raid.end_time).format('h:mm a') :
				'',
			start_time = raid.start_time ?
				moment(raid.start_time).format('h:mm a') :
				'',
			total_attendees = this.getAttendeeCount(raid),
			gym = Gym.getGym(raid.gym_id),
			gym_name = gym.nickname ?
				gym.nickname :
				gym.gymName,
			gym_url = gym.gymInfo.url,
			additional_information = gym.additional_information ?
				gym.additional_information :
				'';

		const attendee_entries = Object.entries(raid.attendees),
			attendees_with_members = await Promise.all(attendee_entries
				.map(async attendee_entry => [await this.getMember(attendee_entry[0]), attendee_entry[1]])),
			sorted_attendees = attendees_with_members
				.sort((entry_a, entry_b) => {
					const name_a = entry_a[0].displayName,
						name_b = entry_b[0].displayName;

					return name_a.localeCompare(name_b);
				}),

			coming_attendees = sorted_attendees
				.filter(attendee_entry => attendee_entry[1].status === 0),
			present_attendees = sorted_attendees
				.filter(attendee_entry => attendee_entry[1].status === 1),
			complete_attendees = sorted_attendees
				.filter(attendee_entry => attendee_entry[1].status === 2),

			attendees_builder = (title, attendees_list, emoji) => {
				if (attendees_list.length === 0) {
					return '';
				}

				let result = title + '\n';

				for (const i in attendees_list) {
					const member = attendees_list[i][0],
						attendee = attendees_list[i][1];

					result += emoji + ' ' + member.displayName;

					// show how many additional attendees this user is bringing with them
					if (attendee.number > 1) {
						result += ' +' + (attendee.number - 1);
					}

					// add role emoji indicators if role exists
					if (this.roles.mystic && member.roles.has(this.roles.mystic.id)) {
						result += ' ' + this.emojis.mystic;
					} else if (this.roles.valor && member.roles.has(this.roles.valor.id)) {
						result += ' ' + this.emojis.valor;
					} else if (this.roles.instinct && member.roles.has(this.roles.instinct.id)) {
						result += ' ' + this.emojis.instinct;
					}

					result += '\n';
				}

				return result;
			};

		// generate string of attendees
		let attendees_list = '';

		attendees_list += attendees_builder('**Coming**', coming_attendees, this.emojis.premierball);
		attendees_list += attendees_builder('**Present**', present_attendees, this.emojis.pokeball);
		attendees_list += attendees_builder('**Complete**', complete_attendees, this.emojis.masterball);

		const embed = new Discord.RichEmbed()
			.setTitle(`Level ${tier} Raid against ${pokemon}`)
			.setColor(4437377)
			.setThumbnail(`https://rankedboost.com/wp-content/plugins/ice/pokemon-go/${pokemon}-Pokemon-Go.png`)
			.setURL(gym_url);

		if (end_time !== '') {
			embed.setDescription(`Raid available until ${end_time}`);
		}

		embed.addField('**Location**', gym_name + '\n' + gym_url);

		embed.addField(`**${total_attendees} Interested ${total_attendees === 1 ? 'Trainer' : 'Trainers'}**`, attendees_list);

		if (start_time !== '') {
			embed.addField('**Start Time**', start_time);
		}

		if (additional_information !== '') {
			embed.addField('**Location Information**', additional_information);
		}

		return {embed};
	}

	async refreshStatusMessages(raid) {
		const formatted_message = await
			this.getFormattedMessage(raid);

		this.getMessage(raid.announcement_message.channel_id, raid.announcement_message.message_id)
			.then(announcement_message => announcement_message.edit(this.getRaidChannelMessage(raid), formatted_message))
			.catch(err => console.log(err));

		raid.messages
			.forEach(message_cache_id => {
				this.getMessage(message_cache_id.channel_id, message_cache_id.message_id)
					.then(message => message.edit(this.getRaidSourceChannelMessage(raid), formatted_message))
					.catch(err => console.log(err));
			});
	}

	raidExistsForGym(gym_id) {
		return this.raids.length > 0 && Object.values(this.raids)
			.map(raid => raid.gym_id)
			.filter(raid_gym_id => raid_gym_id === gym_id)
			.length > 0;
	}

	getCreationChannelName(channel_id) {
		return this.validRaid(channel_id) ?
			this.getChannel(this.getRaid(channel_id).source_channel_id).name :
			this.getChannel(channel_id).name;
	}

	static generateChannelName(raid) {
		const nonCharCleaner = new RegExp(/[^\w]/, 'g'),
			pokemon_name = (raid.pokemon.name ?
				raid.pokemon.name :
				('tier ' + raid.pokemon.tier))
				.replace(nonCharCleaner, ' ')
				.split(' ')
				.filter(token => token.length > 0)
				.join('-'),
			gym = Gym.getGym(raid.gym_id),
			gym_name = (gym.nickname ?
				gym.nickname :
				gym.gymName)
				.toLowerCase()
				.replace(nonCharCleaner, ' ')
				.split(' ')
				.filter(token => token.length > 0)
				.join('-');

		return pokemon_name + '-' + gym_name;
	}
}

module.exports = new Raid();
