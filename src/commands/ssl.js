/**
 * DeployKit — SSL Command
 * Standalone SSL certificate management.
 */

import { sslCommand as sslSetup } from '../modules/ssl.js';
import logger from '../utils/logger.js';
import shell from '../utils/shell.js';

/**
 * SSL command entry point.
 * @param {string} [domain] - Domain from CLI argument
 */
export async function sslCommand(domain) {
  logger.banner();

  if (!shell.isRoot()) {
    logger.error('Run with: sudo deploykit ssl <domain>');
    process.exit(1);
  }

  await sslSetup(domain);
}

export default sslCommand;
