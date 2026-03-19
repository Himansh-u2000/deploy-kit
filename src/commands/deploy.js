/**
 * DeployKit — Deploy Command
 * Deploy a new project or redeploy an existing one.
 */

import { existsSync, readFileSync, readdirSync } from 'fs';
import inquirer from 'inquirer';
import logger from '../utils/logger.js';
import shell from '../utils/shell.js';
import { cloneProject, backupProject } from '../modules/git.js';
import { detectProject } from '../modules/project.js';
import { setupEnv } from '../modules/env.js';
import { setupPm2 } from '../modules/pm2.js';
import { setupNginx } from '../modules/nginx.js';
import { DEPLOY_DIR, DEPLOYKIT_CONFIG_FILE, PROJECT_TYPES } from '../utils/constants.js';

/**
 * Deploy or redeploy a project.
 */
export async function deployCommand() {
  logger.banner();

  if (!shell.isRoot()) {
    logger.error('Run with: sudo deploykit deploy');
    process.exit(1);
  }

  // ── Check for existing deployments ─────────────────────────────
  const existing = getExistingProjects();

  if (existing.length === 0) {
    logger.info('No existing deployments found. Starting fresh deploy...');
    return await freshDeploy();
  }

  // ── Choose action ──────────────────────────────────────────────
  const { action } = await inquirer.prompt([
    {
      type: 'list',
      name: 'action',
      message: 'What would you like to do?',
      choices: [
        { name: '🆕  Deploy a new project', value: 'new' },
        { name: '🔄  Redeploy an existing project', value: 'redeploy' },
      ],
    },
  ]);

  if (action === 'new') {
    return await freshDeploy();
  } else {
    return await redeploy(existing);
  }
}

/**
 * Fresh deployment flow
 */
async function freshDeploy() {
  const { projectName, projectPath, repoUrl, branch } = await cloneProject();
  await setupEnv(projectPath);
  const projectConfig = await detectProject(projectPath);
  await setupPm2({
    projectName,
    projectPath,
    type: projectConfig.type,
    entryPoint: projectConfig.entryPoint,
    port: projectConfig.port,
  });
  await setupNginx({
    projectName,
    projectPath,
    type: projectConfig.type,
    port: projectConfig.port,
    buildDir: projectConfig.buildDir,
  });

  shell.execSafe(`chown -R www-data:www-data ${projectPath}`);
  logger.box('✅ Deployment Complete!', `Project deployed to ${projectPath}`, 'success');
}

/**
 * Redeploy an existing project
 */
async function redeploy(projects) {
  const { project } = await inquirer.prompt([
    {
      type: 'list',
      name: 'project',
      message: 'Select project to redeploy:',
      choices: projects.map((p) => ({ name: p, value: p })),
    },
  ]);

  const projectPath = `${DEPLOY_DIR}/${project}`;

  // Backup before redeploy
  await backupProject(project, projectPath);

  // Pull latest changes
  const pullSpinner = logger.spinner('Pulling latest changes...');
  try {
    shell.exec(`cd ${projectPath} && git pull`);
    pullSpinner.succeed('Latest changes pulled');
  } catch (err) {
    pullSpinner.fail('Failed to pull changes');
    logger.dim(err.message);
    return;
  }

  // Reinstall dependencies
  if (existsSync(`${projectPath}/package.json`)) {
    const depSpinner = logger.spinner('Installing dependencies...');
    try {
      const hasLockfile = existsSync(`${projectPath}/package-lock.json`);
      const cmd = hasLockfile ? 'npm ci --production' : 'npm install --production';
      shell.exec(`cd ${projectPath} && ${cmd}`);
      depSpinner.succeed('Dependencies updated');
    } catch (err) {
      depSpinner.fail('Failed to install dependencies');
      logger.dim(err.message);
    }
  }

  // Detect project type for build step
  const projectConfig = await detectProject(projectPath);

  // Build if Next.js
  if (projectConfig.type === PROJECT_TYPES.NEXTJS) {
    const buildSpinner = logger.spinner('Building Next.js app...');
    try {
      shell.exec(`cd ${projectPath} && npm run build`);
      buildSpinner.succeed('Build complete');
    } catch (err) {
      buildSpinner.fail('Build failed');
      logger.dim(err.message);
      return;
    }
  }

  // Restart PM2 if applicable
  if (projectConfig.type !== PROJECT_TYPES.STATIC && projectConfig.type !== PROJECT_TYPES.REACT) {
    const restartSpinner = logger.spinner('Restarting with PM2...');
    try {
      shell.exec(`pm2 restart "${project}"`);
      restartSpinner.succeed(`${project} restarted`);
    } catch {
      logger.warn('PM2 restart failed — app may not be registered with PM2');
    }
  }

  // Reload Nginx
  shell.execSafe('systemctl reload nginx');

  // Ensure permissions are set for Nginx
  shell.execSafe(`chown -R www-data:www-data ${projectPath}`);

  logger.box('✅ Redeployment Complete!', `${project} has been updated and restarted.`, 'success');
}

/**
 * Get list of existing projects in /var/www
 */
function getExistingProjects() {
  try {
    if (!existsSync(DEPLOY_DIR)) return [];
    return readdirSync(DEPLOY_DIR, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .filter((d) => existsSync(`${DEPLOY_DIR}/${d.name}/package.json`) || existsSync(`${DEPLOY_DIR}/${d.name}/index.html`))
      .map((d) => d.name);
  } catch {
    return [];
  }
}

export default deployCommand;
