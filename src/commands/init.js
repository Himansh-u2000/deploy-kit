/**
 * DeployKit — Init Command
 * Full interactive first-time setup flow.
 * Orchestrates all modules in sequence.
 */

import logger from '../utils/logger.js';
import shell from '../utils/shell.js';
import { setupSystem } from '../modules/system.js';
import { deployProject } from '../modules/deployment.js';

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

  try {
    // ── Step 1: System Setup ─────────────────────────────────────
    await setupSystem();

    // ── Steps 2-7: Clone → Env → Detect/Build → PM2 → Nginx → SSL ─
    await deployProject();
  } catch (err) {
    if (err?.name === 'ExitPromptError') throw err; // Ctrl+C — handled by the CLI
    logger.newline();
    logger.box('❌ Deployment Failed', `${err.message}\n\nCheck the error above and try again.`, 'error');
    process.exit(1);
  }
}

export default initCommand;
