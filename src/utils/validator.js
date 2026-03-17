/**
 * DeployKit — Input Validators
 * Validation functions for user inputs — Git URLs, domains, ports, emails.
 */

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
    const httpsPattern = /^https:\/\/.+\/.+\.git$/;
    const sshPattern = /^git@.+:.+\/.+\.git$/;
    const httpsNoGit = /^https:\/\/(github|gitlab|bitbucket)\.(com|org)\/.+\/.+$/;

    if (httpsPattern.test(url) || sshPattern.test(url) || httpsNoGit.test(url)) {
      return true;
    }
    return 'Invalid Git URL. Use format: https://github.com/user/repo.git or git@github.com:user/repo.git';
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
    const pattern = /^([a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;
    if (pattern.test(domain)) {
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
    const num = parseInt(port, 10);
    if (isNaN(num)) {
      return 'Port must be a number';
    }
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
    const pattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (pattern.test(email)) {
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
   * Non-empty validation (for required fields).
   * @param {string} value
   * @returns {boolean|string}
   */
  isNotEmpty(value) {
    if (!value || value.trim().length === 0) {
      return 'This field is required';
    }
    return true;
  },
};

export default validator;
