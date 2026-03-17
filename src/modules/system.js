/**
 * DeployKit — System Setup Module
 * Handles system updates, swap configuration, and software installation.
 */

import inquirer from 'inquirer';
import logger from '../utils/logger.js';
import shell from '../utils/shell.js';
import {
  NODE_VERSIONS,
  DEFAULT_NODE_VERSION,
  SWAP_SIZE,
  SWAP_FILE,
  FIREWALL_PORTS,
  DEPLOYKIT_CONFIG_DIR,
} from '../utils/constants.js';

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
    shell.exec('apt-get update -y', { silent: true });
    shell.exec('DEBIAN_FRONTEND=noninteractive apt-get upgrade -y', { silent: true });
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
 * Get OS info (name and version)
 */
function getOsInfo() {
  try {
    const name = shell.exec('lsb_release -is');
    const version = shell.exec('lsb_release -rs');
    return { name, version };
  } catch {
    return null;
  }
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
        shell.exec(`fallocate -l ${SWAP_SIZE} ${SWAP_FILE}`);
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
        shell.exec("echo 'vm.swappiness=10' >> /etc/sysctl.conf");

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
    logger.success(`Node.js v${currentVersion} already installed`);

    const { reinstall } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'reinstall',
        message: `Node.js v${currentVersion} is already installed. Install a different version?`,
        default: false,
      },
    ]);

    if (!reinstall) return;
  }

  const { nodeVersion } = await inquirer.prompt([
    {
      type: 'list',
      name: 'nodeVersion',
      message: 'Select Node.js version to install:',
      choices: NODE_VERSIONS,
      default: DEFAULT_NODE_VERSION,
    },
  ]);

  const nodeSpinner = logger.spinner(`Installing Node.js ${nodeVersion} LTS...`);
  try {
    // Install via NodeSource
    shell.exec(`curl -fsSL https://deb.nodesource.com/setup_${nodeVersion}.x | bash -`);
    shell.exec('apt-get install -y nodejs');

    const installedVersion = shell.getVersion('node');
    nodeSpinner.succeed(`Node.js v${installedVersion} installed`);
  } catch (err) {
    nodeSpinner.fail('Failed to install Node.js');
    logger.dim(err.message);
    throw new Error('Node.js installation failed — cannot continue');
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
    shell.exec(installCmd, { silent: true });
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
      shell.exec('apt-get install -y ufw');
    }

    // Allow required ports
    for (const port of FIREWALL_PORTS) {
      shell.execSafe(`ufw allow ${port}`);
    }

    // Enable UFW (non-interactive)
    shell.execSafe('echo "y" | ufw enable');

    fwSpinner.succeed(`Firewall configured (ports: ${FIREWALL_PORTS.map((p) => p.split('/')[0]).join(', ')})`);
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
