/**
 * DeployKit — Shell Command Executor
 * Execute shell commands with streaming output, error handling, and safety checks.
 */

import { execSync, spawn } from 'child_process';

/**
 * Quote a value for safe interpolation into a POSIX shell command.
 * Wraps in single quotes and escapes embedded single quotes.
 * @param {string|number} value
 * @returns {string}
 */
export function quote(value) {
  const str = String(value);
  if (str === '') return "''";
  if (/^[A-Za-z0-9_@%+=:,./-]+$/.test(str)) return str;
  return `'${str.replace(/'/g, `'\\''`)}'`;
}

const shell = {
  quote,

  /**
   * Execute a shell command synchronously and return trimmed stdout.
   * Throws on non-zero exit code.
   * @param {string} cmd - Command to execute
   * @param {object} opts - Options
   * @param {boolean} opts.silent - Suppress output (default: true)
   * @param {string} opts.cwd - Working directory
   * @param {object} opts.env - Extra environment variables
   * @returns {string} stdout
   */
  exec(cmd, { silent = true, cwd, env } = {}) {
    return (
      execSync(cmd, {
        encoding: 'utf-8',
        stdio: silent ? 'pipe' : 'inherit',
        cwd,
        env: env ? { ...process.env, ...env } : process.env,
        maxBuffer: 64 * 1024 * 1024,
      }) ?? ''
    ).trim();
  },

  /**
   * Execute a command and stream output in real-time.
   * Returns a promise that resolves on exit code 0 and rejects otherwise.
   * @param {string} cmd - Command to execute
   * @param {string[]} args - Command arguments (quoted automatically)
   * @returns {Promise<void>}
   */
  execLive(cmd, args = []) {
    return new Promise((resolve, reject) => {
      const command = [cmd, ...args.map(quote)].join(' ');
      const child = spawn(command, {
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
   * On failure, `output` still contains whatever was written to stdout
   * (important for commands like `nginx -t 2>&1`).
   * @param {string} cmd - Command to execute
   * @param {object} opts - Same options as exec (cwd, env)
   * @returns {{ success: boolean, output: string, error: string }}
   */
  execSafe(cmd, { cwd, env } = {}) {
    try {
      const output = shell.exec(cmd, { cwd, env });
      return { success: true, output, error: '' };
    } catch (err) {
      const stdout = err.stdout?.toString().trim() || '';
      const stderr = err.stderr?.toString().trim() || '';
      return {
        success: false,
        output: stdout,
        error: stderr || stdout || err.message,
      };
    }
  },

  /**
   * Check if a binary/package is installed and available in PATH.
   * @param {string} binary - Binary name (e.g., 'nginx', 'node', 'pm2')
   * @returns {boolean}
   */
  isInstalled(binary) {
    return shell.execSafe(`command -v ${quote(binary)}`).success;
  },

  /**
   * Get the version string of an installed binary.
   * @param {string} binary - Binary name
   * @param {string} flag - Version flag (default: '--version')
   * @returns {string|null} Version string or null if not installed
   */
  getVersion(binary, flag = '--version') {
    // Some tools (e.g. nginx -v) print their version to stderr
    const { success, output, error } = shell.execSafe(`${quote(binary)} ${flag} 2>&1`);
    if (!success) return null;
    const text = output || error;
    const match = text.match(/(\d+\.\d+\.\d+)/);
    return match ? match[1] : text.split('\n')[0] || null;
  },

  /**
   * Check if the current process is running as root.
   * @returns {boolean}
   */
  isRoot() {
    if (typeof process.getuid === 'function') return process.getuid() === 0;
    return shell.execSafe('id -u').output === '0';
  },

  /**
   * Detect the server's public IPv4 address.
   * Forces IPv4 so it can be compared to DNS A records, and uses a timeout
   * so a blocked outbound request can't hang the CLI forever.
   * @returns {string|null}
   */
  getPublicIp() {
    const services = ['https://ifconfig.me', 'https://api.ipify.org', 'https://icanhazip.com'];
    for (const url of services) {
      const { success, output } = shell.execSafe(`curl -4 -fsS --max-time 5 ${url}`);
      const ip = output.trim();
      if (success && /^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) return ip;
    }
    return null;
  },

  /**
   * Resolve a hostname to its IPv4 addresses (follows CNAMEs).
   * Uses getent, which is always present on Ubuntu (unlike dig).
   * @param {string} host
   * @returns {string[]}
   */
  resolveIpv4(host) {
    const { success, output } = shell.execSafe(`getent ahostsv4 ${quote(host)}`);
    if (!success || !output) return [];
    return [...new Set(output.split('\n').map((l) => l.trim().split(/\s+/)[0]).filter(Boolean))];
  },
};

export default shell;
