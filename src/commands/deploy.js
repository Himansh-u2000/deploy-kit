/**
 * DeployKit — Deploy Command
 * Deploy a new project or redeploy an existing one.
 */

import { existsSync, readdirSync } from 'fs';
import { select } from '@inquirer/prompts';
import logger from '../utils/logger.js';
import shell from '../utils/shell.js';
import { backupProject, installDependencies, pullLatestChanges } from '../modules/git.js';
import { detectProject, buildProject } from '../modules/project.js';
import { restartPm2App } from '../modules/pm2.js';
import { deployProject, setWebPermissions, readDeployments, saveDeployment } from '../modules/deployment.js';
import { DEPLOY_DIR, PROJECT_TYPES } from '../utils/constants.js';

/**
 * Deploy or redeploy a project.
 */
export async function deployCommand() {
  logger.banner();

  if (!shell.isRoot()) {
    logger.error('Run with: sudo deploykit deploy');
    process.exit(1);
  }

  try {
    // ── Check for existing deployments ───────────────────────────
    const existing = getExistingProjects();

    if (existing.length === 0) {
      logger.info('No existing deployments found. Starting fresh deploy...');
      await deployProject();
      return;
    }

    // ── Choose action ────────────────────────────────────────────
    const action = await select({
      message: 'What would you like to do?',
      choices: [
        { name: '🆕  Deploy a new project', value: 'new' },
        { name: '🔄  Redeploy an existing project', value: 'redeploy' },
      ],
    });

    if (action === 'new') {
      await deployProject();
    } else {
      await redeploy(existing);
    }
  } catch (err) {
    if (err?.name === 'ExitPromptError') throw err; // Ctrl+C — handled by the CLI
    logger.newline();
    logger.box('❌ Deployment Failed', `${err.message}\n\nCheck the error above and try again.`, 'error');
    process.exit(1);
  }
}

/**
 * Redeploy an existing project
 */
async function redeploy(projects) {
  const project = await select({
    message: 'Select project to redeploy:',
    choices: projects.map((p) => ({ name: p, value: p })),
  });

  const projectPath = `${DEPLOY_DIR}/${project}`;
  const saved = readDeployments().find((d) => d.projectName === project);

  // Backup before redeploy
  await backupProject(project, projectPath);

  // Pull latest changes (only if it's a git checkout)
  if (existsSync(`${projectPath}/.git`)) {
    const pullSpinner = logger.spinner('Pulling latest changes...');
    try {
      pullLatestChanges(projectPath, saved?.branch);
      pullSpinner.succeed('Latest changes pulled');
    } catch (err) {
      pullSpinner.fail('Failed to pull changes');
      logger.dim(err.stderr?.toString().trim() || err.message);
      logger.info('If the checkout has local changes, inspect it with: git -C ' + projectPath + ' status');
      return;
    }
  } else {
    logger.warn(`${projectPath} is not a git repository — skipping pull`);
  }

  // Reinstall dependencies (includes devDependencies when a build is required)
  await installDependencies(projectPath);

  // Detect project type for build step
  const projectConfig = await detectProject(projectPath);

  // Build if needed (Next.js)
  if (!(await buildProject(projectPath, projectConfig))) {
    logger.error('Build failed — the previous version is still running');
    return;
  }

  // Restart PM2 if applicable
  if (projectConfig.type !== PROJECT_TYPES.STATIC && projectConfig.type !== PROJECT_TYPES.REACT) {
    const restartSpinner = logger.spinner('Restarting with PM2...');
    try {
      if (restartPm2App(project)) {
        restartSpinner.succeed(`${project} restarted`);
      } else {
        restartSpinner.warn(`"${project}" is not registered with PM2 — run: sudo deploykit deploy → new project`);
      }
    } catch (err) {
      restartSpinner.fail('PM2 restart failed');
      logger.dim(err.message);
    }
  }

  // Reload Nginx (only if the config is valid)
  if (shell.execSafe('nginx -t').success) {
    shell.execSafe('systemctl reload nginx');
  } else {
    logger.warn('Nginx config test failed — not reloading. Run: deploykit nginx → Test configuration');
  }

  // Ensure permissions are set for Nginx
  setWebPermissions(projectPath);

  if (saved) {
    saveDeployment({ ...saved, deployedAt: new Date().toISOString() });
  }

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
      .filter(
        (d) =>
          existsSync(`${DEPLOY_DIR}/${d.name}/package.json`) ||
          existsSync(`${DEPLOY_DIR}/${d.name}/index.html`) ||
          existsSync(`${DEPLOY_DIR}/${d.name}/.git`)
      )
      .map((d) => d.name);
  } catch {
    return [];
  }
}

export default deployCommand;
