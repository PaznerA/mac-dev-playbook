#!/usr/bin/env bash
# provision-client.sh — Bootstrap noveho Macu pro devBoxNOS
# Usage: bash scripts/provision-client.sh
set -euo pipefail

# ── Colors ────────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

info()  { echo -e "${BLUE}[INFO]${NC}  $*"; }
ok()    { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*" >&2; }
die()   { error "$*"; exit 1; }

echo ""
echo "============================================="
echo "  devBoxNOS — Client Provisioning Bootstrap  "
echo "============================================="
echo ""

# ── 1. Check macOS ────────────────────────────────────────────────────────────
info "Checking macOS version..."

if [[ "$(uname)" != "Darwin" ]]; then
    die "This script is for macOS only."
fi

MACOS_VERSION="$(sw_vers -productVersion)"
MACOS_MAJOR="$(echo "${MACOS_VERSION}" | cut -d. -f1)"

if [[ "${MACOS_MAJOR}" -lt 14 ]]; then
    die "macOS 14 (Sonoma) or later required. Found: ${MACOS_VERSION}"
fi
ok "macOS ${MACOS_VERSION}"

# ── 2. Check Apple Silicon ────────────────────────────────────────────────────
info "Checking architecture..."

ARCH="$(uname -m)"
if [[ "${ARCH}" != "arm64" ]]; then
    die "Apple Silicon (arm64) required. Found: ${ARCH}"
fi
ok "Apple Silicon (${ARCH})"

# ── 3. Xcode Command Line Tools ──────────────────────────────────────────────
info "Checking Xcode Command Line Tools..."

if ! xcode-select -p &>/dev/null; then
    info "Installing Xcode Command Line Tools (this may take a few minutes)..."
    xcode-select --install
    echo ""
    warn "Xcode CLT installer opened. Complete the installation, then re-run this script."
    exit 0
else
    ok "Xcode CLT installed ($(xcode-select -p))"
fi

# ── 4. Homebrew ───────────────────────────────────────────────────────────────
info "Checking Homebrew..."

HOMEBREW_PREFIX="/opt/homebrew"

if ! command -v "${HOMEBREW_PREFIX}/bin/brew" &>/dev/null; then
    info "Installing Homebrew..."
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

    # Add Homebrew to PATH for this session
    eval "$("${HOMEBREW_PREFIX}/bin/brew" shellenv)"
    ok "Homebrew installed"
else
    eval "$("${HOMEBREW_PREFIX}/bin/brew" shellenv)"
    ok "Homebrew $(brew --version | head -1)"
fi

# ── 5. Python & pip ──────────────────────────────────────────────────────────
info "Checking Python..."

# Homebrew Python is preferred over system Python
if ! command -v python3 &>/dev/null; then
    info "Installing Python via Homebrew..."
    brew install python
fi
ok "Python $(python3 --version 2>&1 | awk '{print $2}')"

# ── 6. Ansible ────────────────────────────────────────────────────────────────
info "Checking Ansible..."

if ! command -v ansible &>/dev/null; then
    info "Installing Ansible via pip..."
    python3 -m pip install --user ansible
    ok "Ansible installed"
else
    ok "Ansible $(ansible --version | head -1 | awk '{print $NF}' | tr -d ']')"
fi

# ── 7. Ansible Galaxy roles ──────────────────────────────────────────────────
info "Installing Ansible Galaxy roles..."

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(dirname "${SCRIPT_DIR}")"

if [[ -f "${REPO_DIR}/requirements.yml" ]]; then
    ansible-galaxy install -r "${REPO_DIR}/requirements.yml"
    ok "Galaxy roles installed"
else
    warn "requirements.yml not found in ${REPO_DIR} — skipping Galaxy roles"
fi

# ── 8. Copy example configs ──────────────────────────────────────────────────
info "Setting up configuration files..."

if [[ ! -f "${REPO_DIR}/config.yml" ]]; then
    if [[ -f "${REPO_DIR}/config.example.yml" ]]; then
        cp "${REPO_DIR}/config.example.yml" "${REPO_DIR}/config.yml"
        ok "config.yml created from config.example.yml"
    else
        warn "config.example.yml not found — create config.yml manually"
    fi
else
    ok "config.yml already exists (not overwritten)"
fi

if [[ ! -f "${REPO_DIR}/credentials.yml" ]]; then
    if [[ -f "${REPO_DIR}/credentials.example.yml" ]]; then
        cp "${REPO_DIR}/credentials.example.yml" "${REPO_DIR}/credentials.yml"
        ok "credentials.yml created from credentials.example.yml"
        warn "Edit credentials.yml and set secure passwords before running the playbook!"
    else
        warn "credentials.example.yml not found — create credentials.yml manually"
    fi
else
    ok "credentials.yml already exists (not overwritten)"
fi

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
echo "============================================="
echo "  Bootstrap complete!                        "
echo "============================================="
echo ""
echo "Next steps:"
echo ""
echo "  1. Edit config.yml — enable/disable services"
echo "     nano ${REPO_DIR}/config.yml"
echo ""
echo "  2. Edit credentials.yml — set secure passwords"
echo "     nano ${REPO_DIR}/credentials.yml"
echo ""
echo "  3. Run the playbook:"
echo "     cd ${REPO_DIR}"
echo "     ansible-playbook main.yml -K"
echo ""
echo "  Full docs: docs/client-provisioning.md"
echo ""
