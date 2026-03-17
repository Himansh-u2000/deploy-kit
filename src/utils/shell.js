/**
 * DeployKit — Shell Command Executor
 * Execute shell commands with streaming output, error handling, and safety checks.
 */

import { execSync, spawn } from 'child_process';
import logger from './logger.js';

const shell = {
  /**
   * Execute a shell command synchronously and return trimmed stdout.
   * Throws on non-zero exit code.
   * @param {string} cmd - Command to execute
   * @param {object} opts - Options
   * @param {boolean} opts.silent - Suppress output (default: true)
   * @returns {string} stdout
   */
  exec(cmd, { silent = true } = {}) {
    return execSync(cmd, {
      encoding: 'utf-8',
      stdio: silent ? 'pipe' : 'inherit',
    }).trim();
  },

  /**
   * Execute a command and stream output in real-time.
   * Returns a promise that resolves on exit code 0 and rejects otherwise.
   * @param {string} cmd - Command to execute
   * @param {string[]} args - Command arguments
   * @returns {Promise<void>}
   */
  execLive(cmd, args = []) {
    return new Promise((resolve, reject) => {
      const child = spawn(cmd, args, {
        stdio: 'inherit',
        shell: true,
      });

      child.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Command "${cmd}" exited with code ${code}`));
        }
      });

      child.on('error', (err) => {
        reject(err);
      });
    });
  },

  /**
   * Execute a command safely — never throws, returns result object.
   * @param {string} cmd - Command to execute
   * @returns {{ success: boolean, output: string, error: string }}
   */
  execSafe(cmd) {
    try {
      const output = execSync(cmd, { encoding: 'utf-8', stdio: 'pipe' }).trim();
      return { success: true, output, error: '' };
    } catch (err) {
      return {
        success: false,
        output: '',
        error: err.stderr?.trim() || err.message,
      };
    }
  },

  /**
   * Check if a binary/package is installed and available in PATH.
   * @param {string} binary - Binary name (e.g., 'nginx', 'node', 'pm2')
   * @returns {boolean}
   */
  isInstalled(binary) {
    try {
      execSync(`which ${binary}`, { encoding: 'utf-8', stdio: 'pipe' });
      return true;
    } catch {
      return false;
    }
  },

  /**
   * Get the version string of an installed binary.
   * @param {string} binary - Binary name
   * @param {string} flag - Version flag (default: '--version')
   * @returns {string|null} Version string or null if not installed
   */
  getVersion(binary, flag = '--version') {
    try {
      const output = execSync(`${binary} ${flag}`, { encoding: 'utf-8', stdio: 'pipe' }).trim();
      // Extract version number pattern from output
      const match = output.match(/(\d+\.\d+\.\d+)/);
      return match ? match[1] : output.split('\n')[0];
    } catch {
      return null;
    }
  },

  /**
   * Check if the current user is root or has sudo privileges.
   * @returns {boolean}
   */
  isRoot() {
    try {
      const uid = execSync('id -u', { encoding: 'utf-8', stdio: 'pipe' }).trim();
      return uid === '0';
    } catch {
      return false;
    }
  },
};

export default shell;
