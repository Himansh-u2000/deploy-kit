/**
 * DeployKit — Shell utility tests
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import shell, { quote } from '../src/utils/shell.js';

/** Round-trip a value through a real POSIX shell. */
const echoBack = (value) => execFileSync('sh', ['-c', `printf %s ${quote(value)}`], { encoding: 'utf-8' });

describe('quote', () => {
  it('leaves safe values unquoted', () => {
    assert.equal(quote('/var/www/my-app'), '/var/www/my-app');
    assert.equal(quote(3000), '3000');
  });

  for (const value of ["it's", 'a b', '$(id)', '`id`', 'x; rm -rf /', '"q"', '', '\\', 'tab\there', "''"]) {
    it(`round-trips ${JSON.stringify(value)} through sh unchanged`, () => {
      assert.equal(echoBack(value), value);
    });
  }
});

describe('shell helpers', () => {
  it('execSafe returns stdout of failing commands', () => {
    const r = shell.execSafe('echo out; echo err >&2; exit 3');
    assert.equal(r.success, false);
    assert.equal(r.output, 'out');
    assert.equal(r.error, 'err');
  });

  it('execSafe reports success', () => {
    assert.deepEqual(shell.execSafe('echo hi'), { success: true, output: 'hi', error: '' });
  });

  it('exec respects cwd and env', () => {
    assert.equal(shell.exec('pwd', { cwd: '/tmp' }), '/tmp');
    assert.equal(shell.exec('printf %s "$DK_TEST"', { env: { DK_TEST: 'yes' } }), 'yes');
  });

  it('isInstalled detects binaries', () => {
    assert.equal(shell.isInstalled('sh'), true);
    assert.equal(shell.isInstalled('definitely-not-a-real-binary-xyz'), false);
  });

  it('isInstalled is not injectable', () => {
    assert.equal(shell.isInstalled('sh; echo pwned'), false);
  });

  it('getVersion parses node --version', () => {
    assert.equal(shell.getVersion(process.execPath), process.versions.node);
  });

  it('resolveIpv4 resolves localhost', () => {
    assert.ok(shell.resolveIpv4('localhost').includes('127.0.0.1'));
  });
});
