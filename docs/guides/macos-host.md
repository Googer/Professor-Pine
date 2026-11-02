# A Mac as Pine's host

This guide sets up a Mac with Apple silicon (written for an M1 MacBook Air whose own screen is dead, driven through an external monitor while it is set up) as the machine that runs Pine's Docker stack day and night. Once it is done the Mac needs no monitor: it starts the stack by itself after a restart, and you reach it over SSH.

Pine runs in a small Linux VM that [OrbStack](https://orbstack.dev) keeps (Docker's engine and Compose, as on Linux; every image of the stack has an arm64 build). Asahi Linux is not used: on an M1 MacBook Air it cannot yet drive an external monitor over USB-C, and its 16K memory pages break programs built for 4K ones.

What the guide ends with: the stack's database made and migrated, a verified backup, the nightly backups running, and **no bot logged in**. Logging the bot in is the last step of [Starting a new Pine instance](new-instance.md) or [Moving a legacy Professor Pine](migrating-a-legacy-instance.md) (section 4 of either), which you follow from there.

## Contents

1. [What you need](#1-what-you-need)
2. [macOS: account, login, sleep](#2-macos-account-login-sleep)
3. [Network and SSH](#3-network-and-ssh)
4. [The battery](#4-the-battery)
5. [OrbStack](#5-orbstack)
6. [The code](#6-the-code)
7. [The stack's first start, without the bot](#7-the-stacks-first-start-without-the-bot)
8. [Backups off the Mac](#8-backups-off-the-mac)
9. [The tunnel (the web pages)](#9-the-tunnel-the-web-pages)
10. [Living with it](#10-living-with-it)

## 1. What you need

- The Mac, on macOS 14 or later (Apple menu → About This Mac), plugged in.
- A USB-C hub with Ethernet (and HDMI for the monitor while you set it up), in one USB-C port; the charger in the other. A hub that only carries Ethernet and, now and then, the monitor needs no power of its own.
- On the router: a fixed address (a DHCP reservation) for the hub's Ethernet adapter, once you know its MAC address (section 3).

## 2. macOS: account, login, sleep

The Mac must come back by itself after a restart or a power cut, so it logs in on its own and never sleeps.

1. **FileVault off** (System Settings → Privacy & Security → FileVault → Turn Off). With FileVault on, an Apple-silicon Mac waits at the unlock screen after every restart and nothing runs until someone types the password. The price: the disk is still encrypted by the hardware, but no password guards its key, so whoever has the Mac can read it, the bot's token too. Keep the Mac somewhere private.
2. **Log in automatically** (System Settings → Users & Groups → Automatically log in as → your account). It is offered only once FileVault is off. `sudo sysadminctl -autologin set -userName <you> -password -` refused an account linked to an Apple ID with error 22 (macOS 27), so use this page. Check it with `sysadminctl -autologin status`.
3. **Never sleep.** In Terminal:

   ```bash
   sudo pmset -a sleep 0 disksleep 0 displaysleep 10 powernap 0 womp 1 tcpkeepalive 1
   ```

   Then check (`sleep 0`, `womp 1`):

   ```bash
   pmset -g
   ```

   Leave the lid open: a MacBook with its lid closed sleeps unless a monitor is attached and on. An Apple-silicon MacBook starts up by itself when power comes back after its battery ran flat (perhaps after a few minutes of charging); check it once by hand if you can spare the time.
4. **Updates that do not restart it at night.** System Settings → General → Software Update → the (i) beside Automatic Updates (the names differ a little between macOS versions): keep "Download new updates when available" and "Install Security Responses and system files", turn off "Install macOS updates". You install macOS updates yourself, at a quiet hour (section 10).
5. **Name it** (the examples below use `pine-host`):

   ```bash
   sudo scutil --set ComputerName pine-host
   ```

   ```bash
   sudo scutil --set LocalHostName pine-host
   ```

   ```bash
   sudo scutil --set HostName pine-host
   ```

## 3. Network and SSH

1. Plug the hub in with an Ethernet cable. System Settings → Network: the adapter shows as connected (a name such as "USB 10/100/1000 LAN"). Its Details → Hardware tab shows the MAC address: give it a fixed address on the router.
2. **Wi-Fi off**, so the Mac has one address: System Settings → Wi-Fi → off (it stays off across restarts). Check that Ethernet is the adapter in use:

   ```bash
   networksetup -listallhardwareports
   ```

   Wi-Fi is `en0`; the hub's adapter has another device (`en5` or so), and `ifconfig <that device>` shows `status: active` and its address.

3. **Remote Login** (SSH): System Settings → General → Sharing → Remote Login on, "Allow access for: Only these users" with your account. **Screen Sharing** on as well: it is the way in when SSH is not enough and there is no monitor (from another Mac, or a VNC viewer, at `vnc://pine-host.local`).
4. From the computer you work on, put your SSH key on the Mac (the password is asked once), then log in with the key:

   On Windows, in Git Bash:

   ```bash
   cat ~/.ssh/id_rsa.pub | ssh <you>@pine-host.local "mkdir -p ~/.ssh && chmod 700 ~/.ssh && cat >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys"
   ```

   On a Mac or Linux:

   ```bash
   ssh-copy-id <you>@pine-host.local
   ```

   Then:

   ```bash
   ssh <you>@pine-host.local
   ```

   It logs in without asking for the password. (`<you>` is your account's short name on the Mac: `whoami` in its Terminal.)

From here on every command runs on the Mac, over SSH or in its Terminal.

## 4. The battery

A MacBook that is always plugged in should not sit at 100%. System Settings → Battery → the charge limit: **80%** (seen on an M1 Air on macOS 27). macOS before 26.4 has no such limit; there a small tool, [batt](https://github.com/charlie0129/batt) (open source), holds it instead.

## 5. OrbStack

If the Mac does not have [Homebrew](https://brew.sh) yet, run the command on its home page in the Mac's Terminal. It also installs Apple's command-line tools, git among them, which can take a while. At its end it prints two lines to add it to your shell's path: run them.

1. Install it:

   ```bash
   brew install --cask orbstack
   ```

2. Open OrbStack once from Applications (with the monitor, or Screen Sharing): accept its prompts, choose **Docker**, and let it install its helper (it links `/var/run/docker.sock` and the `docker` commands).
3. **Start at login**: `orb config set app.start_at_login true` (or OrbStack → Settings). It is off until you set it. Automatic updates are fine: an update restarts the engine, and the stack's services come back by themselves.
4. Check in Terminal:

   ```bash
   docker compose version
   ```

   ```bash
   docker run --rm hello-world
   ```

   The second prints "Hello from Docker!" and that the image is `arm64v8`.

## 6. The code

```bash
git clone --branch main-dev https://github.com/Googer/Professor-Pine.git ~/professor-pine
```

Then:

```bash
cd ~/professor-pine
```

Every command from here on is `./pine <command>`, run in that folder.

## 7. The stack's first start, without the bot

These steps build the image, make the database and a verified backup, and start the nightly backups. Nothing here logs in to Discord: `./pine migrate` and `./pine backup` start only MySQL and the backup service. Never run `./pine up` or `./pine restart` until the guide you follow next says so: on a host meant for a running bot's token, two bots on one token take each other's sessions.

1. **The backup folder** on the Mac, with its marker (the stack's name, `pine`):

   ```bash
   mkdir -p ~/pine-backups
   ```

   ```bash
   echo pine > ~/pine-backups/.pine-backups
   ```

2. **`.env`**, with a placeholder token for now (the real one goes in when the bot is to log in):

   ```bash
   cp .env.example .env
   ```

   ```bash
   chmod 600 .env
   ```

   Edit it (`nano .env`): `DISCORD_TOKEN=placeholder`, `DISCORD_APP_ID` (the application's ID: Developer Portal → General Information; not a secret) and `OWNER_ID` (your Discord user ID), which must look like Discord IDs even before the bot logs in, `DB_USER=pine`, `DB_PASSWORD` and `DB_ROOT_PASSWORD` new random values (one from `openssl rand -hex 24` each), `DB_SCHEMA=pine`, and `BACKUP_DIR` the folder in full (a `~` is not read):

   ```bash
   echo "BACKUP_DIR=$HOME/pine-backups"
   ```

   prints the line to put in. Leave the rest blank for now. A legacy instance's own values (its database's user, schema and the rest) replace these later, from `./pine convert-settings` ([Moving a legacy Professor Pine](migrating-a-legacy-instance.md)); a database the migrated passwords do not match is simply made anew there (`./pine restore … --replace`).
3. **`pine-settings.json`**:

   ```bash
   cp data/settings.json pine-settings.json
   ```

4. **The database**: builds the image (some minutes the first time), starts MySQL, and creates the schema:

   ```bash
   ./pine migrate
   ```

5. **A backup**, verified in a scratch server; it also starts the backup service, which makes one every night at 03:30:

   ```bash
   ./pine backup
   ```

   Check the file:

   ```bash
   ls -la ~/pine-backups
   ```

   `pine-backup-YYYYMMDD.sql.gz` is there, beside `.pine-backups`.
6. **The status**:

   ```bash
   ./pine status
   ```

   MySQL and the backup service run, the last backup is verified, and the bot is not running.

After a restart of the Mac, OrbStack starts at login and the two services come back by themselves (`restart: unless-stopped`); check with `./pine status`.

## 8. Backups off the Mac

The backups in `~/pine-backups` live on the Mac's own disk, which is soldered in: a dead Mac takes them with it. Copy them elsewhere every day, after 03:30. With a Synology NAS, the NAS fetches them over SSH, so the Mac mounts nothing:

1. On the NAS: a shared folder `pine-backups`, and SSH on (Control Panel → Terminal & SNMP).
2. On the NAS, as the user that runs the task, a key for the Mac: `ssh-keygen -t ed25519`, and its public half added to `~/.ssh/authorized_keys` on the Mac (as in section 3).
3. Control Panel → Task Scheduler → Create → Scheduled Task → User-defined script, daily at 05:00, as that user:

   ```bash
   rsync -a -e "ssh -o StrictHostKeyChecking=accept-new" <you>@pine-host.local:pine-backups/ /volume1/pine-backups/
   ```

   Run it as a NAS user whose home holds the key (an administrator of the NAS rather than root, whose account DSM keeps disabled), with `~/.ssh` at mode 700.

   No `--delete`: the NAS keeps what the Mac already deleted after 90 days (`BACKUP_KEEP_DAYS`), and you prune it there by hand if it grows.
4. Run the task once by hand (Run) and check that the folder on the NAS has the dumps.

## 9. The tunnel (the web pages)

Only if the instance serves its web pages ([docs/web-setup.md](../web-setup.md)). In the Cloudflare dashboard, Zero Trust → Networks → Tunnels: create a tunnel (say `pine-prod`), and add a public hostname on your domain pointing to the service `http://pine:8080`. Copy its token into `.env` as `CLOUDFLARE_TUNNEL_TOKEN`, with `COMPOSE_PROFILES=tunnel`. It starts with the bot (`./pine up`), so it is tried when the bot logs in. Nothing on the Mac is opened to the internet. Also set the domain's HTTPS settings ([web setup](../web-setup.md), section 3).

## 10. Living with it

- `./pine status`, `./pine logs pine` over SSH, as on any host ([operations](../architecture/operations.md)).
- A macOS update: when you choose, at a quiet hour. Software Update installs it and restarts; after the restart, the Mac logs in, OrbStack starts, and the stack follows. `./pine status` afterwards.
- `pmset -g` and the charge limit are worth a look after a macOS update: an update can reset settings.
- The monitor is needed only for what SSH and Screen Sharing cannot do (a macOS that does not start).
