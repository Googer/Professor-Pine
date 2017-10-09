"use strict";

const log = require('loglevel').getLogger('Raid'),
	path = require('path'),
	tesseract = require('tesseract.js'),
	moment = require('moment'),
	Helper = require('../app/helper'),
	Jimp = require('Jimp'),
	GymArgumentType = require('../types/gym'),
	TimeArgumentType = require('../types/time'),
	PokemonArgumentType = require('../types/pokemon'),
	Raid = require('../app/raid');

const debug = true;//function checkDebugFlag() { for (let arg of process.argv) { if (arg == '--debug') { return true } } return false; }();

class ImageProcess {
	constructor() {
		this.image_path = '/../../processing/';
	}

	process(message, url) {
		// easier test case
		if (message.content == 'ping') {
			url = path.join(__dirname, this.image_path, 'image18.png');
		}

		Jimp.read(url).then((image) => {
			if (!image) { return; }

			// resize to some standard size to help tesseract
			image.scaleToFit(1440, 2560, Jimp.RESIZE_HERMITE);

			// some phones are really wierd? and have way too much height to them, and need this check to push cropping around a bit
			const check_phone_color = Jimp.intToRGBA(image.getPixelColor(0, 85));

			let gym_location = { x: image.bitmap.width / 5.1, y: image.bitmap.height / 26, width: image.bitmap.width - (image.bitmap.width / 2.55), height: image.bitmap.height / 13 };

			// special case for some kind of odd vertical phone
			if (check_phone_color.r <= 20 && check_phone_color.g <= 20 && check_phone_color.b <= 20) {
				gym_location.y += 100;
			}


			return new Promise((resolve, reject) => {
				let promises = [];

				// FIRST STEP:  Determine if the screenshot has a valid gym name
				this.getGymName(image, gym_location).then(gym => {
					const GymType = new GymArgumentType(Helper.client);

					// ensure gym exist and is allowed to be created
					GymType.validate(gym, message).then(validation => {
						if (validation == true) {
							this.getRaidData(image).then(values => {
								values.gym = gym;

								resolve(values);
							});
						} else {
							reject(validation);
						}
					}).catch(err => {
						reject(err);
					});
				});
			});
		}).then(values => {
			this.createRaid(message, values);
		}).catch(err => console.log(err));
	}

	/**
	 * Header can contain black-gray text or white-gray text
	 *		need to turn these areas into extremes and filter out everything else
	 **/
	filterHeaderContent(x, y, idx) {
		const red   = this.bitmap.data[ idx + 0 ];
		const green = this.bitmap.data[ idx + 1 ];
		const blue  = this.bitmap.data[ idx + 2 ];
		const alpha = this.bitmap.data[ idx + 3 ];

		if ((red >= 200 && green >= 210 && blue >= 210) || (red <= 50 && green <= 50 && blue <= 50)) {
			this.bitmap.data[ idx + 0 ] = 255;
			this.bitmap.data[ idx + 1 ] = 255;
			this.bitmap.data[ idx + 2 ] = 255;
		} else {
			this.bitmap.data[ idx + 0 ] = 0;
			this.bitmap.data[ idx + 1 ] = 0;
			this.bitmap.data[ idx + 2 ] = 0;
		}
	}

	/**
	 * Normal body text will always be white-gray text, don't need to be as aggressive here
	 **/
	filterBodyContent(x, y, idx) {
		const red   = this.bitmap.data[ idx + 0 ];
		const green = this.bitmap.data[ idx + 1 ];
		const blue  = this.bitmap.data[ idx + 2 ];
		const alpha = this.bitmap.data[ idx + 3 ];

		if (red >= 210 && green >= 210 && blue >= 210) {
			this.bitmap.data[ idx + 0 ] = 255;
			this.bitmap.data[ idx + 1 ] = 255;
			this.bitmap.data[ idx + 2 ] = 255;
		} else {
			this.bitmap.data[ idx + 0 ] = 0;
			this.bitmap.data[ idx + 1 ] = 0;
			this.bitmap.data[ idx + 2 ] = 0;
		}
	}

	/**
	 * Large text such as the pokemon name, cp, or tier information is here and will always be white-gray
	 **/
	filterLargeBodyContent(x, y, idx) {
		const red   = this.bitmap.data[ idx + 0 ];
		const green = this.bitmap.data[ idx + 1 ];
		const blue  = this.bitmap.data[ idx + 2 ];
		const alpha = this.bitmap.data[ idx + 3 ];

		if (red >= 200 && green >= 200 && blue >= 200) {
			this.bitmap.data[ idx + 0 ] = 255;
			this.bitmap.data[ idx + 1 ] = 255;
			this.bitmap.data[ idx + 2 ] = 255;
		} else {
			this.bitmap.data[ idx + 0 ] = 0;
			this.bitmap.data[ idx + 1 ] = 0;
			this.bitmap.data[ idx + 2 ] = 0;
		}
	}


	getPhoneTime(image, region) {
		return new Promise((resolve, reject) => {
			const dst1 = path.join(__dirname, this.image_path, 'cropped1a.png');
			const dst2 = path.join(__dirname, this.image_path, 'cropped1b.png');

			const width = region.width / 4;

			// checking left and right sides of image for time...
			const region1 = { x: region.x, y: region.y, width, height: region.height };
			const region2 = { x: region.width - width, y: region.y, width, height: region.height };

			let promises = [];

			promises.push(new Promise((resolve, reject) => {
				const new_image = image.clone()
					.crop(region1.x, region1.y, region1.width, region1.height)
					.scan(0, 0, region1.width, region1.height, this.filterHeaderContent)
					.getBuffer(Jimp.MIME_PNG, (err, image) => {
						if (err) { reject(err); }

						tesseract.create().recognize(image)
							// .progress(message => console.log(message))
							.catch(err => reject(err))
							.then(result => {
								const match = result.text.replace(/[-!$%^&*()_+|~=`{}\[\]"“’‘;'<>?,.\/\\\n]/g, '').match(/[0-9]{1,2}\:[0-9]{1,2}\s?((a|p)m)?/gi);
								if (match && match.length) {
									resolve(match[0]);
								} else {
									resolve();
								}
							});
					});

				if (debug) {
					new_image.write(dst1);
				}
			}));

			promises.push(new Promise((resolve, reject) => {
				const new_image = image.clone()
					.crop(region2.x, region2.y, region2.width, region2.height)
					.scan(0, 0, region2.width, region2.height, this.filterHeaderContent)
					.getBuffer(Jimp.MIME_PNG, (err, image) => {
						if (err) { reject(err); }

						tesseract.create().recognize(image)
							// .progress(message => console.log(message))
							.catch(err => reject(err))
							.then(result => {
								const match = result.text.replace(/[-!$%^&*()_+|~=`{}\[\]"“’‘;'<>?,.\/\\\n]/g, '').match(/[0-9]{1,2}\:[0-9]{1,2}\s?((a|p)m)?/gi);
								if (match && match.length) {
									resolve(match[0]);
								} else {
									resolve();
								}
							});
					});

				if (debug) {
					new_image.write(dst2);
				}
			}));

			// pass along collected data once all promises have resolved
			Promise.all(promises).then(values => {
				resolve(values[0] || values[1]);
			}).catch(err => {
				reject(err);
			});
		});
	}

	getRaidTimeRemaining(image, region) {
		return new Promise((resolve, reject) => {
			const dst1 = path.join(__dirname,  this.image_path, 'cropped5a.png');
			const dst2 = path.join(__dirname,  this.image_path, 'cropped5b.png');

			let region1 = { x: region.width - (region.width / 3.4), y: region.height - (region.height / 2.2), width: region.width / 4, height: region.height / 12 };
			let region2 = { x: 0, y: region.height / 6.4, width: region.width, height: region.height / 5 };

			let promises = [];

			promises.push(new Promise((resolve, reject) => {
				const new_image = image.clone()
					.crop(region1.x, region1.y, region1.width, region1.height)
					.scan(0, 0, region1.width, region1.height, this.filterHeaderContent)
					.getBuffer(Jimp.MIME_PNG, (err, image) => {
						if (err) { reject(err); }

						tesseract.create().recognize(image)
							// .progress(message => console.log(message))
							.catch(err => reject(err))
							.then(result => {
								const match = result.text.match(/[0-9]{1,2}\:[0-9]{1,2}\:[0-9]{1,2}/g);
								if (match && match.length) {
									resolve(match[0]);
								} else {
									resolve();
								}
							});
					});

				if (debug) {
					new_image.write(dst1);
				}
			}));

			promises.push(new Promise((resolve, reject) => {
				const new_image = image.clone()
					.crop(region2.x, region2.y, region2.width, region2.height)
					.scan(0, 0, region2.width, region2.height, this.filterHeaderContent)
					.getBuffer(Jimp.MIME_PNG, (err, image) => {
						if (err) { reject(err); }

						tesseract.create().recognize(image)
							// .progress(message => console.log(message))
							.catch(err => reject(err))
							.then(result => {
								const match = result.text.match(/[0-9]{1,2}\:[0-9]{1,2}\:[0-9]{1,2}/g);
								if (match && match.length) {
									resolve(match[0]);
								} else {
									resolve();
								}
							});
					});

				if (debug) {
					new_image.write(dst2);
				}
			}));

			// pass along collected data once all promises have resolved
			Promise.all(promises).then(values => {
				resolve([values[0] || values[1], !!values[1]]);
			}).catch(err => {
				reject(err);
			});
		});
	}

	getGymName(image, region) {
		const dst = path.join(__dirname, this.image_path, 'cropped2.png');

		return new Promise((resolve, reject) => {
			const new_image = image.clone()
				.crop(region.x, region.y, region.width, region.height)
				// .brightness(-0.1)
				.scan(0, 0, region.width, region.height, this.filterBodyContent)
				.getBuffer(Jimp.MIME_PNG, (err, image) => {
					if (err) { reject(err); }

					tesseract.create().recognize(image)
						// .progress(message => console.log(message))
						.catch(err => reject(err))
						.then(result => {
							resolve(result.text.replace(/[-!$%^&*()_+|~=`{}\[\]:"“’‘;'<>?,.\/\\\n]/g, ' ').trim());
						});
				});

			if (debug) {
				new_image.write(dst);
			}
		});
	}

	getPokemonName(image, region) {
		const dst = path.join(__dirname,  this.image_path, 'cropped3.png');

		return new Promise((resolve, reject) => {
			const new_image = image.clone()
				.crop(region.x, region.y, region.width, region.height)
				.blur(3)
				.brightness(-0.2)
				.scan(0, 0, region.width, region.height, this.filterLargeBodyContent)
				.getBuffer(Jimp.MIME_PNG, (err, image) => {
					if (err) { reject(err); }

					tesseract.create().recognize(image)
						// .progress(message => console.log(message))
						.catch(err => reject(err))
						.then(result => {
							const text = result.text.replace(/[-!$%^&*()_+|~=`{}\[\]:"“”‘;'<>?,.\/]/gi, '');
							const cp = (text.match(/[0-9]+/g) || [''])[0];
							const pokemon = text.replace(/(cp)?\s?[0-9]*/g, '');
							resolve([cp, pokemon]);
						});
				});

			if (debug) {
				new_image.write(dst);
			}
		});
	}

	getTier(image, region) {
		const dst = path.join(__dirname,  this.image_path, 'cropped4.png');

		return new Promise((resolve, reject) => {
			const new_image = image.clone()
				.crop(region.x, region.y, region.width, region.height)
				.scan(0, 0, region.width, region.height, this.filterLargeBodyContent)
				.blur(3)
				.getBuffer(Jimp.MIME_PNG, (err, image) => {
					if (err) { reject(err); }

					tesseract.create().recognize(image)
						// .progress(message => console.log(message))
						.catch(err => reject(err))
						.then(result => {
							// NOTE:  This doesn't match 1 character alone... too many jibberish character to match T1 raids like this...
							const match = result.text.replace(/[-!%^()_|~=`{}\[\]:"“’‘;'<>?,.\/]/g, '').match(/(.)\1+/g);
							if (match && match.length) {
								resolve(match[0]);
							} else {
								resolve(`Could not determine raid tier. ${result.text}`);
							}
						});
				});

			if (debug) {
				new_image.write(dst);
			}
		});
	}

	getRaidData(image, egg=false) {
		// location of cropping / preprocessing for different pieces of information (based on % width & % height for scalability purposes)
		let phone_time = { x: image.bitmap.width / 2.5, y: 0, width: image.bitmap.width, height: image.bitmap.height / 27 };
		let pokemon_name = { x: 0, y: image.bitmap.height / 6.4, width: image.bitmap.width, height: image.bitmap.height / 5 };
		let tier = { x: 0, y: image.bitmap.height / 4.0, width: image.bitmap.width, height: image.bitmap.height / 9 };
		let all = { x: 0, y: 0, width: image.bitmap.width, height: image.bitmap.height };

		return new Promise((resolve, reject) => {
			let promises = [];

			// PHONE TIME
			promises.push(this.getPhoneTime(image, phone_time));

			// TIME REMAINING
			promises.push(this.getRaidTimeRemaining(image, all));

			// POKEMON TIER
			promises.push(this.getTier(image, tier));

			// POKEMON NAME
			promises.push(this.getPokemonName(image, pokemon_name));

			// pass along collected data once all promises have resolved
			Promise.all(promises).then(values => {
				resolve({
					egg: values[1][1],
					phone_time: values[0],
					time_remaining: values[1][0],
					tier: values[2],
					cp: values[3][0],
					pokemon: values[3][1],
				});
			}).catch(err => {
				reject(err);
			});
		});
	}

	createRaid(message, data) {
		const GymType = new GymArgumentType(Helper.client);
		const PokemonType = new PokemonArgumentType(Helper.client);
		const TimeType = new TimeArgumentType(Helper.client);

		let pokemon = data.pokemon;
		let time = data.time;
		let duration = moment.duration(data.time_remaining,'hh:mm:ss');

		console.log(data);

		// if AM or PM already exists in phone_time, use phone_time as is,
		//		otherwise figure out if AM or PM would be closer to the current time
		if (data.phone_time.search(/(a|p)m/gi) >= 0) {
			time = moment(data.phone_time, 'hh:mma');
		} else {
			// else figure out if time should be AM or PM
			const time_am = moment(data.phone_time + 'am', 'hh:mma');
			const time_pm = moment(data.phone_time + 'pm', 'hh:mma');
			const times = [ time_am.diff(moment()), time_pm.diff(moment()) ]
			if (times[0] < times[1]) {
				time = time_am;
			} else {
				time = time_pm;
			}
		}

		// add time remaining to phone's current time to get final hatch or despawn time
		time = time.add(duration);
		console.log(time.format('h:mma'));

		// Need to fake ArgumentType data in order to parse time...
		message.argString = '';
		message.is_exclusive = false;

		if (PokemonType.validate(data.pokemon, message) === true) {
			pokemon = PokemonType.parse(data.pokemon, message);
		} else {
			pokemon = { name: 'pokemon', tier: '????' };
		}

		if (TimeType.validate(time.format('[at] h:mma'), message, { prompt: '' }) === true) {
			time = TimeType.parse(time.format('[at] h:mma'), message);
		} else {
			console.log(moment().add(duration).format('h:mma'));
			time = TimeType.parse(moment().add(duration).format('[at] h:mma'), message);
		}

		GymType.parse(data.gym, message).then(gym => {
			console.log(gym, pokemon, time);

			// TODO: move screenshot into newly created channel OR if all 3 pieces of information are found successfully, delete screenshot
			if (pokemon && time && gym) {
				let raid;

				Raid.createRaid(message.channel.id, message.member.id, pokemon, gym, time)
					.then(async info => {
						raid = info.raid;
						const raid_channel_message = await Raid.getRaidChannelMessage(raid),
						formatted_message = await Raid.getFormattedMessage(raid);


						return message.channel.send(raid_channel_message, formatted_message);
					})
					.then(announcement_message => {
						return Raid.setAnnouncementMessage(raid.channel_id, announcement_message);
					})
					.then(async bot_message => {
						const raid_source_channel_message = await Raid.getRaidSourceChannelMessage(raid),
						formatted_message = await Raid.getFormattedMessage(raid);
						return Raid.getChannel(raid.channel_id)
							.then(channel => channel.send(raid_source_channel_message, formatted_message))
							.catch(err => log.error(err));
					})
					.then(channel_raid_message => {
						Raid.addMessage(raid.channel_id, channel_raid_message, true);
					})
					.catch(err => log.error(err))
			} else {
				message.channel.send(Object.values(data).join('\n'));
			}
		}).catch(err => log.error(err));
	}
}

module.exports = new ImageProcess();
