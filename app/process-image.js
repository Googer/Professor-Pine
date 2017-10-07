"use strict";

const log = require('loglevel').getLogger('Raid'),
	path = require('path'),
	tesseract = require('tesseract.js'),
	moment = require('moment'),
	Helper = require('../app/helper'),
	Jimp = require('Jimp'),
	GymType = require('../types/gym'),
	TimeType = require('../types/time'),
	PokemonType = require('../types/pokemon'),
	Raid = require('../app/raid');

const debug = true;//function checkDebugFlag() { for (let arg of process.argv) { if (arg == '--debug') { return true } } return false; }();

class ImageProcess {
	constructor() {
		this.image_path = '/../../processing/';
	}

	process(message, url) {
		// easier test case
		if (message.content == 'ping') {
			url = path.join(__dirname, this.image_path, 'image19.png');
		}

		Jimp.read(url).then((image) => {
			if (!image) { return; }

			// resize to some standard size to help tesseract
			image.scaleToFit(1440, 2560, Jimp.RESIZE_HERMITE);

			// some phones are really wierd? and have way too much height to them, and need this check to push cropping around a bit
			const check_phone_color = Jimp.intToRGBA(image.getPixelColor(0, 85));

			// location of cropping / preprocessing for different pieces of information
			let time_remaining_a = { x: image.bitmap.width - (image.bitmap.width / 3.4), y: image.bitmap.height - (image.bitmap.height / 2.2), width: image.bitmap.width / 4, height: image.bitmap.height / 12 };
			let time_remaining_b = { x: 0, y: image.bitmap.height / 6.4, width: image.bitmap.width, height: image.bitmap.height / 5 };

			// special case for some kind of odd vertical phone
			if (check_phone_color.r <= 20 && check_phone_color.g <= 20 && check_phone_color.b <= 20) {
				gym_location.y += 100;
			}


			return new Promise((resolve, reject) => {
				let promises = [];

				// FIRST STEP:  Determine if the screenshot is a hatched raid boss, or an egg
				//		best way to do that (I think?) is to check where the raid time remaining is on the screen
				this.getRaidTimeRemaining(image, time_remaining_a).then(time => {
					console.log('A: ', time);

					// if first location (bottom-right) didn't contain a time, check second location (top-middle)
					if (!time) {
						this.getRaidTimeRemaining(image, time_remaining_b).then(time => {
							console.log('B: ', time);

							this.getRaidData(image, true).then(values => {
								// add time remaining to list of values
								values.push(time);
								resolve(values);
							});
						});
					} else {
						this.getRaidData(image).then(values => {
							// add time remaining to list of values
							values.push(time);
							resolve(values);
						});
					}
				});
			});
		}).then(values => {
			this.createRaid(message, values);
		}).catch(err => console.log(err));
	}

	blacken(x, y, idx) {
		var red   = this.bitmap.data[ idx + 0 ];
		var green = this.bitmap.data[ idx + 1 ];
		var blue  = this.bitmap.data[ idx + 2 ];
		var alpha = this.bitmap.data[ idx + 3 ];

		if ((red >= 190 && green >= 200 && blue >= 200) || (red <= 70 && green <= 70 && blue <= 70)) {
			// black & white pixels should be white
			if (red >= 190 && green >= 200 && blue >= 200) {
				this.bitmap.data[ idx + 0 ] = 255;
				this.bitmap.data[ idx + 1 ] = 255;
				this.bitmap.data[ idx + 2 ] = 255;
			} else {
				this.bitmap.data[ idx + 0 ] = 0;
				this.bitmap.data[ idx + 1 ] = 0;
				this.bitmap.data[ idx + 2 ] = 0;
			}
		} else {
			this.bitmap.data[ idx + 0 ] = 255;
			this.bitmap.data[ idx + 1 ] = 0;
			this.bitmap.data[ idx + 2 ] = 0;
		}
	}

	// more extreme version...
	blacken2(x, y, idx) {
		var red   = this.bitmap.data[ idx + 0 ];
		var green = this.bitmap.data[ idx + 1 ];
		var blue  = this.bitmap.data[ idx + 2 ];
		var alpha = this.bitmap.data[ idx + 3 ];

		if ((red >= 220 && green >= 220 && blue >= 220) || (red <= 30 && green <= 30 && blue <= 30)) {
			// black & white pixels should be white
			if (red >= 220 && green >= 220 && blue >= 220) {
				this.bitmap.data[ idx + 0 ] = 255;
				this.bitmap.data[ idx + 1 ] = 255;
				this.bitmap.data[ idx + 2 ] = 255;
			} else {
				this.bitmap.data[ idx + 0 ] = 0;
				this.bitmap.data[ idx + 1 ] = 0;
				this.bitmap.data[ idx + 2 ] = 0;
			}
		} else {
			this.bitmap.data[ idx + 0 ] = 255;
			this.bitmap.data[ idx + 1 ] = 0;
			this.bitmap.data[ idx + 2 ] = 0;
		}
	}


	getPhoneTime(image, region) {
		return new Promise((resolve, reject) => {
			const dst1 = path.join(__dirname, this.image_path, 'cropped1a.png');
			const dst2 = path.join(__dirname, this.image_path, 'cropped1b.png');

			const width = region.width / 5;

			// checking left and right sides of image for time...
			const region1 = { x: region.x, y: region.y, width, height: region.height };
			const region2 = { x: region.width - width, y: region.y, width, height: region.height };

			let promises = [];

			promises.push(new Promise((resolve, reject) => {
				const new_image = image.clone()
					.crop(region1.x, region1.y, region1.width, region1.height)
					.scan(0, 0, region1.width, region1.height, this.blacken)
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
					.scan(0, 0, region2.width, region2.height, this.blacken)
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

	getGymName(image, region) {
		const dst = path.join(__dirname, this.image_path, 'cropped2.png');

		return new Promise((resolve, reject) => {
			const new_image = image.clone()
				.crop(region.x, region.y, region.width, region.height)
				// .brightness(-0.1)
				.scan(0, 0, region.width, region.height, this.blacken)
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
				.scan(0, 0, region.width, region.height, this.blacken)
				.getBuffer(Jimp.MIME_PNG, (err, image) => {
					if (err) { reject(err); }

					tesseract.create().recognize(image)
						// .progress(message => console.log(message))
						.catch(err => reject(err))
						.then(result => {
							resolve(result.text.replace(/(CP|cp)?\s?[0-9]*/g, '').replace(/[-!$%^&*()_+|~=`{}\[\]:"“;'<>?,.\/\n\s]/g, ''));
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
				.scan(0, 0, region.width, region.height, this.blacken2)
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

	getRaidTimeRemaining(image, region) {
		const dst = path.join(__dirname,  this.image_path, 'cropped5.png');

		return new Promise((resolve, reject) => {
			const new_image = image.clone()
				.crop(region.x, region.y, region.width, region.height)
				.scan(0, 0, region.width, region.height, this.blacken2)
				.getBuffer(Jimp.MIME_PNG, (err, image) => {
					if (err) { reject(err); }

					tesseract.create().recognize(image)
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
				new_image.write(dst);
			}
		});
	}

	getRaidData(image, egg=false) {
		// location of cropping / preprocessing for different pieces of information
		let phone_time = { x: image.bitmap.width / 2.5, y: 0, width: image.bitmap.width, height: image.bitmap.height / 27 };
		let gym_location = { x: image.bitmap.width / 5.1, y: image.bitmap.height / 26, width: image.bitmap.width - (image.bitmap.width / 2.55), height: image.bitmap.height / 13 };
		let pokemon_name = { x: 0, y: image.bitmap.height / 6.4, width: image.bitmap.width, height: image.bitmap.height / 5 };
		let tier = { x: 0, y: image.bitmap.height / 4.0, width: image.bitmap.width, height: image.bitmap.height / 9 };

		return new Promise((resolve, reject) => {
			let promises = [];

			// PHONE TIME
			promises.push(this.getPhoneTime(image, phone_time));

			// GYM NAME
			promises.push(this.getGymName(image, gym_location));

			if (egg) {
				// POKEMON NAME
				promises.push(this.getTier(image, tier));
			} else {
				// POKEMON NAME
				promises.push(this.getPokemonName(image, pokemon_name));
			}

			// pass along collected data once all promises have resolved
			Promise.all(promises).then(values => {
				resolve(values);
			}).catch(err => {
				reject(err);
			});
		});
	}

	createRaid(message, values) {
		console.log(values);
		let gym = values[1];
		let pokemon = values[2];
		let time;

		// if AM or PM already exists in time, use time as is
		if (values[0].search(/(a|p)m/gi) >= 0) {
			time = moment(values[0], 'hh:mma');
		} else {
			// else figure out if time should be AM or PM
			const time_am = moment(values[0] + 'am', 'hh:mma');
			const time_pm = moment(values[0] + 'pm', 'hh:mma');
			const times = [ time_am.diff(moment()), time_pm.diff(moment()) ]
			if (times[0] < times[1]) {
				time = time_am;
			} else {
				time = time_pm;
			}
		}

		pokemon = (new PokemonType(Helper.client)).parse(pokemon, { message, client: Helper.client });
		time = (new TimeType(Helper.client)).parse(time.format('hh:mma'), { message, client: Helper.client, argString: '' });
		gym = (new GymType(Helper.client)).parse(gym, message).then(gym => {
			console.log(gym, pokemon, time);

			if (values[0].length && values[1].length && values[2].length && values[3].length) {
				let raid;

				Raid.createRaid(message.channel.id, message.member.id, pokemon, gym, time)
					.then(async info => {
						raid = info.raid;
						const raid_channel_message = await Raid.getRaidChannelMessage(raid),
						formatted_message = await Raid.getFormattedMessage(raid);

						// TODO: move screenshot into newly created channel if all 3 pieces of information are not found

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
				channel.send(values.join('\n'));
			}
		});
	}
}

module.exports = new ImageProcess();
