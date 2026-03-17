/**
 * DeployKit — Logger
 * Beautiful, consistent terminal output with colors, spinners, and boxes.
 */

import chalk from 'chalk';
import ora from 'ora';
import boxen from 'boxen';
import Table from 'cli-table3';
import { VERSION, NAME } from './constants.js';

// ── Color Palette ────────────────────────────────────────────────
const colors = {
  primary: chalk.hex('#6C63FF'),    // Purple
  success: chalk.hex('#00D68F'),    // Green
  warning: chalk.hex('#FFAA00'),    // Amber
  error: chalk.hex('#FF3D71'),      // Red
  info: chalk.hex('#00B4D8'),       // Cyan
  dim: chalk.gray,
  bold: chalk.bold,
  white: chalk.white,
};

// ── ASCII Banner ─────────────────────────────────────────────────
const BANNER = `
  ____             _             _  ___ _   
 |  _ \\  ___ _ __ | | ___  _   _| |/ (_) |_ 
 | | | |/ _ \\ '_ \\| |/ _ \\| | | | ' /| | __|
 | |_| |  __/ |_) | | (_) | |_| | . \\| | |_ 
 |____/ \\___| .__/|_|\\___/ \\__, |_|\\_\\_|\\__|
            |_|            |___/             
`;

const logger = {
  /**
   * Print the welcome banner
   */
  banner() {
    console.log(colors.primary(BANNER));
    console.log(
      boxen(
        `${colors.bold.white(`${NAME} v${VERSION}`)}\n${colors.dim('One-command VPS deployment tool')}`,
        {
          padding: { top: 0, bottom: 0, left: 2, right: 2 },
          margin: { top: 0, bottom: 1, left: 2, right: 0 },
          borderStyle: 'double',
          borderColor: '#6C63FF',
          textAlignment: 'center',
        }
      )
    );
  },

  /**
   * Print a step progress indicator
   * @param {number} current - Current step number
   * @param {number} total - Total number of steps
   * @param {string} emoji - Emoji for the step
   * @param {string} message - Step description
   */
  step(current, total, emoji, message) {
    console.log(`\n${colors.primary(`[${current}/${total}]`)} ${emoji} ${colors.bold.white(message)}`);
    console.log(colors.dim('─'.repeat(50)));
  },

  /**
   * Success message with checkmark
   */
  success(message) {
    console.log(`  ${colors.success('✔')} ${message}`);
  },

  /**
   * Error message with cross
   */
  error(message) {
    console.log(`  ${colors.error('✖')} ${message}`);
  },

  /**
   * Warning message
   */
  warn(message) {
    console.log(`  ${colors.warning('⚠')} ${message}`);
  },

  /**
   * Info message
   */
  info(message) {
    console.log(`  ${colors.info('ℹ')} ${message}`);
  },

  /**
   * Dimmed/muted message
   */
  dim(message) {
    console.log(`  ${colors.dim(message)}`);
  },

  /**
   * Create and return an ora spinner
   * @param {string} message - Spinner text
   * @returns {object} Ora spinner instance
   */
  spinner(message) {
    return ora({
      text: message,
      indent: 2,
      color: 'cyan',
      spinner: 'dots',
    }).start();
  },

  /**
   * Print a formatted table
   * @param {string[]} headers - Column headers
   * @param {string[][]} rows - Table rows
   */
  table(headers, rows) {
    const table = new Table({
      head: headers.map((h) => colors.primary(h)),
      style: { head: [], border: ['gray'], compact: true },
      chars: {
        top: '─', 'top-mid': '┬', 'top-left': '┌', 'top-right': '┐',
        bottom: '─', 'bottom-mid': '┴', 'bottom-left': '└', 'bottom-right': '┘',
        left: '│', 'left-mid': '├', mid: '─', 'mid-mid': '┼',
        right: '│', 'right-mid': '┤', middle: '│',
      },
    });
    rows.forEach((row) => table.push(row));
    console.log(table.toString());
  },

  /**
   * Print a boxed summary
   * @param {string} title - Box title
   * @param {string} content - Box content
   * @param {'success'|'error'|'info'} type - Box type for coloring
   */
  box(title, content, type = 'success') {
    const borderColor = type === 'success' ? '#00D68F' : type === 'error' ? '#FF3D71' : '#00B4D8';
    console.log(
      boxen(`${colors.bold.white(title)}\n\n${content}`, {
        padding: 1,
        margin: { top: 1, bottom: 1, left: 2, right: 0 },
        borderStyle: 'double',
        borderColor,
      })
    );
  },

  /**
   * Print a blank line
   */
  newline() {
    console.log();
  },

  /**
   * Direct access to color functions
   */
  colors,
};

export default logger;
