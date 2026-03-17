/**
 * DeployKit — Git Operations Module
 * Handles repository cloning, branch selection, and dependency installation.
 */

import { existsSync } from 'fs';
import inquirer from 'inquirer';
import logger from '../utils/logger.js';
import shell from '../utils/shell.js';
import validator from '../utils/validator.js';
import { DEPLOY_DIR, DEFAULT_BRANCH, BACKUP_DIR } from '../utils/constants.js';

/**
 * Clone a project from GitHub/GitLab and install dependencies.
 * Returns project info for downstream modules.
 * @returns {Promise<{ repoUrl: string, branch: string, projectName: string, projectPath: string }>}
 */
export async function cloneProject() {
  logger.step(2, 7, '📦', 'Project Setup');

  // ── Prompt for repo URL ────────────────────────────────────────
  const { repoUrl } = await inquirer.prompt([
    {
      type: 'input',
      name: 'repoUrl',
      message: 'Paste your GitHub repo URL:',
      validate: validator.isValidGitUrl,
    },
  ]);

  // ── Prompt for branch ──────────────────────────────────────────
  const { branch } = await inquirer.prompt([
    {
      type: 'input',
      name: 'branch',
      message: 'Branch to deploy:',
      default: DEFAULT_BRANCH,
    },
  ]);

  // ── Extract project name from URL ──────────────────────────────
  const autoName = extractProjectName(repoUrl);
  const { projectName } = await inquirer.prompt([
    {
      type: 'input',
      name: 'projectName',
      message: 'Project directory name:',
      default: autoName,
      validate: validator.isValidAppName,
    },
  ]);

  const projectPath = `${DEPLOY_DIR}/${projectName}`;

  // ── Check if directory already exists ──────────────────────────
  if (existsSync(projectPath)) {
    const { action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: `Directory ${projectPath} already exists. What do you want to do?`,
        choices: [
          { name: 'Backup existing & clone fresh', value: 'backup' },
          { name: 'Pull latest changes (git pull)', value: 'pull' },
          { name: 'Delete & clone fresh', value: 'delete' },
          { name: 'Cancel', value: 'cancel' },
        ],
      },
    ]);

    if (action === 'cancel') {
      throw new Error('Deployment cancelled by user');
    }

    if (action === 'backup') {
      await backupProject(projectName, projectPath);
      shell.exec(`rm -rf ${projectPath}`);
    } else if (action === 'pull') {
      return await pullLatest(projectPath, projectName, repoUrl, branch);
    } else if (action === 'delete') {
      shell.exec(`rm -rf ${projectPath}`);
      logger.success('Existing directory removed');
    }
  }

  // ── Create deploy directory ────────────────────────────────────
  shell.execSafe(`mkdir -p ${DEPLOY_DIR}`);

  // ── Clone repository ───────────────────────────────────────────
  const cloneSpinner = logger.spinner('Cloning repository...');
  try {
    shell.exec(`git clone --branch ${branch} --single-branch ${repoUrl} ${projectPath}`);
    cloneSpinner.succeed(`Cloned to ${projectPath}`);
  } catch (err) {
    cloneSpinner.fail('Failed to clone repository');
    logger.dim(err.message);
    throw err;
  }

  // ── Install dependencies ───────────────────────────────────────
  await installDependencies(projectPath);

  return { repoUrl, branch, projectName, projectPath };
}

/**
 * Pull latest changes instead of cloning
 */
async function pullLatest(projectPath, projectName, repoUrl, branch) {
  const pullSpinner = logger.spinner('Pulling latest changes...');
  try {
    shell.exec(`cd ${projectPath} && git pull origin ${branch}`);
    pullSpinner.succeed('Latest changes pulled');
  } catch (err) {
    pullSpinner.fail('Failed to pull latest changes');
    logger.dim(err.message);
    throw err;
  }

  await installDependencies(projectPath);
  return { repoUrl, branch, projectName, projectPath };
}

/**
 * Install npm dependencies
 */
async function installDependencies(projectPath) {
  // Check if package.json exists
  if (!existsSync(`${projectPath}/package.json`)) {
    logger.info('No package.json found — skipping npm install');
    return;
  }

  const depSpinner = logger.spinner('Installing dependencies...');
  try {
    // Use npm ci if lockfile exists for faster, deterministic installs
    const hasLockfile = existsSync(`${projectPath}/package-lock.json`);
    const cmd = hasLockfile ? 'npm ci --production' : 'npm install --production';
    shell.exec(`cd ${projectPath} && ${cmd}`);
    depSpinner.succeed(`Dependencies installed (${hasLockfile ? 'npm ci' : 'npm install'})`);
  } catch (err) {
    depSpinner.fail('Failed to install dependencies');
    logger.dim(err.message);
    logger.warn('You may need to install dependencies manually');
  }
}

/**
 * Backup an existing project before redeploying
 */
export async function backupProject(projectName, projectPath) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const backupPath = `${BACKUP_DIR}/${projectName}-${timestamp}`;

  shell.execSafe(`mkdir -p ${BACKUP_DIR}`);

  const backupSpinner = logger.spinner(`Backing up to ${backupPath}...`);
  try {
    shell.exec(`cp -r ${projectPath} ${backupPath}`);
    backupSpinner.succeed(`Backup saved to ${backupPath}`);
  } catch (err) {
    backupSpinner.fail('Failed to create backup');
    logger.dim(err.message);
  }
}

/**
 * Extract project name from Git URL
 * @param {string} url - Git repository URL
 * @returns {string} Project name
 */
function extractProjectName(url) {
  const match = url.match(/\/([^/]+?)(\.git)?$/);
  return match ? match[1] : 'my-app';
}

export default { cloneProject, backupProject };
