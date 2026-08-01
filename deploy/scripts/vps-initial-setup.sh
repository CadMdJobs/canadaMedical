#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# vps-initial-setup.sh — Run ONCE on a fresh Hostinger Ubuntu 22.04/24.04 VPS
#
# What it does:
#   1. Hardens SSH (disable root login, password auth, change port)
#   2. Creates a non-root deploy user with SSH key
#   3. Configures UFW firewall (allow SSH, HTTP, HTTPS only)
#   4. Installs Fail2ban with production jail config
#   5. Installs Docker CE + Docker Compose plugin (latest stable)
#   6. Installs Certbot (Let's Encrypt)
#   7. Sets up swap (2 GB — important for small VPS during builds)
#   8. Applies kernel network hardening
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/.../vps-initial-setup.sh | \
#     sudo bash -s -- --domain yourdomain.com --user deploy --pubkey "ssh-ed25519 AAAA..."
#
# OR run directly on the VPS:
#   sudo bash vps-initial-setup.sh --domain yourdomain.com --user deploy
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

# ── Parse args ────────────────────────────────────────────────────────────────
DEPLOY_USER="deploy"
DOMAIN=""
SSH_PUBKEY=""
SSH_PORT=2222

while [[ $# -gt 0 ]]; do
  case "$1" in
    --user)    DEPLOY_USER="$2"; shift 2 ;;
    --domain)  DOMAIN="$2";      shift 2 ;;
    --pubkey)  SSH_PUBKEY="$2";  shift 2 ;;
    --sshport) SSH_PORT="$2";    shift 2 ;;
    *) echo "Unknown arg: $1"; exit 1 ;;
  esac
done

[[ -z "$DOMAIN" ]] && { echo "ERROR: --domain is required"; exit 1; }

log() { echo -e "\n\033[1;32m[setup] $*\033[0m"; }
warn() { echo -e "\033[1;33m[warn] $*\033[0m"; }

# ── Must run as root ──────────────────────────────────────────────────────────
[[ "$(id -u)" != "0" ]] && { echo "Run as root (sudo)"; exit 1; }

log "Updating system packages ..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get upgrade -yq
apt-get install -yq --no-install-recommends \
  curl wget gnupg2 ca-certificates lsb-release software-properties-common \
  ufw fail2ban git htop ncdu unzip jq openssl

# ── Swap (2 GB) ───────────────────────────────────────────────────────────────
log "Creating 2 GB swap ..."
if ! swapon --show | grep -q /swapfile; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
  echo 'vm.swappiness=10'           >> /etc/sysctl.conf
  echo 'vm.vfs_cache_pressure=50'   >> /etc/sysctl.conf
  sysctl -p
fi

# ── Kernel network hardening ─────────────────────────────────────────────────
log "Applying kernel hardening ..."
cat >> /etc/sysctl.conf << 'EOF'
# Network hardening
net.ipv4.tcp_syncookies = 1
net.ipv4.conf.all.accept_redirects = 0
net.ipv4.conf.default.accept_redirects = 0
net.ipv4.conf.all.send_redirects = 0
net.ipv4.conf.all.accept_source_route = 0
net.ipv4.conf.all.log_martians = 1
net.ipv4.icmp_echo_ignore_broadcasts = 1
net.ipv4.icmp_ignore_bogus_error_responses = 1
net.ipv6.conf.all.disable_ipv6 = 0
# Increase file descriptor limits for Nginx / Daphne
fs.file-max = 65536
EOF
sysctl -p

# ── Deploy user ───────────────────────────────────────────────────────────────
log "Creating deploy user '${DEPLOY_USER}' ..."
if ! id "$DEPLOY_USER" &>/dev/null; then
  useradd -m -s /bin/bash "$DEPLOY_USER"
  usermod -aG sudo "$DEPLOY_USER"
  # Allow sudo without password for deploy user (CI SSH commands)
  echo "${DEPLOY_USER} ALL=(ALL) NOPASSWD:ALL" > "/etc/sudoers.d/${DEPLOY_USER}"
  chmod 440 "/etc/sudoers.d/${DEPLOY_USER}"
fi

# Add SSH public key if provided
if [[ -n "$SSH_PUBKEY" ]]; then
  DEPLOY_HOME=$(getent passwd "$DEPLOY_USER" | cut -d: -f6)
  mkdir -p "${DEPLOY_HOME}/.ssh"
  echo "$SSH_PUBKEY" >> "${DEPLOY_HOME}/.ssh/authorized_keys"
  chmod 700 "${DEPLOY_HOME}/.ssh"
  chmod 600 "${DEPLOY_HOME}/.ssh/authorized_keys"
  chown -R "${DEPLOY_USER}:${DEPLOY_USER}" "${DEPLOY_HOME}/.ssh"
fi

# ── Harden SSH ────────────────────────────────────────────────────────────────
log "Hardening SSH (port ${SSH_PORT}) ..."
cp /etc/ssh/sshd_config /etc/ssh/sshd_config.bak
cat > /etc/ssh/sshd_config.d/99-hardening.conf << EOF
Port ${SSH_PORT}
PermitRootLogin no
PasswordAuthentication no
PubkeyAuthentication yes
AuthorizedKeysFile .ssh/authorized_keys
PermitEmptyPasswords no
ChallengeResponseAuthentication no
UsePAM yes
X11Forwarding no
PrintMotd no
MaxAuthTries 3
LoginGraceTime 30
ClientAliveInterval 300
ClientAliveCountMax 2
AllowUsers ${DEPLOY_USER}
EOF
sshd -t  # Validate config before restarting
systemctl restart sshd
warn "SSH now on port ${SSH_PORT}. Open a NEW terminal with this port BEFORE closing this session."

# ── UFW Firewall ──────────────────────────────────────────────────────────────
log "Configuring UFW ..."
ufw default deny incoming
ufw default allow outgoing
ufw allow "${SSH_PORT}/tcp" comment "SSH"
ufw allow 80/tcp   comment "HTTP"
ufw allow 443/tcp  comment "HTTPS"
ufw --force enable
ufw status verbose

# ── Fail2ban ──────────────────────────────────────────────────────────────────
log "Configuring Fail2ban ..."
cat > /etc/fail2ban/jail.local << EOF
[DEFAULT]
bantime  = 3600
findtime = 600
maxretry = 5
backend  = systemd

[sshd]
enabled  = true
port     = ${SSH_PORT}
filter   = sshd
logpath  = /var/log/auth.log
maxretry = 3
bantime  = 86400

[nginx-http-auth]
enabled = true
filter  = nginx-http-auth
logpath = /var/log/nginx/error.log

[nginx-limit-req]
enabled  = true
filter   = nginx-limit-req
logpath  = /var/log/nginx/error.log
maxretry = 10
EOF
systemctl enable fail2ban
systemctl restart fail2ban

# ── Docker CE ─────────────────────────────────────────────────────────────────
log "Installing Docker CE ..."
if ! command -v docker &>/dev/null; then
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
    | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
    https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -qq
  apt-get install -yq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi

usermod -aG docker "$DEPLOY_USER"
systemctl enable docker
systemctl start docker

# Docker daemon hardening
cat > /etc/docker/daemon.json << 'EOF'
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "20m",
    "max-file": "5"
  },
  "live-restore": true,
  "userland-proxy": false,
  "no-new-privileges": true
}
EOF
systemctl restart docker

# ── Certbot ───────────────────────────────────────────────────────────────────
log "Installing Certbot ..."
snap install --classic certbot 2>/dev/null || apt-get install -yq certbot python3-certbot-nginx
ln -sf /snap/bin/certbot /usr/bin/certbot 2>/dev/null || true

# ── Deploy directory ──────────────────────────────────────────────────────────
log "Creating deploy directory ..."
DEPLOY_PATH="/opt/canadamed"
mkdir -p "$DEPLOY_PATH"
chown "${DEPLOY_USER}:${DEPLOY_USER}" "$DEPLOY_PATH"

# ── Unattended upgrades (security patches auto-apply) ────────────────────────
log "Enabling unattended security upgrades ..."
apt-get install -yq unattended-upgrades
dpkg-reconfigure -plow unattended-upgrades

# ── Done ──────────────────────────────────────────────────────────────────────
log "=== VPS initial setup complete ==="
echo ""
echo "  Deploy user   : ${DEPLOY_USER}"
echo "  SSH port      : ${SSH_PORT}"
echo "  Deploy path   : ${DEPLOY_PATH}"
echo "  Domain        : ${DOMAIN}"
echo ""
echo "  Next steps:"
echo "  1. Upload .env.production to ${DEPLOY_PATH}/"
echo "  2. Upload deploy/pgbouncer/userlist.txt"
echo "  3. Run: certbot --nginx -d ${DOMAIN} -d www.${DOMAIN}"
echo "  4. Push to main branch to trigger CI/CD deploy"
echo ""
warn "IMPORTANT: Verify new SSH port ${SSH_PORT} works before closing this session!"
