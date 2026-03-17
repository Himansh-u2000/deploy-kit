/**
 * DeployKit — Nginx Command
 * Manage Nginx configurations interactively.
 */

import { existsSync, readdirSync, readFileSync } from 'fs';
import inquirer from 'inquirer';
import logger from '../utils/logger.js';
import shell from '../utils/shell.js';
import { NGINX_SITES_AVAILABLE, NGINX_SITES_ENABLED } from '../utils/constants.js';

/**
 * Interactive Nginx management.
 */
export async function nginxCommand() {
  if (!shell.isInstalled('nginx')) {
    logger.error('Nginx is not installed. Run: apt install nginx');
    process.exit(1);
  }

  const { action } = await inquirer.prompt([
    {
      type: 'list',
      name: 'action',
      message: 'Nginx Management:',
      choices: [
        { name: '📋  List all configs', value: 'list' },
        { name: '👁  View a config', value: 'view' },
        { name: '📝  Edit a config', value: 'edit' },
        { name: '🔄  Reload Nginx', value: 'reload' },
        { name: '🧪  Test configuration', value: 'test' },
        { name: '🔴  Disable a site', value: 'disable' },
        { name: '🟢  Enable a site', value: 'enable' },
      ],
    },
  ]);

  switch (action) {
    case 'list':
      await listConfigs();
      break;
    case 'view':
      await viewConfig();
      break;
    case 'edit':
      await editConfig();
      break;
    case 'reload':
      await reloadNginx();
      break;
    case 'test':
      testConfig();
      break;
    case 'disable':
      await disableSite();
      break;
    case 'enable':
      await enableSite();
      break;
  }
}

async function listConfigs() {
  try {
    const available = readdirSync(NGINX_SITES_AVAILABLE);
    const enabled = readdirSync(NGINX_SITES_ENABLED);

    const rows = available.map((site) => [
      site,
      enabled.includes(site) ? logger.colors.success('✓ enabled') : logger.colors.dim('disabled'),
    ]);

    logger.table(['Site', 'Status'], rows);
  } catch {
    logger.error('Could not list configurations');
  }
}

async function viewConfig() {
  const sites = getSites();
  if (sites.length === 0) return;

  const { site } = await inquirer.prompt([
    { type: 'list', name: 'site', message: 'Select config to view:', choices: sites },
  ]);

  try {
    const content = readFileSync(`${NGINX_SITES_AVAILABLE}/${site}`, 'utf-8');
    console.log('\n' + content);
  } catch {
    logger.error('Could not read config file');
  }
}

async function editConfig() {
  const sites = getSites();
  if (sites.length === 0) return;

  const { site } = await inquirer.prompt([
    { type: 'list', name: 'site', message: 'Select config to edit:', choices: sites },
  ]);

  const editor = shell.isInstalled('nano') ? 'nano' : 'vim';
  logger.info(`Opening ${editor}... Save and close when done.`);

  try {
    await shell.execLive(editor, [`${NGINX_SITES_AVAILABLE}/${site}`]);
    logger.success('Config saved');

    // Test and reload
    const { success } = shell.execSafe('nginx -t 2>&1');
    if (success) {
      shell.exec('systemctl reload nginx');
      logger.success('Nginx reloaded');
    } else {
      logger.error('Config test failed — Nginx NOT reloaded');
    }
  } catch {
    logger.warn('Editor closed');
  }
}

async function reloadNginx() {
  const { success } = shell.execSafe('nginx -t 2>&1');
  if (success) {
    shell.exec('systemctl reload nginx');
    logger.success('Nginx reloaded successfully');
  } else {
    logger.error('Config test failed — cannot reload');
  }
}

function testConfig() {
  const result = shell.execSafe('nginx -t 2>&1');
  if (result.success) {
    logger.success('Nginx configuration test: ✓ OK');
  } else {
    logger.error('Nginx configuration test: ✖ FAILED');
    logger.dim(result.error || result.output);
  }
}

async function disableSite() {
  const enabled = getEnabledSites();
  if (enabled.length === 0) {
    logger.info('No sites to disable');
    return;
  }

  const { site } = await inquirer.prompt([
    { type: 'list', name: 'site', message: 'Select site to disable:', choices: enabled },
  ]);

  shell.execSafe(`rm -f ${NGINX_SITES_ENABLED}/${site}`);
  shell.exec('systemctl reload nginx');
  logger.success(`${site} disabled and Nginx reloaded`);
}

async function enableSite() {
  const available = getSites();
  const enabled = getEnabledSites();
  const disabled = available.filter((s) => !enabled.includes(s));

  if (disabled.length === 0) {
    logger.info('All sites are already enabled');
    return;
  }

  const { site } = await inquirer.prompt([
    { type: 'list', name: 'site', message: 'Select site to enable:', choices: disabled },
  ]);

  shell.execSafe(`ln -s ${NGINX_SITES_AVAILABLE}/${site} ${NGINX_SITES_ENABLED}/${site}`);
  shell.exec('systemctl reload nginx');
  logger.success(`${site} enabled and Nginx reloaded`);
}

function getSites() {
  try {
    return readdirSync(NGINX_SITES_AVAILABLE);
  } catch {
    logger.error('Could not list sites');
    return [];
  }
}

function getEnabledSites() {
  try {
    return readdirSync(NGINX_SITES_ENABLED);
  } catch {
    return [];
  }
}

export default nginxCommand;
