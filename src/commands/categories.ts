/** Display names for help categories; ids match settings.helpGroups. */
export const CATEGORY_LABELS = {
  'basic-raid': 'Raid Basics',
  'raid-crud': 'Raid Creation and Maintenance',
  train: 'Trains',
  meetup: 'Meetups',
  roles: 'Roles',
  notifications: 'Notifications',
  friends: 'Friend Codes',
  util: 'Utility',
  admin: 'Administration',
  region: 'Region setting',
} as const;

/** A help category a command can be filed under. */
export type HelpCategory = keyof typeof CATEGORY_LABELS;
