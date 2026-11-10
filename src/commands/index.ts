import type { CommandModule, MessageCommand } from '../discord/command.js';
import { admin } from './admin/index.js';
import { friendCode, nickname } from './friends/friends.js';
import { gym } from './gyms/index.js';
import { info } from './meetups/info.js';
import { meetup } from './meetups/meetup.js';
import { places } from './meetups/places.js';
import { pokestop } from './stops/pokestop.js';
import { research } from './research/research.js';
import { rocket } from './rocket/rocket.js';
import {
  coming,
  done,
  here,
  hmm,
  interested,
  join,
  leave,
  local,
  notHere,
  remote,
} from './parties/attendance.js';
import { group } from './parties/group.js';
import { audit } from './parties/audit.js';
import { deleteParty } from './parties/delete.js';
import { report } from './parties/report.js';
import { reportMessageCommand } from './parties/report-message.js';
import { cancelMeet, meet } from './parties/meet.js';
import { name } from './parties/name.js';
import { target, targets, untarget, untargetAll } from './notifications/targets.js';
import { unwant, unwantAll, want, wants } from './notifications/wants.js';
import { wildCommand } from './notifications/wild.js';
import { shout } from './parties/shout.js';
import { status, where } from './parties/status.js';
import { boss, moveset } from './raids/boss.js';
import { location } from './raids/location.js';
import { duration, end, hatch } from './raids/change.js';
import { max } from './max/max.js';
import { raid } from './raids/raid.js';
import { readScreenshot } from './screenshots/read-screenshot.js';
import { bounds } from './regions/bounds.js';
import { region } from './regions/index.js';
import { iam, iamnot } from './roles/iam.js';
import { settings } from './settings/settings.js';
import { stats } from './stats/stats.js';
import { conductor } from './trains/conductor.js';
import { finish, next, previous, skip } from './trains/move.js';
import { route } from './trains/route.js';
import { train } from './trains/train.js';
import { bossTier } from './util/boss-tier.js';
import { counters } from './util/counters.js';
import { findGym } from './util/find-gym.js';
import { findRegion } from './util/find-region.js';
import { help } from './util/help.js';
import { maps } from './util/maps.js';
import { request } from './util/request.js';
import { leagueRanks, rank } from './util/rank.js';

/**
 * Every message command (Discord's Apps menu on a message; plan 8S-2), five at most. The router,
 * the deploy script and `/help` read this list beside `commands`.
 */
export const messageCommands: readonly MessageCommand[] = [reportMessageCommand];

/** Every slash command. The router and the deploy script both read this list. */
export const commands: readonly CommandModule[] = [
  help,
  raid,
  max,
  readScreenshot,
  train,
  meetup,
  places,
  join,
  coming,
  interested,
  hmm,
  here,
  notHere,
  done,
  leave,
  remote,
  local,
  group,
  meet,
  cancelMeet,
  status,
  where,
  bounds,
  shout,
  report,
  deleteParty,
  audit,
  hatch,
  end,
  duration,
  boss,
  moveset,
  location,
  name,
  info,
  route,
  conductor,
  next,
  previous,
  skip,
  finish,
  settings,
  want,
  unwant,
  wants,
  unwantAll,
  target,
  untarget,
  targets,
  untargetAll,
  wildCommand,
  research,
  rocket,
  iam,
  iamnot,
  friendCode,
  nickname,
  admin,
  gym,
  pokestop,
  region,
  rank,
  ...leagueRanks,
  counters,
  bossTier,
  maps,
  findGym,
  findRegion,
  stats,
  request,
];
