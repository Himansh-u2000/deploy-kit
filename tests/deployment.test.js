/**
 * DeployKit — Deployment metadata, backups, DNS and OS detection tests
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { saveDeployment, readDeployments, redactCredentials } from '../src/modules/deployment.js';
import { listBackups, parseBackupName, pruneBackups } from '../src/modules/git.js';
import { checkDns } from '../src/modules/ssl.js';
import { getOsInfo } from '../src/modules/system.js';

let dir;
before(() => {
  dir = mkdtempSync(join(tmpdir(), 'deploykit-deploy-'));
});
after(() => rmSync(dir, { recursive: true, force: true }));

describe('deployment metadata', () => {
  it('creates the config dir and upserts by project name', () => {
    const file = join(dir, 'etc/deploykit/deployments.json');
    saveDeployment({ projectName: 'api', branch: 'main', repoUrl: 'https://github.com/u/api.git' }, file);
    saveDeployment({ projectName: 'web', branch: 'main', repoUrl: 'https://github.com/u/web.git' }, file);
    saveDeployment({ projectName: 'api', branch: 'develop', repoUrl: 'https://github.com/u/api.git' }, file);

    const records = readDeployments(file);
    assert.equal(records.length, 2);
    assert.equal(records.find((r) => r.projectName === 'api').branch, 'develop');
    assert.equal(statSync(file).mode & 0o777, 0o600);
  });

  it('never stores tokens from repo URLs', () => {
    const file = join(dir, 'tokens.json');
    saveDeployment({ projectName: 'x', repoUrl: 'https://user:ghp_secret@github.com/u/x.git' }, file);
    assert.equal(readDeployments(file)[0].repoUrl, 'https://***@github.com/u/x.git');
  });

  it('returns [] for missing or corrupt files', () => {
    assert.deepEqual(readDeployments(join(dir, 'missing.json')), []);
    writeFileSync(join(dir, 'corrupt.json'), '{not json');
    assert.deepEqual(readDeployments(join(dir, 'corrupt.json')), []);
  });

  it('redactCredentials leaves normal URLs alone', () => {
    assert.equal(redactCredentials('git@github.com:u/r.git'), 'git@github.com:u/r.git');
    assert.equal(redactCredentials('https://github.com/u/r.git'), 'https://github.com/u/r.git');
  });
});

describe('backups', () => {
  let backupDir;
  before(() => {
    backupDir = join(dir, 'backups');
    for (const name of [
      'app-2026-01-01T10-00-00',
      'app-2026-03-01T10-00-00',
      'app-2026-02-01T10-00-00',
      'app-v2-2026-04-01T10-00-00',
      'my-app-2026-01-15T10-00-00',
      'not-a-backup',
    ]) {
      mkdirSync(join(backupDir, name), { recursive: true });
    }
  });

  it('parses backup names', () => {
    assert.deepEqual(parseBackupName('my-app-2026-01-15T10-00-00'), {
      projectName: 'my-app',
      timestamp: '2026-01-15T10-00-00',
    });
    assert.equal(parseBackupName('not-a-backup'), null);
  });

  it('matches the project exactly (app ≠ app-v2 ≠ my-app), newest first', () => {
    assert.deepEqual(listBackups('app', backupDir), [
      'app-2026-03-01T10-00-00',
      'app-2026-02-01T10-00-00',
      'app-2026-01-01T10-00-00',
    ]);
    assert.deepEqual(listBackups('app-v2', backupDir), ['app-v2-2026-04-01T10-00-00']);
  });

  it('lists all valid backups without a filter', () => {
    assert.equal(listBackups(undefined, backupDir).length, 5);
  });

  it('prunes old backups for one project only', () => {
    const removed = pruneBackups('app', { keep: 1, dir: backupDir });
    assert.deepEqual(removed.sort(), ['app-2026-01-01T10-00-00', 'app-2026-02-01T10-00-00']);
    assert.ok(existsSync(join(backupDir, 'app-2026-03-01T10-00-00')));
    assert.ok(existsSync(join(backupDir, 'app-v2-2026-04-01T10-00-00')));
    assert.ok(existsSync(join(backupDir, 'my-app-2026-01-15T10-00-00')));
  });
});

describe('checkDns', () => {
  const fakeDns = {
    'example.com': ['203.0.113.10'],
    // www is a CNAME → resolver returns the final A record(s)
    'www.example.com': ['203.0.113.10'],
    'multi.com': ['198.51.100.1', '203.0.113.10'],
    'elsewhere.com': ['198.51.100.99'],
  };
  const resolve = (host) => fakeDns[host] || [];

  it('passes when every domain resolves to the server', () => {
    const r = checkDns(['example.com', 'www.example.com'], '203.0.113.10', resolve);
    assert.ok(r.every((x) => x.ok));
  });

  it('passes when the server IP is one of several A records', () => {
    assert.equal(checkDns(['multi.com'], '203.0.113.10', resolve)[0].ok, true);
  });

  it('fails for wrong or missing records', () => {
    const r = checkDns(['elsewhere.com', 'nxdomain.com'], '203.0.113.10', resolve);
    assert.deepEqual(r.map((x) => x.ok), [false, false]);
  });
});

describe('getOsInfo', () => {
  it('parses /etc/os-release format', () => {
    const file = join(dir, 'os-release');
    writeFileSync(file, 'PRETTY_NAME="Ubuntu 24.04.3 LTS"\nNAME="Ubuntu"\nVERSION_ID="24.04"\nID=ubuntu\n');
    assert.deepEqual(getOsInfo(file), { name: 'Ubuntu', version: '24.04' });
  });

  it('returns null when the file is missing', () => {
    assert.equal(getOsInfo(join(dir, 'missing')), null);
  });
});

describe('CLI', () => {
  const cli = new URL('../bin/cli.js', import.meta.url).pathname;
  it('prints the version', () => {
    const pkg = JSON.parse(execFileSync('cat', [new URL('../package.json', import.meta.url).pathname], { encoding: 'utf-8' }));
    assert.equal(execFileSync(process.execPath, [cli, '--version'], { encoding: 'utf-8' }).trim(), pkg.version);
  });

  it('prints help with all commands', () => {
    const out = execFileSync(process.execPath, [cli, '--help'], { encoding: 'utf-8' });
    for (const cmd of ['init', 'deploy', 'status', 'logs', 'nginx', 'ssl', 'rollback']) {
      assert.match(out, new RegExp(`\\b${cmd}\\b`));
    }
  });
});
