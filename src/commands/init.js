/**
 * DeployKit — Init Command
 * Full interactive first-time setup flow.
 * Orchestrates all modules in sequence.
 */

import logger from '../utils/logger.js';
import shell from '../utils/shell.js';
import { setupSystem } from '../modules/system.js';
import { cloneProject } from '../modules/git.js';
import { detectProject } from '../modules/project.js';
import { setupEnv } from '../modules/env.js';
import { setupPm2 } from '../modules/pm2.js';
import { setupNginx } from '../modules/nginx.js';
import { setupSsl } from '../modules/ssl.js';
import { PROJECT_TYPES, DEPLOYKIT_CONFIG_DIR } from '../utils/constants.js';

/**
 * Run the full interactive deployment setup.
 */
export async function initCommand() {
  // ── Welcome Banner ─────────────────────────────────────────────
  logger.banner();

  // ── Check root permissions ─────────────────────────────────────
  if (!shell.isRoot()) {
    logger.box(
      '⚠ Root Required',
      'DeployKit needs root permissions to install software and configure the server.\n\nRun with: sudo deploykit init',
      'error'
    );
    process.exit(1);
  }

  const startTime = Date.now();

  try {
    // ── Step 1: System Setup ───────────────────────────────────────
    await setupSystem();

    // ── Step 2: Clone Project ──────────────────────────────────────
    const { projectName, projectPath, repoUrl, branch } = await cloneProject();

    // ── Step 3: Detect Project Type ────────────────────────────────
    const projectConfig = await detectProject(projectPath);

    // ── Step 4: Environment Variables ──────────────────────────────
    await setupEnv(projectPath);

    // ── Step 5: PM2 Setup ──────────────────────────────────────────
    await setupPm2({
      projectName,
      projectPath,
      type: projectConfig.type,
      entryPoint: projectConfig.entryPoint,
      port: projectConfig.port,
    });

    // ── Step 6: Nginx Configuration ────────────────────────────────
    const { domain } = await setupNginx({
      projectName,
      projectPath,
      type: projectConfig.type,
      port: projectConfig.port,
      buildDir: projectConfig.buildDir,
    });

    // ── Step 7: SSL Certificate ────────────────────────────────────
    await setupSsl(domain);

    // ── Final Summary ──────────────────────────────────────────────
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    const isStatic = projectConfig.type === PROJECT_TYPES.STATIC || projectConfig.type === PROJECT_TYPES.REACT;

    const summaryLines = [
      `🌐  http://${domain}`,
      `🔒  https://${domain}`,
      '',
      `📁  Project: ${projectPath}`,
      `🔗  Repo:    ${repoUrl}`,
      `🌿  Branch:  ${branch}`,
      '',
      `⏱  Completed in ${elapsed}s`,
      '',
      'Useful commands:',
      `  ${logger.colors.dim('deploykit status')}    — Server dashboard`,
      `  ${logger.colors.dim('deploykit logs')}      — View app logs`,
      `  ${logger.colors.dim('deploykit deploy')}    — Redeploy app`,
      `  ${logger.colors.dim('deploykit rollback')}  — Undo last deploy`,
      `  ${logger.colors.dim('deploykit ssl')}       — Manage SSL`,
    ];

    if (!isStatic) {
      summaryLines.splice(5, 0, `⚡  PM2:     ${projectName}`);
    }

    logger.box('✅ Deployment Complete!', summaryLines.join('\n'), 'success');

    // ── Save deployment config ────────────────────────────────────
    saveDeploymentConfig({
      projectName,
      projectPath,
      repoUrl,
      branch,
      domain,
      type: projectConfig.type,
      port: projectConfig.port,
      deployedAt: new Date().toISOString(),
    });

  } catch (err) {
    logger.newline();
    logger.box('❌ Deployment Failed', `${err.message}\n\nCheck the error above and try again.`, 'error');
    process.exit(1);
  }
}

/**
 * Save deployment metadata for status/rollback commands
 */
function saveDeploymentConfig(config) {
  try {
    import('fs').then(({ readFileSync, writeFileSync }) => {
      const configPath = `${DEPLOYKIT_CONFIG_DIR}/deployments.json`;
      let deployments = [];

      try {
        const existing = readFileSync(configPath, 'utf-8');
        deployments = JSON.parse(existing);
      } catch {
        // No existing config
      }

      deployments.push(config);
      writeFileSync(configPath, JSON.stringify(deployments, null, 2), 'utf-8');
    });
  } catch {
    // Non-critical — don't fail deployment if config save fails
  }
}

export default initCommand;
