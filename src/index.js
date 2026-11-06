/**
 * DeployKit — Main Export
 * Exports all modules and commands for programmatic usage.
 */

export { setupSystem } from './modules/system.js';
export {
  cloneProject,
  backupProject,
  installDependencies,
  listBackups,
  pruneBackups,
} from './modules/git.js';
export { detectProject, buildProject } from './modules/project.js';
export { setupEnv } from './modules/env.js';
export { setupPm2, viewLogs, restartPm2App } from './modules/pm2.js';
export { setupNginx, generateConfig } from './modules/nginx.js';
export { setupSsl, sslCommand } from './modules/ssl.js';
export { deployProject, readDeployments, saveDeployment } from './modules/deployment.js';
export { default as validator } from './utils/validator.js';

export { default as initCommand } from './commands/init.js';
export { default as deployCommand } from './commands/deploy.js';
export { default as statusCommand } from './commands/status.js';
export { default as logsCommand } from './commands/logs.js';
export { default as nginxCommand } from './commands/nginx.js';
export { default as rollbackCommand } from './commands/rollback.js';
