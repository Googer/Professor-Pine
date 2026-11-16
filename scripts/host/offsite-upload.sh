#!/bin/sh
# Copies Pine's recent backups off the host, to a bucket (Cloudflare R2, through rclone): each dump
# of the backup folder from the last two days that the bucket lacks is encrypted with age for a
# public key whose private half is kept elsewhere (the host can encrypt a backup, never read one
# back), then uploaded as <dump>.age. The bucket's own lifecycle rule deletes what it holds after
# 90 days, as the Privacy Policy promises. One line per upload.
#
# On any failure, or when no dump of the folder is newer than 26 hours (the nightly backup has
# stopped), it tells the owner once per run by a DM on Discord (`./pine tell-owner` of the checkout)
# and exits 1. Run by cron after the nightly backup, or by hand:
#   sh ~/professor-pine/scripts/host/offsite-upload.sh
# Its settings are ~/.config/pine-offsite/config, which scripts/host/offsite-setup.sh writes:
#   remote=pine-offsite:<bucket>   the rclone remote and the bucket
#   recipient=age1...              the age public key
#   backups=/home/you/pine-backups the stack's BACKUP_DIR (this is the default)
#   checkout=/home/you/professor-pine   whose ./pine tells the owner (default: the one this is in)
# docs/guides/oracle-cloud-host.md, section 8, sets it up. POSIX sh; needs rclone and age.
set -eu

config=$HOME/.config/pine-offsite/config
# Hours: the nightly backup is a day apart, give or take its own run and a change of the clocks.
recent_hours=26

stamp() {
  date '+%F %T'
}

log() {
  printf '%s %s\n' "$(stamp)" "$*"
}

log_error() {
  printf '%s %s\n' "$(stamp)" "$*" >&2
}

# What went wrong, for the owner: sentences joined by "; ".
problems=
problem() {
  log_error "$1"
  problems=${problems:+$problems; }$1
}

# A setting of the file into `value`: its last line `key=value`, a leading ~/ the home.
setting() {
  value=
  if [ -r "$config" ]; then
    value=$(sed -n "s/^[[:space:]]*$1[[:space:]]*=[[:space:]]*//p" "$config" | tail -n 1 | tr -d '\r')
  fi
  # A ~ typed into the file, which no shell expands there.
  # shellcheck disable=SC2088
  case $value in
    '~/'*) value=$HOME/${value#'~/'} ;;
  esac
}

# The checkout this script is in, unless the settings name another.
here=$(cd "$(dirname "$0")/../.." && pwd)

# Tells the owner of every problem in one DM, and ends the run as failed.
finish() {
  if [ -z "$problems" ]; then exit 0; fi
  setting checkout
  checkout=${value:-$here}
  text="The upload of Pine's backups off $(uname -n) failed: $problems. Its log on the host says more."
  if ! "$checkout/pine" tell-owner "$text" >/dev/null; then
    log_error "the owner could not be told (./pine tell-owner in $checkout failed)"
  fi
  exit 1
}

tmp=
trap 'rm -f "$tmp"' EXIT
trap 'exit 1' HUP INT TERM

for tool in rclone age; do
  command -v "$tool" >/dev/null 2>&1 || problem "$tool is not installed"
done
if [ ! -r "$config" ]; then
  problem "its settings ($config) are missing: scripts/host/offsite-setup.sh writes them"
  finish
fi
setting remote
remote=$value
[ -n "$remote" ] || problem "its settings ($config) name no remote (the rclone remote and bucket)"
setting recipient
recipient=$value
[ -n "$recipient" ] || problem "its settings ($config) name no recipient (the age public key)"
setting backups
dir=${value:-$HOME/pine-backups}
[ -d "$dir" ] || problem "the backup folder $dir is not there"
[ -z "$problems" ] || finish

# The dumps by name (pine-backup-YYYYMMDD-HHMMSS[-tag].sql.gz: no blank in one), oldest first.
recent=$(find "$dir" -maxdepth 1 -type f -name 'pine-backup-*.sql.gz' -mmin -$((recent_hours * 60)))
[ -n "$recent" ] ||
  problem "no backup in $dir is newer than $recent_hours hours (has the nightly backup stopped? './pine status' says)"

if ! listed=$(rclone lsf "$remote"); then
  problem "the bucket $remote could not be listed"
  finish
fi

dumps=$(find "$dir" -maxdepth 1 -type f -name 'pine-backup-*.sql.gz' -mtime -2 | sort)
tried=0
failures=0
failed=
# One dump a line: a blank in the folder's path splits nothing.
IFS='
'
set -f
for file in $dumps; do
  name=$(basename "$file").age
  if printf '%s\n' "$listed" | grep -qxF "$name"; then continue; fi
  tried=$((tried + 1))
  # A file of known size, not a stream: Ubuntu's rclone (1.60) streams to R2 by a request R2
  # refuses. In the home, not /tmp, which may be too small for a dump.
  tmp=$(mktemp "$HOME/.pine-offsite.XXXXXX")
  if age -r "$recipient" -o "$tmp" "$file" && rclone copyto "$tmp" "$remote/$name"; then
    log "uploaded $name"
  else
    log_error "FAILED $name"
    failures=$((failures + 1))
    failed=${failed:+$failed, }$(basename "$file")
  fi
  rm -f "$tmp"
  tmp=
done

if [ -n "$failed" ]; then
  problem "$failures of $tried dumps were not uploaded ($failed)"
elif [ "$tried" = 0 ]; then
  log "nothing new: the bucket has every dump of the last two days"
fi
finish
