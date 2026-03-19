/**
 * DeployKit — SSL Certificate Module
 * Manages Let's Encrypt SSL certificates via Certbot.
 */

import inquirer from 'inquirer';
import logger from '../utils/logger.js';
import shell from '../utils/shell.js';
import validator from '../utils/validator.js';

/**
 * Setup SSL certificate for a domain using Certbot.
 * @param {string} domain - Domain name
 */
export async function setupSsl(domain) {
  logger.step(7, 7, '🔒', 'SSL Certificate');

  // ── If no domain, skip ─────────────────────────────────────────
  if (!domain || /^\d+\.\d+\.\d+\.\d+$/.test(domain) || domain === '_') {
    logger.warn('SSL requires a domain name (cannot use IP address)');
    logger.info('Point a domain to this server, then run: deploykit ssl <domain>');
    return;
  }

  // ── Ask if user wants SSL ──────────────────────────────────────
  const { wantSsl } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'wantSsl',
      message: `Setup SSL certificate for ${domain}?`,
      default: true,
    },
  ]);

  if (!wantSsl) {
    logger.info(`You can setup SSL later with: deploykit ssl ${domain}`);
    return;
  }

  // ── Check if Certbot is installed ──────────────────────────────
  if (!shell.isInstalled('certbot')) {
    logger.error('Certbot is not installed. Run: apt install certbot python3-certbot-nginx');
    return;
  }

  // ── Prompt for email ───────────────────────────────────────────
  const { email } = await inquirer.prompt([
    {
      type: 'input',
      name: 'email',
      message: 'Email for SSL certificate registration:',
      validate: validator.isValidEmail,
    },
  ]);

  // ── Ask about www subdomain ────────────────────────────────────
  const { includeWww } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'includeWww',
      message: `Also include www.${domain}?`,
      default: true,
    },
  ]);

  // ── Check DNS resolution ───────────────────────────────────────
  const dnsSpinner = logger.spinner('Checking DNS resolution...');
  const domainsToCheck = includeWww ? [domain, `www.${domain}`] : [domain];
  let dnsOk = true;

  try {
    const serverIp = shell.exec('curl -s ifconfig.me').trim();
    
    for (const d of domainsToCheck) {
      const { success, output: dnsIp } = shell.execSafe(`dig +short ${d}`);
      if (!success || !dnsIp || dnsIp.trim() !== serverIp) {
        dnsOk = false;
        dnsSpinner.warn(`DNS may not be pointing to this server for ${d}`);
        logger.dim(`  Domain resolves to: ${dnsIp || 'unknown'}`);
        logger.dim(`  Server IP:          ${serverIp}`);
      }
    }

    if (dnsOk) {
      dnsSpinner.succeed(`DNS verified for ${domainsToCheck.join(' and ')}`);
    } else {
      const { continueAnyway } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'continueAnyway',
          message: 'DNS might not be pointing here. Continue anyway?',
          default: false,
        },
      ]);

      if (!continueAnyway) {
        logger.info('Update your DNS records and try again: deploykit ssl ' + domain);
        return;
      }
    }
  } catch {
    dnsSpinner.warn('Could not verify DNS — continuing anyway');
  }

  // ── Build Certbot command ──────────────────────────────────────
  let certbotCmd = `certbot --nginx --non-interactive --agree-tos --email ${email} -d ${domain}`;
  if (includeWww) {
    certbotCmd += ` -d www.${domain}`;
  }

  // ── Run Certbot ────────────────────────────────────────────────
  const sslSpinner = logger.spinner('Obtaining SSL certificate...');
  try {
    shell.exec(certbotCmd);
    sslSpinner.succeed(`SSL certificate installed for ${domain}`);
  } catch (err) {
    sslSpinner.fail('Failed to obtain SSL certificate');
    logger.dim(err.message);
    logger.info('Common issues:');
    logger.dim('  • Domain not pointing to this server');
    logger.dim('  • Port 80 not accessible (check firewall)');
    logger.dim('  • Rate limit reached (try again later)');
    return;
  }

  // ── Verify auto-renewal ────────────────────────────────────────
  const renewSpinner = logger.spinner('Verifying auto-renewal...');
  const { success: renewOk } = shell.execSafe('certbot renew --dry-run');
  if (renewOk) {
    renewSpinner.succeed('Auto-renewal configured and verified');
  } else {
    renewSpinner.warn('Auto-renewal dry-run failed — check certbot timer');
  }

  logger.success(`🔒 https://${domain} is now secured with SSL`);
}

/**
 * Setup SSL for a specific domain (standalone command)
 * @param {string} [domainArg] - Domain from CLI argument
 */
export async function sslCommand(domainArg) {
  let domain = domainArg;

  if (!domain) {
    const { domainInput } = await inquirer.prompt([
      {
        type: 'input',
        name: 'domainInput',
        message: 'Enter domain to setup SSL for:',
        validate: validator.isValidDomain,
      },
    ]);
    domain = domainInput;
  }

  await setupSsl(domain);
}

export default { setupSsl, sslCommand };
