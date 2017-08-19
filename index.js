"use strict";

const Discord = require('discord.js');
const Commando = require('discord.js-commando');
const Client = new Commando.Client();

const Raid = require('./app/raid');
const LocationSearch = require('./app/location-search');

Client.registry.registerGroup('raids', 'Raids');
Client.registry.registerDefaults();
Client.registry.registerCommandsIn(__dirname + '/commands');

Client.on('ready', () => {
});

Client.on('message', (message) => {
	if (message.content === 'ping') {
		message.channel.send('pong');
	}
});


// let role = message.guild.roles.find("name", "Team Mystic");
//
// // Let's pretend you mentioned the user you want to add a role to (!addrole @user Role Name):
// let member = message.mentions.members.first();
//
// // or the person who made the command: let member = message.member;
//
// // Add the role!
// member.addRole(role).catch(console.error);
//
// // Remove a role!
// member.removeRole(role).catch(console.error);

Client.login('MzQ4MTA3MTQyNzgxMzM3NjAx.DHiHpQ.ERN3QnVneiXkVj_TpAGlwz5_eDo');
