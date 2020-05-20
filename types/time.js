"use strict";

const Commando = require('discord.js-commando'),
  moment = require('moment'),
  {PartyType, TimeMode, TimeParameter} = require('../app/constants'),
  settings = require('../data/settings.json');

let PartyManager;

process.nextTick(() => PartyManager = require('../app/party-manager'));

class TimeType extends Commando.ArgumentType {
  constructor(client) {
    super(client, 'time');
  }

  validate(value, message, arg) {
    const isExRaid = this.isExclusiveRaid(value, message, arg),
      partyExists = PartyManager.validParty(message.channel.id),
      party = PartyManager.getParty(message.channel.id),
      partyType = partyExists ?
        party.type :
        PartyType.RAID,
      now = moment(),
      partyCreationTime = partyExists ?
        moment(party.creationTime) :
        now,
      raidHatchTime = partyExists && !!party.hatchTime ?
        moment(party.hatchTime) :
        undefined,
      incubationDuration = isExRaid ?
        settings.exclusiveRaidIncubateDuration :
        settings.standardRaidIncubateDuration,
      hatchedDuration = partyExists && !!party.duration ?
        party.duration :
        isExRaid ?
          settings.exclusiveRaidHatchedDuration :
          settings.standardRaidHatchedDuration;

    let firstPossibleTime,
      maxDuration,
      lastPossibleTime,
      isTrainOrMeetup,
      trainOrMeetupMeetingTime;

    isTrainOrMeetup = (partyType === PartyType.RAID_TRAIN || partyType === PartyType.MEETUP);
    trainOrMeetupMeetingTime = isTrainOrMeetup ?
      moment(party.startTime) :
      undefined;

    // Figure out valid first and last possible times for this time
    switch (arg.key) {
      case TimeParameter.MEET: {
        switch (partyType) {
          case PartyType.RAID: {
            // Start time - valid range is now (or hatch time if it exists, whichever is later)
            // through raid's end time
            const hatchTime = party ?
              party.hatchTime :
              undefined,
              endTime = party ?
                party.endTime :
                undefined;

            if (hatchTime) {
              const hatchTimeMoment = moment(hatchTime);

              firstPossibleTime = now.isAfter(hatchTimeMoment) ?
                now :
                hatchTimeMoment;
            } else {
              firstPossibleTime = now;
            }

            const partyEndTime = endTime !== TimeType.UNDEFINED_END_TIME ?
              moment(endTime) :
              partyCreationTime.clone().add(incubationDuration + hatchedDuration, 'minutes');

            if (isTrainOrMeetup) {
              maxDuration = settings.maximumMeetupLeadtime;
              lastPossibleTime = partyCreationTime.clone().add(maxDuration, 'days');
            } else {
              maxDuration = incubationDuration + hatchedDuration;
              lastPossibleTime = partyEndTime;
            }
            break;
          }

          case PartyType.RAID_TRAIN:
          case PartyType.MEETUP: {
            firstPossibleTime = partyCreationTime;
            maxDuration = settings.maxMeetupLeadupDuration;
            lastPossibleTime = partyCreationTime.clone().add(maxDuration, 'minutes');
            break;
          }
        }
        break;
      }

      case TimeParameter.HATCH: {
        // Hatch time - valid range is up to hatched duration in the past
        // through incubation period past raid creation time
        firstPossibleTime = now.clone().add(-hatchedDuration, 'minutes');
        maxDuration = incubationDuration;
        lastPossibleTime = partyCreationTime.clone().add(maxDuration, 'minutes');
        break;
      }

      case TimeParameter.END: {
        // End time - valid range is now through incubation plus hatch duration past creation time
        firstPossibleTime = now;

        if (isTrainOrMeetup) {
          maxDuration = settings.maximumMeetupLeadtime + 1;
          lastPossibleTime = partyCreationTime.clone().add(maxDuration, 'days');
        } else {
          maxDuration = incubationDuration + hatchedDuration;
          lastPossibleTime = partyCreationTime.clone().add(maxDuration, 'minutes');
        }

        break;
      }
    }

    let valueToParse = value.trim(),
      possibleTimes = [],
      timeMode = TimeMode.AUTODETECT;

    if (valueToParse.match(/^in/i)) {
      valueToParse = valueToParse.substring(2).trim();
      timeMode = TimeMode.RELATIVE;
    } else if (raidHatchTime && ['hatch', 'start'].indexOf(valueToParse.toLowerCase()) !== -1) {
      valueToParse = raidHatchTime.format('h:m a');
      timeMode = TimeMode.ABSOLUTE;
    } else if (['unset', 'cancel', 'none'].indexOf(valueToParse.toLowerCase()) !== -1) {
      // mark this is a valid time.
      return true;
    } else if (isTrainOrMeetup === true) {
      timeMode = TimeMode.ABSOLUTE;
    } else {
      const absoluteMatch = valueToParse.match(/^at(.*)|(.*[ap]m?)$/i);

      if (absoluteMatch) {
        valueToParse = (absoluteMatch[1] || absoluteMatch[2]).trim();
        timeMode = TimeMode.ABSOLUTE;
      }
    }

    if (timeMode !== TimeMode.ABSOLUTE) {
      let duration;

      if (valueToParse.indexOf(':') === -1) {
        duration = moment.duration(Number.parseInt(valueToParse), 'minutes');
      } else {
        const anyDuration = valueToParse.split(':')
          .map(part => Number.parseInt(part))
          .find(number => number !== 0) !== undefined;

        if (anyDuration) {
          duration = moment.duration(valueToParse);

          if (duration.isValid() && duration.asMilliseconds() === 0) {
            // set to invalid duration
            duration = moment.duration.invalid();
          }
        } else {
          duration = moment.duration(0);
        }
      }

      if (moment.isDuration(duration) && duration.isValid() && duration.asMinutes() < maxDuration) {
        possibleTimes.push(now.clone().add(duration));
      }
    }

    if (timeMode !== TimeMode.RELATIVE) {
      const enteredDate = moment(valueToParse, ['hmm a', 'Hmm', 'h:m a', 'H:m', 'M-D hmm a', 'M-D Hmm', 'M-D h:m a', 'M-D H:m', 'M-D h a', 'M-D H']);

      if (enteredDate.isValid()) {
        possibleTimes.push(...TimeType.generateTimes(enteredDate, arg.key, partyType, isTrainOrMeetup ? trainOrMeetupMeetingTime : raidHatchTime));
      }
    }

    if (possibleTimes.length === 0) {
      return `"${value}" is not a valid duration or time!\n\n${arg.prompt}`;
    }

    if (possibleTimes.find(possibleTime =>
      this.isValidTime(possibleTime, firstPossibleTime, lastPossibleTime))) {
      return true;
    }

    const calendarFormat = {
        sameDay: 'LT',
        sameElse: 'l LT'
      },
      firstPossibleFormattedTime = firstPossibleTime.calendar(null, calendarFormat),
      lastPossibleFormattedTime = lastPossibleTime.calendar(null, calendarFormat);

    return `"${value}" is not valid for this ${partyType} - valid time range is between ${firstPossibleFormattedTime} and ${lastPossibleFormattedTime}!\n\n${arg.prompt}`;
  }

  parse(value, message, arg) {
    const isExRaid = this.isExclusiveRaid(value, message, arg),
      partyExists = PartyManager.validParty(message.channel.id),
      party = PartyManager.getParty(message.channel.id),
      partyType = partyExists ?
        party.type :
        PartyType.RAID,
      now = moment(),
      partyCreationTime = partyExists ?
        moment(party.creationTime) :
        now,
      raidHatchTime = partyExists && !!PartyManager.getParty(message.channel.id).hatchTime ?
        moment(party.hatchTime) :
        undefined,
      incubationDuration = isExRaid ?
        settings.exclusiveRaidIncubateDuration :
        settings.standardRaidIncubateDuration,
      hatchedDuration = partyExists && !!party.duration ?
        party.duration :
        isExRaid ?
          settings.exclusiveRaidHatchedDuration :
          settings.standardRaidHatchedDuration;

    let firstPossibleTime,
      maxDuration,
      lastPossibleTime,
      isTrainOrMeetup,
      trainOrMeetupMeetingTime;

    isTrainOrMeetup = (partyType === PartyType.RAID_TRAIN || partyType === PartyType.MEETUP);
    trainOrMeetupMeetingTime = isTrainOrMeetup ?
      moment(party.startTime) :
      undefined;

    // Figure out valid first and last possible times for this time
    switch (arg.key) {
      case TimeParameter.MEET: {
        switch (partyType) {
          case PartyType.RAID: {
            // Start time - valid range is now (or hatch time if it exists, whichever is later)
            // through raid's end time
            const hatchTime = partyExists ?
              party.hatchTime :
              undefined,
              endTime = partyExists ?
                party.endTime :
                undefined;

            if (hatchTime) {
              const hatchTimeMoment = moment(hatchTime);

              firstPossibleTime = now.isAfter(hatchTimeMoment) ?
                now :
                hatchTimeMoment;
            } else {
              firstPossibleTime = now;
            }

            const partyEndTime = endTime !== TimeType.UNDEFINED_END_TIME ?
              moment(endTime) :
              partyCreationTime.clone().add(incubationDuration + hatchedDuration, 'minutes');

            if (isTrainOrMeetup) {
              maxDuration = settings.maximumMeetupLeadtime;
              lastPossibleTime = partyCreationTime.clone().add(maxDuration, 'days');
            } else {
              maxDuration = incubationDuration + hatchedDuration;
              lastPossibleTime = partyEndTime;
            }
            break;
          }

          case PartyType.RAID_TRAIN:
          case PartyType.MEETUP: {
            firstPossibleTime = partyCreationTime;
            maxDuration = settings.maxMeetupLeadupDuration;
            lastPossibleTime = partyCreationTime.clone().add(maxDuration, 'minutes');
            break;
          }
        }
        break;
      }

      case TimeParameter.HATCH: {
        // Hatch time - valid range is up to hatched duration in the past
        // through incubation period past raid creation time
        firstPossibleTime = now.clone().add(-hatchedDuration, 'minutes');
        maxDuration = incubationDuration;
        lastPossibleTime = partyCreationTime.clone().add(maxDuration, 'minutes');
        break;
      }

      case TimeParameter.END: {
        // End time - valid range is now through incubation plus hatch duration past creation time
        firstPossibleTime = now;
        if (isTrainOrMeetup) {
          maxDuration = settings.maximumMeetupLeadtime + 1;
          lastPossibleTime = partyCreationTime.clone().add(maxDuration, 'days');
        } else {
          maxDuration = incubationDuration + hatchedDuration;
          lastPossibleTime = partyCreationTime.clone().add(maxDuration, 'minutes');
        }

        break;
      }
    }

    let valueToParse = value.trim(),
      possibleTimes = [],
      timeMode = TimeMode.AUTODETECT;

    if (valueToParse.match(/^in/i)) {
      valueToParse = valueToParse.substring(2).trim();
      timeMode = TimeMode.RELATIVE;
    } else if (raidHatchTime && ['hatch', 'start'].indexOf(valueToParse.toLowerCase()) !== -1) {
      valueToParse = raidHatchTime.format('h:m a');
      timeMode = TimeMode.ABSOLUTE;
    } else if (['unset', 'cancel', 'none'].indexOf(valueToParse.toLowerCase()) !== -1) {
      // return a value to indicate unset & meet.
      return -1;
    } else if (isTrainOrMeetup === true) {
      timeMode = TimeMode.ABSOLUTE;
    } else {
      const absoluteMatch = valueToParse.match(/^at(.*)|(.*[ap]m?)$/i);

      if (absoluteMatch) {
        valueToParse = (absoluteMatch[1] || absoluteMatch[2]).trim();
        timeMode = TimeMode.ABSOLUTE;
      }
    }

    if (timeMode !== TimeMode.ABSOLUTE) {
      let duration;

      if (valueToParse.indexOf(':') === -1) {
        duration = moment.duration(Number.parseInt(valueToParse), 'minutes');
      } else {
        const anyDuration = valueToParse.split(':')
          .map(part => Number.parseInt(part))
          .find(number => number !== 0) !== undefined;

        if (anyDuration) {
          duration = moment.duration(valueToParse);

          if (duration.isValid() && duration.asMilliseconds() === 0) {
            // set to invalid duration
            duration = moment.duration.invalid();
          }
        } else {
          duration = moment.duration(0);
        }
      }

      if (moment.isDuration(duration) && duration.isValid() && duration.asMinutes() < maxDuration) {
        possibleTimes.push(now.clone().add(duration));
      }
    }

    if (timeMode !== TimeMode.RELATIVE) {
      const enteredDate = moment(valueToParse, ['hmm a', 'Hmm', 'h:m a', 'H:m', 'M-D hmm a', 'M-D Hmm', 'M-D h:m a', 'M-D H:m', 'M-D h a', 'M-D H']);

      if (enteredDate.isValid()) {
        possibleTimes.push(...TimeType.generateTimes(enteredDate, arg.key, partyType, isTrainOrMeetup ? trainOrMeetupMeetingTime : raidHatchTime));
      }
    }

    return possibleTimes.find(possibleTime =>
      this.isValidTime(possibleTime, firstPossibleTime, lastPossibleTime)).valueOf();
  }

  isExclusiveRaid(value, message, arg) {
    // first check is message has isExclusive set - the create command embeds it in the
    // CommandMessage for the sole purpose of checking it here from outside the raid channel
    return message.isExclusive !== undefined ?
      message.isExclusive :
      PartyManager.getParty(message.channel.id).isExclusive;
  }

  static generateTimes(possibleDate, timeParameter, partyType, partyMeetingOrHatchTime) {
    const possibleDates = [],
      dateFormat = possibleDate.creationData().format,
      hour = possibleDate.hour(),
      ambiguouslyAM = hour < 12 && !dateFormat.endsWith('a'),
      containsDate = dateFormat.includes('D');

    if (timeParameter === TimeParameter.MEET && !containsDate && partyMeetingOrHatchTime !== undefined) {
      possibleDate.date(partyMeetingOrHatchTime.date());
      possibleDate.month(partyMeetingOrHatchTime.month());
      possibleDate.year(partyMeetingOrHatchTime.year());
    }

    if ((partyType === PartyType.RAID_TRAIN || partyType === PartyType.MEETUP) && timeParameter === TimeParameter.END && !containsDate && partyMeetingOrHatchTime !== undefined) {
      possibleDate.date(partyMeetingOrHatchTime.date());
      possibleDate.month(partyMeetingOrHatchTime.month());
      possibleDate.year(partyMeetingOrHatchTime.year());
    }

    possibleDates.push(possibleDate);

    // try next year to allow for year wrap
    possibleDates.push(possibleDate.clone()
      .year(possibleDate.year() + 1));

    if (ambiguouslyAM) {
      // try pm time as well
      possibleDates.push(possibleDate.clone()
        .hour(possibleDate.hour() + 12));

      // try next year pm time as well
      possibleDates.push(possibleDate.clone()
        .hour(possibleDate.hour() + 12)
        .year(possibleDate.year() + 1));
    }

    return possibleDates;
  }

  isValidTime(dateToCheck, firstPossibleTime, lastPossibleTime) {
    return dateToCheck.isBetween(firstPossibleTime, lastPossibleTime, undefined, '[]');
  }

  static get UNDEFINED_END_TIME() {
    return 'unset';
  }
}

module.exports = TimeType;
