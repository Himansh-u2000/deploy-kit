/**
 * DeployKit — Project Detection Module
 * Detects project type, entry points, and prompts for port configuration.
 */

import { existsSync, readFileSync } from 'fs';
import inquirer from 'inquirer';
import logger from '../utils/logger.js';
import validator from '../utils/validator.js';
import { PROJECT_TYPES, DEFAULT_PORT } from '../utils/constants.js';

/**
 * Detect project type and gather configuration.
 * @param {string} projectPath - Absolute path to the project directory
 * @returns {Promise<{ type: string, entryPoint: string|null, port: number|null, buildDir: string|null }>}
 */
export async function detectProject(projectPath) {
  logger.step(3, 7, '🔍', 'Project Detection');

  let projectType = PROJECT_TYPES.UNKNOWN;
  let entryPoint = null;
  let buildDir = null;

  // ── Read package.json ──────────────────────────────────────────
  const pkgPath = `${projectPath}/package.json`;
  let pkg = null;

  if (existsSync(pkgPath)) {
    try {
      pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
    } catch {
      logger.warn('Could not parse package.json');
    }
  }

  if (pkg) {
    projectType = detectType(pkg, projectPath);
  } else {
    // No package.json — check for static site indicators
    if (existsSync(`${projectPath}/index.html`)) {
      projectType = PROJECT_TYPES.STATIC;
    }
  }

  // ── Detect entry point and build directory ─────────────────────
  switch (projectType) {
    case PROJECT_TYPES.EXPRESS: {
      entryPoint = detectEntryPoint(pkg, projectPath);
      logger.success(`Detected: Node.js/Express API`);
      logger.success(`Entry point: ${entryPoint}`);
      break;
    }
    case PROJECT_TYPES.REACT: {
      buildDir = detectBuildDir(projectPath);
      logger.success(`Detected: React (pre-built static)`);
      if (buildDir) {
        logger.success(`Build directory: ${buildDir}`);
      } else {
        logger.warn('No dist/ or build/ folder found — make sure to push your compiled React build');
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

      // Let user choose
      const { chosenType } = await inquirer.prompt([
        {
          type: 'list',
          name: 'chosenType',
          message: 'Select your project type:',
          choices: [
            { name: 'Node.js / Express API', value: PROJECT_TYPES.EXPRESS },
            { name: 'React (pre-built dist/build folder)', value: PROJECT_TYPES.REACT },
            { name: 'Next.js', value: PROJECT_TYPES.NEXTJS },
            { name: 'Static website (HTML/CSS/JS)', value: PROJECT_TYPES.STATIC },
          ],
        },
      ]);
      projectType = chosenType;

      if (chosenType === PROJECT_TYPES.EXPRESS) {
        entryPoint = detectEntryPoint(pkg, projectPath);
      } else if (chosenType === PROJECT_TYPES.REACT) {
        buildDir = detectBuildDir(projectPath);
      } else if (chosenType === PROJECT_TYPES.NEXTJS) {
        entryPoint = 'npm start';
      }
    }
  }

  // ── Prompt for port (Node.js and Next.js apps) ─────────────────
  let port = null;
  if (projectType === PROJECT_TYPES.EXPRESS || projectType === PROJECT_TYPES.NEXTJS) {
    const { appPort } = await inquirer.prompt([
      {
        type: 'input',
        name: 'appPort',
        message: 'What port does your app run on?',
        default: String(DEFAULT_PORT),
        validate: validator.isValidPort,
      },
    ]);
    port = parseInt(appPort, 10);
    logger.success(`App port: ${port}`);
  }

  // ── Confirm project configuration ──────────────────────────────
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

  const { confirmed } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirmed',
      message: 'Does this look correct?',
      default: true,
    },
  ]);

  if (!confirmed) {
    return await manualConfig(projectPath);
  }

  return config;
}

/**
 * Detect project type from package.json dependencies and scripts
 */
function detectType(pkg, projectPath) {
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };

  // Check for Next.js
  if (deps['next']) {
    return PROJECT_TYPES.NEXTJS;
  }

  // Check for React (CRA or Vite)
  if (deps['react'] && (deps['react-scripts'] || deps['vite'] || deps['@vitejs/plugin-react'])) {
    // React project — check if dist/build folder exists (pre-built)
    return PROJECT_TYPES.REACT;
  }

  // Check for Express or other Node.js servers
  if (deps['express'] || deps['fastify'] || deps['koa'] || deps['hapi'] || deps['@hapi/hapi']) {
    return PROJECT_TYPES.EXPRESS;
  }

  // Check if it has a start script (generic Node.js app)
  if (pkg.scripts?.start || pkg.main) {
    return PROJECT_TYPES.EXPRESS;
  }

  // Check for static site
  if (existsSync(`${projectPath}/index.html`)) {
    return PROJECT_TYPES.STATIC;
  }

  return PROJECT_TYPES.UNKNOWN;
}

/**
 * Detect the main entry point for Node.js apps
 */
function detectEntryPoint(pkg, projectPath) {
  // Check package.json main field
  if (pkg?.main && existsSync(`${projectPath}/${pkg.main}`)) {
    return pkg.main;
  }

  // Check common entry point files
  const candidates = ['server.js', 'index.js', 'app.js', 'src/server.js', 'src/index.js', 'src/app.js'];
  for (const file of candidates) {
    if (existsSync(`${projectPath}/${file}`)) {
      return file;
    }
  }

  // Fallback
  return 'index.js';
}

/**
 * Detect the build output directory for React apps
 */
function detectBuildDir(projectPath) {
  // Vite outputs to dist/, CRA outputs to build/
  if (existsSync(`${projectPath}/dist`)) return 'dist';
  if (existsSync(`${projectPath}/build`)) return 'build';
  if (existsSync(`${projectPath}/public`)) return 'public';
  return null;
}

/**
 * Manual configuration fallback
 */
async function manualConfig(projectPath) {
  const answers = await inquirer.prompt([
    {
      type: 'list',
      name: 'type',
      message: 'Select your project type:',
      choices: [
        { name: 'Node.js / Express API', value: PROJECT_TYPES.EXPRESS },
        { name: 'React (pre-built dist/build folder)', value: PROJECT_TYPES.REACT },
        { name: 'Next.js', value: PROJECT_TYPES.NEXTJS },
        { name: 'Static website (HTML/CSS/JS)', value: PROJECT_TYPES.STATIC },
      ],
    },
    {
      type: 'input',
      name: 'entryPoint',
      message: 'Entry point file (e.g., server.js):',
      when: (a) => a.type === PROJECT_TYPES.EXPRESS,
      default: 'server.js',
    },
    {
      type: 'input',
      name: 'port',
      message: 'What port does your app run on?',
      when: (a) => a.type === PROJECT_TYPES.EXPRESS || a.type === PROJECT_TYPES.NEXTJS,
      default: String(DEFAULT_PORT),
      validate: validator.isValidPort,
    },
    {
      type: 'input',
      name: 'buildDir',
      message: 'Build output directory (e.g., dist, build):',
      when: (a) => a.type === PROJECT_TYPES.REACT,
      default: 'dist',
    },
  ]);

  return {
    type: answers.type,
    entryPoint: answers.entryPoint || (answers.type === PROJECT_TYPES.NEXTJS ? 'npm start' : null),
    port: answers.port ? parseInt(answers.port, 10) : null,
    buildDir: answers.buildDir || null,
  };
}

export default { detectProject };
