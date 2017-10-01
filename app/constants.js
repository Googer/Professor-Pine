const RaidStatus = {
	NOT_INTERESTED: -1,
	INTERESTED: 0,
	COMING: 1,
	PRESENT: 2,
	COMPLETE_PENDING: 3,
	COMPLETE: 4
};

const TimeMode = {
	AUTODETECT: 0,
	RELATIVE: 1,
	ABSOLUTE: 2
};

module.exports = {RaidStatus, TimeMode};