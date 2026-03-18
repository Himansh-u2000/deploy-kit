/**
 * DeployKit — Project Detection Module
 * Detects project type, entry points, and prompts for port configuration.
 * Supports single-type and fullstack (client/ + server/) projects.
 */

import { existsSync, readFileSync } from 'fs';
import inquirer from 'inquirer';
import logger from '../utils/logger.js';
import shell from '../utils/shell.js';
import validator from '../utils/validator.js';
import { PROJECT_TYPES, DEFAULT_PORT } from '../utils/constants.js';

/**
 * Detect project type and gather configuration.
 * @param {string} projectPath - Absolute path to the project directory
 * @returns {Promise<object>} Project configuration
 */
export async function detectProject(projectPath) {
  logger.step(3, 7, '🔍', 'Project Detection');

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
    const { customBuildDir } = await inquirer.prompt([
      {
        type: 'input',
        name: 'customBuildDir',
        message: `Where is the client build output? (relative to project root):`,
        default: `${clientDir}/dist`,
      },
    ]);
    buildDir = customBuildDir;
  }

  // ── Detect server entry point ──────────────────────────────────
  let serverPkg = null;
  const serverPkgPath = `${serverPath}/package.json`;
  if (existsSync(serverPkgPath)) {
    try {
      serverPkg = JSON.parse(readFileSync(serverPkgPath, 'utf-8'));
    } catch {}
  }

  const entryPoint = detectEntryPoint(serverPkg, serverPath);
  logger.success(`Server entry point: ${entryPoint}`);

  // ── Prompt for server port ─────────────────────────────────────
  const { appPort } = await inquirer.prompt([
    {
      type: 'input',
      name: 'appPort',
      message: 'What port does your server/API run on?',
      default: String(DEFAULT_PORT),
      validate: validator.isValidPort,
    },
  ]);
  const port = parseInt(appPort, 10);
  logger.success(`Server port: ${port}`);

  // ── Install server dependencies ────────────────────────────────
  if (existsSync(serverPkgPath)) {
    const depSpinner = logger.spinner(`Installing server dependencies...`);
    try {
      const hasLockfile = existsSync(`${serverPath}/package-lock.json`);
      const cmd = hasLockfile ? 'npm ci --production' : 'npm install --production';
      shell.exec(`cd ${serverPath} && ${cmd}`);
      depSpinner.succeed('Server dependencies installed');
    } catch (err) {
      depSpinner.fail('Failed to install server dependencies');
      logger.dim(err.message);
    }
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
 * Detect a single-type project (Express, React, Next.js, static)
 */
async function detectSingleProject(projectPath) {
  let projectType = PROJECT_TYPES.UNKNOWN;
  let entryPoint = null;
  let buildDir = null;

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
      const { chosenType } = await inquirer.prompt([
        {
          type: 'list',
          name: 'chosenType',
          message: 'Select your project type:',
          choices: [
            { name: 'Node.js / Express API', value: PROJECT_TYPES.EXPRESS },
            { name: 'React (pre-built dist/build folder)', value: PROJECT_TYPES.REACT },
            { name: 'Next.js', value: PROJECT_TYPES.NEXTJS },
            { name: 'Fullstack (client + server folders)', value: PROJECT_TYPES.FULLSTACK },
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
      } else if (chosenType === PROJECT_TYPES.FULLSTACK) {
        return await detectFullstack(projectPath);
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

function detectType(pkg, projectPath) {
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };

  if (deps['next']) return PROJECT_TYPES.NEXTJS;

  if (deps['react'] && (deps['react-scripts'] || deps['vite'] || deps['@vitejs/plugin-react'])) {
    return PROJECT_TYPES.REACT;
  }

  if (deps['express'] || deps['fastify'] || deps['koa'] || deps['hapi'] || deps['@hapi/hapi']) {
    return PROJECT_TYPES.EXPRESS;
  }

  if (pkg.scripts?.start || pkg.main) return PROJECT_TYPES.EXPRESS;
  if (existsSync(`${projectPath}/index.html`)) return PROJECT_TYPES.STATIC;

  return PROJECT_TYPES.UNKNOWN;
}

function detectEntryPoint(pkg, projectPath) {
  if (pkg?.main && existsSync(`${projectPath}/${pkg.main}`)) return pkg.main;

  const candidates = ['server.js', 'index.js', 'app.js', 'src/server.js', 'src/index.js', 'src/app.js'];
  for (const file of candidates) {
    if (existsSync(`${projectPath}/${file}`)) return file;
  }
  return 'index.js';
}

function detectBuildDir(projectPath) {
  if (existsSync(`${projectPath}/dist`)) return 'dist';
  if (existsSync(`${projectPath}/build`)) return 'build';
  if (existsSync(`${projectPath}/public`)) return 'public';
  return null;
}

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
        { name: 'Fullstack (client + server folders)', value: PROJECT_TYPES.FULLSTACK },
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

  if (answers.type === PROJECT_TYPES.FULLSTACK) {
    return await detectFullstack(projectPath);
  }

  return {
    type: answers.type,
    entryPoint: answers.entryPoint || (answers.type === PROJECT_TYPES.NEXTJS ? 'npm start' : null),
    port: answers.port ? parseInt(answers.port, 10) : null,
    buildDir: answers.buildDir || null,
  };
}

export default { detectProject };
