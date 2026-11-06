/**
 * DeployKit — Rollback Command
 * Roll back to a previous deployment snapshot.
 */

import { existsSync, renameSync, rmSync } from 'fs';
import { confirm, select } from '@inquirer/prompts';
import logger from '../utils/logger.js';
import shell, { quote } from '../utils/shell.js';
import { listBackups, parseBackupName } from '../modules/git.js';
import { restartPm2App } from '../modules/pm2.js';
import { setWebPermissions } from '../modules/deployment.js';
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
  const backups = listBackups();
  if (backups.length === 0) {
    logger.error('No backups found. Backups are created automatically during deploys.');
    return;
  }

  // ── Filter by app name if provided (exact project match) ───────
  let filteredBackups = backups;
  if (appName) {
    filteredBackups = listBackups(appName);
    if (filteredBackups.length === 0) {
      const projects = [...new Set(backups.map((b) => parseBackupName(b).projectName))];
      logger.error(`No backups found for "${appName}"`);
      logger.info('Projects with backups: ' + projects.join(', '));
      return;
    }
  }

  // ── Select backup to restore ───────────────────────────────────
  const backup = await select({
    message: 'Select backup to restore:',
    choices: filteredBackups.map((b) => {
      const { projectName, timestamp } = parseBackupName(b);
      const [date, time] = timestamp.split('T');
      return { name: `${projectName} (${date} ${time.replace(/-/g, ':')} UTC)`, value: b };
    }),
  });

  // ── Extract project name ───────────────────────────────────────
  const { projectName } = parseBackupName(backup);
  const projectPath = `${DEPLOY_DIR}/${projectName}`;
  const backupPath = `${BACKUP_DIR}/${backup}`;

  // ── Confirm rollback ───────────────────────────────────────────
  const confirmed = await confirm({
    message: `Rollback "${projectName}" to backup "${backup}"? This will replace the current deployment.`,
    default: false,
  });

  if (!confirmed) {
    logger.info('Rollback cancelled');
    return;
  }

  // ── Perform rollback ───────────────────────────────────────────
  // Copy the backup next to the live dir first, then swap, so a failed copy
  // never leaves the project missing.
  const stagingPath = `${projectPath}.rollback-${process.pid}`;
  const previousPath = `${projectPath}.previous-${process.pid}`;
  const rollbackSpinner = logger.spinner('Rolling back...');
  try {
    shell.exec(`cp -a ${quote(backupPath)} ${quote(stagingPath)}`);

    if (existsSync(projectPath)) renameSync(projectPath, previousPath);
    renameSync(stagingPath, projectPath);
    rmSync(previousPath, { recursive: true, force: true });

    setWebPermissions(projectPath);
    rollbackSpinner.succeed(`Rolled back to ${backup}`);

    // Restart PM2 if applicable
    if (restartPm2App(projectName)) {
      logger.success(`PM2 process "${projectName}" restarted`);
    }

    // Reload Nginx
    if (shell.execSafe('nginx -t').success) {
      shell.execSafe('systemctl reload nginx');
      logger.success('Nginx reloaded');
    }

    logger.box('✅ Rollback Complete!', `"${projectName}" has been restored from:\n${backupPath}`, 'success');
  } catch (err) {
    rollbackSpinner.fail('Rollback failed');
    logger.dim(err.message);
    // Put the original deployment back if we already moved it aside
    if (!existsSync(projectPath) && existsSync(previousPath)) {
      renameSync(previousPath, projectPath);
      logger.info('Original deployment restored');
    }
    rmSync(stagingPath, { recursive: true, force: true });
    logger.error('Manual intervention may be required');
  }
}

export default rollbackCommand;
