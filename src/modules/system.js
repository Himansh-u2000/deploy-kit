/**
 * DeployKit — System Setup Module
 * Handles system updates, swap configuration, and software installation.
 */

import { existsSync, readFileSync, appendFileSync } from 'fs';
import { confirm, select } from '@inquirer/prompts';
import logger from '../utils/logger.js';
import shell from '../utils/shell.js';
import {
  NODE_VERSIONS,
  DEFAULT_NODE_VERSION,
  SWAP_SIZE,
  SWAP_FILE,
  FIREWALL_PORTS,
  DEFAULT_SSH_PORT,
  MIN_NODE_MAJOR,
  DEPLOYKIT_CONFIG_DIR,
} from '../utils/constants.js';

const APT_ENV = { DEBIAN_FRONTEND: 'noninteractive' };

/**
 * Run the full system setup:
 * 1. Check Ubuntu version
 * 2. Setup swap (if needed)
 * 3. apt update & upgrade
 * 4. Install Node.js, Nginx, PM2, Certbot, Git
 * 5. Configure firewall
 * 6. Display summary
 */
export async function setupSystem() {
  logger.step(1, 7, '🔧', 'System Setup');

  // ── Check Ubuntu ───────────────────────────────────────────────
  const osInfo = getOsInfo();
  if (osInfo) {
    logger.success(`${osInfo.name} ${osInfo.version} detected`);
  } else {
    logger.warn('Could not detect OS version — continuing anyway');
  }

  // ── Setup Swap ─────────────────────────────────────────────────
  await setupSwap();

  // ── System Update ──────────────────────────────────────────────
  const updateSpinner = logger.spinner('Updating system packages...');
  try {
    shell.exec('apt-get update -y', { env: APT_ENV });
    shell.exec(
      'apt-get -o Dpkg::Options::=--force-confdef -o Dpkg::Options::=--force-confold upgrade -y',
      { env: APT_ENV }
    );
    updateSpinner.succeed('System packages updated');
  } catch (err) {
    updateSpinner.fail('Failed to update system packages');
    logger.dim(err.message);
  }

  // ── Install Node.js ────────────────────────────────────────────
  await installNodejs();

  // ── Install Nginx ──────────────────────────────────────────────
  await installPackage('nginx', 'Nginx', 'apt-get install -y nginx');

  // ── Install PM2 ────────────────────────────────────────────────
  await installPackage('pm2', 'PM2', 'npm install -g pm2');

  // ── Install Certbot ────────────────────────────────────────────
  await installPackage('certbot', 'Certbot', 'apt-get install -y certbot python3-certbot-nginx');

  // ── Install Git ────────────────────────────────────────────────
  await installPackage('git', 'Git', 'apt-get install -y git');

  // ── Configure Firewall ─────────────────────────────────────────
  await configureFirewall();

  // ── Create config directory ────────────────────────────────────
  shell.execSafe(`mkdir -p ${DEPLOYKIT_CONFIG_DIR}`);

  // ── Display Summary ────────────────────────────────────────────
  displayVersionSummary();
}

/**
 * Get OS info (name and version) from /etc/os-release
 * (lsb_release is not installed on minimal Ubuntu images).
 */
export function getOsInfo(osReleasePath = '/etc/os-release') {
  try {
    if (!existsSync(osReleasePath)) return null;
    const content = readFileSync(osReleasePath, 'utf-8');
    const get = (key) => content.match(new RegExp(`^${key}="?([^"\\n]*)"?$`, 'm'))?.[1];
    const name = get('NAME');
    const version = get('VERSION_ID');
    return name ? { name, version: version || '' } : null;
  } catch {
    return null;
  }
}

/**
 * Detect the port sshd listens on, so enabling UFW never locks the user out.
 * @returns {number}
 */
export function detectSshPort() {
  // Effective sshd config (handles Include files and drop-ins)
  const { success, output } = shell.execSafe('sshd -T 2>/dev/null | grep -i "^port "');
  if (success && output) {
    const port = parseInt(output.split(/\s+/)[1], 10);
    if (port > 0 && port < 65536) return port;
  }
  // Fallback: what sshd is actually listening on
  const ss = shell.execSafe(`ss -Htlnp 2>/dev/null | grep -m1 '"sshd"'`);
  const match = ss.output.match(/:(\d+)\s/);
  if (match) return parseInt(match[1], 10);
  return DEFAULT_SSH_PORT;
}

/**
 * Setup swap file if total RAM is < 1GB
 */
async function setupSwap() {
  try {
    const memKb = parseInt(shell.exec("grep MemTotal /proc/meminfo | awk '{print $2}'"), 10);
    const memMb = Math.round(memKb / 1024);

    if (memMb < 1024) {
      logger.info(`RAM: ${memMb}MB — setting up ${SWAP_SIZE} swap file`);

      // Check if swap already exists
      const { success: swapExists } = shell.execSafe(`swapon --show | grep ${SWAP_FILE}`);
      if (swapExists) {
        logger.success('Swap file already configured');
        return;
      }

      const swapSpinner = logger.spinner('Creating swap file...');
      try {
        // fallocate is unsupported on some filesystems — fall back to dd
        if (!shell.execSafe(`fallocate -l ${SWAP_SIZE} ${SWAP_FILE}`).success) {
          shell.exec(`dd if=/dev/zero of=${SWAP_FILE} bs=1M count=${parseInt(SWAP_SIZE, 10) * 1024}`);
        }
        shell.exec(`chmod 600 ${SWAP_FILE}`);
        shell.exec(`mkswap ${SWAP_FILE}`);
        shell.exec(`swapon ${SWAP_FILE}`);

        // Make persistent
        const { success: fstabExists } = shell.execSafe(`grep ${SWAP_FILE} /etc/fstab`);
        if (!fstabExists) {
          shell.exec(`echo '${SWAP_FILE} none swap sw 0 0' >> /etc/fstab`);
        }

        // Optimize swappiness for low-RAM servers
        shell.exec('sysctl vm.swappiness=10');
        const sysctlConf = existsSync('/etc/sysctl.conf') ? readFileSync('/etc/sysctl.conf', 'utf-8') : '';
        if (!/^\s*vm\.swappiness\s*=/m.test(sysctlConf)) {
          appendFileSync('/etc/sysctl.conf', '\nvm.swappiness=10\n');
        }

        swapSpinner.succeed(`Swap file configured (${SWAP_SIZE})`);
      } catch (err) {
        swapSpinner.fail('Failed to setup swap file');
        logger.dim(err.message);
      }
    } else {
      logger.success(`RAM: ${memMb}MB — swap not needed`);
    }
  } catch {
    logger.warn('Could not check memory — skipping swap setup');
  }
}

/**
 * Install Node.js via NodeSource — let user choose version
 */
async function installNodejs() {
  if (shell.isInstalled('node')) {
    const currentVersion = shell.getVersion('node');
    const currentMajor = parseInt(currentVersion, 10);
    const outdated = Number.isFinite(currentMajor) && currentMajor < MIN_NODE_MAJOR;

    if (outdated) {
      logger.warn(`Node.js v${currentVersion} is end-of-life and no longer receives security updates`);
    } else {
      logger.success(`Node.js v${currentVersion} already installed`);
    }

    const reinstall = await confirm({
      message: outdated
        ? `Upgrade Node.js v${currentVersion} to a supported LTS version? (recommended)`
        : `Node.js v${currentVersion} is already installed. Install a different version?`,
      default: outdated,
    });

    if (!reinstall) return;
  }

  const nodeVersion = await select({
    message: 'Select Node.js version to install:',
    choices: NODE_VERSIONS,
    default: DEFAULT_NODE_VERSION,
  });

  const nodeSpinner = logger.spinner(`Installing Node.js ${nodeVersion} LTS...`);
  try {
    // Install via NodeSource
    shell.exec(`curl -fsSL https://deb.nodesource.com/setup_${nodeVersion}.x | bash -`, { env: APT_ENV });
    shell.exec('apt-get install -y nodejs', { env: APT_ENV });

    const installedVersion = shell.getVersion('node');
    nodeSpinner.succeed(`Node.js v${installedVersion} installed`);
  } catch (err) {
    nodeSpinner.fail('Failed to install Node.js');
    logger.dim(err.message);
    throw new Error('Node.js installation failed — cannot continue', { cause: err });
  }
}

/**
 * Install a package if not already present
 * @param {string} binary - Binary name to check
 * @param {string} displayName - Display name for logs
 * @param {string} installCmd - Command to install
 */
async function installPackage(binary, displayName, installCmd) {
  if (shell.isInstalled(binary)) {
    const version = shell.getVersion(binary);
    logger.success(`${displayName} ${version ? `v${version}` : ''} already installed`);
    return;
  }

  const pkgSpinner = logger.spinner(`Installing ${displayName}...`);
  try {
    shell.exec(installCmd, { env: APT_ENV });
    const version = shell.getVersion(binary);
    pkgSpinner.succeed(`${displayName} ${version ? `v${version}` : ''} installed`);
  } catch (err) {
    pkgSpinner.fail(`Failed to install ${displayName}`);
    logger.dim(err.message);
  }
}

/**
 * Configure UFW firewall
 */
async function configureFirewall() {
  const fwSpinner = logger.spinner('Configuring firewall...');
  try {
    // Install UFW if not present
    if (!shell.isInstalled('ufw')) {
      shell.exec('apt-get install -y ufw', { env: APT_ENV });
    }

    // Always allow SSH first — on its real port — so we never lock the user out
    const sshPort = detectSshPort();
    const ports = [`${sshPort}/tcp`, ...FIREWALL_PORTS.filter((p) => p !== `${sshPort}/tcp`)];

    for (const port of ports) {
      const { success, error } = shell.execSafe(`ufw allow ${port}`);
      if (!success) throw new Error(`ufw allow ${port} failed: ${error}`);
    }

    // Enable UFW (non-interactive)
    shell.exec('ufw --force enable');

    fwSpinner.succeed(`Firewall configured (ports: ${ports.map((p) => p.split('/')[0]).join(', ')})`);
    if (sshPort !== DEFAULT_SSH_PORT) {
      logger.info(`Detected SSH on custom port ${sshPort} — allowed through the firewall`);
    }
  } catch (err) {
    fwSpinner.fail('Failed to configure firewall');
    logger.dim(err.message);
  }
}

/**
 * Display a version summary table of all installed software
 */
function displayVersionSummary() {
  logger.newline();
  const rows = [];

  const software = [
    { name: 'Node.js', binary: 'node' },
    { name: 'npm', binary: 'npm' },
    { name: 'Nginx', binary: 'nginx', flag: '-v' },
    { name: 'PM2', binary: 'pm2' },
    { name: 'Certbot', binary: 'certbot' },
    { name: 'Git', binary: 'git' },
    { name: 'UFW', binary: 'ufw' },
  ];

  for (const sw of software) {
    const version = shell.getVersion(sw.binary, sw.flag || '--version');
    const status = version ? `v${version}` : (shell.isInstalled(sw.binary) ? '✔ installed' : '✖ missing');
    rows.push([sw.name, status]);
  }

  logger.table(['Software', 'Version'], rows);
}

export default { setupSystem };
