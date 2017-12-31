const CommandGroup = {
	ADMIN: 'admin',
	BASIC_RAID: 'basic-raid',
	RAID_CRUD: 'raid-crud',
	ROLES: 'roles',
	NOTIFICATIONS: 'notifications',
	UTIL: 'util'
};

const RaidStatus = {
	NOT_INTERESTED: -1,
	INTERESTED: 0,
	COMING: 1,
	PRESENT: 2,
	COMPLETE_PENDING: 3,
	COMPLETE: 4
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

module.exports = {CommandGroup, RaidStatus, Team, TimeMode, TimeParameter};