/**
 * DeployKit — Nginx Configuration Module
 * Generates and manages Nginx server blocks for deployed projects.
 */

import { readFileSync, writeFileSync, existsSync, unlinkSync, symlinkSync, lstatSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { confirm, input } from '@inquirer/prompts';
import logger from '../utils/logger.js';
import shell from '../utils/shell.js';
import validator from '../utils/validator.js';
import { NGINX_SITES_AVAILABLE, NGINX_SITES_ENABLED, PROJECT_TYPES } from '../utils/constants.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = join(__dirname, '..', 'templates');

const TEMPLATE_FOR_TYPE = {
  [PROJECT_TYPES.FULLSTACK]: 'nginx-fullstack.conf',
  [PROJECT_TYPES.STATIC]: 'nginx-static.conf',
  [PROJECT_TYPES.REACT]: 'nginx-static.conf',
  [PROJECT_TYPES.NEXTJS]: 'nginx-nextjs.conf',
  [PROJECT_TYPES.EXPRESS]: 'nginx-node.conf',
};

/**
 * Render an Nginx config template.
 * @param {string} templateName - File name in src/templates
 * @param {{ DOMAIN?: string, PORT?: number|string, ROOT_DIR?: string }} vars
 * @returns {string}
 */
export function renderTemplate(templateName, vars) {
  const template = readFileSync(join(TEMPLATES_DIR, templateName), 'utf-8');
  return template.replace(/\{\{([A-Z_]+)\}\}/g, (placeholder, key) => {
    if (vars[key] === undefined || vars[key] === null) {
      throw new Error(`Missing value for ${placeholder} in ${templateName}`);
    }
    return String(vars[key]);
  });
}

/**
 * Generate the Nginx config for a project type.
 * @param {object} opts
 * @param {string} opts.type - Project type
 * @param {string} opts.serverNames - Space separated server_name values
 * @param {number|null} opts.port - Upstream app port
 * @param {string} opts.rootDir - Absolute static root
 * @returns {string}
 */
export function generateConfig({ type, serverNames, port, rootDir }) {
  const templateName = TEMPLATE_FOR_TYPE[type] || TEMPLATE_FOR_TYPE[PROJECT_TYPES.EXPRESS];
  // A missing port for a proxy template throws instead of rendering 'proxy_pass http://127.0.0.1:;'
  return renderTemplate(templateName, { DOMAIN: serverNames, PORT: port, ROOT_DIR: rootDir });
}

/**
 * Configure Nginx for a deployed project.
 * @param {object} options
 * @param {string} options.projectName - App name
 * @param {string} options.projectPath - Absolute path to the project
 * @param {string} options.type - Project type
 * @param {number|null} options.port - App port (for reverse proxy)
 * @param {string|null} options.buildDir - Build output dir (for static/react)
 * @returns {Promise<{ domain: string, configPath: string, includeWww: boolean, hasDomain: boolean }>}
 */
export async function setupNginx({ projectName, projectPath, type, port, buildDir }) {
  logger.step(6, 7, '🌐', 'Nginx Configuration');

  // ── Prompt for domain ──────────────────────────────────────────
  const useDomain = await confirm({
    message: 'Do you have a domain name for this project?',
    default: true,
  });

  let domain;
  let serverNames;
  let includeWww = false;
  if (useDomain) {
    domain = (
      await input({
        message: 'Enter your domain name:',
        validate: validator.isValidDomain,
      })
    )
      .trim()
      .toLowerCase()
      .replace(/^www\./, '');

    // Check if user wants www subdomain configured in Nginx
    includeWww = await confirm({
      message: `Also configure www.${domain}?`,
      default: true,
    });
    serverNames = includeWww ? `${domain} www.${domain}` : domain;
  } else {
    // Use server IP
    const ip = shell.getPublicIp();
    if (ip) {
      domain = ip;
      serverNames = ip;
      logger.info(`Using server IP: ${ip}`);
    } else {
      domain = '_';
      serverNames = '_';
      logger.warn('Could not detect server IP — using catch-all');
    }
  }

  // ── Generate Nginx config ──────────────────────────────────────
  const rootDir = buildDir ? `${projectPath}/${buildDir}` : projectPath;
  const config = generateConfig({ type, serverNames, port, rootDir });

  if (type === PROJECT_TYPES.FULLSTACK) {
    logger.info(`Frontend: ${rootDir}`);
    logger.info(`API: /api → 127.0.0.1:${port}`);
  } else if (type === PROJECT_TYPES.STATIC || type === PROJECT_TYPES.REACT) {
    logger.info(`Serving static files from: ${rootDir}`);
  }

  // ── Write config file ─────────────────────────────────────────
  const configFileName = useDomain ? domain : projectName;
  const configPath = `${NGINX_SITES_AVAILABLE}/${configFileName}`;
  const backupConfig = existsSync(configPath) ? readFileSync(configPath, 'utf-8') : null;

  const writeSpinner = logger.spinner('Writing Nginx configuration...');
  try {
    writeFileSync(configPath, config, 'utf-8');
    writeSpinner.succeed(`Config written to ${configPath}`);
  } catch (err) {
    writeSpinner.fail('Failed to write Nginx config');
    logger.dim(err.message);
    throw err;
  }

  // ── Create symlink to sites-enabled ────────────────────────────
  const enabledPath = `${NGINX_SITES_ENABLED}/${configFileName}`;
  enableSiteLink(configPath, enabledPath);
  logger.success('Symlinked to sites-enabled');

  // ── Remove default config (optional) ───────────────────────────
  const defaultPath = `${NGINX_SITES_ENABLED}/default`;
  if (existsSync(defaultPath)) {
    const removeDefault = await confirm({
      message: 'Remove default Nginx config? (recommended)',
      default: true,
    });
    if (removeDefault) {
      safeUnlink(defaultPath);
      logger.success('Default config removed');
    }
  }

  const result = { domain, configPath, includeWww, hasDomain: useDomain };

  // ── Test and reload Nginx ──────────────────────────────────────
  const testSpinner = logger.spinner('Testing Nginx configuration...');
  const { success: testOk, error: testErr } = shell.execSafe('nginx -t');
  if (testOk) {
    testSpinner.succeed('Nginx config tested ✓');
  } else {
    testSpinner.fail('Nginx config test failed');
    logger.dim(testErr);
    // Roll back so a bad config doesn't break every other site on reload
    if (backupConfig !== null) {
      writeFileSync(configPath, backupConfig, 'utf-8');
      logger.warn('Restored the previous config for this site');
    } else {
      safeUnlink(enabledPath);
      logger.warn(`Disabled the new site — fix ${configPath} and run: deploykit nginx`);
    }
    return result;
  }

  const reloadSpinner = logger.spinner('Reloading Nginx...');
  try {
    // reload fails if nginx isn't running yet (fresh install) — start it instead
    const { success: active } = shell.execSafe('systemctl is-active --quiet nginx');
    shell.exec(active ? 'systemctl reload nginx' : 'systemctl start nginx');
    reloadSpinner.succeed('Nginx reloaded');
  } catch (err) {
    reloadSpinner.fail('Failed to reload Nginx');
    logger.dim(err.message);
  }

  // ── Ensure Nginx is enabled on boot ────────────────────────────
  shell.execSafe('systemctl enable nginx');

  logger.success(`Nginx configured: ${domain} → ${port ? `127.0.0.1:${port}` : 'static files'}`);

  return result;
}

/**
 * Point sites-enabled/<name> at sites-available/<name>, replacing any existing link.
 */
export function enableSiteLink(configPath, enabledPath) {
  safeUnlink(enabledPath);
  symlinkSync(configPath, enabledPath);
}

function safeUnlink(path) {
  try {
    lstatSync(path);
    unlinkSync(path);
  } catch {}
}

export default { setupNginx };
