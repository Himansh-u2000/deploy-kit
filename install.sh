#!/bin/bash
#
# DeployKit Installer
# Installs Node.js (if not present) and deploykit-cli CLI on Ubuntu servers.
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/Himansh-u2000/deploy-kit/main/install.sh | bash
#

set -euo pipefail

# ── Colors ────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# ── Helper Functions ──────────────────────────────────────────────
info()    { echo -e "  ${CYAN}ℹ${NC} $1"; }
success() { echo -e "  ${GREEN}✔${NC} $1"; }
warn()    { echo -e "  ${YELLOW}⚠${NC} $1"; }
error()   { echo -e "  ${RED}✖${NC} $1"; }

# ── Banner ────────────────────────────────────────────────────────
echo ""
echo -e "${CYAN}${BOLD}"
echo "  ____             _             _  ___ _   "
echo " |  _ \\  ___ _ __ | | ___  _   _| |/ (_) |_ "
echo " | | | |/ _ \\ '_ \\| |/ _ \\| | | | ' /| | __|"
echo " | |_| |  __/ |_) | | (_) | |_| | . \\| | |_ "
echo " |____/ \\___| .__/|_|\\___/ \\__, |_|\\_\\_|\\__|"
echo "            |_|            |___/             "
echo -e "${NC}"
echo -e "  ${BOLD}One-command VPS deployment tool${NC}"
echo ""
echo "─────────────────────────────────────────────"
echo ""

# ── Check OS ──────────────────────────────────────────────────────
if [ -f /etc/os-release ]; then
    # shellcheck disable=SC1091
    . /etc/os-release
    success "Detected: ${PRETTY_NAME:-unknown}"
    # Node.js 22+ needs glibc >= 2.28 (Ubuntu 20.04+ / Debian 10+)
    if [ "${ID:-}" = "ubuntu" ] && [ "${VERSION_ID%%.*}" -lt 20 ] 2>/dev/null; then
        error "Ubuntu ${VERSION_ID} is too old — Node.js 22+ requires Ubuntu 20.04 or newer"
        exit 1
    fi
else
    warn "Could not detect OS — continuing anyway (designed for Ubuntu/Debian)"
fi

# ── Check root ────────────────────────────────────────────────────
if [ "$(id -u)" -ne 0 ]; then
    error "This installer must be run as root"
    echo ""
    echo "  Run with:"
    echo -e "  ${BOLD}curl -fsSL https://raw.githubusercontent.com/Himansh-u2000/deploy-kit/main/install.sh | sudo bash${NC}"
    echo ""
    exit 1
fi

# ── Check architecture ───────────────────────────────────────────
ARCH=$(uname -m)
case $ARCH in
    x86_64) success "Architecture: x86_64 (64-bit)" ;;
    aarch64) success "Architecture: ARM64" ;;
    *) warn "Architecture: $ARCH (may have limited support)" ;;
esac

# ── Install Node.js if not present (or too old) ──────────────────
# Node.js 18 and 20 are end-of-life. 24 is the recommended LTS.
NODE_VERSION="${DEPLOYKIT_NODE_VERSION:-24}"
MIN_NODE_MAJOR=22
MIN_NODE_MINOR=12
export DEBIAN_FRONTEND=noninteractive

node_is_supported() {
    command -v node &> /dev/null || return 1
    local ver major minor
    ver=$(node --version | sed 's/^v//')
    major=${ver%%.*}
    minor=$(echo "$ver" | cut -d. -f2)
    [ "$major" -gt "$MIN_NODE_MAJOR" ] || { [ "$major" -eq "$MIN_NODE_MAJOR" ] && [ "$minor" -ge "$MIN_NODE_MINOR" ]; }
}

if node_is_supported; then
    success "Node.js $(node --version) is already installed"
else
    if command -v node &> /dev/null; then
        warn "Node.js $(node --version) is too old (DeployKit needs >= ${MIN_NODE_MAJOR}.${MIN_NODE_MINOR})"
        info "Upgrading to Node.js $NODE_VERSION LTS..."
    else
        info "Installing Node.js $NODE_VERSION LTS..."
    fi

    # Install curl / certificates if not present
    if ! command -v curl &> /dev/null; then
        apt-get update -y -qq > /dev/null 2>&1
        apt-get install -y -qq curl ca-certificates > /dev/null 2>&1
    fi

    # Install Node.js via NodeSource (logs kept for troubleshooting)
    NODE_LOG=/tmp/deploykit-node-install.log
    if ! { curl -fsSL "https://deb.nodesource.com/setup_${NODE_VERSION}.x" | bash - && apt-get install -y nodejs; } > "$NODE_LOG" 2>&1; then
        error "Node.js installation failed — see $NODE_LOG"
        tail -n 15 "$NODE_LOG" | sed 's/^/    /'
        exit 1
    fi
    hash -r

    if node_is_supported; then
        success "Node.js $(node --version) installed"
    else
        error "Failed to install Node.js"
        echo "  Try installing manually:"
        echo "  curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash -"
        echo "  apt-get install -y nodejs"
        exit 1
    fi
fi

# ── Verify npm ────────────────────────────────────────────────────
if ! command -v npm &> /dev/null; then
    info "npm is missing. Attempting to install via apt..."
    apt-get update -y -qq > /dev/null 2>&1
    apt-get install -y -qq npm > /dev/null 2>&1
fi

if command -v npm &> /dev/null; then
    success "npm $(npm --version) available"
else
    error "npm not found. Please install Node.js and npm manually."
    exit 1
fi

# ── Install deploykit-cli ────────────────────────────────────────────
info "Installing deploykit-cli globally..."

NPM_LOG=/tmp/deploykit-npm-install.log
if ! npm install -g deploykit-cli@latest > "$NPM_LOG" 2>&1; then
    error "npm install failed — see $NPM_LOG"
    tail -n 15 "$NPM_LOG" | sed 's/^/    /'
    exit 1
fi
hash -r

if command -v deploykit &> /dev/null; then
    success "deploykit $(deploykit --version) installed successfully!"
else
    # Installed, but npm's global bin dir isn't on PATH
    NPM_PREFIX=$(npm prefix -g)
    if [ -x "$NPM_PREFIX/bin/deploykit" ]; then
        warn "deploykit installed to $NPM_PREFIX/bin, which is not on your PATH"
        echo "  Add it with: export PATH=\"$NPM_PREFIX/bin:\$PATH\""
    else
        error "Failed to install deploykit-cli"
        echo "  Try installing manually:"
        echo "  npm install -g deploykit-cli"
        exit 1
    fi
fi

# ── Done! ─────────────────────────────────────────────────────────
echo ""
echo "─────────────────────────────────────────────"
echo ""
echo -e "  ${GREEN}${BOLD}✅ Installation complete!${NC}"
echo ""
echo -e "  Get started with:"
echo -e "  ${BOLD}  deploykit init${NC}"
echo ""
echo -e "  This will:"
echo "    • Install Node.js LTS, Nginx, PM2, Certbot"
echo "    • Clone your project from GitHub"
echo "    • Configure environment variables"
echo "    • Setup Nginx & SSL"
echo ""
echo -e "  Other commands:"
echo -e "    ${CYAN}deploykit deploy${NC}     Deploy or redeploy"
echo -e "    ${CYAN}deploykit status${NC}     Server dashboard"
echo -e "    ${CYAN}deploykit logs${NC}       View app logs"
echo -e "    ${CYAN}deploykit ssl${NC}        Manage SSL certs"
echo -e "    ${CYAN}deploykit rollback${NC}   Undo last deploy"
echo ""
echo "─────────────────────────────────────────────"
echo ""
