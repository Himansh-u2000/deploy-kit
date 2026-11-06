#!/usr/bin/env node

/**
 * DeployKit CLI
 * One-command VPS deployment tool.
 *
 * Usage:
 *   deploykit init              Full interactive setup
 *   deploykit deploy            Deploy / redeploy a project
 *   deploykit status            Server & app status dashboard
 *   deploykit logs [app]        View PM2 logs
 *   deploykit nginx             Manage Nginx configs
 *   deploykit ssl [domain]      Setup SSL certificate
 *   deploykit rollback [app]    Rollback to previous deployment
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf-8'));

// ── Node.js version guard ────────────────────────────────────────
// Checked before importing dependencies so users on an old Node get a
// clear message instead of a cryptic syntax/import error.
const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 22 || (major === 22 && minor < 12)) {
  console.error(
    `\n  ✖ DeployKit v${pkg.version} requires Node.js >= 22.12 (you have v${process.versions.node}).\n` +
      '    Node.js 18 and 20 are end-of-life. Upgrade with:\n\n' +
      '    curl -fsSL https://deb.nodesource.com/setup_24.x | sudo bash -\n' +
      '    sudo apt-get install -y nodejs\n'
  );
  process.exit(1);
}

const { Command } = await import('commander');

const program = new Command();

program
  .name('deploykit')
  .description('🚀 One-command VPS deployment tool — setup, deploy, and manage Node.js apps on Ubuntu servers')
  .version(pkg.version, '-v, --version');

// ── deploykit init ───────────────────────────────────────────────
program
  .command('init')
  .description('Full interactive first-time server setup and project deployment')
  .action(async () => {
    const { initCommand } = await import('../src/commands/init.js');
    await initCommand();
  });

// ── deploykit deploy ─────────────────────────────────────────────
program
  .command('deploy')
  .description('Deploy a new project or redeploy an existing one')
  .action(async () => {
    const { deployCommand } = await import('../src/commands/deploy.js');
    await deployCommand();
  });

// ── deploykit status ─────────────────────────────────────────────
program
  .command('status')
  .description('Show server stats, PM2 processes, Nginx, and SSL status')
  .action(async () => {
    const { statusCommand } = await import('../src/commands/status.js');
    await statusCommand();
  });

// ── deploykit logs ───────────────────────────────────────────────
program
  .command('logs [app]')
  .description('Stream PM2 logs for an app (or all apps)')
  .action(async (app) => {
    const { logsCommand } = await import('../src/commands/logs.js');
    await logsCommand(app);
  });

// ── deploykit nginx ──────────────────────────────────────────────
program
  .command('nginx')
  .description('Manage Nginx configurations interactively')
  .action(async () => {
    const { nginxCommand } = await import('../src/commands/nginx.js');
    await nginxCommand();
  });

// ── deploykit ssl ────────────────────────────────────────────────
program
  .command('ssl [domain]')
  .description('Setup or manage SSL certificates via Let\'s Encrypt')
  .action(async (domain) => {
    const { sslCommand } = await import('../src/commands/ssl.js');
    await sslCommand(domain);
  });

// ── deploykit rollback ───────────────────────────────────────────
program
  .command('rollback [app]')
  .description('Rollback to a previous deployment backup')
  .action(async (app) => {
    const { rollbackCommand } = await import('../src/commands/rollback.js');
    await rollbackCommand(app);
  });

// ── Graceful exit on Ctrl+C ──────────────────────────────────────
process.on('SIGINT', () => {
  console.log('\n  Cancelled.');
  process.exit(130);
});

// ── Parse and run ────────────────────────────────────────────────
// Show help if no command is provided
if (!process.argv.slice(2).length) {
  program.outputHelp();
  process.exit(0);
}

try {
  await program.parseAsync(process.argv);
} catch (err) {
  // @inquirer/prompts throws ExitPromptError when the user presses Ctrl+C
  if (err?.name === 'ExitPromptError' || err?.name === 'AbortPromptError') {
    console.log('\n  Cancelled.');
    process.exit(130);
  }
  console.error(`\n  ✖ ${err?.message || err}`);
  if (process.env.DEBUG) console.error(err);
  process.exit(1);
}
