#!/bin/sh
# Sets up the copy of Pine's backups off the host (scripts/host/offsite-upload.sh) to a Cloudflare R2
# bucket: asks for the account id, the bucket, the R2 API token's Access Key ID and Secret Access
# Key (neither shown as typed nor printed), the age public key the backups are encrypted for, and
# the stack's backup folder; writes rclone's remote "pine-offsite" (replacing one written before,
# keeping every other remote) and the upload's settings (~/.config/pine-offsite/config), both for
# you alone; then checks that the bucket answers. Run once on the host, on a terminal:
#   sh ~/professor-pine/scripts/host/offsite-setup.sh
# and again to change any of it. docs/guides/oracle-cloud-host.md, section 8. POSIX sh; needs rclone.
set -eu

conf=${RCLONE_CONFIG:-$HOME/.config/rclone/rclone.conf}
settings=$HOME/.config/pine-offsite/config
here=$(cd "$(dirname "$0")/../.." && pwd)

refuse() {
  printf '%s Nothing was written.\n' "$1" >&2
  exit 1
}

# Typing shown back only on a terminal; the secrets' not even there.
tty=
if [ -t 0 ]; then tty=yes; fi
trap 'if [ -n "$tty" ]; then stty echo; fi' EXIT
trap 'exit 1' HUP INT TERM

ask() {
  printf '%s' "$1"
  IFS= read -r answer || answer=
  answer=$(printf '%s' "$answer" | tr -d '\r')
}

ask_hidden() {
  printf '%s' "$1"
  if [ -n "$tty" ]; then stty -echo; fi
  IFS= read -r answer || answer=
  if [ -n "$tty" ]; then
    stty echo
    echo
  fi
  answer=$(printf '%s' "$answer" | tr -d '\r')
}

command -v rclone >/dev/null 2>&1 ||
  refuse "rclone is not installed: sudo apt-get install rclone age (on macOS: brew install rclone age)."

echo "The Cloudflare R2 bucket for Pine's backups (docs/guides/oracle-cloud-host.md, section 8)."
ask 'Account ID (R2 > Overview, "Account Details"): '
account=$answer
case $account in
  *[!0-9a-f]*) account_ok= ;;
  *) [ ${#account} -eq 32 ] && account_ok=yes || account_ok= ;;
esac
[ -n "$account_ok" ] ||
  refuse "The account id is 32 letters and digits (0-9, a-f), as R2's overview shows it."

ask 'Bucket name: '
bucket=$answer
case $bucket in
  '' | -* | *- | *[!a-z0-9-]*) bucket_ok= ;;
  *) [ ${#bucket} -ge 3 ] && [ ${#bucket} -le 63 ] && bucket_ok=yes || bucket_ok= ;;
esac
[ -n "$bucket_ok" ] ||
  refuse "A bucket name is 3 to 63 lowercase letters, digits and hyphens (not first or last)."

ask_hidden 'Access Key ID (not shown): '
key=$answer
ask_hidden 'Secret Access Key (not shown): '
secret=$answer
for part in "$key" "$secret"; do
  case $part in
    '' | *[!A-Za-z0-9]*)
      refuse "The Access Key ID and the Secret Access Key are letters and digits, as Cloudflare shows them once when the token is made."
      ;;
  esac
done

ask 'The age public key (age1..., from age-keygen on another machine): '
recipient=$answer
case $recipient in
  age1*[!a-z0-9]* | '') recipient_ok= ;;
  age1?*) recipient_ok=yes ;;
  *) recipient_ok= ;;
esac
[ -n "$recipient_ok" ] ||
  refuse "The public key starts with age1: the line 'Public key: age1...' that age-keygen prints, never the private key (AGE-SECRET-KEY-...)."

ask "The stack's backup folder, its BACKUP_DIR [$HOME/pine-backups]: "
backups=${answer:-$HOME/pine-backups}
# A ~ typed as an answer, which read does not expand.
# shellcheck disable=SC2088
case $backups in
  '~/'*) backups=$HOME/${backups#'~/'} ;;
esac
case $backups in
  /*) ;;
  *) refuse "Name the backup folder by its full path (such as /home/ubuntu/pine-backups)." ;;
esac

umask 077
mkdir -p "$(dirname "$conf")" "$(dirname "$settings")"

# Every remote but an old pine-offsite, then the new one after a blank line.
next=$conf.next
if [ -f "$conf" ]; then
  awk '/^[[:space:]]*\[/ { skip = ($0 ~ /^[[:space:]]*\[pine-offsite\][[:space:]]*$/) } !skip' "$conf" >"$next"
else
  : >"$next"
fi
if [ -s "$next" ] && [ -n "$(tail -n 1 "$next")" ]; then echo >>"$next"; fi
# no_head: R2 answers 501 to the HEAD with ?versionId that rclone 1.60 (Ubuntu's) sends after an
# upload. no_check_bucket: the token may not create or list buckets. acl: R2 has no ACLs.
cat >>"$next" <<EOF
[pine-offsite]
type = s3
provider = Cloudflare
access_key_id = $key
secret_access_key = $secret
endpoint = https://$account.r2.cloudflarestorage.com
acl = private
no_check_bucket = true
no_head = true
EOF
chmod 600 "$next"
mv "$next" "$conf"

cat >"$settings.next" <<EOF
# The upload of Pine's backups off this host (scripts/host/offsite-upload.sh), written by
# scripts/host/offsite-setup.sh.
remote=pine-offsite:$bucket
recipient=$recipient
backups=$backups
checkout=$here
EOF
chmod 600 "$settings.next"
mv "$settings.next" "$settings"

if [ ! -d "$backups" ]; then
  echo "Note: $backups is not there (yet): the upload tells the owner until it is."
fi
if rclone lsf "pine-offsite:$bucket" >/dev/null 2>&1; then
  echo "Saved, and the bucket answers."
  echo "Now upload once by hand: sh $here/scripts/host/offsite-upload.sh"
else
  echo "Saved, but the bucket $bucket did not answer: check the account id, and that the token has Object Read & Write on $bucket, then run this again." >&2
  exit 1
fi
