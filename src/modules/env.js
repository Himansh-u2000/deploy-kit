/**
 * DeployKit — Environment Variable Module
 * Manages .env file creation and editing via system editor.
 */

import { existsSync, copyFileSync } from 'fs';
import inquirer from 'inquirer';
import logger from '../utils/logger.js';
import shell from '../utils/shell.js';

/**
 * Setup environment variables for a project.
 * Copies .env.example if available, then opens editor for user to configure.
 * @param {string} projectPath - Absolute path to the project directory
 */
export async function setupEnv(projectPath) {
  logger.step(4, 7, '🔐', 'Environment Variables');

  const envPath = `${projectPath}/.env`;
  const envExamplePath = `${projectPath}/.env.example`;
  const envSamplePath = `${projectPath}/.env.sample`;

  // ── Copy from template if available ────────────────────────────
  if (!existsSync(envPath)) {
    if (existsSync(envExamplePath)) {
      copyFileSync(envExamplePath, envPath);
      logger.success('Created .env from .env.example template');
    } else if (existsSync(envSamplePath)) {
      copyFileSync(envSamplePath, envPath);
      logger.success('Created .env from .env.sample template');
    } else {
      // Create empty .env
      shell.execSafe(`touch ${envPath}`);
      logger.info('No .env template found — created empty .env file');
    }
  } else {
    logger.success('.env file already exists');
  }

  // ── Ask if user wants to edit ──────────────────────────────────
  const { wantEdit } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'wantEdit',
      message: 'Would you like to edit the .env file now?',
      default: true,
    },
  ]);

  if (wantEdit) {
    // Detect available editor
    const editor = detectEditor();
    logger.info(`Opening ${editor} to edit .env — save and close when done`);

    try {
      await shell.execLive(editor, [envPath]);
      logger.success('Environment file saved');
    } catch (err) {
      logger.warn(`Editor closed with an error: ${err.message}`);
      logger.info('You can edit .env later with: nano ' + envPath);
    }
  } else {
    logger.info(`You can edit .env later with: nano ${envPath}`);
  }
}

/**
 * Detect the best available text editor
 * @returns {string} Editor command
 */
function detectEditor() {
  // Check EDITOR env var first
  if (process.env.EDITOR) {
    return process.env.EDITOR;
  }

  // Prefer nano for simplicity
  if (shell.isInstalled('nano')) return 'nano';
  if (shell.isInstalled('vim')) return 'vim';
  if (shell.isInstalled('vi')) return 'vi';

  return 'nano'; // Fallback
}

export default { setupEnv };
