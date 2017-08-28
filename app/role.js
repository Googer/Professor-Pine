"use strict";

const DBManager = require('./../app/db');
const moment = require('moment');
const settings = require('./../data/settings');

class Role {
	constructor() {
	}

	addNewRole(channel, member, roles) {
		DBManager.insertData(channel, 'role', {}, () => {

		});
	}

	removeOldRole(channel, member, roles) {

	}

	assignRole(channel, member, role) {
		const id = member.guild.roles.find('name', role);

		if (!id) {
			return { error: `Role ${role} was not found.` }
		}

		member.addRole(id);
	}
}


module.exports = new Role();
