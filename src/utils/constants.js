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
export const DEPLOYKIT_CONFIG_DIR = '/etc/deploykit';
export const DEPLOYKIT_CONFIG_FILE = '/etc/deploykit/config.json';

// ── Default Values ───────────────────────────────────────────────
export const DEFAULT_BRANCH = 'main';
export const DEFAULT_PORT = 3000;
export const DEFAULT_NODE_VERSION = '20';

// ── Supported Node.js Versions ───────────────────────────────────
export const NODE_VERSIONS = [
  { name: 'Node.js 18 LTS (Hydrogen)', value: '18' },
  { name: 'Node.js 20 LTS (Iron)', value: '20' },
  { name: 'Node.js 22 LTS (Jod)', value: '22' },
];

// ── Project Types ────────────────────────────────────────────────
export const PROJECT_TYPES = {
  EXPRESS: 'express',
  REACT: 'react',
  NEXTJS: 'nextjs',
  STATIC: 'static',
  UNKNOWN: 'unknown',
};

// ── Swap Configuration ───────────────────────────────────────────
export const SWAP_SIZE = '1G';
export const SWAP_FILE = '/swapfile';

// ── Firewall Ports ───────────────────────────────────────────────
export const FIREWALL_PORTS = ['22/tcp', '80/tcp', '443/tcp'];

// ── PM2 Defaults ─────────────────────────────────────────────────
export const PM2_MAX_MEMORY = '300M'; // Safe for 512MB RAM
