
const fs = require('fs');
const path = require('path');

class Raid {
	constructor() {
		// channel maps of raid maps
		this.raids = new Map();

		this.raids_counter = 0;

		this.roles = {
			mystic: '',
			valor: '',
			instinct: ''
		};

		// TODO:  create interval loop to clean up raids every 1 minute?
	}

	createRaid(channel, member, raid_data) {
		var channel_raid_map = this.raids.get(channel.id);
		var id = raid_data.pokemon + '-' + this.raids_counter;

		// one time setup for getting role id's by name
		if (!this.roles.mystic) { this.roles.mystic = member.guild.roles.find('name', 'Mystic'); }
		if (!this.roles.valor) { this.roles.valor = member.guild.roles.find('name', 'Valor'); }
		if (!this.roles.instinct) { this.roles.instinct = member.guild.roles.find('name', 'Instinct'); }

		// add extra data to "member"
		member.additional_attendees = 0;

		// add some extra raid data to remember
		raid_data.id = id;
		raid_data.timestamp = Date.now();
		raid_data.attendees = [ member ];

		if (channel_raid_map) {
			channel_raid_map.set(id, raid_data);
		} else {
			channel_raid_map = new Map();
			channel_raid_map.set(id, raid_data);
			this.raids.set(channel.id, channel_raid_map);
		}

		this.raids_counter++;

		return { raid: raid_data };
	}

	getRaid(channel, raid_id) {
		return this.raids.get(channel.id).get(raid_id);
	}

	getAttendeeCount(options) {
		var attendees = [];
		var length = 0;

		// get attendee data via given raid data, or map data in order to find the attendee data
		if (options.raid) {
			attendees = options.raid.attendees;
		} else {
			if (!options.channel || !options.member || isNaN(options.raid_id)) { throw ('Need raid data in order to get attendee count.'); }
			attendees = this.getRaid(options.channel, options.raid_id).attendees;
		}

		length = attendees.length;

		for (let i=0; i<attendees.length; i++) {
			var attendee = attendees[i];
			length += attendee.additional_attendees;
		}

		return length;
	}

	getMessage(channel, member, raid_id) {
		return this.getRaid(channel, raid_id).message;
	}

	setMessage(channel, member, raid_id, message) {
		this.getRaid(channel, raid_id).message = message;
	}

	addAttendee(channel, member, raid_id, additional_attendees=0) {
		var raid_data = this.getRaid(channel, raid_id);
		var index;

		if (!raid_data) {
			return { error: `<@${member.id}> The raid you entered (${raid_id}) was not found.` }
		}

		// first check if member is already in list, and if they are, ignore their request to join again
		index = raid_data.attendees.findIndex((m) => {
			return m.id === member.id;
		});

		if (index >= 0) {
			return { error: `<@${member.id}> You\'ve already joined this raid.` }
		}

		// add some additional information to "member" joining the raid
		member.additional_attendees = additional_attendees;

		// message.member.displayName, message.guild
		raid_data.attendees.push(member);

		return { raid: raid_data };
	}

	removeAttendee(channel, member, raid_id) {
		var raid_data = this.getRaid(channel, raid_id);

		// message.member.displayName, message.guild
		var index = raid_data.attendees.findIndex((m) => {
			return m.id === member.id;
		});

		raid_data.attendees.splice(index, 1);

		return { raid: raid_data };
	}

	setArrivalStatus(channel, member, raid_id, status) {
		var raid_data = this.getRaid(channel, raid_id);

		for (let i=0; i<raid_data.attendees.length; i++) {
			let m = raid_data.attendees[i];

			// TODO:  Can't set arrived status on member as it is on the MEMBER and thus will be set on other raids they attend
			//			need to save some where else, and need to save the main "author" as the raid leader for masterball status
			if (m.id === member.id) {
				m.has_arrived = true;
				break;
			}
		}

		return { raid: raid_data };
	}

	setRaidTime(channel, member, raid_id, start_time) {
		var raid_data = this.getRaid(channel, raid_id);

		raid_data.start_time = start_time;

		return { raid: raid_data };
	}

	setRaidLocation(channel, member, raid_id, location) {
		var raid_data = this.getRaid(channel, raid_id);

		raid_data.location = location;

		return { raid: raid_data };
	}

	getFormattedMessage(raid_data) {
		var pokemon = raid_data.pokemon.charAt(0).toUpperCase() + raid_data.pokemon.slice(1);
		var end_time = (raid_data.end_time)? raid_data.end_time: '????';
		var total_attendees = this.getAttendeeCount({ raid: raid_data });
		var location = (raid_data.location)? raid_data.location + '\n': '';

		// generate string of attendees
		var attendees_list = '';
		for (let i=0; i<raid_data.attendees.length; i++) {
			let member = raid_data.attendees[i];

			// member list
			attendees_list += '';
			if (i == 0 && member.has_arrived) { attendees_list += '<:MasterBall:347218482078810112>'; }
			else if (member.has_arrived) { attendees_list += '<:PokeBall:347218482296782849>'; }
			else { attendees_list += '<:PremierBall:347221891263496193>'; } //◻️, \t\t
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
				"title": `Level 5 Raid against ${pokemon}`,
				"description": `Raid available until ${end_time}\n` +
								`${location}\n` +
								`Join this raid by typing the command \`\`\`!join ${raid_data.id}\`\`\`\n\n` +
								`Potential Trainers:\n` +
								`${attendees_list}\n` +
								`Trainers: **${total_attendees} total**\n` +
								`Starting @ **${((raid_data.start_time)? (raid_data.start_time): '????')}**\n`,
				"url": (location)? location: 'https://discordapp.com',
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
