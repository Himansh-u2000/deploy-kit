/**
 * DeployKit — Git Operations Module
 * Handles repository cloning, branch selection, and dependency installation.
 */

import { existsSync, readFileSync, readdirSync, rmSync } from 'fs';
import { input, select } from '@inquirer/prompts';
import logger from '../utils/logger.js';
import shell, { quote } from '../utils/shell.js';
import validator from '../utils/validator.js';
import { DEPLOY_DIR, DEFAULT_BRANCH, BACKUP_DIR, BACKUP_KEEP } from '../utils/constants.js';

// <project>-YYYY-MM-DDTHH-MM-SS
const BACKUP_SUFFIX = /-(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2})$/;

/**
 * Build a git command that trusts the given repo directory.
 * Avoids "dubious ownership" errors when root operates on www-data owned
 * checkouts, without permanently appending to the global git config on
 * every run (which `git config --global --add safe.directory` did).
 * @param {string} projectPath
 * @param {string} args - git sub-command and arguments (already quoted)
 */
export function gitCmd(projectPath, args) {
  return `git -c safe.directory=${quote(projectPath)} -C ${quote(projectPath)} ${args}`;
}

/**
 * Clone a project from GitHub/GitLab and install dependencies.
 * Returns project info for downstream modules.
 * @returns {Promise<{ repoUrl: string, branch: string, projectName: string, projectPath: string }>}
 */
export async function cloneProject() {
  logger.step(2, 7, '📦', 'Project Setup');

  // ── Prompt for repo URL ────────────────────────────────────────
  const repoUrl = (
    await input({
      message: 'Paste your GitHub repo URL:',
      validate: validator.isValidGitUrl,
    })
  ).trim();

  // ── Prompt for branch ──────────────────────────────────────────
  const branch = (
    await input({
      message: 'Branch to deploy:',
      default: DEFAULT_BRANCH,
      validate: validator.isValidBranch,
    })
  ).trim();

  // ── Extract project name from URL ──────────────────────────────
  const autoName = extractProjectName(repoUrl);
  const projectName = await input({
    message: 'Project directory name:',
    default: autoName,
    validate: validator.isValidAppName,
  });

  const projectPath = `${DEPLOY_DIR}/${projectName}`;

  // ── Check if directory already exists ──────────────────────────
  if (existsSync(projectPath)) {
    const action = await select({
      message: `Directory ${projectPath} already exists. What do you want to do?`,
      choices: [
        { name: 'Backup existing & clone fresh', value: 'backup' },
        { name: 'Pull latest changes (git pull)', value: 'pull' },
        { name: 'Delete & clone fresh', value: 'delete' },
        { name: 'Cancel', value: 'cancel' },
      ],
    });

    if (action === 'cancel') {
      throw new Error('Deployment cancelled by user');
    }

    if (action === 'backup') {
      const ok = await backupProject(projectName, projectPath);
      if (!ok) throw new Error('Backup failed — refusing to delete the existing directory');
      shell.exec(`rm -rf ${quote(projectPath)}`);
    } else if (action === 'pull') {
      return await pullLatest(projectPath, projectName, repoUrl, branch);
    } else if (action === 'delete') {
      shell.exec(`rm -rf ${quote(projectPath)}`);
      logger.success('Existing directory removed');
    }
  }

  // ── Create deploy directory ────────────────────────────────────
  shell.execSafe(`mkdir -p ${quote(DEPLOY_DIR)}`);

  // ── Clone repository ───────────────────────────────────────────
  const cloneSpinner = logger.spinner('Cloning repository...');
  try {
    shell.exec(
      `git clone --branch ${quote(branch)} --single-branch -- ${quote(repoUrl)} ${quote(projectPath)}`,
      { env: { GIT_TERMINAL_PROMPT: '0' } }
    );
    cloneSpinner.succeed(`Cloned to ${projectPath}`);
  } catch (err) {
    cloneSpinner.fail('Failed to clone repository');
    logger.dim(err.stderr?.toString().trim() || err.message);
    logger.info('For private repos, use an SSH URL with a deploy key, or an HTTPS URL with a token');
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
    pullLatestChanges(projectPath, branch);
    pullSpinner.succeed('Latest changes pulled');
  } catch (err) {
    pullSpinner.fail('Failed to pull latest changes');
    logger.dim(err.stderr?.toString().trim() || err.message);
    throw err;
  }

  await installDependencies(projectPath);
  return { repoUrl, branch, projectName, projectPath };
}

/**
 * Fetch and fast-forward a checkout to the latest commit of a branch.
 * If no branch is given, the currently checked out branch is used.
 * @param {string} projectPath
 * @param {string} [branch]
 */
export function pullLatestChanges(projectPath, branch) {
  const target = branch || shell.exec(gitCmd(projectPath, 'rev-parse --abbrev-ref HEAD'));
  shell.exec(gitCmd(projectPath, `pull --ff-only origin ${quote(target)}`), {
    env: { GIT_TERMINAL_PROMPT: '0' },
  });
}

/**
 * Does this package.json need devDependencies at deploy time?
 * Next.js (and anything with a build step we run on the server) needs
 * devDependencies such as typescript / tailwind / postcss to build.
 * @param {object|null} pkg
 */
export function needsDevDependencies(pkg) {
  if (!pkg) return false;
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  return Boolean(deps.next);
}

/**
 * Install npm dependencies.
 * Uses `npm ci` when a lockfile exists (falls back to `npm install` if the
 * lockfile is out of sync) and omits devDependencies unless they're needed
 * for a server-side build.
 * @param {string} projectPath
 * @param {object} [opts]
 * @param {boolean} [opts.includeDev] - Force installing devDependencies
 * @returns {Promise<boolean>} true on success
 */
export async function installDependencies(projectPath, { includeDev } = {}) {
  const pkgPath = `${projectPath}/package.json`;
  if (!existsSync(pkgPath)) {
    logger.info('No package.json found — skipping npm install');
    return true;
  }

  let pkg = null;
  try {
    pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
  } catch {}

  const withDev = includeDev ?? needsDevDependencies(pkg);
  const omit = withDev ? '--include=dev' : '--omit=dev';
  const flags = `${omit} --no-audit --no-fund`;
  const hasLockfile = existsSync(`${projectPath}/package-lock.json`);

  const depSpinner = logger.spinner(
    `Installing dependencies${withDev ? ' (including devDependencies for build)' : ''}...`
  );
  try {
    let used = 'npm install';
    if (hasLockfile) {
      try {
        shell.exec(`npm ci ${flags}`, { cwd: projectPath });
        used = 'npm ci';
      } catch {
        depSpinner.text = 'Lockfile out of sync — falling back to npm install...';
        shell.exec(`npm install ${flags}`, { cwd: projectPath });
      }
    } else {
      shell.exec(`npm install ${flags}`, { cwd: projectPath });
    }
    depSpinner.succeed(`Dependencies installed (${used})`);
    return true;
  } catch (err) {
    depSpinner.fail('Failed to install dependencies');
    logger.dim(err.stderr?.toString().trim().split('\n').slice(-10).join('\n') || err.message);
    logger.warn('You may need to install dependencies manually');
    return false;
  }
}

/**
 * Backup an existing project before redeploying
 * @returns {Promise<string|null>} backup path, or null on failure
 */
export async function backupProject(projectName, projectPath) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const backupPath = `${BACKUP_DIR}/${projectName}-${timestamp}`;

  shell.execSafe(`mkdir -p ${quote(BACKUP_DIR)}`);

  const backupSpinner = logger.spinner(`Backing up to ${backupPath}...`);
  try {
    // -a preserves permissions, ownership, timestamps and symlinks
    shell.exec(`cp -a ${quote(projectPath)} ${quote(backupPath)}`);
    backupSpinner.succeed(`Backup saved to ${backupPath}`);
    pruneBackups(projectName);
    return backupPath;
  } catch (err) {
    backupSpinner.fail('Failed to create backup');
    logger.dim(err.message);
    return null;
  }
}

/**
 * Parse a backup directory name into project name + timestamp.
 * @param {string} dirName
 * @returns {{ projectName: string, timestamp: string }|null}
 */
export function parseBackupName(dirName) {
  const match = dirName.match(BACKUP_SUFFIX);
  if (!match) return null;
  return { projectName: dirName.slice(0, match.index), timestamp: match[1] };
}

/**
 * List backups (newest first), optionally only for one project.
 * @param {string} [projectName]
 * @param {string} [dir]
 * @returns {string[]} backup directory names
 */
export function listBackups(projectName, dir = BACKUP_DIR) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .filter((name) => {
      const parsed = parseBackupName(name);
      return parsed && (!projectName || parsed.projectName === projectName);
    })
    .sort((a, b) => parseBackupName(b).timestamp.localeCompare(parseBackupName(a).timestamp));
}

/**
 * Delete all but the newest BACKUP_KEEP backups of a project.
 * @param {string} projectName
 * @param {object} [opts]
 * @param {number} [opts.keep]
 * @param {string} [opts.dir]
 * @returns {string[]} removed backup names
 */
export function pruneBackups(projectName, { keep = BACKUP_KEEP, dir = BACKUP_DIR } = {}) {
  const stale = listBackups(projectName, dir).slice(keep);
  for (const name of stale) {
    try {
      rmSync(`${dir}/${name}`, { recursive: true, force: true });
    } catch {}
  }
  if (stale.length) logger.dim(`Removed ${stale.length} old backup(s) (keeping ${keep})`);
  return stale;
}

/**
 * Extract project name from Git URL
 * @param {string} url - Git repository URL
 * @returns {string} Project name
 */
export function extractProjectName(url) {
  const match = String(url).replace(/\/+$/, '').match(/[/:]([^/:]+?)(\.git)?$/);
  const name = match ? match[1].replace(/[^a-zA-Z0-9_-]/g, '-') : '';
  return validator.isValidAppName(name) === true ? name : 'my-app';
}

export default { cloneProject, backupProject, installDependencies };
