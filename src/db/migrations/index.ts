import type { Migration } from 'kysely/migration';
import { baseline } from './2026_10_09_000_baseline.js';
import { raidBosses } from './2026_10_10_001_raid_bosses.js';
import { parties } from './2026_10_11_002_parties.js';
import { raidBossImage } from './2026_10_11_003_raid_boss_image.js';
import { partyAccessGrants } from './2026_10_11_004_party_access_grants.js';
import { pokemonNotificationForm } from './2026_10_12_005_pokemon_notification_form.js';
import { newTrainNotifications } from './2026_10_12_006_new_train_notifications.js';
import { unownWantGifts } from './2026_10_12_007_unown_want_gifts.js';
import { selfRoleGroups } from './2026_10_13_008_self_role_groups.js';
import { exWantsToElite } from './2026_10_13_009_ex_wants_to_elite.js';
import { spawnReports } from './2026_10_13_010_spawn_reports.js';
import { regionChannelUnique } from './2026_10_13_011_region_channel_unique.js';
import { wayfarer } from './2026_10_15_012_wayfarer.js';
import { savedRouteAtEnd } from './2026_10_16_013_saved_route_at_end.js';
import { gymLookups } from './2026_10_16_014_gym_lookups.js';
import { webSession } from './2026_10_16_015_web_session.js';
import { wayspot } from './2026_10_16_017_wayspot.js';
import { partyHistory } from './2026_10_16_018_party_history.js';
import { meetupSafety } from './2026_10_17_019_meetup_safety.js';
import { trainSplit } from './2026_10_17_020_train_split.js';
import { meetupRequestSource } from './2026_10_17_021_meetup_request_source.js';
import { moderationReports } from './2026_10_17_022_moderation_reports.js';
import { meetupRequestFailure } from './2026_10_18_023_meetup_request_failure.js';
import { scriptAccess } from './2026_10_19_024_script_access.js';
import { maxBattleHistory } from './2026_10_21_025_max_battle_history.js';
import { trainSpotStops } from './2026_10_21_026_train_spot_stops.js';
import { stopReports } from './2026_10_21_027_stop_reports.js';
import { rocket } from './2026_10_22_028_rocket.js';
import { maxEvents } from './2026_10_22_029_max_events.js';
import { costumedWants } from './2026_10_22_030_costumed_wants.js';
import { regionBoard } from './2026_10_25_031_region_board.js';
import { googleLine } from './2026_10_26_032_google_line.js';
import { eventsForum } from './2026_10_29_033_events_forum.js';
import { researchTaskEnds } from './2026_10_31_034_research_task_ends.js';
import { wayspotAddress } from './2026_11_04_035_wayspot_address.js';
import { stopReportHistory } from './2026_11_04_036_stop_report_history.js';
import { reachAndWantCounts } from './2026_11_04_037_reach_and_want_counts.js';
import { activityBuckets } from './2026_11_05_038_activity_buckets.js';
import { conductors } from './2026_11_05_039_conductors.js';
import { leaderboardOptIn } from './2026_11_05_040_leaderboard_opt_in.js';
import { trainCardFacts } from './2026_11_05_041_train_card.js';
import { activityDays } from './2026_11_06_042_activity_days.js';
import { legacyFillIn } from './2026_11_06_043_legacy_fill_in.js';
import { spawnsOnMap } from './2026_11_07_044_spawns_on_map.js';
import { partyAudit } from './2026_11_07_045_party_audit.js';
import { endedPartyCopies } from './2026_11_07_046_ended_party_copies.js';
import { meetupRequestEnd } from './2026_11_07_047_meetup_request_end.js';
import { checkedForeignKeys } from './2026_11_07_048_checked_foreign_keys.js';
import { eventWindow } from './2026_11_09_049_event_window.js';
import { sweepIndexes } from './2026_11_10_050_sweep_indexes.js';
import { forgettableMembers } from './2026_11_10_051_forgettable_members.js';
import { serverSettings } from './2026_11_12_052_server_settings.js';
import { serverSettingsAudit } from './2026_11_12_053_server_settings_audit.js';
import { feedLocalTimes } from './2026_11_13_054_feed_local_times.js';
import { maxBossStart } from './2026_11_13_055_max_boss_start.js';
import { gymServers } from './2026_11_13_056_gym_servers.js';
import { memberIndexes } from './2026_11_13_057_member_indexes.js';
import { pokemonNicknames } from './2026_11_13_058_pokemon_nicknames.js';
import { serverWayspots } from './2026_11_13_059_server_wayspots.js';
import { dmContacts } from './2026_11_13_060_dm_contacts.js';

/**
 * Every migration, keyed by name. Kysely applies them in name order, so names are
 * `YYYY_MM_DD_NNN_description`. Add new migrations here; never rename or remove one.
 */
export const migrations: Record<string, Migration> = {
  '2026_10_09_000_baseline': baseline,
  '2026_10_10_001_raid_bosses': raidBosses,
  '2026_10_11_002_parties': parties,
  '2026_10_11_003_raid_boss_image': raidBossImage,
  '2026_10_11_004_party_access_grants': partyAccessGrants,
  '2026_10_12_005_pokemon_notification_form': pokemonNotificationForm,
  '2026_10_12_006_new_train_notifications': newTrainNotifications,
  '2026_10_12_007_unown_want_gifts': unownWantGifts,
  '2026_10_13_008_self_role_groups': selfRoleGroups,
  '2026_10_13_009_ex_wants_to_elite': exWantsToElite,
  '2026_10_13_010_spawn_reports': spawnReports,
  '2026_10_13_011_region_channel_unique': regionChannelUnique,
  '2026_10_15_012_wayfarer': wayfarer,
  '2026_10_16_013_saved_route_at_end': savedRouteAtEnd,
  '2026_10_16_014_gym_lookups': gymLookups,
  '2026_10_16_015_web_session': webSession,
  '2026_10_16_017_wayspot': wayspot,
  '2026_10_16_018_party_history': partyHistory,
  '2026_10_17_019_meetup_safety': meetupSafety,
  '2026_10_17_020_train_split': trainSplit,
  '2026_10_17_021_meetup_request_source': meetupRequestSource,
  '2026_10_17_022_moderation_reports': moderationReports,
  '2026_10_18_023_meetup_request_failure': meetupRequestFailure,
  '2026_10_19_024_script_access': scriptAccess,
  '2026_10_21_025_max_battle_history': maxBattleHistory,
  '2026_10_21_026_train_spot_stops': trainSpotStops,
  '2026_10_21_027_stop_reports': stopReports,
  '2026_10_22_028_rocket': rocket,
  '2026_10_22_029_max_events': maxEvents,
  '2026_10_22_030_costumed_wants': costumedWants,
  '2026_10_25_031_region_board': regionBoard,
  '2026_10_26_032_google_line': googleLine,
  '2026_10_29_033_events_forum': eventsForum,
  '2026_10_31_034_research_task_ends': researchTaskEnds,
  '2026_11_04_035_wayspot_address': wayspotAddress,
  '2026_11_04_036_stop_report_history': stopReportHistory,
  '2026_11_04_037_reach_and_want_counts': reachAndWantCounts,
  '2026_11_05_038_activity_buckets': activityBuckets,
  '2026_11_05_039_conductors': conductors,
  '2026_11_05_040_leaderboard_opt_in': leaderboardOptIn,
  '2026_11_05_041_train_card': trainCardFacts,
  '2026_11_06_042_activity_days': activityDays,
  '2026_11_06_043_legacy_fill_in': legacyFillIn,
  '2026_11_07_044_spawns_on_map': spawnsOnMap,
  '2026_11_07_045_party_audit': partyAudit,
  '2026_11_07_046_ended_party_copies': endedPartyCopies,
  '2026_11_07_047_meetup_request_end': meetupRequestEnd,
  '2026_11_07_048_checked_foreign_keys': checkedForeignKeys,
  '2026_11_09_049_event_window': eventWindow,
  '2026_11_10_050_sweep_indexes': sweepIndexes,
  '2026_11_10_051_forgettable_members': forgettableMembers,
  '2026_11_12_052_server_settings': serverSettings,
  '2026_11_12_053_server_settings_audit': serverSettingsAudit,
  '2026_11_13_054_feed_local_times': feedLocalTimes,
  '2026_11_13_055_max_boss_start': maxBossStart,
  '2026_11_13_056_gym_servers': gymServers,
  '2026_11_13_057_member_indexes': memberIndexes,
  '2026_11_13_058_pokemon_nicknames': pokemonNicknames,
  '2026_11_13_059_server_wayspots': serverWayspots,
  '2026_11_13_060_dm_contacts': dmContacts,
};
