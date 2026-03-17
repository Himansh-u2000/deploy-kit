/**
 * DeployKit — Logs Command
 * Stream PM2 logs for an app.
 */

import { readdirSync, existsSync } from 'fs';
import inquirer from 'inquirer';
import logger from '../utils/logger.js';
import shell from '../utils/shell.js';
import { DEPLOY_DIR } from '../utils/constants.js';

/**
 * View PM2 logs for a specific app or all apps.
 * @param {string} [appName] - Optional app name from CLI argument
 */
export async function logsCommand(appName) {
  if (!shell.isInstalled('pm2')) {
    logger.error('PM2 is not installed. Run: npm install -g pm2');
    process.exit(1);
  }

  if (!appName) {
    // List PM2 processes and let user pick
    try {
      const processes = JSON.parse(shell.exec('pm2 jlist'));
      if (processes.length === 0) {
        logger.info('No PM2 processes running');
        return;
      }

      const choices = [
        { name: '📋  All apps', value: '__all__' },
        ...processes.map((p) => ({
          name: `${p.pm2_env?.status === 'online' ? '🟢' : '🔴'}  ${p.name}`,
          value: p.name,
        })),
      ];

      const { selected } = await inquirer.prompt([
        {
          type: 'list',
          name: 'selected',
          message: 'Which app logs do you want to view?',
          choices,
        },
      ]);

      appName = selected === '__all__' ? undefined : selected;
    } catch {
      logger.warn('Could not list PM2 processes — showing all logs');
    }
  }

  logger.info(`Streaming logs${appName ? ` for ${appName}` : ' (all apps)'}... Press Ctrl+C to stop`);
  logger.newline();

  try {
    const args = ['logs', '--lines', '50'];
    if (appName) args.splice(1, 0, appName);
    await shell.execLive('pm2', args);
  } catch {
    // Ctrl+C — normal exit
  }
}

export default logsCommand;
