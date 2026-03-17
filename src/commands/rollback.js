/**
 * DeployKit — Rollback Command
 * Roll back to a previous deployment snapshot.
 */

import { existsSync, readdirSync } from 'fs';
import inquirer from 'inquirer';
import logger from '../utils/logger.js';
import shell from '../utils/shell.js';
import { BACKUP_DIR, DEPLOY_DIR } from '../utils/constants.js';

/**
 * Rollback to a previous backup.
 * @param {string} [appName] - Optional app name from CLI
 */
export async function rollbackCommand(appName) {
  logger.banner();

  if (!shell.isRoot()) {
    logger.error('Run with: sudo deploykit rollback [app]');
    process.exit(1);
  }

  // ── Check for backups ──────────────────────────────────────────
  if (!existsSync(BACKUP_DIR)) {
    logger.error('No backups found. Backups are created automatically during deploys.');
    return;
  }

  const backups = readdirSync(BACKUP_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort()
    .reverse();

  if (backups.length === 0) {
    logger.error('No backups found.');
    return;
  }

  // ── Filter by app name if provided ─────────────────────────────
  let filteredBackups = backups;
  if (appName) {
    filteredBackups = backups.filter((b) => b.startsWith(appName));
    if (filteredBackups.length === 0) {
      logger.error(`No backups found for "${appName}"`);
      logger.info('Available backups: ' + backups.join(', '));
      return;
    }
  }

  // ── Select backup to restore ───────────────────────────────────
  const { backup } = await inquirer.prompt([
    {
      type: 'list',
      name: 'backup',
      message: 'Select backup to restore:',
      choices: filteredBackups.map((b) => {
        const parts = b.match(/^(.+)-(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2})$/);
        const name = parts ? parts[1] : b;
        const date = parts ? parts[2].replace(/-/g, ':').replace('T', ' ') : '';
        return {
          name: `${name} ${date ? `(${date})` : ''}`,
          value: b,
        };
      }),
    },
  ]);

  // ── Extract project name ───────────────────────────────────────
  const projectName = backup.replace(/-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}$/, '');
  const projectPath = `${DEPLOY_DIR}/${projectName}`;
  const backupPath = `${BACKUP_DIR}/${backup}`;

  // ── Confirm rollback ───────────────────────────────────────────
  const { confirmed } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirmed',
      message: `Rollback "${projectName}" to backup "${backup}"? This will replace the current deployment.`,
      default: false,
    },
  ]);

  if (!confirmed) {
    logger.info('Rollback cancelled');
    return;
  }

  // ── Perform rollback ───────────────────────────────────────────
  const rollbackSpinner = logger.spinner('Rolling back...');
  try {
    // Remove current deployment
    if (existsSync(projectPath)) {
      shell.exec(`rm -rf ${projectPath}`);
    }

    // Copy backup to deployment directory
    shell.exec(`cp -r ${backupPath} ${projectPath}`);
    rollbackSpinner.succeed(`Rolled back to ${backup}`);

    // Restart PM2 if applicable
    const { success } = shell.execSafe(`pm2 describe "${projectName}"`);
    if (success) {
      shell.exec(`pm2 restart "${projectName}"`);
      logger.success(`PM2 process "${projectName}" restarted`);
    }

    // Reload Nginx
    shell.execSafe('systemctl reload nginx');
    logger.success('Nginx reloaded');

    logger.box('✅ Rollback Complete!', `"${projectName}" has been restored from:\n${backupPath}`, 'success');
  } catch (err) {
    rollbackSpinner.fail('Rollback failed');
    logger.dim(err.message);
    logger.error('Manual intervention may be required');
  }
}

export default rollbackCommand;
