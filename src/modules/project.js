/**
 * DeployKit — Project Detection Module
 * Detects project type, entry points, and prompts for port configuration.
 * Supports single-type and fullstack (client/ + server/) projects.
 */

import { existsSync, readFileSync } from 'fs';
import { confirm, input, select } from '@inquirer/prompts';
import logger from '../utils/logger.js';
import shell from '../utils/shell.js';
import validator from '../utils/validator.js';
import { installDependencies } from './git.js';
import { PROJECT_TYPES, DEFAULT_PORT } from '../utils/constants.js';

const SERVER_FRAMEWORKS = [
  'express',
  'fastify',
  'koa',
  'hapi',
  '@hapi/hapi',
  'hono',
  '@hono/node-server',
  '@nestjs/core',
  'restify',
];

const PROJECT_TYPE_CHOICES = [
  { name: 'Node.js / Express API', value: PROJECT_TYPES.EXPRESS },
  { name: 'React / Vite SPA (pre-built dist/build folder)', value: PROJECT_TYPES.REACT },
  { name: 'Next.js', value: PROJECT_TYPES.NEXTJS },
  { name: 'Fullstack (client + server folders)', value: PROJECT_TYPES.FULLSTACK },
  { name: 'Static website (HTML/CSS/JS)', value: PROJECT_TYPES.STATIC },
];

/**
 * Detect project type and gather configuration.
 * @param {string} projectPath - Absolute path to the project directory
 * @returns {Promise<object>} Project configuration
 */
export async function detectProject(projectPath) {
  logger.step(4, 7, '🔍', 'Project Detection');

  // ── Check for fullstack structure first ────────────────────────
  const hasClient = existsSync(`${projectPath}/client`) || existsSync(`${projectPath}/frontend`);
  const hasServer = existsSync(`${projectPath}/server`) || existsSync(`${projectPath}/backend`);

  if (hasClient && hasServer) {
    return await detectFullstack(projectPath);
  }

  // ── Single project type detection ──────────────────────────────
  return await detectSingleProject(projectPath);
}

/**
 * Build the project on the server when required (currently Next.js).
 * React/Vite apps are expected to be pre-built (low-RAM servers).
 * @param {string} projectPath
 * @param {object} config - Result of detectProject
 * @returns {Promise<boolean>} true if no build was needed or the build succeeded
 */
export async function buildProject(projectPath, config) {
  if (config.type !== PROJECT_TYPES.NEXTJS) return true;

  const buildSpinner = logger.spinner('Building Next.js app (this can take a few minutes)...');
  try {
    shell.exec('npm run build', {
      cwd: projectPath,
      env: { NODE_ENV: 'production', NEXT_TELEMETRY_DISABLED: '1' },
    });
    buildSpinner.succeed('Next.js build complete');
    return true;
  } catch (err) {
    buildSpinner.fail('Next.js build failed');
    logger.dim(lastLines(err.stdout?.toString() || err.stderr?.toString() || err.message, 20));
    logger.info('On 512MB servers, ensure swap is enabled (deploykit init configures it)');
    return false;
  }
}

/**
 * Detect and configure a fullstack project (client + server)
 */
async function detectFullstack(projectPath) {
  const clientDir = existsSync(`${projectPath}/client`) ? 'client' : 'frontend';
  const serverDir = existsSync(`${projectPath}/server`) ? 'server' : 'backend';

  logger.success(`Detected: Fullstack project`);
  logger.success(`Client: ${clientDir}/`);
  logger.success(`Server: ${serverDir}/`);

  const clientPath = `${projectPath}/${clientDir}`;
  const serverPath = `${projectPath}/${serverDir}`;

  // ── Detect client build directory ──────────────────────────────
  let buildDir = null;
  if (existsSync(`${clientPath}/dist`)) buildDir = `${clientDir}/dist`;
  else if (existsSync(`${clientPath}/build`)) buildDir = `${clientDir}/build`;

  if (buildDir) {
    logger.success(`Client build dir: ${buildDir}`);
  } else {
    logger.warn(`No dist/ or build/ folder found in ${clientDir}/`);
    buildDir = await input({
      message: `Where is the client build output? (relative to project root):`,
      default: `${clientDir}/dist`,
      validate: validator.isValidRelativePath,
    });
  }

  // ── Detect server entry point ──────────────────────────────────
  const serverPkg = readPackageJson(serverPath);
  const entryPoint = detectEntryPoint(serverPkg, serverPath);
  logger.success(`Server entry point: ${entryPoint}`);

  // ── Extract server port from .env ──────────────────────────────
  const envPort = readPortFromEnv([`${serverPath}/.env`, `${projectPath}/.env`], ['PORT', 'API_PORT']);
  const port = envPort ?? DEFAULT_PORT;
  logger.success(`Server port: ${port} ${envPort ? '(from .env)' : '(default)'}`);

  // ── Install server dependencies ────────────────────────────────
  if (serverPkg) {
    await installDependencies(serverPath);
  }

  // ── Show summary ───────────────────────────────────────────────
  const config = {
    type: PROJECT_TYPES.FULLSTACK,
    entryPoint,
    port,
    buildDir,
    clientDir,
    serverDir,
  };

  logger.newline();
  logger.table(
    ['Setting', 'Value'],
    [
      ['Project Type', 'fullstack (client + server)'],
      ['Client Build', buildDir],
      ['Server Entry', `${serverDir}/${entryPoint}`],
      ['Server Port', String(port)],
    ]
  );

  const confirmed = await confirm({ message: 'Does this look correct?', default: true });
  if (!confirmed) {
    return await manualConfig(projectPath);
  }

  return config;
}

/**
 * Detect a single-type project (Express, React, Next.js, static)
 */
async function detectSingleProject(projectPath) {
  let projectType = PROJECT_TYPES.UNKNOWN;
  let entryPoint = null;
  let buildDir = null;

  const pkg = readPackageJson(projectPath);
  if (existsSync(`${projectPath}/package.json`) && !pkg) {
    logger.warn('Could not parse package.json');
  }

  if (pkg) {
    projectType = detectType(pkg, projectPath);
  } else if (existsSync(`${projectPath}/index.html`)) {
    projectType = PROJECT_TYPES.STATIC;
  }

  switch (projectType) {
    case PROJECT_TYPES.EXPRESS: {
      entryPoint = detectEntryPoint(pkg, projectPath);
      logger.success(`Detected: Node.js/Express API`);
      logger.success(`Entry point: ${entryPoint}`);
      break;
    }
    case PROJECT_TYPES.REACT: {
      buildDir = detectBuildDir(projectPath);
      logger.success(`Detected: React/Vite SPA (pre-built static)`);
      if (buildDir) {
        logger.success(`Build directory: ${buildDir}`);
      } else {
        logger.warn('No dist/ or build/ folder found — make sure to push your compiled build');
      }
      break;
    }
    case PROJECT_TYPES.NEXTJS: {
      entryPoint = 'npm start';
      logger.success(`Detected: Next.js application`);
      break;
    }
    case PROJECT_TYPES.STATIC: {
      logger.success(`Detected: Static site`);
      break;
    }
    default: {
      logger.warn('Could not auto-detect project type');
      const chosenType = await select({
        message: 'Select your project type:',
        choices: PROJECT_TYPE_CHOICES,
      });
      projectType = chosenType;

      if (chosenType === PROJECT_TYPES.EXPRESS) {
        entryPoint = detectEntryPoint(pkg, projectPath);
      } else if (chosenType === PROJECT_TYPES.REACT) {
        buildDir = detectBuildDir(projectPath);
      } else if (chosenType === PROJECT_TYPES.NEXTJS) {
        entryPoint = 'npm start';
      } else if (chosenType === PROJECT_TYPES.FULLSTACK) {
        return await detectFullstack(projectPath);
      }
    }
  }

  // ── Extract port from .env (Node.js and Next.js apps) ─────────────────
  let port = null;
  if (projectType === PROJECT_TYPES.EXPRESS || projectType === PROJECT_TYPES.NEXTJS) {
    const envPort = readPortFromEnv([`${projectPath}/.env`], ['PORT', 'APP_PORT']);
    port = envPort ?? DEFAULT_PORT;
    logger.success(`App port: ${port} ${envPort ? '(from .env)' : '(default)'}`);
  }

  const config = { type: projectType, entryPoint, port, buildDir };

  logger.newline();
  logger.table(
    ['Setting', 'Value'],
    [
      ['Project Type', projectType],
      ['Entry Point', entryPoint || 'N/A (static)'],
      ['Port', port ? String(port) : 'N/A (static)'],
      ['Build Dir', buildDir || 'N/A'],
    ]
  );

  const confirmed = await confirm({ message: 'Does this look correct?', default: true });
  if (!confirmed) {
    return await manualConfig(projectPath);
  }

  return config;
}

/**
 * Determine the project type from package.json.
 * @param {object} pkg - Parsed package.json
 * @param {string} projectPath
 * @returns {string} One of PROJECT_TYPES
 */
export function detectType(pkg, projectPath) {
  const deps = { ...pkg?.dependencies, ...pkg?.devDependencies };
  const hasServerFramework = SERVER_FRAMEWORKS.some((name) => deps[name]);

  if (deps['next']) return PROJECT_TYPES.NEXTJS;

  if (deps['react'] && (deps['react-scripts'] || deps['vite'] || deps['@vitejs/plugin-react'])) {
    return PROJECT_TYPES.REACT;
  }

  if (hasServerFramework) return PROJECT_TYPES.EXPRESS;

  // Vite SPA in any framework (Vue, Svelte, Solid...) with no server
  if (deps['vite']) return PROJECT_TYPES.REACT;

  if (pkg?.scripts?.start || pkg?.main) return PROJECT_TYPES.EXPRESS;
  if (existsSync(`${projectPath}/index.html`)) return PROJECT_TYPES.STATIC;

  return PROJECT_TYPES.UNKNOWN;
}

/**
 * Find the Node.js entry point for a project.
 * @param {object|null} pkg
 * @param {string} projectPath
 * @returns {string}
 */
export function detectEntryPoint(pkg, projectPath) {
  if (pkg?.main && existsSync(`${projectPath}/${pkg.main}`)) return pkg.main;

  // "start": "node dist/server.js" → dist/server.js
  const startMatch = pkg?.scripts?.start?.match(/^node\s+(?:--\S+\s+)*([^\s&|;]+\.(?:c|m)?js)\b/);
  if (startMatch && existsSync(`${projectPath}/${startMatch[1]}`)) return startMatch[1];

  const candidates = [
    'server.js',
    'index.js',
    'app.js',
    'main.js',
    'src/server.js',
    'src/index.js',
    'src/app.js',
    'dist/server.js',
    'dist/index.js',
    'dist/main.js',
    'server.mjs',
    'index.mjs',
  ];
  for (const file of candidates) {
    if (existsSync(`${projectPath}/${file}`)) return file;
  }
  return 'index.js';
}

/**
 * Find the static build output directory.
 * @param {string} projectPath
 * @returns {string|null}
 */
export function detectBuildDir(projectPath) {
  if (existsSync(`${projectPath}/dist`)) return 'dist';
  if (existsSync(`${projectPath}/build`)) return 'build';
  if (existsSync(`${projectPath}/public`)) return 'public';
  return null;
}

/**
 * Read a port number from the first .env file that defines one.
 * Handles `PORT=3000`, `PORT = "3000"`, `export PORT=3000`, and inline comments.
 * @param {string[]} envPaths - Candidate .env files, in priority order
 * @param {string[]} keys - Variable names to look for, in priority order
 * @returns {number|null}
 */
export function readPortFromEnv(envPaths, keys = ['PORT']) {
  for (const envPath of envPaths) {
    if (!existsSync(envPath)) continue;
    let content;
    try {
      content = readFileSync(envPath, 'utf-8');
    } catch {
      continue;
    }
    for (const key of keys) {
      const re = new RegExp(`^\\s*(?:export\\s+)?${key}\\s*=\\s*["']?(\\d{2,5})["']?\\s*(?:#.*)?$`, 'm');
      const match = content.match(re);
      if (match && validator.isValidPort(match[1]) === true) {
        return parseInt(match[1], 10);
      }
    }
  }
  return null;
}

/**
 * Read and parse package.json in a directory.
 * @param {string} dir
 * @returns {object|null}
 */
function readPackageJson(dir) {
  const pkgPath = `${dir}/package.json`;
  if (!existsSync(pkgPath)) return null;
  try {
    return JSON.parse(readFileSync(pkgPath, 'utf-8'));
  } catch {
    return null;
  }
}

function lastLines(text, n) {
  return String(text).trim().split('\n').slice(-n).join('\n');
}

async function manualConfig(projectPath) {
  const type = await select({
    message: 'Select your project type:',
    choices: PROJECT_TYPE_CHOICES,
  });

  if (type === PROJECT_TYPES.FULLSTACK) {
    return await detectFullstack(projectPath);
  }

  let entryPoint = null;
  let buildDir = null;
  let port = null;

  if (type === PROJECT_TYPES.EXPRESS) {
    entryPoint = await input({
      message: 'Entry point file (e.g., server.js):',
      default: detectEntryPoint(readPackageJson(projectPath), projectPath),
      validate: validator.isValidRelativePath,
    });
  } else if (type === PROJECT_TYPES.REACT) {
    buildDir = await input({
      message: 'Build output directory (e.g., dist, build):',
      default: detectBuildDir(projectPath) || 'dist',
      validate: validator.isValidRelativePath,
    });
  } else if (type === PROJECT_TYPES.NEXTJS) {
    entryPoint = 'npm start';
  }

  if (type === PROJECT_TYPES.EXPRESS || type === PROJECT_TYPES.NEXTJS) {
    const envPort = readPortFromEnv([`${projectPath}/.env`], ['PORT', 'APP_PORT']);
    port = parseInt(
      await input({
        message: 'App port:',
        default: String(envPort ?? DEFAULT_PORT),
        validate: validator.isValidPort,
      }),
      10
    );
  }

  return { type, entryPoint, port, buildDir };
}

export default { detectProject, buildProject };
