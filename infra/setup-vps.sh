#!/usr/bin/env bash
# One-time bootstrap of a fresh OVH Ubuntu 24.04 VPS for diogomota.com. Safe to re-run.
# Run as root from the ubuntu account:  sudo bash setup-vps.sh
#
# - deploy user (docker group, no password) with the SSH keys of the ubuntu user
# - SSH: keys only, no root login
# - UFW: only 22, 80 and 443 in
# - fail2ban (sshd jail), unattended security upgrades (reboot at 04:30 if needed)
# - 2 GB swapfile if the machine has no swap
# - Docker Engine + compose plugin from Docker's apt repository
# - /opt/diogomota with backups/ and logs/, owned by deploy
set -euo pipefail

ADMIN_USER=ubuntu            # existing account whose authorized_keys deploy gets
DEPLOY_USER=deploy
APP_DIR=/opt/diogomota
SWAP_FILE=/swapfile
SWAP_SIZE=2G
AUTO_REBOOT_TIME=04:30       # when unattended-upgrades may reboot; empty = never

# Never prompt: keep existing config files on upgrades, restart services as needed.
export DEBIAN_FRONTEND=noninteractive
export UCF_FORCE_CONFFOLD=1
export NEEDRESTART_MODE=a

log() { printf '\n==> %s\n' "$*"; }
die() { printf '\nERROR: %s\n' "$*" >&2; exit 1; }

# Number of valid public keys in an authorized_keys file (0 if missing).
key_count() {
    if [[ -f $1 ]]; then
        ssh-keygen -lf "$1" 2>/dev/null | wc -l
    else
        echo 0
    fi
}

installed() { dpkg -l "$1" 2>/dev/null | grep -q '^ii'; }

# --- Preflight: nothing changes until these pass -----------------------------

[[ $EUID -eq 0 ]] || die "run as root: sudo bash $0"

# shellcheck source=/dev/null
. /etc/os-release
[[ ${ID:-} == ubuntu && ${VERSION_ID:-} == 24.04 ]] ||
    die "expected Ubuntu 24.04, found ${PRETTY_NAME:-unknown}"

admin_home=$(getent passwd "$ADMIN_USER" | cut -d: -f6) ||
    die "user $ADMIN_USER does not exist"
admin_keys="$admin_home/.ssh/authorized_keys"
(( $(key_count "$admin_keys") > 0 )) ||
    die "$admin_keys has no SSH keys. deploy would have no way in once password login is off; aborting before any change."

# --- Packages ------------------------------------------------------------------

log "Updating packages"
apt-get update -q
apt-get upgrade -y -q -o Dpkg::Options::=--force-confdef -o Dpkg::Options::=--force-confold
apt-get install -y -q ca-certificates curl ufw fail2ban python3-systemd unattended-upgrades

# --- Swap ----------------------------------------------------------------------

log "Swap"
if [[ -n $(swapon --show --noheadings) ]]; then
    echo "Swap already active, leaving it alone."
else
    if [[ ! -f $SWAP_FILE ]]; then
        fallocate -l "$SWAP_SIZE" "$SWAP_FILE" ||
            dd if=/dev/zero of="$SWAP_FILE" bs=1M count=$(( ${SWAP_SIZE%G} * 1024 )) status=none
    fi
    chmod 600 "$SWAP_FILE"
    mkswap "$SWAP_FILE" >/dev/null
    swapon "$SWAP_FILE"
    echo "Created $SWAP_FILE ($SWAP_SIZE)."
fi
if swapon --show=NAME --noheadings | grep -qxF "$SWAP_FILE" &&
    ! grep -qE "^${SWAP_FILE}[[:space:]]" /etc/fstab; then
    echo "$SWAP_FILE none swap sw 0 0" >> /etc/fstab
fi

# --- Docker --------------------------------------------------------------------

log "Docker Engine"
# Distribution packages that conflict with Docker's own.
for pkg in docker.io docker-doc docker-compose docker-compose-v2 podman-docker containerd runc; do
    if installed "$pkg"; then
        apt-get remove -y -q "$pkg"
    fi
done
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
cat > /etc/apt/sources.list.d/docker.sources <<EOF
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: ${UBUNTU_CODENAME:-$VERSION_CODENAME}
Components: stable
Signed-By: /etc/apt/keyrings/docker.asc
EOF
apt-get update -q
apt-get install -y -q docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
systemctl enable --now docker.service containerd.service

# --- deploy user ---------------------------------------------------------------

log "User $DEPLOY_USER"
if id "$DEPLOY_USER" &>/dev/null; then
    echo "Already exists."
else
    # Password '*': no password login at all, but not "locked" (sshd can refuse
    # key logins for locked accounts).
    useradd --create-home --shell /bin/bash --password '*' "$DEPLOY_USER"
    echo "Created."
fi
usermod -aG docker "$DEPLOY_USER"

deploy_home=$(getent passwd "$DEPLOY_USER" | cut -d: -f6)
deploy_keys="$deploy_home/.ssh/authorized_keys"
install -d -m 700 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$deploy_home/.ssh"
touch "$deploy_keys"
# Make sure an appended key starts on its own line.
if [[ -s $deploy_keys && -n $(tail -c1 "$deploy_keys") ]]; then
    echo >> "$deploy_keys"
fi
# Add the admin keys that are missing; keep keys added later (e.g. the CI deploy key).
added=0
while IFS= read -r line || [[ -n $line ]]; do
    [[ $line =~ ^[[:space:]]*(#|$) ]] && continue
    if ! grep -qxF -- "$line" "$deploy_keys"; then
        printf '%s\n' "$line" >> "$deploy_keys"
        added=$(( added + 1 ))
    fi
done < "$admin_keys"
chown "$DEPLOY_USER:$DEPLOY_USER" "$deploy_keys"
chmod 600 "$deploy_keys"
echo "Copied $added key(s) from $admin_keys."
(( $(key_count "$deploy_keys") > 0 )) ||
    die "$deploy_keys has no valid keys; not touching sshd."

# --- Directories ---------------------------------------------------------------

log "Directories"
install -d -m 750 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$APP_DIR" "$APP_DIR/logs"
install -d -m 700 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$APP_DIR/backups"
echo "$APP_DIR, $APP_DIR/backups, $APP_DIR/logs"

# --- SSH -----------------------------------------------------------------------

log "SSH: keys only, no root login"
sshd_dropin=/etc/ssh/sshd_config.d/00-diogomota.conf
cat > "$sshd_dropin" <<'EOF'
# Written by infra/setup-vps.sh. sshd keeps the first value it reads for each
# setting, and this file sorts before cloud-init's 50-cloud-init.conf.
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin no
EOF
install -d -m 755 /run/sshd   # sshd -t needs it; missing until ssh.service first starts
undo_sshd() {
    rm -f "$sshd_dropin"
    die "$1; removed $sshd_dropin, SSH is unchanged."
}
sshd -t || undo_sshd "sshd rejected the new config"
effective=$(sshd -T) || undo_sshd "sshd -T failed"
for setting in "passwordauthentication no" "kbdinteractiveauthentication no" "permitrootlogin no"; do
    grep -qx "$setting" <<<"$effective" ||
        undo_sshd "sshd would not apply '$setting' (another config wins?)"
done
# Reload keeps open sessions. On 24.04 ssh.service is socket-activated: if it is
# not running, the next connection starts it with the new config.
systemctl try-reload-or-restart ssh.service

# --- Firewall ------------------------------------------------------------------

log "UFW"
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp comment ssh     # before enabling, so this session survives
ufw allow 80/tcp comment http
ufw allow 443/tcp comment https
ufw --force enable
# Note: Docker's published ports bypass UFW. Only nginx publishes ports (80/443).

# --- fail2ban ------------------------------------------------------------------

log "fail2ban"
cat > /etc/fail2ban/jail.d/sshd.local <<'EOF'
# Written by infra/setup-vps.sh.
[sshd]
enabled  = true
backend  = systemd
maxretry = 5
findtime = 10m
bantime  = 1h
EOF
fail2ban-client -t >/dev/null || die "fail2ban rejected /etc/fail2ban/jail.d/sshd.local"
systemctl enable fail2ban.service
systemctl restart fail2ban.service

# --- Unattended upgrades -------------------------------------------------------

log "Unattended upgrades"
cat > /etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
EOF
reboot_conf=/etc/apt/apt.conf.d/52diogomota-reboot
if [[ -n $AUTO_REBOOT_TIME ]]; then
    cat > "$reboot_conf" <<EOF
// Written by infra/setup-vps.sh: reboot when an update (e.g. a kernel) needs it.
// The containers come back on their own (restart: unless-stopped).
Unattended-Upgrade::Automatic-Reboot "true";
Unattended-Upgrade::Automatic-Reboot-Time "$AUTO_REBOOT_TIME";
EOF
else
    rm -f "$reboot_conf"
fi
systemctl enable --now unattended-upgrades.service

# --- Summary -------------------------------------------------------------------

log "Summary"
row() { printf '  %-21s %s\n' "$1" "$2"; }
row "deploy user" "$DEPLOY_USER: $(key_count "$deploy_keys") SSH key(s), groups: $(id -nG "$DEPLOY_USER")"
row "SSH" "$(grep -E '^(passwordauthentication|kbdinteractiveauthentication|permitrootlogin) ' <<<"$(sshd -T)" | paste -sd ',' | sed 's/,/, /g')"
row "firewall" "$(ufw status | head -n1)"
ufw status | grep -E 'ALLOW' | sed 's/^/                          /' || true
row "fail2ban" "$(systemctl is-active fail2ban.service || true), jails: $(fail2ban-client status 2>/dev/null | sed -n 's/.*Jail list:[[:space:]]*//p' || true)"
row "unattended-upgrades" "$(systemctl is-active unattended-upgrades.service || true), auto reboot: ${AUTO_REBOOT_TIME:-off}"
row "swap" "$(swapon --show=NAME,SIZE --noheadings | paste -sd ',' | tr -s ' ')"
row "docker" "$(docker --version), compose $(docker compose version --short)"
row "directories" "$APP_DIR (backups/, logs/), owner $DEPLOY_USER"
if [[ -f /var/run/reboot-required ]]; then
    row "reboot" "REQUIRED by the upgrades: sudo reboot"
fi

cat <<EOF

Before closing this session, check in a NEW terminal that key login works:
  ssh $DEPLOY_USER@$(hostname -I | awk '{print $1}') 'id; docker ps'
EOF
