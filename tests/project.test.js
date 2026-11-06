/**
 * DeployKit — Project detection tests
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { detectType, detectEntryPoint, detectBuildDir, readPortFromEnv } from '../src/modules/project.js';
import { needsDevDependencies, extractProjectName } from '../src/modules/git.js';
import { PROJECT_TYPES } from '../src/utils/constants.js';

let dir;
const write = (rel, content = '') => {
  const full = join(dir, rel);
  mkdirSync(join(full, '..'), { recursive: true });
  writeFileSync(full, content);
  return full;
};

before(() => {
  dir = mkdtempSync(join(tmpdir(), 'deploykit-test-'));
});
after(() => rmSync(dir, { recursive: true, force: true }));

describe('detectType', () => {
  const t = (deps, extra = {}) => detectType({ dependencies: deps, ...extra }, dir);

  it('detects Next.js', () => assert.equal(t({ next: '15', react: '19' }), PROJECT_TYPES.NEXTJS));
  it('detects React + Vite', () => assert.equal(t({ react: '19', vite: '7' }), PROJECT_TYPES.REACT));
  it('detects CRA', () => assert.equal(t({ react: '18', 'react-scripts': '5' }), PROJECT_TYPES.REACT));
  it('detects Express', () => assert.equal(t({ express: '5' }), PROJECT_TYPES.EXPRESS));
  it('detects Fastify', () => assert.equal(t({ fastify: '5' }), PROJECT_TYPES.EXPRESS));
  it('detects Hono', () => assert.equal(t({ hono: '4' }), PROJECT_TYPES.EXPRESS));
  it('detects NestJS', () => assert.equal(t({ '@nestjs/core': '11' }), PROJECT_TYPES.EXPRESS));
  it('treats a Vite Vue app as a static SPA', () => assert.equal(t({ vue: '3', vite: '7' }), PROJECT_TYPES.REACT));
  it('falls back to EXPRESS with a start script', () =>
    assert.equal(t({}, { scripts: { start: 'node app.js' } }), PROJECT_TYPES.EXPRESS));
  it('reads devDependencies too', () =>
    assert.equal(detectType({ devDependencies: { next: '15' } }, dir), PROJECT_TYPES.NEXTJS));
});

describe('detectEntryPoint', () => {
  it('uses package.json main when the file exists', () => {
    write('main-proj/lib/start.js');
    assert.equal(detectEntryPoint({ main: 'lib/start.js' }, join(dir, 'main-proj')), 'lib/start.js');
  });

  it('parses the start script', () => {
    write('script-proj/dist/server.js');
    const pkg = { scripts: { start: 'node --enable-source-maps dist/server.js' } };
    assert.equal(detectEntryPoint(pkg, join(dir, 'script-proj')), 'dist/server.js');
  });

  it('falls back to common file names', () => {
    write('cand-proj/src/app.js');
    assert.equal(detectEntryPoint({}, join(dir, 'cand-proj')), 'src/app.js');
  });

  it('defaults to index.js', () => {
    mkdirSync(join(dir, 'empty-proj'), { recursive: true });
    assert.equal(detectEntryPoint(null, join(dir, 'empty-proj')), 'index.js');
  });
});

describe('detectBuildDir', () => {
  it('prefers dist over build', () => {
    mkdirSync(join(dir, 'b1/dist'), { recursive: true });
    mkdirSync(join(dir, 'b1/build'), { recursive: true });
    assert.equal(detectBuildDir(join(dir, 'b1')), 'dist');
  });
  it('returns null when nothing exists', () => {
    mkdirSync(join(dir, 'b2'), { recursive: true });
    assert.equal(detectBuildDir(join(dir, 'b2')), null);
  });
});

describe('readPortFromEnv', () => {
  const cases = {
    'PORT=4000': 4000,
    'PORT = 4001': 4001,
    'PORT="4002"': 4002,
    "PORT='4003'": 4003,
    'export PORT=4004': 4004,
    'PORT=4005 # api port': 4005,
    'DB_PORT=5432\nPORT=4006': 4006,
    '# PORT=9999': null,
    'PORT=80': null, // privileged — ignored
    'SUPPORT=4007': null,
  };
  let i = 0;
  for (const [content, expected] of Object.entries(cases)) {
    it(`${JSON.stringify(content)} → ${expected}`, () => {
      const file = write(`env-${i++}/.env`, content + '\n');
      assert.equal(readPortFromEnv([file], ['PORT']), expected);
    });
  }

  it('respects key priority and file order', () => {
    const a = write('env-prio/server/.env', 'API_PORT=5001\n');
    const b = write('env-prio/.env', 'PORT=5002\n');
    assert.equal(readPortFromEnv([a, b], ['PORT', 'API_PORT']), 5001);
  });

  it('skips missing files', () => {
    assert.equal(readPortFromEnv([join(dir, 'nope/.env')]), null);
  });
});

describe('needsDevDependencies', () => {
  it('is true for Next.js projects', () => assert.equal(needsDevDependencies({ dependencies: { next: '15' } }), true));
  it('is false for Express projects', () => assert.equal(needsDevDependencies({ dependencies: { express: '5' } }), false));
  it('handles null', () => assert.equal(needsDevDependencies(null), false));
});

describe('extractProjectName', () => {
  it('handles HTTPS .git URLs', () => assert.equal(extractProjectName('https://github.com/u/my-app.git'), 'my-app'));
  it('handles URLs without .git', () => assert.equal(extractProjectName('https://github.com/u/my-app'), 'my-app'));
  it('handles trailing slash', () => assert.equal(extractProjectName('https://github.com/u/my-app/'), 'my-app'));
  it('handles SSH URLs', () => assert.equal(extractProjectName('git@github.com:u/api.git'), 'api'));
  it('sanitises dots', () => assert.equal(extractProjectName('https://github.com/u/my.site.git'), 'my-site'));
});
