/**
 * DeployKit — Nginx Configuration Module
 * Generates and manages Nginx server blocks for deployed projects.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import inquirer from 'inquirer';
import logger from '../utils/logger.js';
import shell from '../utils/shell.js';
import validator from '../utils/validator.js';
import { NGINX_SITES_AVAILABLE, NGINX_SITES_ENABLED, PROJECT_TYPES } from '../utils/constants.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const TEMPLATES_DIR = join(__dirname, '..', 'templates');

/**
 * Configure Nginx for a deployed project.
 * @param {object} options
 * @param {string} options.projectName - App name
 * @param {string} options.projectPath - Absolute path to the project
 * @param {string} options.type - Project type
 * @param {number|null} options.port - App port (for reverse proxy)
 * @param {string|null} options.buildDir - Build output dir (for static/react)
 */
export async function setupNginx({ projectName, projectPath, type, port, buildDir }) {
  logger.step(6, 7, '🌐', 'Nginx Configuration');

  // ── Prompt for domain ──────────────────────────────────────────
  const { useDomain } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'useDomain',
      message: 'Do you have a domain name for this project?',
      default: true,
    },
  ]);

  let domain;
  let serverNames;
  if (useDomain) {
    const { domainInput } = await inquirer.prompt([
      {
        type: 'input',
        name: 'domainInput',
        message: 'Enter your domain name:',
        validate: validator.isValidDomain,
      },
    ]);
    domain = domainInput;
    
    // Check if user wants www subdomain configured in Nginx
    const { includeWww } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'includeWww',
        message: `Also configure www.${domain}?`,
        default: true,
      },
    ]);
    serverNames = includeWww ? `${domain} www.${domain}` : domain;
  } else {
    // Use server IP
    try {
      const ip = shell.exec('curl -s ifconfig.me');
      domain = ip;
      serverNames = ip;
      logger.info(`Using server IP: ${ip}`);
    } catch {
      domain = '_';
      serverNames = '_';
      logger.warn('Could not detect server IP — using catch-all');
    }
  }

  // ── Generate Nginx config ──────────────────────────────────────
  let config;
  if (type === PROJECT_TYPES.FULLSTACK) {
    const rootDir = buildDir ? `${projectPath}/${buildDir}` : projectPath;
    config = generateFullstackConfig(serverNames, port, rootDir);
    logger.info(`Frontend: ${rootDir}`);
    logger.info(`API: /api → localhost:${port}`);
  } else if (type === PROJECT_TYPES.STATIC || type === PROJECT_TYPES.REACT) {
    const rootDir = buildDir ? `${projectPath}/${buildDir}` : projectPath;
    config = generateStaticConfig(serverNames, rootDir);
    logger.info(`Serving static files from: ${rootDir}`);
  } else if (type === PROJECT_TYPES.NEXTJS) {
    config = generateNextjsConfig(serverNames, port);
  } else {
    config = generateNodeConfig(serverNames, port);
  }

  // ── Write config file ─────────────────────────────────────────
  const configFileName = useDomain ? domain : projectName;
  const configPath = `${NGINX_SITES_AVAILABLE}/${configFileName}`;

  const writeSpinner = logger.spinner('Writing Nginx configuration...');
  try {
    writeFileSync(configPath, config, 'utf-8');
    writeSpinner.succeed(`Config written to ${configPath}`);
  } catch (err) {
    writeSpinner.fail('Failed to write Nginx config');
    logger.dim(err.message);
    throw err;
  }

  // ── Create symlink to sites-enabled ────────────────────────────
  const enabledPath = `${NGINX_SITES_ENABLED}/${configFileName}`;
  shell.execSafe(`rm -f ${enabledPath}`); // Remove if exists
  shell.execSafe(`ln -s ${configPath} ${enabledPath}`);
  logger.success('Symlinked to sites-enabled');

  // ── Remove default config (optional) ───────────────────────────
  const defaultPath = `${NGINX_SITES_ENABLED}/default`;
  if (existsSync(defaultPath)) {
    const { removeDefault } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'removeDefault',
        message: 'Remove default Nginx config? (recommended)',
        default: true,
      },
    ]);
    if (removeDefault) {
      shell.execSafe(`rm -f ${defaultPath}`);
      logger.success('Default config removed');
    }
  }

  // ── Test and reload Nginx ──────────────────────────────────────
  const testSpinner = logger.spinner('Testing Nginx configuration...');
  const { success: testOk, error: testErr } = shell.execSafe('nginx -t');
  if (testOk) {
    testSpinner.succeed('Nginx config tested ✓');
  } else {
    testSpinner.fail('Nginx config test failed');
    logger.dim(testErr);
    logger.warn('Please check the config file and fix any errors');
    return { domain, configPath };
  }

  const reloadSpinner = logger.spinner('Reloading Nginx...');
  try {
    shell.exec('systemctl reload nginx');
    reloadSpinner.succeed('Nginx reloaded');
  } catch (err) {
    reloadSpinner.fail('Failed to reload Nginx');
    logger.dim(err.message);
  }

  // ── Ensure Nginx is enabled on boot ────────────────────────────
  shell.execSafe('systemctl enable nginx');

  logger.success(`Nginx configured: ${domain} → ${port ? `localhost:${port}` : 'static files'}`);

  return { domain, configPath };
}

/**
 * Generate Nginx config for Node.js reverse proxy
 */
function generateNodeConfig(domain, port) {
  const templatePath = join(TEMPLATES_DIR, 'nginx-node.conf');
  if (existsSync(templatePath)) {
    return readFileSync(templatePath, 'utf-8')
      .replace(/\{\{DOMAIN\}\}/g, domain)
      .replace(/\{\{PORT\}\}/g, String(port));
  }

  // Inline fallback
  return `server {
    listen 80;
    server_name ${domain};

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    location / {
        proxy_pass http://localhost:${port};
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 90s;
        proxy_connect_timeout 90s;
    }
}
`;
}

/**
 * Generate Nginx config for static/React sites
 */
function generateStaticConfig(domain, rootDir) {
  const templatePath = join(TEMPLATES_DIR, 'nginx-static.conf');
  if (existsSync(templatePath)) {
    return readFileSync(templatePath, 'utf-8')
      .replace(/\{\{DOMAIN\}\}/g, domain)
      .replace(/\{\{ROOT_DIR\}\}/g, rootDir);
  }

  return `server {
    listen 80;
    server_name ${domain};
    root ${rootDir};
    index index.html index.htm;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css text/javascript application/javascript application/json application/xml image/svg+xml;

    # Cache static assets
    location ~* \\.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # SPA fallback — serve index.html for all routes
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Deny access to hidden files
    location ~ /\\. {
        deny all;
    }
}
`;
}

/**
 * Generate Nginx config for Next.js apps
 */
function generateNextjsConfig(domain, port) {
  const templatePath = join(TEMPLATES_DIR, 'nginx-nextjs.conf');
  if (existsSync(templatePath)) {
    return readFileSync(templatePath, 'utf-8')
      .replace(/\{\{DOMAIN\}\}/g, domain)
      .replace(/\{\{PORT\}\}/g, String(port));
  }

  return `server {
    listen 80;
    server_name ${domain};

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # Cache Next.js static assets
    location /_next/static {
        proxy_pass http://localhost:${port};
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # Cache public assets
    location /static {
        proxy_pass http://localhost:${port};
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    location / {
        proxy_pass http://localhost:${port};
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
`;
}

/**
 * Generate Nginx config for fullstack apps (static frontend + API backend)
 */
function generateFullstackConfig(domain, port, rootDir) {
  const templatePath = join(TEMPLATES_DIR, 'nginx-fullstack.conf');
  if (existsSync(templatePath)) {
    return readFileSync(templatePath, 'utf-8')
      .replace(/\{\{DOMAIN\}\}/g, domain)
      .replace(/\{\{PORT\}\}/g, String(port))
      .replace(/\{\{ROOT_DIR\}\}/g, rootDir);
  }

  return `server {
    listen 80;
    server_name ${domain};

    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;

    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css text/javascript application/javascript application/json application/xml image/svg+xml;

    location /api {
        proxy_pass http://localhost:${port};
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    location ~* \\.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        root ${rootDir};
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    location / {
        root ${rootDir};
        index index.html;
        try_files $uri $uri/ /index.html;
    }

    location ~ /\\. {
        deny all;
    }
}
`;
}

export default { setupNginx };
