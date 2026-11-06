/**
 * DeployKit — Deployment Pipeline
 * The shared clone → env → detect → build → PM2 → Nginx → SSL flow used by
 * both `deploykit init` and `deploykit deploy`, plus deployment metadata.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname } from 'path';
import logger from '../utils/logger.js';
import shell, { quote } from '../utils/shell.js';
import { cloneProject } from './git.js';
import { detectProject, buildProject } from './project.js';
import { setupEnv } from './env.js';
import { setupPm2 } from './pm2.js';
import { setupNginx } from './nginx.js';
import { setupSsl } from './ssl.js';
import { PROJECT_TYPES, DEPLOYMENTS_FILE } from '../utils/constants.js';

/**
 * Run a full project deployment (everything after system setup).
 * @returns {Promise<object>} The saved deployment record
 */
export async function deployProject() {
  const startTime = Date.now();

  // ── Clone Project ──────────────────────────────────────────────
  const { projectName, projectPath, repoUrl, branch } = await cloneProject();

  // ── Environment Variables (before detection: port is read from .env) ──
  await setupEnv(projectPath);

  // ── Detect Project Type ────────────────────────────────────────
  const projectConfig = await detectProject(projectPath);

  // ── Build (Next.js) ────────────────────────────────────────────
  const built = await buildProject(projectPath, projectConfig);
  if (!built) {
    throw new Error('Build failed — fix the errors above and run: deploykit deploy');
  }

  // ── PM2 Setup ──────────────────────────────────────────────────
  await setupPm2({
    projectName,
    projectPath,
    type: projectConfig.type,
    entryPoint: projectConfig.entryPoint,
    port: projectConfig.port,
    serverDir: projectConfig.serverDir,
  });

  // ── Nginx Configuration ────────────────────────────────────────
  const { domain, includeWww, hasDomain } = await setupNginx({
    projectName,
    projectPath,
    type: projectConfig.type,
    port: projectConfig.port,
    buildDir: projectConfig.buildDir,
  });

  // ── SSL Certificate ────────────────────────────────────────────
  const sslInstalled = await setupSsl(domain, { includeWww });

  // ── Permissions ────────────────────────────────────────────────
  logger.info('Setting web server permissions...');
  setWebPermissions(projectPath);

  // ── Save deployment metadata ───────────────────────────────────
  const record = {
    projectName,
    projectPath,
    repoUrl,
    branch,
    domain,
    includeWww,
    ssl: sslInstalled,
    type: projectConfig.type,
    port: projectConfig.port,
    deployedAt: new Date().toISOString(),
  };
  saveDeployment(record);

  // ── Final Summary ──────────────────────────────────────────────
  const elapsed = Math.round((Date.now() - startTime) / 1000);
  printSummary({ ...record, hasDomain, elapsed });

  return record;
}

/**
 * Give Nginx (www-data) read access to the deployed files.
 * @param {string} projectPath
 */
export function setWebPermissions(projectPath) {
  shell.execSafe(`chown -R www-data:www-data ${quote(projectPath)}`);
}

/**
 * Print the post-deploy summary box.
 */
function printSummary({ projectName, projectPath, repoUrl, branch, domain, ssl, type, hasDomain, elapsed }) {
  const isStatic = type === PROJECT_TYPES.STATIC || type === PROJECT_TYPES.REACT;
  const accessLine = hasDomain
    ? ssl
      ? `🔒  https://${domain}`
      : `🌐  http://${domain}`
    : `🌐  http://${domain === '_' ? shell.getPublicIp() || '<server-ip>' : domain}`;

  const summaryLines = [
    accessLine,
    '',
    `📁  Project: ${projectPath}`,
    `🔗  Repo:    ${redactCredentials(repoUrl)}`,
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
}

/**
 * Hide tokens in URLs like https://user:token@github.com/...
 * @param {string} url
 */
export function redactCredentials(url) {
  return String(url).replace(/^(https?:\/\/)[^@/]+@/, '$1***@');
}

/**
 * Read saved deployment records.
 * @param {string} [file]
 * @returns {object[]}
 */
export function readDeployments(file = DEPLOYMENTS_FILE) {
  try {
    const data = JSON.parse(readFileSync(file, 'utf-8'));
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

/**
 * Save (upsert by projectName) a deployment record.
 * Non-critical — never throws.
 * @param {object} record
 * @param {string} [file]
 */
export function saveDeployment(record, file = DEPLOYMENTS_FILE) {
  try {
    mkdirSync(dirname(file), { recursive: true });

    const deployments = readDeployments(file).filter((d) => d.projectName !== record.projectName);
    deployments.push({ ...record, repoUrl: redactCredentials(record.repoUrl) });
    writeFileSync(file, JSON.stringify(deployments, null, 2) + '\n', { encoding: 'utf-8', mode: 0o600 });
  } catch (err) {
    logger.dim(`Could not save deployment metadata: ${err.message}`);
  }
}

export default { deployProject, saveDeployment, readDeployments };
