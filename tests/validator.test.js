/**
 * DeployKit — Validator Tests
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import validator from '../src/utils/validator.js';

const ok = (v) => assert.equal(v, true);
const bad = (v) => assert.equal(typeof v, 'string');

describe('isValidGitUrl', () => {
  it('accepts HTTPS GitHub URL with .git', () => ok(validator.isValidGitUrl('https://github.com/user/repo.git')));
  it('accepts HTTPS GitHub URL without .git', () => ok(validator.isValidGitUrl('https://github.com/user/repo')));
  it('accepts HTTPS GitHub URL with trailing slash', () => ok(validator.isValidGitUrl('https://github.com/user/repo/')));
  it('accepts SSH GitHub URL', () => ok(validator.isValidGitUrl('git@github.com:user/repo.git')));
  it('accepts ssh:// URL', () => ok(validator.isValidGitUrl('ssh://git@gitlab.example.com/group/repo.git')));
  it('accepts GitLab URL', () => ok(validator.isValidGitUrl('https://gitlab.com/user/repo.git')));
  it('accepts self-hosted HTTPS URL', () => ok(validator.isValidGitUrl('https://git.example.com/team/app.git')));
  it('accepts surrounding whitespace', () => ok(validator.isValidGitUrl('  https://github.com/user/repo.git ')));
  it('rejects empty string', () => bad(validator.isValidGitUrl('')));
  it('rejects random text', () => bad(validator.isValidGitUrl('not-a-url')));
  it('rejects shell injection', () => bad(validator.isValidGitUrl('https://github.com/u/r.git; rm -rf /')));
  it('rejects command substitution', () => bad(validator.isValidGitUrl('https://x.com/$(id)/r.git')));
  it('rejects backticks', () => bad(validator.isValidGitUrl('https://x.com/`id`/r.git')));
});

describe('isValidBranch', () => {
  for (const b of ['main', 'develop', 'feature/login', 'release-1.2', 'v2.0.0', 'fix_bug']) {
    it(`accepts "${b}"`, () => ok(validator.isValidBranch(b)));
  }
  for (const b of ['', ' ', 'main; rm -rf /', '$(id)', '-delete', 'a..b', 'a b', 'x.lock', 'a//b', '/main', 'main/', 'a:b', 'a@{1}']) {
    it(`rejects ${JSON.stringify(b)}`, () => bad(validator.isValidBranch(b)));
  }
});

describe('isValidDomain', () => {
  it('accepts example.com', () => ok(validator.isValidDomain('example.com')));
  it('accepts sub.example.com', () => ok(validator.isValidDomain('sub.example.com')));
  it('accepts app.my-site.io', () => ok(validator.isValidDomain('app.my-site.io')));
  it('rejects just "localhost"', () => bad(validator.isValidDomain('localhost')));
  it('rejects empty string', () => bad(validator.isValidDomain('')));
  it('rejects labels starting with hyphen', () => bad(validator.isValidDomain('-bad.example.com')));
  it('rejects shell metacharacters', () => bad(validator.isValidDomain('example.com;id')));
});

describe('isValidPort', () => {
  it('accepts 3000', () => ok(validator.isValidPort('3000')));
  it('accepts 8080 as number', () => ok(validator.isValidPort(8080)));
  it('accepts 65535', () => ok(validator.isValidPort('65535')));
  it('rejects 80 (privileged)', () => bad(validator.isValidPort('80')));
  it('rejects 0', () => bad(validator.isValidPort('0')));
  it('rejects "abc"', () => bad(validator.isValidPort('abc')));
  it('rejects 99999', () => bad(validator.isValidPort('99999')));
  it('rejects "3000abc" (parseInt would accept it)', () => bad(validator.isValidPort('3000abc')));
});

describe('isValidEmail', () => {
  it('accepts user@example.com', () => ok(validator.isValidEmail('user@example.com')));
  it('accepts user+tag@sub.example.com', () => ok(validator.isValidEmail('user+tag@sub.example.com')));
  it('rejects "not-an-email"', () => bad(validator.isValidEmail('not-an-email')));
  it('rejects empty string', () => bad(validator.isValidEmail('')));
  it('rejects shell injection', () => bad(validator.isValidEmail('a@b.com;reboot')));
});

describe('isValidAppName', () => {
  it('accepts "my-app"', () => ok(validator.isValidAppName('my-app')));
  it('accepts "app_v2"', () => ok(validator.isValidAppName('app_v2')));
  it('rejects single char', () => bad(validator.isValidAppName('a')));
  it('rejects "-starts-with-hyphen"', () => bad(validator.isValidAppName('-starts-with-hyphen')));
  it('rejects path traversal', () => bad(validator.isValidAppName('../etc')));
});

describe('isValidRelativePath', () => {
  it('accepts client/dist', () => ok(validator.isValidRelativePath('client/dist')));
  it('rejects absolute paths', () => bad(validator.isValidRelativePath('/etc')));
  it('rejects traversal', () => bad(validator.isValidRelativePath('client/../../etc')));
});

describe('isNotEmpty', () => {
  it('rejects whitespace', () => bad(validator.isNotEmpty('   ')));
  it('does not crash on non-strings', () => ok(validator.isNotEmpty(42)));
  it('rejects undefined', () => bad(validator.isNotEmpty(undefined)));
});
