/**
 * DeployKit — Nginx template tests
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateConfig } from '../src/modules/nginx.js';
import { PROJECT_TYPES } from '../src/utils/constants.js';

const configs = {
  [PROJECT_TYPES.EXPRESS]: generateConfig({ type: 'express', serverNames: 'a.com www.a.com', port: 3000, rootDir: '/var/www/a' }),
  [PROJECT_TYPES.NEXTJS]: generateConfig({ type: 'nextjs', serverNames: 'b.com', port: 3001, rootDir: '/var/www/b' }),
  [PROJECT_TYPES.REACT]: generateConfig({ type: 'react', serverNames: 'c.com', port: null, rootDir: '/var/www/c/dist' }),
  [PROJECT_TYPES.STATIC]: generateConfig({ type: 'static', serverNames: 'd.com', port: null, rootDir: '/var/www/d' }),
  [PROJECT_TYPES.FULLSTACK]: generateConfig({ type: 'fullstack', serverNames: 'e.com', port: 4000, rootDir: '/var/www/e/client/dist' }),
};

describe('generateConfig', () => {
  for (const [type, conf] of Object.entries(configs)) {
    describe(type, () => {
      it('replaces every placeholder', () => assert.doesNotMatch(conf, /\{\{[A-Z_]+\}\}/));

      it('proxies to 127.0.0.1, never localhost', () => assert.doesNotMatch(conf, /localhost/));

      it('drops the deprecated X-XSS-Protection header', () => assert.doesNotMatch(conf, /X-XSS-Protection/));

      it('denies hidden files but allows ACME challenges', () => {
        assert.match(conf, /location ~ \/\\\.\(\?!well-known\/\)/);
      });

      it('repeats security headers in every location that sets its own headers', () => {
        // nginx drops inherited add_header directives when a location defines any
        const locations = conf.split(/\n\s*location /).slice(1);
        for (const loc of locations) {
          const body = loc.slice(0, loc.indexOf('\n    }'));
          if (body.includes('add_header')) {
            assert.match(body, /X-Frame-Options/, `missing headers in: location ${body.split('\n')[0]}`);
            assert.match(body, /X-Content-Type-Options/);
          }
        }
      });
    });
  }

  it('uses the right port and server names', () => {
    assert.match(configs.express, /server_name a\.com www\.a\.com;/);
    assert.match(configs.express, /proxy_pass http:\/\/127\.0\.0\.1:3000;/);
    assert.match(configs.fullstack, /location \/api \{\n\s+proxy_pass http:\/\/127\.0\.0\.1:4000;/);
    assert.match(configs.react, /root \/var\/www\/c\/dist;/);
  });

  it('throws when a required placeholder value is missing', () => {
    assert.throws(() => generateConfig({ type: 'express', serverNames: 'a.com', rootDir: '/x' }), /PORT/);
  });

  // Only runs where nginx is installed (CI / servers); skipped elsewhere.
  const hasNginx = (() => {
    try {
      execSync('command -v nginx', { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  })();

  it('produces configs that pass `nginx -t`', { skip: !hasNginx && 'nginx not installed' }, () => {
    const dir = mkdtempSync(join(tmpdir(), 'deploykit-nginx-'));
    try {
      // CI runners are not root: `nginx -t` binds the listen ports, so move
      // them off privileged port 80, and keep every writable path in `dir`.
      const includes = Object.entries(configs).map(([type, conf], i) => {
        const file = join(dir, `${type}.conf`);
        writeFileSync(file, conf.replace(/listen 80;/g, `listen 127.0.0.1:${18080 + i};`));
        return `include ${file};`;
      });
      const tempPaths = ['client_body', 'proxy', 'fastcgi', 'uwsgi', 'scgi']
        .map((name) => `${name}_temp_path ${dir}/${name};`)
        .join('\n  ');
      const main = join(dir, 'nginx.conf');
      writeFileSync(
        main,
        `pid ${dir}/nginx.pid;\nerror_log ${dir}/error.log;\nevents {}\nhttp {\n  access_log off;\n  ${tempPaths}\n  ${includes.join('\n  ')}\n}\n`
      );
      execSync(`nginx -t -q -e ${dir}/error.log -c ${main} -p ${dir}`, { stdio: 'pipe' });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
