/**
 * DeployKit — Environment Variable Module
 * Manages .env file creation and editing via system editor.
 * Supports monorepo/fullstack projects with client/ and server/ subdirectories.
 */

import { existsSync, copyFileSync, readdirSync } from 'fs';
import inquirer from 'inquirer';
import logger from '../utils/logger.js';
import shell from '../utils/shell.js';

/**
 * Common subdirectory names for fullstack projects
 */
const SUBDIR_NAMES = ['server', 'client', 'backend', 'frontend', 'api', 'web', 'app'];

/**
 * Setup environment variables for a project.
 * Detects .env.example in root and subdirectories (client/, server/, etc.)
 * @param {string} projectPath - Absolute path to the project directory
 */
export async function setupEnv(projectPath) {
  logger.step(4, 7, '🔐', 'Environment Variables');

  // ── Find all .env.example files (root + subdirs) ───────────────
  const envLocations = findEnvFiles(projectPath);

  if (envLocations.length === 0) {
    // No .env.example found anywhere
    logger.info('No .env.example or .env.sample found in project');

    const { createEnv } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'createEnv',
        message: 'Create an empty .env file in the project root?',
        default: true,
      },
    ]);

    if (createEnv) {
      const envPath = `${projectPath}/.env`;
      shell.execSafe(`touch ${envPath}`);
      await editEnvFile(envPath, 'root');
    }
    return;
  }

  // ── Process each .env location ─────────────────────────────────
  if (envLocations.length === 1) {
    // Single .env.example — straightforward
    const loc = envLocations[0];
    logger.success(`Found ${loc.templateName} in ${loc.label}`);
    await processEnvFile(loc);
  } else {
    // Multiple .env files (fullstack project)
    logger.success(`Found ${envLocations.length} environment configs:`);
    envLocations.forEach((loc) => {
      logger.dim(`  • ${loc.label}/${loc.templateName}`);
    });
    logger.newline();

    for (const loc of envLocations) {
      logger.info(`── ${loc.label} ──`);
      await processEnvFile(loc);
      logger.newline();
    }
  }
}

/**
 * Find all .env.example / .env.sample files in root and common subdirectories
 * @param {string} projectPath
 * @returns {Array<{ dir: string, label: string, templateName: string, templatePath: string, envPath: string }>}
 */
function findEnvFiles(projectPath) {
  const locations = [];
  const templateNames = ['.env.example', '.env.sample'];

  // Check root directory
  for (const name of templateNames) {
    const templatePath = `${projectPath}/${name}`;
    if (existsSync(templatePath)) {
      locations.push({
        dir: projectPath,
        label: 'root',
        templateName: name,
        templatePath,
        envPath: `${projectPath}/.env`,
      });
      break; // Only take one template from root
    }
  }

  // Check common subdirectories
  for (const subdir of SUBDIR_NAMES) {
    const subdirPath = `${projectPath}/${subdir}`;
    if (!existsSync(subdirPath)) continue;

    for (const name of templateNames) {
      const templatePath = `${subdirPath}/${name}`;
      if (existsSync(templatePath)) {
        locations.push({
          dir: subdirPath,
          label: subdir,
          templateName: name,
          templatePath,
          envPath: `${subdirPath}/.env`,
        });
        break; // Only take one template per subdir
      }
    }
  }

  return locations;
}

/**
 * Process a single .env location — copy template and open editor
 * @param {object} loc - Location info from findEnvFiles
 */
async function processEnvFile(loc) {
  // Copy template if .env doesn't already exist
  if (!existsSync(loc.envPath)) {
    copyFileSync(loc.templatePath, loc.envPath);
    logger.success(`Created .env from ${loc.templateName} in ${loc.label}/`);
  } else {
    logger.success(`.env already exists in ${loc.label}/`);
  }

  await editEnvFile(loc.envPath, loc.label);
}

/**
 * Ask user if they want to edit an .env file, then open editor
 * @param {string} envPath - Path to .env file
 * @param {string} label - Display label (e.g., 'root', 'server', 'client')
 */
async function editEnvFile(envPath, label) {
  const { wantEdit } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'wantEdit',
      message: `Edit .env for ${label}?`,
      default: true,
    },
  ]);

  if (wantEdit) {
    const editor = detectEditor();
    logger.info(`Opening ${editor} — save and close when done`);

    try {
      await shell.execLive(editor, [envPath]);
      logger.success(`${label}/.env saved`);
    } catch (err) {
      logger.warn(`Editor closed with an error: ${err.message}`);
      logger.info(`Edit later with: nano ${envPath}`);
    }
  } else {
    logger.info(`Edit later with: nano ${envPath}`);
  }
}

/**
 * Detect the best available text editor
 * @returns {string} Editor command
 */
function detectEditor() {
  if (process.env.EDITOR) return process.env.EDITOR;
  if (shell.isInstalled('nano')) return 'nano';
  if (shell.isInstalled('vim')) return 'vim';
  if (shell.isInstalled('vi')) return 'vi';
  return 'nano';
}

export default { setupEnv };
