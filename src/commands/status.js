/**
 * DeployKit — Status Command
 * Display server stats, PM2 processes, Nginx status, and SSL info.
 */

import logger from '../utils/logger.js';
import shell from '../utils/shell.js';

/**
 * Show a comprehensive server status dashboard.
 */
export async function statusCommand() {
  logger.banner();

  // ── Server Stats ───────────────────────────────────────────────
  logger.step(1, 4, '💻', 'Server Stats');
  displayServerStats();

  // ── PM2 Processes ──────────────────────────────────────────────
  logger.step(2, 4, '⚡', 'PM2 Processes');
  displayPm2Status();

  // ── Nginx Status ───────────────────────────────────────────────
  logger.step(3, 4, '🌐', 'Nginx Status');
  displayNginxStatus();

  // ── SSL Certificates ───────────────────────────────────────────
  logger.step(4, 4, '🔒', 'SSL Certificates');
  displaySslStatus();
}

/**
 * Display server resource usage
 */
function displayServerStats() {
  try {
    // CPU
    const cpuCount = shell.exec('nproc');
    const loadAvg = shell.exec("cat /proc/loadavg | awk '{print $1, $2, $3}'");

    // Memory
    const memInfo = shell.exec("free -m | awk 'NR==2{printf \"%s/%sMB (%.1f%%)\", $3,$2,$3*100/$2}'");

    // Disk
    const diskInfo = shell.exec("df -h / | awk 'NR==2{printf \"%s/%s (%s)\", $3,$2,$5}'");

    // Uptime
    const uptime = shell.exec('uptime -p');

    // Swap
    const swapInfo = shell.execSafe("free -m | awk 'NR==3{printf \"%s/%sMB\", $3,$2}'");

    logger.table(
      ['Resource', 'Usage'],
      [
        ['CPU Cores', `${cpuCount} cores`],
        ['Load Average', loadAvg],
        ['Memory', memInfo],
        ['Swap', swapInfo.success ? swapInfo.output : 'Not configured'],
        ['Disk', diskInfo],
        ['Uptime', uptime],
      ]
    );
  } catch (err) {
    logger.warn('Could not retrieve server stats');
    logger.dim(err.message);
  }
}

/**
 * Display PM2 process status
 */
function displayPm2Status() {
  if (!shell.isInstalled('pm2')) {
    logger.warn('PM2 is not installed');
    return;
  }

  try {
    const status = shell.exec('pm2 jlist');
    const processes = JSON.parse(status);

    if (processes.length === 0) {
      logger.info('No PM2 processes running');
      return;
    }

    const rows = processes.map((p) => [
      p.name,
      p.pm2_env?.status === 'online'
        ? logger.colors.success('online')
        : logger.colors.error(p.pm2_env?.status || 'unknown'),
      `${Math.round((p.monit?.cpu || 0))}%`,
      `${Math.round((p.monit?.memory || 0) / 1048576)}MB`,
      formatUptime(p.pm2_env?.pm_uptime),
      String(p.pm2_env?.restart_time || 0),
    ]);

    logger.table(['Name', 'Status', 'CPU', 'Memory', 'Uptime', 'Restarts'], rows);
  } catch {
    // Fallback
    try {
      shell.exec('pm2 list', { silent: false });
    } catch {
      logger.warn('Could not get PM2 status');
    }
  }
}

/**
 * Display Nginx status
 */
function displayNginxStatus() {
  if (!shell.isInstalled('nginx')) {
    logger.warn('Nginx is not installed');
    return;
  }

  // Check if running
  const { success: isActive } = shell.execSafe('systemctl is-active nginx');
  const status = isActive
    ? logger.colors.success('● Active (running)')
    : logger.colors.error('● Inactive');
  logger.success(`Nginx: ${status}`);

  // List enabled sites
  try {
    const sites = shell.exec('ls /etc/nginx/sites-enabled/').split('\n').filter(Boolean);
    if (sites.length > 0) {
      logger.info(`Enabled sites: ${sites.join(', ')}`);
    }
  } catch {
    logger.dim('Could not list enabled sites');
  }

  // Config test
  const { success: configOk } = shell.execSafe('nginx -t 2>&1');
  if (configOk) {
    logger.success('Config test: ✓ OK');
  } else {
    logger.error('Config test: ✖ FAILED');
  }
}

/**
 * Display SSL certificate info
 */
function displaySslStatus() {
  if (!shell.isInstalled('certbot')) {
    logger.warn('Certbot is not installed');
    return;
  }

  try {
    const certs = shell.exec('certbot certificates 2>/dev/null');
    if (certs.includes('No certificates found')) {
      logger.info('No SSL certificates installed');
    } else {
      // Parse certificate info
      const domains = certs.match(/Domains: .+/g) || [];
      const expiries = certs.match(/Expiry Date: .+/g) || [];

      const rows = domains.map((d, i) => [
        d.replace('Domains: ', ''),
        expiries[i] ? expiries[i].replace('Expiry Date: ', '').trim() : 'Unknown',
      ]);

      if (rows.length > 0) {
        logger.table(['Domain', 'Expires'], rows);
      } else {
        logger.dim(certs);
      }
    }
  } catch {
    logger.warn('Could not retrieve SSL certificate info');
  }
}

/**
 * Format PM2 uptime
 */
function formatUptime(startTime) {
  if (!startTime) return 'N/A';
  const diff = Date.now() - startTime;
  const hours = Math.floor(diff / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);
  if (hours > 24) {
    return `${Math.floor(hours / 24)}d ${hours % 24}h`;
  }
  return `${hours}h ${mins}m`;
}

export default statusCommand;
