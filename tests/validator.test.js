/**
 * DeployKit — Validator Tests
 */

import validator from '../src/utils/validator.js';

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✔ ${name}`);
    passed++;
  } catch (err) {
    console.log(`  ✖ ${name}`);
    console.log(`    ${err.message}`);
    failed++;
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message || 'Assertion failed');
}

console.log('\n🧪 Validator Tests\n');

// ── Git URL Validation ───────────────────────────────────────────
console.log('  Git URL Validation:');

test('accepts HTTPS GitHub URL with .git', () => {
  assert(validator.isValidGitUrl('https://github.com/user/repo.git') === true);
});

test('accepts HTTPS GitHub URL without .git', () => {
  assert(validator.isValidGitUrl('https://github.com/user/repo') === true);
});

test('accepts SSH GitHub URL', () => {
  assert(validator.isValidGitUrl('git@github.com:user/repo.git') === true);
});

test('accepts GitLab URL', () => {
  assert(validator.isValidGitUrl('https://gitlab.com/user/repo.git') === true);
});

test('rejects empty string', () => {
  assert(typeof validator.isValidGitUrl('') === 'string');
});

test('rejects random text', () => {
  assert(typeof validator.isValidGitUrl('not-a-url') === 'string');
});

// ── Domain Validation ────────────────────────────────────────────
console.log('\n  Domain Validation:');

test('accepts example.com', () => {
  assert(validator.isValidDomain('example.com') === true);
});

test('accepts sub.example.com', () => {
  assert(validator.isValidDomain('sub.example.com') === true);
});

test('accepts app.my-site.io', () => {
  assert(validator.isValidDomain('app.my-site.io') === true);
});

test('rejects just "localhost"', () => {
  assert(typeof validator.isValidDomain('localhost') === 'string');
});

test('rejects empty string', () => {
  assert(typeof validator.isValidDomain('') === 'string');
});

// ── Port Validation ──────────────────────────────────────────────
console.log('\n  Port Validation:');

test('accepts 3000', () => {
  assert(validator.isValidPort('3000') === true);
});

test('accepts 8080', () => {
  assert(validator.isValidPort('8080') === true);
});

test('accepts 65535', () => {
  assert(validator.isValidPort('65535') === true);
});

test('rejects 80 (privileged)', () => {
  assert(typeof validator.isValidPort('80') === 'string');
});

test('rejects 0', () => {
  assert(typeof validator.isValidPort('0') === 'string');
});

test('rejects "abc"', () => {
  assert(typeof validator.isValidPort('abc') === 'string');
});

test('rejects 99999', () => {
  assert(typeof validator.isValidPort('99999') === 'string');
});

// ── Email Validation ─────────────────────────────────────────────
console.log('\n  Email Validation:');

test('accepts user@example.com', () => {
  assert(validator.isValidEmail('user@example.com') === true);
});

test('accepts user+tag@sub.example.com', () => {
  assert(validator.isValidEmail('user+tag@sub.example.com') === true);
});

test('rejects "not-an-email"', () => {
  assert(typeof validator.isValidEmail('not-an-email') === 'string');
});

test('rejects empty string', () => {
  assert(typeof validator.isValidEmail('') === 'string');
});

// ── App Name Validation ──────────────────────────────────────────
console.log('\n  App Name Validation:');

test('accepts "my-app"', () => {
  assert(validator.isValidAppName('my-app') === true);
});

test('accepts "app_v2"', () => {
  assert(validator.isValidAppName('app_v2') === true);
});

test('rejects single char', () => {
  assert(typeof validator.isValidAppName('a') === 'string');
});

test('rejects "-starts-with-hyphen"', () => {
  assert(typeof validator.isValidAppName('-starts-with-hyphen') === 'string');
});

// ── Summary ──────────────────────────────────────────────────────
console.log(`\n  Results: ${passed} passed, ${failed} failed\n`);

if (failed > 0) {
  process.exit(1);
}
