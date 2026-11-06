/**
 * DeployKit — Constants & Defaults
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Read version from package.json
const pkg = JSON.parse(readFileSync(join(__dirname, '../../package.json'), 'utf-8'));

export const VERSION = pkg.version;
export const NAME = 'DeployKit';

// ── Directory Paths ──────────────────────────────────────────────
export const DEPLOY_DIR = '/var/www';
export const NGINX_SITES_AVAILABLE = '/etc/nginx/sites-available';
export const NGINX_SITES_ENABLED = '/etc/nginx/sites-enabled';
export const BACKUP_DIR = '/var/backups/deploykit';
export const BACKUP_KEEP = 5; // backups kept per project
export const DEPLOYKIT_CONFIG_DIR = '/etc/deploykit';
export const DEPLOYKIT_CONFIG_FILE = '/etc/deploykit/config.json';
export const DEPLOYMENTS_FILE = '/etc/deploykit/deployments.json';

// ── Default Values ───────────────────────────────────────────────
export const DEFAULT_BRANCH = 'main';
export const DEFAULT_PORT = 3000;
export const DEFAULT_NODE_VERSION = '24';

// ── Supported Node.js Versions ───────────────────────────────────
// Node 18 (Hydrogen) and 20 (Iron) are end-of-life and no longer receive
// security updates. See https://github.com/nodejs/release#release-schedule
export const NODE_VERSIONS = [
  { name: 'Node.js 22 LTS (Jod) — maintenance until Apr 2027', value: '22' },
  { name: 'Node.js 24 LTS (Krypton) — recommended, supported until Apr 2028', value: '24' },
  { name: 'Node.js 26 LTS (Lithium) — newest, supported until Apr 2029', value: '26' },
];

// Minimum Node.js major version DeployKit itself runs on
export const MIN_NODE_MAJOR = 22;

// ── Project Types ────────────────────────────────────────────────
export const PROJECT_TYPES = {
  EXPRESS: 'express',
  REACT: 'react',
  NEXTJS: 'nextjs',
  FULLSTACK: 'fullstack',
  STATIC: 'static',
  UNKNOWN: 'unknown',
};

// ── Swap Configuration ───────────────────────────────────────────
export const SWAP_SIZE = '1G';
export const SWAP_FILE = '/swapfile';

// ── Firewall Ports ───────────────────────────────────────────────
// The SSH port is detected at runtime (see system.js) so a server running
// sshd on a custom port is never locked out when UFW is enabled.
export const FIREWALL_PORTS = ['80/tcp', '443/tcp'];
export const DEFAULT_SSH_PORT = 22;

// ── PM2 Defaults ─────────────────────────────────────────────────
export const PM2_MAX_MEMORY = '300M'; // Safe for 512MB RAM
