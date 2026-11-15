# Oracle Cloud as Pine's host

This guide sets up a virtual machine on Oracle Cloud's Always Free tier as the machine that runs Pine's Docker stack: an Arm VM with 4 cores and 24 GB of memory, for no charge. Pine's dev instance has run on one since 2026-11-15, as a trial. Idle, the whole stack uses about 1 GB of memory; reading a raid screenshot takes about 1.5 seconds.

What the guide ends with: the stack's database made and migrated, a verified backup, the nightly backups running, and **no bot logged in**. Logging the bot in is the last step of [Starting a new Pine instance](new-instance.md) or [Moving a legacy Professor Pine](migrating-a-legacy-instance.md) (section 4 of either), which you follow from there.

## Contents

1. [The account](#1-the-account)
2. [The network](#2-the-network)
3. [The VM](#3-the-vm)
4. [Its public address and SSH](#4-its-public-address-and-ssh)
5. [Docker and git](#5-docker-and-git)
6. [The code and the stack's first start](#6-the-code-and-the-stacks-first-start)
7. [Snags on a Linux host](#7-snags-on-a-linux-host)
8. [Backups off the VM](#8-backups-off-the-vm)
9. [Living with it](#9-living-with-it)

## 1. The account

1. Sign up at <https://www.oracle.com/cloud/free/>. A card is asked for to check who you are; the Always Free resources are not charged.
2. **Choose the home region with care: it cannot be changed**, and Always Free resources exist only there. Take the one nearest your members (Pittsburgh's is US East, Ashburn). Pine needs one region: subscribing to more adds nothing.
3. **Upgrade to Pay As You Go** (Billing & Cost Management → Upgrade and Manage Payment). It is still free for what stays within the Always Free limits, and it matters twice:
   - Free-trial accounts often get "Out of host capacity" when they create an Arm VM, in every availability domain; after the upgrade the same VM was created at the first try.
   - Oracle may reclaim an idle Always Free VM of a free account; a Pay As You Go account keeps it.

   The upgrade can show "account provisioning is in progress" and then "upgrade in progress" for a few hours. Oracle sends an email when it is done.
4. **A budget alert**, so that anything that does cost money is seen at once: Billing & Cost Management → Budgets → Create Budget, the root compartment, monthly, an amount of $1, and an alert on **actual** spend at 1% of it, to your email.

## 2. The network

Networking → Virtual Cloud Networks → **Start VCN Wizard** → **Create VCN with Internet Connectivity**. Give it a name (say `pine-vcn`) and keep the defaults: a public subnet, an internet gateway and a route of `0.0.0.0/0` to it.

Pine needs no port open to the internet: Discord is reached outward, and the web pages go out through a Cloudflare tunnel (section 9 of [A Mac as Pine's host](macos-host.md#9-the-tunnel-the-web-pages), the same on any host). The default security list opens only SSH (port 22). To narrow that to your own address, edit its ingress rule's source from `0.0.0.0/0` to `<your address>/32`; SSH takes keys only either way.

## 3. The VM

Compute → Instances → **Create instance**:

- **Image:** Canonical Ubuntu (the newest LTS; 26.04 here), its **aarch64** build. Every image of Pine's stack has an arm64 build.
- **Shape:** Ampere, **VM.Standard.A1.Flex**, 4 OCPUs and 24 GB of memory, the whole Always Free allowance for Arm.
- **Networking:** the VCN and public subnet of section 2. If the switch for a public IPv4 address is grayed out, carry on: section 4 adds one.
- **SSH keys:** upload your public key (`~/.ssh/id_ed25519.pub` or `id_rsa.pub`). Oracle gives the VM no password: without the key there is no way in.
- **Boot volume:** 50 GB is plenty to start (Always Free covers 200 GB of block storage in all), and it can be enlarged later without a rebuild. The cost estimate on the page ignores the free tier: it shows a monthly price even for what is free.

The VM starts within a few minutes.

## 4. Its public address and SSH

If the VM has no public IP address (its page shows none): its page → **Attached VNICs** → the VNIC → **IPv4 Addresses** (IP administration) → the private address's menu → **Edit** → **Ephemeral public IP** → Update. An ephemeral address stays with the VM until the VM is deleted; nothing of Pine depends on it but your SSH.

Then, from your computer:

```bash
ssh ubuntu@<the VM's public address>
```

The user is `ubuntu` on Oracle's Ubuntu image.

## 5. Docker and git

Ubuntu's own packages are enough (Docker Engine 29 and Compose 2.40 on 26.04):

```bash
sudo apt-get update && sudo apt-get install -y docker.io docker-compose-v2 git
```

```bash
sudo usermod -aG docker ubuntu && sudo systemctl enable --now docker
```

Log out and in again, so that the `docker` group counts, and check:

```bash
docker compose version
```

Oracle's image keeps a firewall (iptables) that refuses everything inbound but SSH; leave it. Docker's own rules sit beside it, and Pine opens no port.

## 6. The code and the stack's first start

As on any host: [A Mac as Pine's host](macos-host.md), sections 6 and 7, run on the VM, with `/home/ubuntu` where that guide has the Mac's home. Two things differ:

- **Backups owned by you.** The backup service writes as root unless told otherwise, so you would need `sudo` to restore a dump. Put your own ids in `.env`:

  ```bash
  echo "BACKUP_UID=$(id -u)"; echo "BACKUP_GID=$(id -g)"
  ```

  prints the two lines to put in.
- **Files the bot reads must be readable by others** (section 7).

Then go on with [Starting a new Pine instance](new-instance.md) or [Moving a legacy Professor Pine](migrating-a-legacy-instance.md).

**Moving a running Pine 2 here from another host** (after the steps above, with a placeholder token):

1. On the old host, stop it and take a backup of the moment, not last night's: `./pine down`, then `./pine backup` (it starts only MySQL and the backup service, never the bot), then `./pine down` again. Two bots on one token take each other's sessions, so the old one stays down from here on.
2. Copy that dump, its `.env` and its `pine-settings.json` to the VM (`scp`; mind the modes, section 7).
3. In the copied `.env`, set what belongs to the VM: `BACKUP_DIR` (`/home/ubuntu/pine-backups`, with its `.pine-backups` marker), `BACKUP_UID` and `BACKUP_GID` (above), and any of `LEGACY_INDEX_DIR`, `LEGACY_PARTIES_DIR` and `PINE_TOOL_DIR` that named the old host's folders. A path that no longer exists stops the stack on Docker Engine.
4. Load the dump in place of the empty database the first start made: `./pine restore <dump> --replace --no-start` (it backs up the empty one first), then `./pine up`.

## 7. Snags on a Linux host

Docker Desktop and OrbStack hide these; Docker Engine on Linux does not.

- **The bot is not you.** It runs as the image's user `node`, uid 1000, and reads the files mounted into it (`pine-settings.json`, the legacy member index of `LEGACY_INDEX_DIR`, the legacy parties folder) with that id. On Oracle's Ubuntu image uid 1000 is the user `opc`, and `ubuntu` is 1001, so a file of mode 600 that you own is unreadable to the bot: it restarts again and again with "data/settings.json is not valid JSON: EACCES". Let others read those files:

  ```bash
  chmod 644 pine-settings.json
  ```

  ```bash
  chmod -R a+rX <the legacy index folder> <the legacy parties folder>
  ```

  `pine-settings.json` holds no secrets (they are in `.env`, which stays 600: the bot gets its values from Compose, not from the file). `./pine` checks the settings file and the index before it starts the bot, and refuses to start it with a settings file the bot cannot read.
- **Folders that must exist.** Docker Engine refuses to start a service whose bind-mounted folder is missing ("bind source path does not exist"), where Docker Desktop makes it. `./pine` makes the ones it knows of (the legacy index folder, the Wayfarer tool's, and `./backups` while backups are off); make `BACKUP_DIR` yourself, with its `.pine-backups` marker, as the Mac guide's section 7 says.
- **Copying files over.** `scp` and `tar` keep a source file's restrictive modes: a settings file copied from a Mac where it was 600 arrives 600 (see the first point). A `tar` made on macOS prints warnings about `LIBARCHIVE.xattr` when unpacked on Linux; they are harmless.

## 8. Backups off the VM

The nightly backups land on the VM's own boot volume, in one data center: copy them somewhere else every day, after 03:30. The NAS of [the Mac guide's section 8](macos-host.md#8-backups-off-the-mac) works the same against the VM: the VM's address in place of `pine-host.local`, and, if section 2 narrowed SSH to your address, the NAS's public address added to that rule too. Wherever they go, keep them on storage only you reach, and **no longer than 90 days**: a dump holds every member's data, and the Privacy Policy promises that backups, and what members had removed, are gone after 90 days. The VM deletes its own after `BACKUP_KEEP_DAYS` (90); the copies need the same (the Mac guide's section 8 has a daily task for the NAS).

## 9. Living with it

- `./pine status`, `./pine logs pine` over SSH, as on any host ([operations](../architecture/operations.md)).
- Ubuntu installs its security updates by itself (unattended upgrades), Docker's among them: an update of `docker.io` or `containerd` restarts Docker, and with it the whole stack (the bot logs in again within a minute or two). A new kernel waits for a restart of the VM, which never comes by itself: restart it now and then at a quiet hour (`sudo reboot`; `/var/run/reboot-required` says when one is due). After a restart Docker starts and the stack follows (`restart: unless-stopped`); check with `./pine status`.
- The budget alert of section 1 is the one to watch: everything in this guide stays within the Always Free limits.
- More disk: Block Storage → Boot Volumes → the VM's → Edit → a larger size. The simplest way for the VM to use it is a restart (`sudo reboot`): Ubuntu grows its root partition at boot. Without one, the VM must first see the new size (Oracle's page for the volume shows the rescan commands it needs), then `sudo growpart /dev/sda 1 && sudo resize2fs /dev/sda1`.
