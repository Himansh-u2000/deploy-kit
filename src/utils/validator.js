/**
 * DeployKit — Input Validators
 * Validation functions for user inputs — Git URLs, domains, ports, emails.
 */

// Characters that have special meaning to the shell. User input containing
// these is rejected up-front (values are also quoted when used in commands).
const SHELL_META = /[\s;&|`$<>(){}[\]\\'"!*?#~]/;

const validator = {
  /**
   * Validate a Git repository URL (HTTPS or SSH).
   * Supports GitHub, GitLab, Bitbucket, and custom Git URLs.
   * @param {string} url
   * @returns {boolean|string} true if valid, error message if invalid
   */
  isValidGitUrl(url) {
    if (!url || typeof url !== 'string') {
      return 'Please enter a Git repository URL';
    }
    const value = url.trim();
    if (SHELL_META.test(value)) {
      return 'Git URL contains invalid characters';
    }
    const httpsPattern = /^https:\/\/[^/]+\/.+\.git$/;
    const sshPattern = /^(ssh:\/\/)?[\w.-]+@[\w.-]+[:/].+\/.+\.git$/;
    const httpsNoGit = /^https:\/\/(github\.com|gitlab\.com|bitbucket\.org)\/[^/]+\/[^/]+\/?$/;

    if (httpsPattern.test(value) || sshPattern.test(value) || httpsNoGit.test(value)) {
      return true;
    }
    return 'Invalid Git URL. Use format: https://github.com/user/repo.git or git@github.com:user/repo.git';
  },

  /**
   * Validate a Git branch name (subset of git check-ref-format rules).
   * @param {string} branch
   * @returns {boolean|string}
   */
  isValidBranch(branch) {
    if (!branch || typeof branch !== 'string' || !branch.trim()) {
      return 'Please enter a branch name';
    }
    const value = branch.trim();
    if (
      SHELL_META.test(value) ||
      value.startsWith('-') ||
      value.startsWith('/') ||
      value.endsWith('/') ||
      value.endsWith('.lock') ||
      value.includes('..') ||
      value.includes('//') ||
      value.includes('@{') ||
      // eslint-disable-next-line no-control-regex -- rejecting control chars is the point
      /[\x00-\x1f\x7f^:]/.test(value)
    ) {
      return 'Invalid branch name';
    }
    return true;
  },

  /**
   * Validate a domain name.
   * @param {string} domain
   * @returns {boolean|string} true if valid, error message if invalid
   */
  isValidDomain(domain) {
    if (!domain || typeof domain !== 'string') {
      return 'Please enter a domain name';
    }
    const value = domain.trim();
    const pattern = /^([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,63}$/;
    if (value.length <= 253 && pattern.test(value)) {
      return true;
    }
    return 'Invalid domain name. Example: example.com or app.example.com';
  },

  /**
   * Validate a port number (1024–65535 for non-privileged ports).
   * @param {string|number} port
   * @returns {boolean|string} true if valid, error message if invalid
   */
  isValidPort(port) {
    if (!/^\d+$/.test(String(port).trim())) {
      return 'Port must be a number';
    }
    const num = parseInt(port, 10);
    if (num < 1024 || num > 65535) {
      return 'Port must be between 1024 and 65535';
    }
    return true;
  },

  /**
   * Validate an email address (for SSL/Certbot registration).
   * @param {string} email
   * @returns {boolean|string} true if valid, error message if invalid
   */
  isValidEmail(email) {
    if (!email || typeof email !== 'string') {
      return 'Please enter an email address';
    }
    const pattern = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/;
    if (pattern.test(email.trim())) {
      return true;
    }
    return 'Invalid email address';
  },

  /**
   * Validate a project/app name (alphanumeric, hyphens, underscores).
   * @param {string} name
   * @returns {boolean|string} true if valid, error message if invalid
   */
  isValidAppName(name) {
    if (!name || typeof name !== 'string') {
      return 'Please enter an app name';
    }
    const pattern = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/;
    if (pattern.test(name) && name.length >= 2 && name.length <= 50) {
      return true;
    }
    return 'App name must be 2-50 characters, alphanumeric, hyphens, or underscores';
  },

  /**
   * Validate a relative path inside the project (e.g. a build dir).
   * @param {string} value
   * @returns {boolean|string}
   */
  isValidRelativePath(value) {
    if (!value || typeof value !== 'string' || !value.trim()) {
      return 'Please enter a path';
    }
    const v = value.trim();
    if (v.startsWith('/') || v.split('/').includes('..') || SHELL_META.test(v)) {
      return 'Path must be relative to the project and contain no special characters';
    }
    return true;
  },

  /**
   * Non-empty validation (for required fields).
   * @param {string} value
   * @returns {boolean|string}
   */
  isNotEmpty(value) {
    if (value == null || String(value).trim().length === 0) {
      return 'This field is required';
    }
    return true;
  },
};

export default validator;
