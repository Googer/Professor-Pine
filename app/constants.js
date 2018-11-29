const CommandGroup = {
  ADMIN: 'admin',
  COMMANDS: 'commands',
  BASIC_RAID: 'basic-raid',
  RAID_CRUD: 'raid-crud',
  REGION: 'region',
  ROLES: 'roles',
  NOTIFICATIONS: 'notifications',
  UTIL: 'util'
};

const GymParameter = {
  FAVORITE: 'favorite'
};

const PrivacyOpts = {
  ANONYMOUS: 1,
  VISIBLE: 0
};

const PartyStatus = {
  NOT_INTERESTED: -1,
  INTERESTED: 0,
  COMING: 1,
  PRESENT: 2,
  COMPLETE_PENDING: 3,
  COMPLETE: 4
};

const PartyType = {
  RAID: 'raid',
  RAID_TRAIN: 'raid train',
  MEETUP: 'meet-up'
};

const Team = {
  NONE: 0,
  INSTINCT: 1,
  MYSTIC: 2,
  VALOR: 3
};

const TimeMode = {
  AUTODETECT: 0,
  RELATIVE: 1,
  ABSOLUTE: 2
};

const TimeParameter = {
  HATCH: 'hatch',
  START: 'start',
  END: 'end'
};

module.exports = {CommandGroup, GymParameter, PartyStatus, PartyType, Team, TimeMode, TimeParameter, PrivacyOpts};
