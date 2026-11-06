/**
 * DeployKit — PM2 Process Management Module
 * Handles starting apps with PM2, startup configuration, and log viewing.
 */

import { confirm, select } from '@inquirer/prompts';
import logger from '../utils/logger.js';
import shell, { quote } from '../utils/shell.js';
import { PROJECT_TYPES, PM2_MAX_MEMORY } from '../utils/constants.js';

/**
 * Start the application with PM2 and configure startup on boot.
 * @param {object} options
 * @param {string} options.projectName - App/project name
 * @param {string} options.projectPath - Absolute path to the project
 * @param {string} options.type - Project type (express, nextjs, etc.)
 * @param {string} options.entryPoint - Entry point file (e.g., server.js)
 * @param {number} options.port - Application port
 * @param {string} [options.serverDir] - Server subdirectory (fullstack projects)
 */
export async function setupPm2({ projectName, projectPath, type, entryPoint, port, serverDir }) {
  logger.step(5, 7, '⚡', 'PM2 Setup');

  // ── Skip PM2 for static/react sites ────────────────────────────
  if (type === PROJECT_TYPES.STATIC || type === PROJECT_TYPES.REACT) {
    logger.info('Static/React project — no PM2 needed (served by Nginx)');
    return;
  }

  // ── Determine working directory ────────────────────────────────
  let workDir = projectPath;
  if (type === PROJECT_TYPES.FULLSTACK && serverDir) {
    workDir = `${projectPath}/${serverDir}`;
  }

  // ── Build PM2 start command ────────────────────────────────────
  const name = quote(projectName);
  const common = `--name ${name} --cwd ${quote(workDir)} --max-memory-restart ${PM2_MAX_MEMORY} --time`;
  const pm2Cmd =
    type === PROJECT_TYPES.NEXTJS
      ? `pm2 start npm ${common} -- start`
      : `pm2 start ${quote(entryPoint || 'index.js')} ${common}`;

  // ── Environment for the PM2 process ────────────────────────────
  const env = { NODE_ENV: 'production' };
  if (port) env.PORT = String(port);

  // ── Check if app already running in PM2 ────────────────────────
  const { success: isRunning } = shell.execSafe(`pm2 describe ${name}`);
  if (isRunning) {
    const action = await select({
      message: `"${projectName}" is already running in PM2. What to do?`,
      choices: [
        { name: 'Restart it', value: 'restart' },
        { name: 'Delete & start fresh', value: 'fresh' },
        { name: 'Skip PM2 setup', value: 'skip' },
      ],
    });

    if (action === 'skip') return;

    if (action === 'restart') {
      const restartSpinner = logger.spinner('Restarting with PM2...');
      try {
        shell.exec(`pm2 restart ${name} --update-env`, { cwd: workDir, env });
        restartSpinner.succeed(`${projectName} restarted with PM2`);
      } catch (err) {
        restartSpinner.fail('Failed to restart');
        logger.dim(err.message);
      }
      await configurePm2Startup();
      return;
    }

    // Delete existing
    shell.execSafe(`pm2 delete ${name}`);
  }

  // ── Start with PM2 ────────────────────────────────────────────
  const pm2Spinner = logger.spinner(`Starting ${projectName} with PM2...`);
  try {
    shell.exec(pm2Cmd, { cwd: workDir, env });
    pm2Spinner.succeed(`${projectName} started with PM2`);
  } catch (err) {
    pm2Spinner.fail('Failed to start with PM2');
    logger.dim(err.message);
    throw err;
  }

  // ── Configure startup ─────────────────────────────────────────
  await configurePm2Startup();

  // ── Show PM2 status ────────────────────────────────────────────
  logger.newline();
  try {
    const status = shell.exec('pm2 jlist');
    const processes = JSON.parse(status);
    const rows = processes.map((p) => [
      p.name,
      p.pm2_env?.status || 'unknown',
      `${Math.round((p.monit?.memory || 0) / 1048576)}MB`,
      p.pm2_env?.restart_time?.toString() || '0',
    ]);
    logger.table(['Name', 'Status', 'Memory', 'Restarts'], rows);
  } catch {
    // Fallback to text output
    shell.execSafe('pm2 list');
  }

  // ── Ask if user wants to see logs ──────────────────────────────
  const wantLogs = await confirm({
    message: 'View PM2 logs now? (Ctrl+C to stop)',
    default: false,
  });

  if (wantLogs) {
    logger.info('Streaming logs... Press Ctrl+C to stop');
    try {
      await shell.execLive('pm2', ['logs', projectName, '--lines', '20']);
    } catch {
      // User pressed Ctrl+C — that's fine
    }
  }
}

/**
 * Configure PM2 to start on system boot
 */
async function configurePm2Startup() {
  const startupSpinner = logger.spinner('Configuring PM2 startup on boot...');
  try {
    shell.exec('pm2 startup systemd -u root --hp /root');
    shell.exec('pm2 save');
    startupSpinner.succeed('PM2 startup configured');
  } catch (err) {
    startupSpinner.fail('Failed to configure PM2 startup');
    logger.dim(err.message);
  }
}

/**
 * Restart an existing PM2 app, picking up any changed environment.
 * @param {string} projectName
 * @returns {boolean} true if restarted
 */
export function restartPm2App(projectName) {
  const name = quote(projectName);
  if (!shell.execSafe(`pm2 describe ${name}`).success) return false;
  shell.exec(`pm2 restart ${name} --update-env`, { env: { NODE_ENV: 'production' } });
  shell.execSafe('pm2 save');
  return true;
}

/**
 * View PM2 logs for a specific app or all apps
 * @param {string} [appName] - App name (optional, shows all if omitted)
 */
export async function viewLogs(appName) {
  logger.info(`Streaming PM2 logs${appName ? ` for ${appName}` : ''}... Press Ctrl+C to stop`);
  try {
    const args = ['logs', '--lines', '50'];
    if (appName) args.splice(1, 0, appName);
    await shell.execLive('pm2', args);
  } catch {
    // Ctrl+C — normal exit
  }
}

export default { setupPm2, viewLogs, restartPm2App };
