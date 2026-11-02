#!/bin/sh
# The stack's backups (the `backup` service of compose.yaml, on the mysql:8.4 image, whose
# mysqldump and mysqld this uses; see docs/architecture/operations.md).
#
#   backup.sh schedule   every day at BACKUP_TIME, in BACKUP_TZ (or the settings' timezone)
#   backup.sh now [tag]  one backup now (`./pine backup`); exits 1 when it failed. With a tag
#                        (`before-restore`, `before-update`) it is a file of its own,
#                        pine-backup-YYYYMMDD-HHMMSS-<tag>.sql.gz, which no day's backup replaces
#   backup.sh status     the last backup's result in a line
#
# A backup is a dump of the Pine schema (DB_SCHEMA) of the `mysql` service, gzipped, as
# /backups/pine-backup-YYYYMMDD.sql.gz (one per day; a second one the same day replaces it).
# /backups is BACKUP_DIR on the host; it must hold a file `.pine-backups`, made once by the
# operator, so that an unmounted share (an empty folder) is never taken for the backup folder.
# Every file there is written as BACKUP_UID:BACKUP_GID (an NFS share that squashes root).
# Every dump is verified before it takes its name: loaded into a scratch MySQL server of its own
# (a second mysqld with a temporary data directory under /scratch, a volume), the tables compared
# with the live ones, the main tables and kysely_migration checked for rows; then the scratch
# server is thrown away. Dumps of this stack older than BACKUP_KEEP_DAYS days are deleted
# (only `pine-backup-*.sql.gz`: nothing else in the folder). The result goes to the log and to
# /ops/backup-status.json, which the watchdog reads (a DM to the owner on failure).
#
# Backups are off where BACKUP_DIR is blank (a development or rehearsal stack): the service
# then says so in its status ({"off":true}, which the watchdog takes as no backups to watch)
# and makes none; `now` exits 3.
#
# With BACKUP_SH_LIBRARY set, the functions are only defined (the tests source the script;
# BACKUP_OUT_DIR, BACKUP_OPS_DIR and BACKUP_LOCK put its folders elsewhere for them).
set -eu

OUT=${BACKUP_OUT_DIR:-/backups}
MARKER=.pine-backups
OPS=${BACKUP_OPS_DIR:-/ops}
STATUS=$OPS/backup-status.json
SUMMARY=$OPS/backup-status.txt
SCRATCH_DIR=/scratch
LOCK=${BACKUP_LOCK:-/tmp/pine-backup.lock}
# Set by the schedule: a scheduled run that finds another running records a failure.
SCHEDULED=
# The tables that must have rows in a dump when they have rows in the live database.
MAIN_TABLES="Guild Region Gym User"

# The settings, checked once at the start of every command; a mistake stops the service with a
# sentence in its log.
setup() {
  SCHEMA=${DB_SCHEMA:?DB_SCHEMA is not set}
  : "${MYSQL_ROOT_PASSWORD:?MYSQL_ROOT_PASSWORD is not set}"
  AT=${BACKUP_TIME:-03:30}
  KEEP=${BACKUP_KEEP_DAYS:-90}
  OWNER_UID=${BACKUP_UID:-0}
  OWNER_GID=${BACKUP_GID:-0}
  # The zone of BACKUP_TIME: BACKUP_TZ, else the bot's settings' timezone, else UTC.
  if [ -n "${BACKUP_TZ:-}" ]; then
    TZ=$BACKUP_TZ
  else
    TZ=$(sed -n 's/^[[:space:]]*"timezone"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' \
      /pine-settings.json 2>/dev/null | head -n 1)
    TZ=${TZ:-UTC}
  fi
  if [ ! -f "/usr/share/zoneinfo/$TZ" ]; then
    echo "The time zone '$TZ' (BACKUP_TZ, or the settings' timezone) is none this image knows." >&2
    exit 1
  fi
  export TZ
  case $AT in
    [0-1][0-9]:[0-5][0-9] | 2[0-3]:[0-5][0-9]) ;;
    *)
      echo "BACKUP_TIME must be HH:MM (24 hours), not '$AT'." >&2
      exit 1
      ;;
  esac
  case $KEEP in
    '' | 0 | *[!0-9]*)
      echo "BACKUP_KEEP_DAYS must be a number of days (1 or more), not '$KEEP'." >&2
      exit 1
      ;;
  esac
  case $OWNER_UID$OWNER_GID in
    '' | *[!0-9]*)
      echo "BACKUP_UID and BACKUP_GID must be numbers." >&2
      exit 1
      ;;
  esac
  export MYSQL_PWD="$MYSQL_ROOT_PASSWORD"
}

log() {
  printf '%s backup: %s\n' "$(date '+%Y-%m-%d %H:%M:%S %Z')" "$*"
}

# A command on the backup folder, as its owner (root squashed on an NFS share).
as_owner() {
  if [ "$OWNER_UID" = 0 ] && [ "$OWNER_GID" = 0 ]; then
    "$@"
  else
    gosu "$OWNER_UID:$OWNER_GID" "$@"
  fi
}

# The live database, as MySQL's root.
live() {
  mysql -h mysql -uroot -N -B "$@"
}

# A text as the inside of a JSON string: backslashes and quotes escaped, line breaks as spaces.
json_text() {
  printf '%s' "$1" | tr '\r\n\t' '   ' | sed 's/\\/\\\\/g; s/"/\\"/g'
}

# When a backup last succeeded, from the status file (milliseconds), or nothing.
last_ok() {
  sed -n 's/.*"lastOkAt":\([0-9]*\).*/\1/p' "$STATUS" 2>/dev/null | head -n 1
}

# write_status <true|false> <reason> <file> <bytes> <seconds> [warning]
write_status() {
  now=$(($(date +%s) * 1000))
  if [ "$1" = true ]; then ok_at=$now; else ok_at=$(last_ok); fi
  mkdir -p "$OPS"
  {
    printf '{"finishedAt":%s,"ok":%s' "$now" "$1"
    if [ -n "$2" ]; then printf ',"reason":"%s"' "$(json_text "$2")"; fi
    if [ -n "$3" ]; then printf ',"file":"%s"' "$(json_text "$3")"; fi
    printf ',"bytes":%s,"seconds":%s' "${4:-0}" "${5:-0}"
    if [ -n "$ok_at" ]; then printf ',"lastOkAt":%s' "$ok_at"; fi
    if [ -n "${6:-}" ]; then printf ',"warning":"%s"' "$(json_text "$6")"; fi
    printf '}\n'
  } >"$STATUS.next"
  mv "$STATUS.next" "$STATUS"
  if [ "$1" = true ]; then
    printf 'ok at %s: %s, %s bytes, verified, %s s%s\n' "$(date '+%Y-%m-%d %H:%M %Z')" "$3" "$4" "$5" \
      "${6:+ (but $6)}"
  else
    printf 'FAILED at %s: %s\n' "$(date '+%Y-%m-%d %H:%M %Z')" "$(printf '%s' "$2" | tr '\r\n' '  ')"
  fi >"$SUMMARY"
}

# Backups are off: BACKUP_DIR is blank.
backups_off() {
  [ -z "${BACKUP_DIR:-}" ]
}

# The status of a stack whose backups are off.
write_off_status() {
  mkdir -p "$OPS"
  printf '{"off":true}\n' >"$STATUS.next"
  mv "$STATUS.next" "$STATUS"
  echo "backups are off (BACKUP_DIR is blank)" >"$SUMMARY"
}

# Deletes this stack's dumps older than KEEP days (exactly KEEP days are kept: today's and the
# KEEP - 1 before), as the folder's owner. What it could not delete is in `prune_failed`.
prune_old() {
  prune_failed=
  if ! old=$(as_owner find "$OUT" -maxdepth 1 -name 'pine-backup-*.sql.gz' -mtime +"$((KEEP - 1))"); then
    prune_failed="the old dumps could not be listed"
    return 0
  fi
  for file in $old; do
    as_owner rm -f "$file" || prune_failed="$prune_failed ${file##*/}"
  done
  prune_failed=${prune_failed# }
}

# What a run that was killed left half-written in the backup folder, as the folder's owner.
remove_partials() {
  as_owner find "$OUT" -maxdepth 1 -name '.pine-backup-*.partial' -exec rm -f {} + ||
    log "the half-written dumps of a stopped run could not be removed"
}

# A count from the live database; nothing (an error) is a failure, never a zero.
live_count() {
  counted=$(live -e "select count(*) from \`$SCHEMA\`.\`$1\`") || return 1
  case $counted in
    '' | *[!0-9]*) return 1 ;;
  esac
  printf '%s\n' "$counted"
}

# make_dump <file>: the schema, gzipped, written as the folder's owner and readable by that owner
# alone (it holds members' ids and the keys of the export tool). Sets `reason` and fails when
# mysqldump or the write does.
make_dump() {
  rc_file=$(mktemp)
  # No pipefail in sh: the status of mysqldump and of the write are kept aside. In the
  # background, waited for: a stop's trap runs at once (sh runs a trap only between commands, and
  # `wait` is one that a signal ends), not after the whole dump.
  # shellcheck disable=SC2016 # the $1 of the inner sh
  {
    mysqldump -h mysql -uroot --single-transaction --quick --routines --triggers --events \
      --hex-blob --no-tablespaces --set-gtid-purged=OFF --default-character-set=utf8mb4 \
      "$SCHEMA" 2>"$rc_file.err"
    echo $? >"$rc_file"
  } | gzip -6 | (
    umask 077
    as_owner sh -c 'cat >"$1"' sh "$1"
  ) &
  if ! wait $!; then
    reason="the dump could not be written to $OUT"
    rm -f "$rc_file" "$rc_file.err"
    return 1
  fi
  rc=$(cat "$rc_file")
  err=$(tail -n 1 "$rc_file.err")
  rm -f "$rc_file" "$rc_file.err"
  if [ "$rc" != 0 ]; then
    reason="mysqldump failed: ${err:-exit $rc}"
    return 1
  fi
  # A dump that ran to its end says so in its last line.
  if ! as_owner cat "$1" | gzip -dc | tail -n 1 | grep -q '^-- Dump completed'; then
    reason="the dump is incomplete (no 'Dump completed' line)"
    return 1
  fi
}

scratch=
scratch_pid=
stop_scratch() {
  if [ -n "$scratch_pid" ]; then
    MYSQL_PWD='' mysqladmin --socket="$scratch/mysql.sock" -uroot shutdown >/dev/null 2>&1 ||
      kill "$scratch_pid" 2>/dev/null || true
    wait "$scratch_pid" 2>/dev/null || true
    scratch_pid=
  fi
  if [ -n "$scratch" ]; then rm -rf "$scratch"; fi
  scratch=
}

# The scratch server; its root has no password and listens on a socket only.
in_scratch() {
  MYSQL_PWD='' mysql --socket="$scratch/mysql.sock" -uroot -N -B "$@"
}

# verify_dump <file>: loaded into a scratch server and checked. Sets `verified` when every check
# passed, `reason` when one failed.
verify_dump() {
  mkdir -p "$SCRATCH_DIR"
  scratch=$(mktemp -d "$SCRATCH_DIR/pine-verify.XXXXXX")
  chown mysql:mysql "$scratch"
  if ! mysqld --no-defaults --initialize-insecure --user=mysql --datadir="$scratch/data" \
    --lower-case-table-names=0 >"$scratch/init.log" 2>&1; then
    reason="the scratch server could not be made: $(tail -n 1 "$scratch/init.log")"
    return 1
  fi
  # A server that is thrown away: no binary log, no double writes, no flush at every commit.
  mysqld --no-defaults --user=mysql --datadir="$scratch/data" --socket="$scratch/mysql.sock" \
    --pid-file="$scratch/mysqld.pid" --log-error="$scratch/error.log" --skip-networking \
    --mysqlx=OFF --skip-log-bin --innodb-doublewrite=OFF --innodb-flush-log-at-trx-commit=0 \
    --innodb-buffer-pool-size=128M --lower-case-table-names=0 \
    --character-set-server=utf8mb4 --collation-server=utf8mb4_0900_ai_ci &
  scratch_pid=$!
  tries=0
  until MYSQL_PWD='' mysqladmin --socket="$scratch/mysql.sock" -uroot ping >/dev/null 2>&1; do
    tries=$((tries + 1))
    if [ "$tries" -gt 120 ] || ! kill -0 "$scratch_pid" 2>/dev/null; then
      reason="the scratch server did not start: $(tail -n 1 "$scratch/error.log" 2>/dev/null)"
      return 1
    fi
    sleep 1
  done
  if ! in_scratch -e 'create database verify character set utf8mb4 collate utf8mb4_0900_ai_ci'; then
    reason="the scratch server took no database"
    return 1
  fi
  # In the background, waited for, as the dump: a stop is heard at once. --commands=OFF: what a
  # dump asks of the client (`\!` runs a program, as root here) is not done.
  as_owner cat "$1" | gzip -dc | in_scratch --commands=OFF --default-character-set=utf8mb4 verify \
    2>"$scratch/load.err" &
  if ! wait $!; then
    reason="the dump did not load into a scratch server: $(tail -n 1 "$scratch/load.err")"
    return 1
  fi
  tables="select table_name from information_schema.tables where table_schema = '%s' order by 1"
  # shellcheck disable=SC2059 # the format is ours
  if ! live_tables=$(live -e "$(printf "$tables" "$SCHEMA")") || [ -z "$live_tables" ]; then
    reason="the live database's tables could not be read"
    return 1
  fi
  # shellcheck disable=SC2059
  dumped_tables=$(in_scratch -e "$(printf "$tables" verify)")
  if [ "$live_tables" != "$dumped_tables" ]; then
    reason="the dump's tables differ from the database's"
    return 1
  fi
  if ! printf '%s\n' "$dumped_tables" | grep -qx kysely_migration; then
    reason="the dump has no kysely_migration table: not a database the bot has migrated"
    return 1
  fi
  if [ "$(in_scratch -e 'select count(*) from verify.kysely_migration')" = 0 ]; then
    reason="the dump's kysely_migration table is empty"
    return 1
  fi
  for table in $MAIN_TABLES; do
    printf '%s\n' "$dumped_tables" | grep -qx "$table" || continue
    if ! in_live=$(live_count "$table"); then
      reason="the live database's $table table could not be counted"
      return 1
    fi
    in_dump=$(in_scratch -e "select count(*) from verify.\`$table\`")
    if [ "$in_live" -gt 0 ] && [ "$in_dump" = 0 ]; then
      reason="the dump's $table table is empty, the database's has $in_live rows"
      return 1
    fi
  done
  counted=$(for table in $MAIN_TABLES; do
    printf '%s %s, ' "$table" "$(in_scratch -e "select count(*) from verify.\`$table\`" 2>/dev/null || echo -)"
  done)
  log "verified: ${counted%, }"
  verified=yes
}

# Takes the lock: a directory that holds the pid of the run that has it. A lock whose run is
# gone (a container stopped half-way) is taken over. Fails when a live run holds it.
# `lock_mine` says whether this run took it.
lock_mine=
take_lock() {
  if mkdir "$LOCK" 2>/dev/null; then
    echo $$ >"$LOCK/pid"
    lock_mine=yes
    return 0
  fi
  holder=$(cat "$LOCK/pid" 2>/dev/null || true)
  if [ -n "$holder" ] && kill -0 "$holder" 2>/dev/null; then
    return 1
  fi
  log "taking over the lock of a backup that is gone (pid ${holder:-unknown})"
  rm -rf "$LOCK"
  mkdir "$LOCK" && echo $$ >"$LOCK/pid" && lock_mine=yes
}

release_lock() {
  rm -rf "$LOCK"
}

# Gives the lock back only if this run took it (a stop of a run that found another running
# leaves that one's lock alone).
release_own_lock() {
  if [ -n "$lock_mine" ]; then
    release_lock
    lock_mine=
  fi
}

# The backup folder belongs to one stack: the first that writes there puts its name
# (BACKUP_STACK, the Compose project) into the marker file; another stack is refused.
# A marker that already names this stack needs no write (a share that squashes root may refuse
# one); an empty one is filled in. Without the marker the folder is refused (an unmounted share).
claim_folder() {
  stack=${BACKUP_STACK:-pine}
  if ! as_owner test -f "$OUT/$MARKER"; then
    reason="the backup folder has no $MARKER file: is BACKUP_DIR (the share) mounted? Make the file once there by hand, with this stack's name in it (echo $stack > <BACKUP_DIR>/$MARKER); if the share is mounted on the host, './pine restart backup'."
    return 1
  fi
  owner=$(as_owner cat "$OUT/$MARKER" 2>/dev/null | head -n 1 | tr -d '\r') || owner=
  if [ -z "$owner" ]; then
    # shellcheck disable=SC2016 # the $1 of the inner sh
    if ! printf '%s\n' "$stack" | as_owner sh -c 'cat >"$1"' sh "$OUT/$MARKER"; then
      reason="the backup folder's $MARKER file cannot be written as $OWNER_UID:$OWNER_GID: make it as the share's owner with this stack's name in it (echo $stack > <BACKUP_DIR>/$MARKER)"
      return 1
    fi
    return 0
  fi
  if [ "$owner" != "$stack" ]; then
    reason="the backup folder belongs to the stack '$owner' (its $MARKER file says so)"
    return 1
  fi
}

# publish_dump <partial> <name>: the verified dump takes its name, then old ones go. Sets
# `reason` and fails when the move does: a dump that has no name is no backup.
# The verified dump is kept under its half-written name when it cannot take its own (the next
# start of the schedule removes it); the reason names it.
publish_dump() {
  if ! as_owner mv "$1" "$OUT/$2"; then
    reason="the verified dump could not take its name $2; it is kept as ${1##*/}"
    keep_partial=yes
    return 1
  fi
  prune_old
}

# One backup, verified; a tag gives it a name of its own. Returns 1 when it failed (the day's
# earlier dump, if any, stays).
backup_once() {
  started=$(date +%s)
  case ${1:-} in
    '') name="pine-backup-$(date +%Y%m%d).sql.gz" ;;
    *[!a-z-]*)
      log "a tag is lower-case letters and hyphens, not '$1'"
      return 1
      ;;
    *) name="pine-backup-$(date +%Y%m%d-%H%M%S)-$1.sql.gz" ;;
  esac
  if ! take_lock; then
    log "a backup is running already"
    # Only the schedule's own run counts as a missed backup; one asked for now only says so.
    if [ -n "$SCHEDULED" ]; then
      write_status false "a backup was still running when the next was due" "$name" 0 0
    fi
    return 1
  fi
  partial="$OUT/.$name.partial"
  reason=
  verified=
  keep_partial=
  log "dumping $SCHEMA into $OUT/$name"
  if ! claim_folder; then
    :
  elif ! as_owner test -w "$OUT"; then
    reason="the backup folder cannot be written as $OWNER_UID:$OWNER_GID (BACKUP_UID, BACKUP_GID)"
  elif make_dump "$partial" && verify_dump "$partial"; then
    :
  fi
  stop_scratch
  seconds=$(($(date +%s) - started))
  if [ -z "$reason" ] && [ "$verified" != yes ]; then
    reason="the verification stopped half-way"
  fi
  if [ -z "$reason" ]; then
    bytes=$(as_owner cat "$partial" | wc -c | tr -d ' ')
    if publish_dump "$partial" "$name"; then
      warning=
      if [ -n "$prune_failed" ]; then
        warning="old dumps could not be deleted: $prune_failed"
        log "$warning"
      fi
      write_status true '' "$name" "$bytes" "$seconds" "$warning"
      log "done: $name, $bytes bytes, verified, in $seconds s"
      release_own_lock
      return 0
    fi
  fi
  if [ -z "$keep_partial" ]; then as_owner rm -f "$partial" 2>/dev/null || true; fi
  write_status false "$reason" "$name" 0 "$seconds"
  log "FAILED: $reason"
  release_own_lock
  return 1
}

# Seconds since the epoch of the next BACKUP_TIME.
next_run() {
  at=$(date -d "$(date +%Y-%m-%d) $AT" +%s)
  if [ "$at" -le "$(date +%s)" ]; then
    at=$(date -d "$(date -d tomorrow +%Y-%m-%d) $AT" +%s)
  fi
  echo "$at"
}

schedule() {
  SCHEDULED=yes
  # The container just started: no backup of it runs, and what a stopped one left goes.
  release_lock
  rm -rf "$SCRATCH_DIR"/pine-verify.*
  # Only in a folder that is this stack's: never in an unmounted share's empty mount point.
  if claim_folder; then remove_partials; else log "not cleaning the backup folder: $reason"; fi
  trap 'stop_scratch; exit 0' TERM INT
  log "a verified backup every day at $AT ($TZ) into $OUT as $OWNER_UID:$OWNER_GID, kept $KEEP days"
  while :; do
    at=$(next_run)
    log "next backup at $(date -d "@$at" '+%Y-%m-%d %H:%M %Z')"
    # In steps of a minute, so that a stop is quick and a clock change is noticed.
    while [ "$(date +%s)" -lt "$at" ]; do
      sleep 60 &
      wait $! || true
    done
    backup_once || true
  done
}

# A stack without backups: its status says so, and the service waits until it is stopped.
off() {
  write_off_status
  log "backups are off (BACKUP_DIR is blank)"
  trap 'exit 0' TERM INT
  while :; do
    sleep 3600 &
    wait $! || true
  done
}

main() {
  case ${1:-} in
    schedule)
      if backups_off; then off; fi
      setup
      schedule
      ;;
    now)
      if backups_off; then
        log "backups are off (BACKUP_DIR is blank)"
        exit 3
      fi
      setup
      trap 'stop_scratch; release_own_lock; exit 1' TERM INT
      backup_once "${2:-}"
      ;;
    status)
      if [ -f "$SUMMARY" ]; then cat "$SUMMARY"; else echo "no backup has run yet"; fi
      ;;
    *)
      echo "Usage: backup.sh schedule | now | status" >&2
      exit 2
      ;;
  esac
}

if [ -z "${BACKUP_SH_LIBRARY:-}" ]; then
  main "$@"
fi
