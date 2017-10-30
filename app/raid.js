"use strict";

const log = require('loglevel').getLogger('Raid'),
	moment = require('moment'),
	settings = require('../data/settings'),
	storage = require('node-persist'),
	{RaidStatus, Team} = require('./constants'),
	Discord = require('discord.js'),
	Helper = require('./helper'),
	Gym = require('./gym'),
	NaturalArgumentType = require('../types/natural'),
	TimeType = require('../types/time');

class Raid {
	constructor() {
		this.active_raid_storage = storage.create({
			dir: 'raids/active',
			forgiveParseErrors: true
		});
		this.active_raid_storage.initSync();

		this.completed_raid_storage = storage.create({
			dir: 'raids/complete',
			forgiveParseErrors: true
		});
		this.completed_raid_storage.initSync();

		// maps channel ids to raid info for that channel
		this.raids = Object.create(null);

		this.active_raid_storage
			.forEach((channel_id, raid) => this.raids[channel_id] = raid);

		let last_interval_time = moment().valueOf();

		// loop to clean up raids periodically
		this.update = setInterval(() => {
			const now = moment().valueOf(),
				start_clear_time = now + (settings.start_clear_time * 60 * 1000),
				deletion_grace_time = settings.deletion_grace_time * 60 * 1000,
				deletion_time = now + (settings.deletion_warning_time * 60 * 1000);

			Object.entries(this.raids)
				.forEach(([channel_id, raid]) => {
					if (raid.hatch_time && now > raid.hatch_time && raid.hatch_time > last_interval_time) {
						this.refreshStatusMessages(raid)
							.catch(err => log.error(err));
					}
					if (raid.start_time) {
						if (raid.start_clear_time && (now > raid.start_clear_time)) {
							// clear out start time
							delete raid.start_time;
							delete raid.start_clear_time;

							this.persistRaid(raid);

							this.refreshStatusMessages(raid)
								.catch(err => log.error(err));

							// ask members if they finished raid
							this.setPresentAttendeesToComplete(channel_id)
								.catch(err => log.error(err));
						} else if (!raid.start_clear_time && now > raid.start_time) {
							raid.start_clear_time = start_clear_time;

							this.persistRaid(raid);

							this.refreshStatusMessages(raid)
								.catch(err => log.error(err));
						}
					}
					if (((raid.end_time !== TimeType.UNDEFINED_END_TIME && now > raid.end_time + deletion_grace_time) || now > raid.last_possible_time + deletion_grace_time) &&
						!raid.deletion_time) {
						// raid's end time is set (or last possible time) in the past, even past the grace period,
						// so schedule its deletion
						raid.deletion_time = deletion_time;

						this.sendDeletionWarningMessage(raid);

						this.persistRaid(raid);
					}
					if (raid.deletion_time && now > raid.deletion_time) {
						this.deleteRaid(channel_id);
					}

					last_interval_time = now;
				});
		}, settings.cleanup_interval);
	}

	async getMember(channel_id, member_id) {
		const channel = await this.getChannel(channel_id),
			member = channel.guild.members.get(member_id);

		if (!!member) {
			return Promise.resolve(member);
		}

		log.warn(`Removing nonexistent member ${member_id} from raid`);
		this.removeAttendee(channel_id, member_id);

		throw new Error(`Member ${member_id} does not exist!`);
	}

	findRaid(gym_id) {
		return Object.values(this.raids)
			.find(raid => raid.gym_id === gym_id);
	}

	getChannel(channel_id) {
		const channel = this.client.channels.get(channel_id);

		if (!channel) {
			if (this.validRaid(channel_id)) {
				log.warn(`Deleting raid for nonexistent channel ${channel_id}`);

				this.deleteRaid(channel_id);
			}

			return Promise.reject(new Error('Channel does not exist'));
		}

		return Promise.resolve(channel);
	}

	async getMessage(message_cache_id) {
		const [channel_id, message_id] = message_cache_id.split(':');

		return this.getChannel(channel_id)
			.then(channel => channel.messages.fetch(message_id))
			.catch(err => {
				log.error(err);
				const raid = this.getRaid(channel_id);

				if (!!raid) {
					log.warn(`Deleting nonexistent message ${message_id} from raid ${channel_id}`);
					raid.messages.splice(raid.messages.indexOf(message_cache_id), 1);

					this.persistRaid(raid);
				} else {
					// try to find raid announcement message that matches this message since that's what this non-existent message
					// most likely is
					Object.values(this.raids)
						.filter(raid => raid.announcement_message === message_cache_id)
						.forEach(raid => {
							log.warn(`Deleting nonexistent announcement message ${message_id} from raid ${raid.channel_id}`);
							delete raid.announcement_message;

							this.persistRaid(raid);
						});
				}

				return Promise.reject(new Error('Message does not exist'));
			});
	}

	shutdown() {
		this.client.destroy();
	}

	persistRaid(raid) {
		try {
			this.active_raid_storage.setItemSync(raid.channel_id, raid);
		} catch (err) {
			log.error(err);
		}
	}

	setClient(client) {
		this.client = client;

		client.on('message', message => {
			if (message.author.id !== client.user.id) {
				// if this is a raid channel that's scheduled for deletion, trigger deletion warning message
				const raid = this.getRaid(message.channel.id);

				if (!!raid && !!raid.deletion_time) {
					this.sendDeletionWarningMessage(raid);
				}
			}
		});
	}

	async createRaid(channel_id, member_id, pokemon, gym_id, time = TimeType.UNDEFINED_END_TIME) {
		const raid = Object.create(null);

		// add some extra raid data to remember
		raid.created_by_id = member_id;
		raid.is_exclusive = !!pokemon.exclusive;
		raid.source_channel_id = channel_id;
		raid.creation_time = moment().valueOf();
		raid.last_possible_time = raid.creation_time + (raid.is_exclusive ?
			(settings.exclusive_raid_incubate_duration + settings.exclusive_raid_hatched_duration) * 60 * 1000 :
			(settings.standard_raid_incubate_duration + settings.standard_raid_hatched_duration) * 60 * 1000);

		raid.pokemon = pokemon;
		raid.gym_id = gym_id;

		raid.attendees = Object.create(Object.prototype);
		raid.attendees[member_id] = {number: 1, status: RaidStatus.INTERESTED};

		const source_channel = await this.getChannel(channel_id),
			channel_name = Raid.generateChannelName(raid);

		let new_channel_id;

		return source_channel.guild.createChannel(channel_name, 'text', {
			parent: source_channel.parent,
			overwrites: source_channel.permissionOverwrites
		})
			.then(new_channel => {
				new_channel_id = new_channel.id;

				this.raids[new_channel.id] = raid;
				raid.channel_id = new_channel.id;

				// move channel to end
				return new_channel.guild.setChannelPositions([{
					channel: new_channel,
					position: new_channel.guild.channels.size - 1
				}]);
			})
			.then(guild => {
				if (time === TimeType.UNDEFINED_END_TIME) {
					raid.end_time = TimeType.UNDEFINED_END_TIME;
					this.persistRaid(raid);
				} else {
					this.setRaidEndTime(new_channel_id, time);
				}

				return {raid: raid};
			});
	}

	deleteRaid(channel_id) {
		const raid = this.getRaid(channel_id);

		let deletion_promise;

		// actually delete the channel and announcement message
		if (raid.announcement_message) {
			deletion_promise = this.getMessage(raid.announcement_message)
				.then(message => message.delete())
				.catch(err => log.error(err));
		} else {
			deletion_promise = Promise.resolve(true);
		}

		deletion_promise.then(result => {
			this.getChannel(channel_id)
				.then(channel => channel.delete())
				.then(channel => {
					// delete messages from raid object before moving to completed raid
					// storage as they're no longer needed
					delete raid.announcement_message;
					delete raid.messages;

					delete raid.messages_since_deletion_scheduled;

					this.completed_raid_storage.getItem(raid.gym_id.toString())
						.then(gym_raids => {
							if (!gym_raids) {
								gym_raids = [];
							}
							gym_raids.push(raid);
							try {
								this.completed_raid_storage.setItemSync(raid.gym_id.toString(), gym_raids)
							} catch (err) {
								log.error(err);
							}
							return true;
						})
						.then(result => this.active_raid_storage.removeItemSync(channel_id))
						.catch(err => log.error(err));

					delete this.raids[channel_id];
				})
				.catch(err => {
					log.error(err);

					this.active_raid_storage.removeItemSync(channel_id);
					delete this.raids[channel_id];
				});
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
		return Object.values(raid.attendees)
		// complete attendees shouldn't count
			.filter(attendee => attendee.status !== RaidStatus.COMPLETE)
			.map(attendee => attendee.number)
			.reduce((total, number) => total + number, 0);
	}

	isExclusive(channel_id) {
		const raid = this.getRaid(channel_id);
		return raid.is_exclusive;
	}

	setAnnouncementMessage(channel_id, message) {
		const raid = this.getRaid(channel_id);

		raid.announcement_message = `${raid.source_channel_id.toString()}:${message.id.toString()}`;

		this.persistRaid(raid);

		return message.pin();
	}

	addMessage(channel_id, message, pin = false) {
		const raid = this.getRaid(channel_id);

		if (!raid.messages) {
			raid.messages = [];
		}

		const message_cache_id = `${channel_id.toString()}:${message.id.toString()}`;

		raid.messages.push(message_cache_id);

		this.persistRaid(raid);

		if (pin) {
			return message.pin();
		}
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

	getMemberStatus(channel_id, member_id) {
		const raid = this.getRaid(channel_id),
			attendee = raid.attendees[member_id];

		return !!attendee ?
			attendee.status :
			RaidStatus.NOT_INTERESTED;
	}

	setMemberStatus(channel_id, member_id, status, additional_attendees = NaturalArgumentType.UNDEFINED_NUMBER) {
		const raid = this.getRaid(channel_id),
			attendee = raid.attendees[member_id],
			number = (additional_attendees !== NaturalArgumentType.UNDEFINED_NUMBER)
				? 1 + additional_attendees
				: 1;

		if (!attendee) {
			raid.attendees[member_id] = {
				number: number,
				status: status
			}
		} else {
			if (additional_attendees !== NaturalArgumentType.UNDEFINED_NUMBER) {
				attendee.number = number;
			}
			attendee.status = status;
		}

		this.persistRaid(raid);

		return {raid: raid};
	}

	async setPresentAttendeesToComplete(channel_id, member_id) {
		const raid = this.getRaid(channel_id);

		if (!!member_id) {
			// set member that issued this command to complete
			this.setMemberStatus(channel_id, member_id, RaidStatus.COMPLETE);
			this.refreshStatusMessages(raid)
				.catch(err => log.error(err));
		}

		const channel = await this.getChannel(channel_id)
				.catch(err => log.error(err)),
			member_ids = Object.keys(raid.attendees)
				.filter(attendee_id => attendee_id !== member_id),
			members = await Promise.all(member_ids
				.map(async attendee_id => await this.getMember(channel_id, attendee_id)))
				.catch(err => log.error(err)),
			present_members = members
				.filter(member => raid.attendees[member.id].status === RaidStatus.PRESENT),
			timeout = settings.raid_complete_timeout;

		if (present_members.length > 0) {
			const members_string = present_members
				.map(member => `**${member.displayName}**`)
				.reduce((prev, next) => prev + ', ' + next);

			const autocomplete_members = [];

			channel.send(`${members_string}: Have you completed this raid?  Answer **no** within ${timeout} minutes to indicate you haven't; otherwise it will be assumed you have!`)
				.then(message => {
					Promise.all(present_members
						.map(present_member => {
							this.setMemberStatus(channel_id, present_member.id, RaidStatus.COMPLETE_PENDING);

							return message.channel.awaitMessages(
								response => response.author.id === present_member.id, {
									max: 1,
									time: timeout * 60 * 1000,
									errors: ['time']
								})
								.then(collected_responses => {
									let confirmation, response;

									if (collected_responses && collected_responses.size === 1) {
										response = collected_responses.first();

										const command_prefix = this.client.options.commandPrefix,
											user_response = response.content.toLowerCase().trim(),
											is_command = user_response.startsWith(command_prefix);

										if (is_command) {
											// don't try to process response
											return true;
										}

										confirmation = this.client.registry.types.get('boolean').truthy.has(user_response);
									} else {
										confirmation = false;
									}

									if (confirmation) {
										response.react(Helper.getEmoji('snorlaxthumbsup') || '👍')
											.then(reaction => response.delete({timeout: settings.message_cleanup_delay_success}))
											.catch(err => log.error(err));

										this.setMemberStatus(channel_id, present_member.id, RaidStatus.COMPLETE);

										this.refreshStatusMessages(raid)
											.catch(err => log.error(err));
									} else {
										response.react(Helper.getEmoji('snorlaxthumbsdown') || '👎')
											.then(reaction => response.delete({timeout: settings.message_cleanup_delay_success}))
											.catch(err => log.error(err));

										this.setMemberStatus(channel_id, present_member.id, RaidStatus.PRESENT);
									}

									return Promise.resolve(true);
								})
								.catch(collected_responses => {
									// defensive check that raid in fact still exists
									if (!!this.getRaid(channel_id)) {
										// check that user didn't already set their status to something else (via running another command during the collection period)
										if (this.getMemberStatus(channel_id, present_member.id) === RaidStatus.COMPLETE_PENDING) {
											autocomplete_members.push(present_member);

											// set user status to complete
											this.setMemberStatus(channel_id, present_member.id, RaidStatus.COMPLETE);
										}
									}

									return Promise.resolve(true);
								});
						}))
						.then(() => {
							// defensive check that raid in fact still exists
							if (!!this.getRaid(channel_id)) {
								this.refreshStatusMessages(raid)
									.catch(err => log.error(err));

								if (autocomplete_members.length > 0) {
									const members_string = autocomplete_members
										.map(member => `**${member.displayName}**`)
										.reduce((prev, next) => prev + ', ' + next);

									message.channel
										.send(`${members_string}: I am assuming you *have* completed this raid.`)
										.then(message => message.delete(60000))
										.catch(err => log.error(err));
								}

								message.delete({timeout: settings.message_cleanup_delay_success})
									.catch(err => log.error(err));
							}
						})
				});
		}
	}

	setRaidHatchTime(channel_id, hatch_time) {
		const raid = this.getRaid(channel_id);

		let end_time;

		if (raid.is_exclusive) {
			end_time = hatch_time + (settings.exclusive_raid_hatched_duration * 60 * 1000);
		} else {
			end_time = hatch_time + (settings.standard_raid_hatched_duration * 60 * 1000);
		}

		raid.hatch_time = hatch_time;
		raid.end_time = end_time;

		this.persistRaid(raid);

		return {raid: raid};
	}

	setRaidStartTime(channel_id, start_time) {
		const raid = this.getRaid(channel_id);

		raid.start_time = start_time;

		// delete start clear time if there is one
		if (raid.start_clear_time) {
			delete raid.start_clear_time;
		}

		this.persistRaid(raid);

		return {raid: raid};
	}

	setRaidEndTime(channel_id, end_time) {
		const raid = this.getRaid(channel_id);

		let hatch_time;

		if (raid.is_exclusive) {
			hatch_time = end_time - (settings.exclusive_raid_hatched_duration * 60 * 1000);
		} else {
			hatch_time = end_time - (settings.standard_raid_hatched_duration * 60 * 1000);
		}

		raid.hatch_time = hatch_time;
		raid.end_time = end_time;

		this.persistRaid(raid);

		return {raid: raid};
	}

	setRaidPokemon(channel_id, pokemon) {
		const raid = this.getRaid(channel_id);

		raid.pokemon = pokemon;
		raid.is_exclusive = !!pokemon.exclusive;

		raid.last_possible_time = Math.max(raid.creation_time + (raid.is_exclusive ?
			(settings.exclusive_raid_incubate_duration + settings.exclusive_raid_hatched_duration) * 60 * 1000 :
			(settings.standard_raid_incubate_duration + settings.standard_raid_hatched_duration) * 60 * 1000),
			raid.last_possible_time);

		this.persistRaid(raid);

		const new_channel_name = Raid.generateChannelName(raid);

		this.getChannel(channel_id)
			.then(channel => channel.setName(new_channel_name))
			.catch(err => log.error(err));

		return {raid: raid};
	}

	setRaidLocation(channel_id, gym_id) {
		const raid = this.getRaid(channel_id);
		raid.gym_id = gym_id;

		this.persistRaid(raid);

		const new_channel_name = Raid.generateChannelName(raid);

		this.getChannel(channel_id)
			.then(channel => channel.setName(new_channel_name))
			.catch(err => log.error(err));

		return {raid: raid};
	}

	async getRaidsFormattedMessage(channel_id) {
		const raids = this.getAllRaids(channel_id);

		if (!raids || raids.length === 0) {
			return 'No raids exist for this channel.  Create one with \`!raid\`!';
		}

		const raid_strings = await Promise.all(raids
				.map(async raid => await this.getRaidShortMessage(raid))),
			filtered_raid_strings = raid_strings
				.filter(raid_string => {
					return raid_string !== '';
				});

		if (filtered_raid_strings.length === 0) {
			return 'No raids exist for this channel.  Create one with \`!raid\`!';
		}

		return filtered_raid_strings.join('\n');
	}

	getRaidShortMessage(raid) {
		const pokemon = raid.is_exclusive ?
			'EX Raid' :
			raid.pokemon.name ?
				raid.pokemon.name.charAt(0).toUpperCase() + raid.pokemon.name.slice(1) :
				'Tier ' + raid.pokemon.tier,
			gym = Gym.getGym(raid.gym_id),
			gym_name = (!!gym.nickname ?
				gym.nickname :
				gym.gymName),
			total_attendees = this.getAttendeeCount(raid),
			calendar_format = {
				sameDay: 'LT',
				sameElse: 'l LT'
			},
			now = moment(),
			start_label = !!raid.start_time ?
				now > raid.start_time ?
					'Raided at' :
					'Raiding at'
				: '',
			start_time = !!raid.start_time ?
				` :: ${start_label} **${moment(raid.start_time).calendar(null, calendar_format)}**` :
				'',
			end_time = raid.end_time !== TimeType.UNDEFINED_END_TIME ?
				` :: Ends at **${moment(raid.end_time).calendar(null, calendar_format)}**` :
				'';

		return this.getChannel(raid.channel_id)
			.then(channel => `**${pokemon}**\n` +
				`${channel.toString()} :: ${gym_name} :: **${total_attendees}** potential trainer${total_attendees !== 1 ? 's' : ''}${start_time}${end_time}\n`)
			.catch(err => {
				log.error(err);
				return '';
			});
	}

	sendDeletionWarningMessage(raid) {
		// send deletion warning message to this raid every 5th call to this
		if (!!raid.messages_since_deletion_scheduled) {
			++raid.messages_since_deletion_scheduled;
		} else {
			raid.messages_since_deletion_scheduled = 1;
		}

		if (raid.messages_since_deletion_scheduled % 5 === 1) {
			const time_until_deletion = moment(raid.deletion_time).fromNow();

			this.getChannel(raid.channel_id)
				.then(channel => channel.send(`**WARNING**: This channel will self-destruct ${time_until_deletion}!`))
				.catch(err => log.error(err));
		}
	}

	getRaidChannelMessage(raid) {
		return this.getChannel(raid.channel_id)
			.then(channel => `Use ${channel.toString()} for the following raid:`)
			.catch(err => log.error(err));
	}

	getRaidSourceChannelMessage(raid) {
		return this.getChannel(raid.source_channel_id)
			.then(channel => `Use ${channel.toString()} to return to this raid\'s regional channel.`)
			.catch(err => log.error(err));
	}

	async getFormattedMessage(raid) {
		const pokemon = !!raid.pokemon.name ?
			raid.pokemon.name.charAt(0).toUpperCase() + raid.pokemon.name.slice(1) :
			'????',
			pokemon_url = !!raid.pokemon.name ?
				`${settings.pokemon_url_base}${pokemon}-Pokemon-Go.png` :
				'',

			raid_description = raid.is_exclusive ?
				`EX Raid against ${pokemon}` :
				`Level ${raid.pokemon.tier} Raid against ${pokemon}`,

			now = moment(),

			calendar_format = {
				sameDay: 'LT',
				sameElse: 'l LT'
			},

			report_member = await this.getMember(raid.channel_id, raid.created_by_id),
			raid_reporter = `reported by ${report_member.displayName}`,

			end_time = raid.end_time !== TimeType.UNDEFINED_END_TIME ?
				`Raid available until ${moment(raid.end_time).calendar(null, calendar_format)}, ` :
				'Raid end time currently unset, ',
			start_time = !!raid.start_time ?
				moment(raid.start_time) :
				'',
			start_label = !!raid.start_time ?
				now > start_time ?
					'__Last Starting Time__' :
					'__Next Planned Starting Time__'
				: '',
			hatch_time = !!raid.hatch_time ?
				moment(raid.hatch_time) :
				'',
			hatch_label = !!raid.hatch_time ?
				now > hatch_time ?
					'__Egg Hatched At__' :
					'__Egg Hatch Time__' :
				'',

			gym = Gym.getGym(raid.gym_id),
			gym_name = !!gym.nickname ?
				gym.nickname :
				gym.gymName,
			gym_url = `https://www.google.com/maps/dir/?api=1&destination=${gym.gymInfo.latitude},${gym.gymInfo.longitude}`,
			additional_information = !!gym.additional_information ?
				gym.additional_information :
				'',

			total_attendees = this.getAttendeeCount(raid),
			attendee_entries = Object.entries(raid.attendees),
			attendees_with_members = await Promise.all(attendee_entries
				.map(async attendee_entry => [await this.getMember(raid.channel_id, attendee_entry[0]), attendee_entry[1]])),
			sorted_attendees = attendees_with_members
				.sort((entry_a, entry_b) => {
					const team_a = Helper.getTeam(entry_a[0]),
						team_b = Helper.getTeam(entry_b[0]),
						name_a = entry_a[0].displayName,
						name_b = entry_b[0].displayName;

					const team_compare = team_a - team_b;

					return (team_compare !== 0) ?
						team_compare :
						name_a.localeCompare(name_b);
				}),

			interested_attendees = sorted_attendees
				.filter(attendee_entry => attendee_entry[1].status === RaidStatus.INTERESTED),
			coming_attendees = sorted_attendees
				.filter(attendee_entry => attendee_entry[1].status === RaidStatus.COMING),
			present_attendees = sorted_attendees
				.filter(attendee_entry => attendee_entry[1].status === RaidStatus.PRESENT ||
					attendee_entry[1].status === RaidStatus.COMPLETE_PENDING),
			complete_attendees = sorted_attendees
				.filter(attendee_entry => attendee_entry[1].status === RaidStatus.COMPLETE),

			attendees_builder = (attendees_list, emoji_name) => {
				const emoji = Helper.getEmoji(emoji_name).toString();

				let result = '';

				attendees_list.forEach(([member, attendee]) => {
					if (result.length > 1024) {
						return;
					}

					const displayName = member.displayName.length > 12 ?
						member.displayName.substring(0, 11).concat('…') :
						member.displayName;

					result += emoji + ' ' + displayName;

					// show how many additional attendees this user is bringing with them
					if (attendee.number > 1) {
						result += ' +' + (attendee.number - 1);
					}

					// add role emoji indicators if role exists
					switch (Helper.getTeam(member)) {
						case Team.INSTINCT:
							result += ' ' + Helper.getEmoji('instinct').toString();
							break;

						case Team.MYSTIC:
							result += ' ' + Helper.getEmoji('mystic').toString();
							break;

						case Team.VALOR:
							result += ' ' + Helper.getEmoji('valor').toString();
							break;
					}

					result += '\n';
				});

				if (result.length > 1024) {
					// try again with 'plain' emoji
					result = '';

					attendees_list.forEach(([member, attendee]) => {
						const displayName = member.displayName.length > 12 ?
							member.displayName.substring(0, 11).concat('…') :
							member.displayName;

						result += '• ' + displayName;

						// show how many additional attendees this user is bringing with them
						if (attendee.number > 1) {
							result += ' +' + (attendee.number - 1);
						}

						// add role emoji indicators if role exists
						const roles = Helper.guild.get(member.guild.id).roles;
						if (roles.has('mystic') && member.roles.has(roles.get('mystic').id)) {
							result += ' ❄';
						} else if (roles.has('valor') && member.roles.has(roles.get('valor').id)) {
							result += ' 🔥';
						} else if (roles.has('instinct') && member.roles.has(roles.get('instinct').id)) {
							result += ' ⚡';
						}

						result += '\n';
					});

					if (result.length > 1024) {
						// one last check, just truncate if it's still too long -
						// it's better than blowing up! sorry people with late alphabetical names!
						result = result.substring(0, 1022) + '…';
					}
				}

				return result;
			};

		const embed = new Discord.MessageEmbed();
		embed.setColor(4437377);
		embed.setTitle(`Map Link: ${gym_name}`);
		embed.setURL(gym_url);
		embed.setDescription(raid_description);

		if (pokemon_url !== '') {
			embed.setThumbnail(pokemon_url);
		}

		embed.setFooter(end_time + raid_reporter);

		if (total_attendees > 0) {
			embed.addField('__Possible Trainers__', total_attendees.toString());
		}
		if (interested_attendees.length > 0) {
			embed.addField('Interested', attendees_builder(interested_attendees, 'pokeball'), true);
		}
		if (coming_attendees.length > 0) {
			embed.addField('Coming', attendees_builder(coming_attendees, 'greatball'), true);
		}
		if (present_attendees.length > 0) {
			embed.addField('Present', attendees_builder(present_attendees, 'ultraball'), true);
		}
		if (complete_attendees.length > 0) {
			embed.addField('Complete', attendees_builder(complete_attendees, 'premierball'), true);
		}

		if (!!raid.hatch_time) {
			embed.addField(hatch_label, hatch_time.calendar(null, calendar_format));
		}

		if (!!raid.start_time) {
			embed.addField(start_label, start_time.calendar(null, calendar_format));
		}

		if (additional_information !== '') {
			embed.addField('**Location Information**', additional_information);
		}

		return {embed};
	}

	async refreshStatusMessages(raid) {
		const raid_channel_message = await this.getRaidChannelMessage(raid),
			raid_source_channel_message = await this.getRaidSourceChannelMessage(raid),
			formatted_message = await this.getFormattedMessage(raid);

		if (raid.announcement_message) {
			this.getMessage(raid.announcement_message)
				.then(announcement_message => announcement_message.edit(raid_channel_message, formatted_message))
				.catch(err => log.error(err));
		}

		raid.messages
			.forEach(message_cache_id => {
				this.getMessage(message_cache_id)
					.then(message => message.edit(raid_source_channel_message, formatted_message))
					.catch(err => log.error(err));
			});
	}

	raidExistsForGym(gym_id) {
		return Object.values(this.raids)
			.map(raid => raid.gym_id)
			.filter(raid_gym_id => raid_gym_id === gym_id)
			.length > 0;
	}

	getCreationChannelName(channel_id) {
		return this.validRaid(channel_id) ?
			this.getChannel(this.getRaid(channel_id).source_channel_id)
				.then(channel => channel.name)
				.catch(err => {
					log.error(err);
					return '';
				}) :
			this.getChannel(channel_id)
				.then(channel => channel.name)
				.catch(err => {
					log.error(err);
					return '';
				});
	}

	static generateChannelName(raid) {
		const nonCharCleaner = new RegExp(/[^\w]/, 'g'),
			pokemon_name = (raid.is_exclusive ?
				'ex raid' :
				!!raid.pokemon.name ?
					raid.pokemon.name :
					`tier ${raid.pokemon.tier}`)
				.replace(nonCharCleaner, ' ')
				.split(' ')
				.filter(token => token.length > 0)
				.join('-'),
			gym = Gym.getGym(raid.gym_id),
			gym_name = (!!gym.nickname ?
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
