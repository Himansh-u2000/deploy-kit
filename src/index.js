/**
 * DeployKit — Main Export
 * Exports all modules and commands for programmatic usage.
 */

export { setupSystem } from './modules/system.js';
export { cloneProject, backupProject } from './modules/git.js';
export { detectProject } from './modules/project.js';
export { setupEnv } from './modules/env.js';
export { setupPm2, viewLogs } from './modules/pm2.js';
export { setupNginx } from './modules/nginx.js';
export { setupSsl, sslCommand } from './modules/ssl.js';

export { default as initCommand } from './commands/init.js';
export { default as deployCommand } from './commands/deploy.js';
export { default as statusCommand } from './commands/status.js';
export { default as logsCommand } from './commands/logs.js';
export { default as nginxCommand } from './commands/nginx.js';
export { default as rollbackCommand } from './commands/rollback.js';
