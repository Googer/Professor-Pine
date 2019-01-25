const express = require('express'),
  Gym = require('../gym'),
  PartyManager = require('../party-manager'),
  {PartyType} = require('../constants'),
  settings = require('../../data/settings');

class WebServer {
  constructor() {
  }

  initialize() {
    const server = express();
    this.server = server;

    server.listen(settings.web.port || 8081);

    server.route('/raids')
      .get(WebServer.getRaids);

    server.route('/raid/:gymId')
      .get(WebServer.getRaid);

    server.route('/trains')
      .get(WebServer.getTrains);

    server.route('/trains/:trainId')
      .get(WebServer.getTrain);
  }

  static async getRaids(request, response) {
    const raids = PartyManager.getAllParties(undefined, PartyType.RAID);

    response.json(await Promise.all(raids
      .map(WebServer.convertRaid)));
  }

  static async getTrains(request, response) {
    const raidTrains = PartyManager.getAllParties(undefined, PartyType.RAID_TRAIN);

    response.json(await Promise.all(raidTrains
      .map(WebServer.convertTrain)));
  }

  static async getTrain(request, response) {
    const raidTrain = PartyManager.findRaidTrain(request.params.trainId);

    if (!!raidTrain) {
      response.json(await WebServer.convertTrain(raidTrain));
    } else {
      response
        .status(404)
        .send({url: request.originalUrl + ' not found'});
    }
  }

  static async getRaid(request, response) {
    const raid = PartyManager.findRaid(request.params.gymId);

    if (!!raid) {
      response.json(await WebServer.convertRaid(raid));
    } else {
      response
        .status(404)
        .send({url: request.originalUrl + ' not found'});
    }
  }

  static async convertRaid(raid) {
    const gym = Gym.getGym(raid.gymId),
      channelResult = await PartyManager.getChannel(raid.channelId),
      channelName = channelResult.ok ?
        channelResult.channel.name :
        'nonexistent';

    return {
      gymId: raid.gymId,
      name: channelName,
      latitude: gym.gymInfo.latitude,
      longitude: gym.gymInfo.longitude,
      boss: raid.pokemon,
      hatchTime: raid.hatchTime,
      endTime: raid.endTime,
      groups: raid.groups,
      attendees: raid.attendees
    };
  }

  static convertTrain(raidTrain) {
    return {};
  }
}

module.exports = new WebServer();
