/**
 * DeployKit — SSL Certificate Module
 * Manages Let's Encrypt SSL certificates via Certbot.
 */

import { confirm, input } from '@inquirer/prompts';
import logger from '../utils/logger.js';
import shell, { quote } from '../utils/shell.js';
import validator from '../utils/validator.js';

const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;

/**
 * Check whether each domain resolves (directly or via CNAME) to the server IP.
 * @param {string[]} domains
 * @param {string} serverIp
 * @param {(host: string) => string[]} [resolve] - injectable for tests
 * @returns {{ domain: string, ips: string[], ok: boolean }[]}
 */
export function checkDns(domains, serverIp, resolve = shell.resolveIpv4) {
  return domains.map((domain) => {
    const ips = resolve(domain);
    return { domain, ips, ok: ips.includes(serverIp) };
  });
}

/**
 * Setup SSL certificate for a domain using Certbot.
 * @param {string} domain - Domain name
 * @param {object} [opts]
 * @param {boolean} [opts.includeWww] - Include www.<domain>; prompts if undefined
 * @returns {Promise<boolean>} true if a certificate was installed
 */
export async function setupSsl(domain, { includeWww } = {}) {
  logger.step(7, 7, '🔒', 'SSL Certificate');

  // ── If no domain, skip ─────────────────────────────────────────
  if (!domain || IPV4.test(domain) || domain === '_') {
    logger.warn('SSL requires a domain name (cannot use IP address)');
    logger.info('Point a domain to this server, then run: deploykit ssl <domain>');
    return false;
  }

  if (validator.isValidDomain(domain) !== true) {
    logger.error(`Invalid domain: ${domain}`);
    return false;
  }

  // ── Ask if user wants SSL ──────────────────────────────────────
  const wantSsl = await confirm({
    message: `Setup SSL certificate for ${domain}?`,
    default: true,
  });

  if (!wantSsl) {
    logger.info(`You can setup SSL later with: deploykit ssl ${domain}`);
    return false;
  }

  // ── Check if Certbot is installed ──────────────────────────────
  if (!shell.isInstalled('certbot')) {
    logger.error('Certbot is not installed. Run: apt install certbot python3-certbot-nginx');
    return false;
  }

  // ── Prompt for email ───────────────────────────────────────────
  const email = (
    await input({
      message: 'Email for SSL certificate registration:',
      validate: validator.isValidEmail,
    })
  ).trim();

  // ── Ask about www subdomain (unless Nginx setup already decided) ──
  if (includeWww === undefined) {
    includeWww = await confirm({
      message: `Also include www.${domain}?`,
      default: true,
    });
  }

  // ── Check DNS resolution ───────────────────────────────────────
  const dnsSpinner = logger.spinner('Checking DNS resolution...');
  const domainsToCheck = includeWww ? [domain, `www.${domain}`] : [domain];
  const serverIp = shell.getPublicIp();

  if (!serverIp) {
    dnsSpinner.warn('Could not detect this server\'s public IP — skipping DNS check');
  } else {
    const results = checkDns(domainsToCheck, serverIp);
    const failed = results.filter((r) => !r.ok);

    if (failed.length === 0) {
      dnsSpinner.succeed(`DNS verified for ${domainsToCheck.join(' and ')}`);
    } else {
      dnsSpinner.warn('DNS may not be pointing to this server');
      for (const r of failed) {
        logger.dim(`  ${r.domain} resolves to: ${r.ips.join(', ') || 'nothing'}`);
      }
      logger.dim(`  Server IP: ${serverIp}`);
      logger.dim('  (If you use a proxy/CDN like Cloudflare, disable proxying while issuing the cert)');

      const continueAnyway = await confirm({
        message: 'DNS might not be pointing here. Continue anyway?',
        default: false,
      });

      if (!continueAnyway) {
        logger.info('Update your DNS records and try again: deploykit ssl ' + domain);
        return false;
      }
    }
  }

  // ── Build Certbot command ──────────────────────────────────────
  const domainFlags = domainsToCheck.map((d) => `-d ${quote(d)}`).join(' ');
  const certbotCmd =
    `certbot --nginx --non-interactive --agree-tos --redirect ` +
    `--email ${quote(email)} ${domainFlags}`;

  // ── Run Certbot ────────────────────────────────────────────────
  const sslSpinner = logger.spinner('Obtaining SSL certificate...');
  try {
    shell.exec(certbotCmd);
    sslSpinner.succeed(`SSL certificate installed for ${domainsToCheck.join(', ')}`);
  } catch (err) {
    sslSpinner.fail('Failed to obtain SSL certificate');
    logger.dim(err.stderr?.toString().trim() || err.message);
    logger.info('Common issues:');
    logger.dim('  • Domain not pointing to this server');
    logger.dim('  • Port 80 not accessible (check firewall / cloud security group)');
    logger.dim('  • Rate limit reached (try again later)');
    return false;
  }

  // ── Verify auto-renewal ────────────────────────────────────────
  const renewSpinner = logger.spinner('Verifying auto-renewal...');
  const { success: renewOk } = shell.execSafe('certbot renew --dry-run');
  if (renewOk) {
    renewSpinner.succeed('Auto-renewal configured and verified');
  } else {
    renewSpinner.warn('Auto-renewal dry-run failed — check: systemctl status certbot.timer');
  }

  logger.success(`🔒 https://${domain} is now secured with SSL`);
  return true;
}

/**
 * Setup SSL for a specific domain (standalone command)
 * @param {string} [domainArg] - Domain from CLI argument
 */
export async function sslCommand(domainArg) {
  let domain = domainArg?.trim();

  if (domain && validator.isValidDomain(domain) !== true) {
    logger.error(`"${domain}" is not a valid domain name`);
    domain = undefined;
  }

  if (!domain) {
    domain = (
      await input({
        message: 'Enter domain to setup SSL for:',
        validate: validator.isValidDomain,
      })
    ).trim();
  }

  return await setupSsl(domain.toLowerCase());
}

export default { setupSsl, sslCommand };
