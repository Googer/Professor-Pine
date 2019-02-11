"use strict";

const log = require('loglevel').getLogger('EditGymCommand'),
  commando = require('discord.js-commando'),
  Discord = require('discord.js'),
  oneLine = require('common-tags').oneLine,
  Region = require('../../../app/region'),
  Gym = require('../../../app/gym'),
  Helper = require('../../../app/helper'),
  Raid = require('../../../app/raid'),
  {CommandGroup} = require('../../../app/constants');

function getGymMetaFields() {
	return ['location', 'name', 'nickname', 'description', 'keywords', 'exraid', 'notice']
}

module.exports = class EditGym extends commando.Command {
	constructor(client) {
		super(client, {
			name: 'editgym',
			aliases: ['edit-gym'],
			group: CommandGroup.REGION,
			memberName: 'editgym',
			description: 'Edit a gyms meta data',
			details: oneLine `
				This command will allow the user to edit one of the gyms meta data fields.
        		Fields include name, nickname, location, ex raid eligibility, notice, description or keywords.
			`,
			examples: ['\teditgym dog stop'],
			argsPromptLimit: 3
		});

		this.gymCollector = new commando.ArgumentCollector(client, [{
			key: 'gym',
			prompt: 'What gym are you trying to edit? Provide a name or a search term',
			type: 'findgym'
		}], 3);

		this.fieldCollector = new commando.ArgumentCollector(client, [{
			key: 'field',
			prompt: 'What field of the gym do you wish to edit? Available fields: `location`,`name`,`nickname`,`description`,`keywords`,`exraid`,`notice`.',
			type: 'string',
			validate: value => {
				if (value === 'location' || value === 'name' || value === 'nickname' || value === 'description' || value === 'keywords' || value === 'exraid' || value === 'notice') {
					return true
				} else {
					return "Invalid field. Available fields: `location`,`name`,`nickname`,`description`,`keywords`,`exraid`,`notice`."
				}
			}
		}], 3);

		this.nameCollector = new commando.ArgumentCollector(client, [{
			key: 'name',
			label: 'cool',
			prompt: 'Provide a new name for this gym.',
			type: 'string',
			validate: value => {
				if (value.replaceAll(" ", "").length > 0) {
					return true;
				} else {
					return "You must provide a valid name for this gym."
				}
			}
		}], 3);

		this.nicknameCollector = new commando.ArgumentCollector(client, [{
			key: 'nickname',
			prompt: 'Provide a new nickname for this gym. To remove this field from this gym, type `remove`.',
			type: 'string'
		}], 3);

		this.descriptionCollector = new commando.ArgumentCollector(client, [{
			key: 'description',
			prompt: 'Provide a new description for this gym. To remove this field from this gym, type `remove`.',
			type: 'string',
			wait: 60
		}], 3);

		this.locationCollector = new commando.ArgumentCollector(client, [{
			key: 'location',
			prompt: 'What is the latitude & longitude location of this gym? Can provide a pin link from apple maps or comma separated numbers.',
			type: 'coords',
			wait: 60
		}], 3);

		this.keywordsCollector = new commando.ArgumentCollector(client, [{
			key: 'keywords',
			prompt: 'Type `add` or `remove` followed by a list of keywords separated by commas. To remove all existing commas type `remove all`.',
			type: 'keywords'
		}], 3);

		this.noticeCollector = new commando.ArgumentCollector(client, [{
			key: 'notice',
			prompt: 'Provide a notice for this gym (ie: Warnings, Parking Restrictions, Safety suggestions etc). To remove an existing notice type `remove`.',
			type: 'string'
		}], 3);

		this.exstatusCollector = new commando.ArgumentCollector(client, [{
			key: 'exstatus',
			prompt: 'Provide the EX Raid eligibility of this gym with `sponsored`, `park`, or `previous`. To remove an existing EX Raid eligibility status type `remove`.',
			type: 'string',
			validate: value => {
				if (value === 'sponsored' || value === 'park' || value === 'previous' || value === 'remove') {
					return true;
				} else {
					return "Please provide a valid EX Raid eligibility.";
				}
			}
		}], 3);

    client.dispatcher.addInhibitor(message => {
			if (!!message.command && message.command.name === 'editgym') {
				if (!Helper.isManagement(message)) {
					return ['unauthorized', message.reply('You are not authorized to use this command.')];
				}
        if(!Helper.isBotChannel(message)) {
          return ['invalid-channel', message.reply('This command must be ran in a bot channel.')]
        }
			}

			return false;
		});
	}

	getQuotedString(value) {
		var single = value.split(/'/);
		var double = value.split(/"/);

		if (single.length == 3) {
			return single[1];
		} else if (double.length == 3) {
			return double[1];
		} else {
			return null;
		}
	}

	getGymArgument(args) {
		if (this.getQuotedString(args)) {
			return this.getQuotedString(args);
		} else {
			if (this.getFieldArgument(args)) {
				const field = this.getFieldArgument(args);
				return args.substring(0, args.length - field.length)
			} else {
				return args;
			}
		}
	}

	getFieldArgument(args) {
		const pieces = args.split(" ");
		if (pieces.length <= 1) {
			return null;
		} else {
			const last = pieces[pieces.length - 1];
			if (getGymMetaFields().indexOf(last.toLowerCase()) != -1) {
				return last;
			}
		}
	}

	cleanup(msg, gym_result, field_result, collection_result, gym_message) {
		msg.delete()
		if (gym_message) {
			gym_message.delete()
		}

		gym_result.prompts.forEach(message => {
			message.delete()
		})

		gym_result.answers.forEach(message => {
			message.delete()
		})

		if (field_result) {
			field_result.prompts.forEach(message => {
				message.delete()
			})

			field_result.answers.forEach(message => {
				message.delete()
			})
		}

		if (collection_result) {
			collection_result.prompts.forEach(message => {
				message.delete()
			})

			collection_result.answers.forEach(message => {
				message.delete()
			})
		}
	}

	async run(msg, args) {

		log.info(args.constructor.name);
		const that = this;
		const gym_args = (args.length > 0) ? [this.getGymArgument(args)] : []
		this.gymCollector.obtain(msg, gym_args).then(async function(gym_result) {
			if (!gym_result.cancelled) {

				const gym = gym_result.values["gym"];
				const gym_msg = gym.message;

				const field_args = that.getFieldArgument(args) ? [that.getFieldArgument(args)] : []

				log.info("field: " + field_args);

				that.fieldCollector.obtain(msg, field_args).then(async function(field_result) {
					if (!field_result.cancelled) {

						const value = field_result.values["field"].toLowerCase();

						if (value === 'location') {
							that.locationCollector.obtain(msg).then(async function(collection_result) {
								if (!collection_result.cancelled) {
									const location = collection_result.values["location"];
									var result = await Region.setGymLocation(gym["id"], location, Gym).catch(error => msg.say("An error occurred changing the location of this gym."));
									if (result["id"]) {
										that.cleanup(msg, gym_result, field_result, collection_result, gym_msg);
										Region.showGymDetail(msg, result, "Updated Gym Location", msg.member.displayName);
									}
								} else {
									that.cleanup(msg, gym_result, field_result, collection_result, gym_msg);
								}
							});
						} else if (value === 'name') {
							that.nameCollector.obtain(msg).then(async function(collection_result) {
								if (!collection_result.cancelled) {
									const name = collection_result.values["name"];
									var result = await Region.setGymName(gym, name, Gym).catch(error => msg.say("An error occurred setting the name of this gym."));
									if (result["id"]) {
										that.cleanup(msg, gym_result, field_result, collection_result);
										Region.showGymDetail(msg, result, "Updated Gym Name", msg.member.displayName);
									}
								} else {
									that.cleanup(msg, gym_result, field_result, collection_result, gym_msg);
								}
							});
						} else if (value === 'nickname') {
							that.nicknameCollector.obtain(msg).then(async function(collection_result) {
								if (!collection_result.cancelled) {
									const nickname = collection_result.values["nickname"];
									var result = await Region.setGymNickname(gym, nickname, Gym).catch(error => msg.say("An error occurred setting the nickname of this gym."));
									if (result["id"]) {
										that.cleanup(msg, gym_result, field_result, collection_result, gym_msg);
										Region.showGymDetail(msg, result, "Updated Gym Nickname", msg.member.displayName);
									}
								} else {
									that.cleanup(msg, gym_result, field_result, collection_result, gym_msg);
								}
							});
						} else if (value === 'description') {
							that.descriptionCollector.obtain(msg).then(async function(collection_result) {
								if (!collection_result.cancelled) {
									const description = collection_result.values["description"];
									var result = await Region.setGymDescription(gym, description, Gym).catch(error => msg.say("An error occurred setting the description of this gym."));
									if (result["id"]) {
										that.cleanup(msg, gym_result, field_result, collection_result, gym_msg);
										Region.showGymDetail(msg, result, "Updated Gym Description", msg.member.displayName);
									}
								} else {
									that.cleanup(msg, gym_result, field_result, collection_result, gym_msg);
								}
							});
						} else if (value === 'keywords') {
							that.keywordsCollector.obtain(msg).then(async function(collection_result) {
								if (!collection_result.cancelled) {
									log.info("action: " + collection_result.values["keywords"]["action"]);
									log.info("keywords: " + collection_result.values["keywords"]["keywords"]);

									const action = collection_result.values["keywords"]["action"];
									const keywords = collection_result.values["keywords"]["keywords"];
									var result = await Region.editGymKeywords(gym, action, keywords, Gym).catch(error => msg.say("An error occurred adding removing keywords from the gym."));
									if (result["id"]) {
										that.cleanup(msg, gym_result, field_result, collection_result, gym_msg);
										Region.showGymDetail(msg, result, "Updated Gym Keywords", msg.member.displayName);
									}
								} else {
									that.cleanup(msg, gym_result, field_result, collection_result, gym_msg);
								}
							});
						} else if (value === 'exraid') {
							that.exstatusCollector.obtain(msg).then(async function(collection_result) {
								if (!collection_result.cancelled) {
									const description = collection_result.values["description"];
									var result = await Region.setEXStatus(gym, collection_result.values["exstatus"], Gym).catch(error => msg.say("An error occurred setting the EX eligibility of This gym."));
									if (result["id"]) {
										that.cleanup(msg, gym_result, field_result, collection_result, gym_msg);
										Region.showGymDetail(msg, result, "Updated EX Raid Eligibility", msg.member.displayName);
									}
								} else {
									that.cleanup(msg, gym_result, field_result, collection_result, gym_msg);
								}
							});
						} else if (value === 'notice') {
							that.noticeCollector.obtain(msg).then(async function(collection_result) {
								if (!collection_result.cancelled) {
									const notice = collection_result.values["notice"];
									var result = await Region.setGymNotice(gym, notice, Gym).catch(error => msg.say("An error occurred setting the notice for this gym."));
									if (result["id"]) {
										that.cleanup(msg, gym_result, field_result, collection_result, gym_msg);
										Region.showGymDetail(msg, result, "Updated Gym Notice", msg.member.displayName);
									}
								} else {
									that.cleanup(msg, gym_result, field_result, collection_result, gym_msg);
								}
							});
						}


					} else {
						that.cleanup(msg, gym_result, field_result, null, gym_msg);
					}
				});
			} else {
				that.cleanup(msg, gym_result, null, null, null);
			}
		});
	}

};
