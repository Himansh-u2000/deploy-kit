#!/bin/bash
#
# DeployKit Installer
# Installs Node.js (if not present) and deploykit-cli CLI on Ubuntu servers.
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/Himansh-u2000/deploy-kit/main/install.sh | bash
#

set -e

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
    . /etc/os-release
    OS=$ID
    VERSION=$VERSION_ID
    success "Detected: $PRETTY_NAME"
else
    warn "Could not detect OS — continuing anyway (designed for Ubuntu/Debian)"
fi

# ── Check root ────────────────────────────────────────────────────
if [ "$EUID" -ne 0 ]; then
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

# ── Install Node.js if not present ────────────────────────────────
NODE_VERSION="20"

if command -v node &> /dev/null; then
    CURRENT_NODE=$(node --version)
    success "Node.js $CURRENT_NODE is already installed"
else
    info "Installing Node.js $NODE_VERSION LTS..."

    # Install curl if not present
    if ! command -v curl &> /dev/null; then
        apt-get update -y -qq > /dev/null 2>&1
        apt-get install -y -qq curl > /dev/null 2>&1
    fi

    # Install Node.js via NodeSource
    curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash - > /dev/null 2>&1
    apt-get install -y -qq nodejs > /dev/null 2>&1

    if command -v node &> /dev/null; then
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

npm install -g deploykit-cli > /dev/null 2>&1

if command -v deploykit &> /dev/null; then
    success "deploykit-cli installed successfully!"
else
    # Fallback — try with explicit path
    warn "deploykit not found in PATH — trying alternate install..."
    NPM_GLOBAL=$(npm root -g)
    if [ -f "$NPM_GLOBAL/../bin/deploykit" ]; then
        success "deploykit-cli installed (may need PATH update)"
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
echo "    • Install Nginx, PM2, Certbot"
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
