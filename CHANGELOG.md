# Changelog

All notable changes to this project are documented here.
This project follows [Semantic Versioning](https://semver.org/).

## [2.0.0] — 2026-11-06

### ⚠️ Breaking changes

- **Requires Node.js 22.12 or newer.** Node.js 18 (EOL Apr 2025) and 20 (EOL Apr 2026) no longer
  receive security updates, and every current major of DeployKit's dependencies requires Node 22.
  The CLI now prints a clear upgrade message on older versions instead of crashing.
- `deploykit init` offers Node.js **22 / 24 / 26 LTS** (default **24**) instead of 18 / 20 / 22.
  `install.sh` installs Node 24 and upgrades an existing Node that is too old.
- Ubuntu 18.04 is no longer supported (Node 22+ needs glibc 2.28).

### Dependencies

| Package | Before | After |
|---|---|---|
| `inquirer` → **`@inquirer/prompts`** | 9.3.7 | 8.7.5 |
| `commander` | 12.1.0 | 15.0.0 |
| `chalk` | 5.3.0 | 6.0.1 |
| `ora` | 8.1.1 | 10.0.0 |
| `boxen` | 7.1.1 | 9.0.0 |
| `cli-table3` | 0.6.5 | 0.6.5 (latest) |

`inquirer` v10+ removed the `list` prompt type used throughout the CLI, so all prompts were
migrated to the modern `@inquirer/prompts` API. New dev dependencies: `eslint` 10, `@eslint/js`, `globals`.

### Fixed

- **Next.js apps were never built.** `init`/`deploy` started `npm start` without running
  `npm run build`, and installs used `--production`, which skipped devDependencies (TypeScript,
  Tailwind, PostCSS…) that `next build` needs. Next.js projects now install devDependencies and build.
- **`deploykit deploy` (new project) skipped SSL** and never saved deployment metadata. `init` and
  `deploy` now share one pipeline.
- **Nginx security headers were missing on cached assets.** Nginx drops inherited `add_header`
  directives in any `location` that defines its own, so JS/CSS/image responses had no
  `X-Frame-Options` / `X-Content-Type-Options`. Headers are now repeated where needed.
- **SSL DNS check failed for `www` CNAMEs** and when the server's IPv6 address was detected.
  The check now resolves IPv4 (following CNAMEs) via `getent` (no `dig` dependency) and compares
  against all returned addresses.
- **Possible SSH lockout:** UFW was enabled allowing only port 22. The real sshd port is now detected
  and allowed first.
- **`deploykit rollback app` also matched `app-v2` / `app-old` backups** (prefix match). Matching is
  now exact. Rollback is atomic: the backup is copied first and swapped in, so a failed copy no
  longer leaves the site deleted.
- **Shell injection / quoting:** branch names, repo URLs, emails, domains and paths were
  interpolated into shell commands unquoted. All values are now quoted, branch names are
  validated, and URL validation rejects shell metacharacters.
- `saveDeploymentConfig` used a fire-and-forget dynamic import, so write errors became unhandled
  promise rejections and the file was never created when `/etc/deploykit` didn't exist.
- Every redeploy appended a duplicate `safe.directory` entry to root's global git config; git now
  uses a per-command `-c safe.directory`.
- Redeploy pulled whatever upstream was configured; it now fast-forwards the saved branch.
- `npm ci --production` (deprecated) replaced by `npm ci --omit=dev`, with a fallback to
  `npm install` when the lockfile is out of sync.
- Enabling a site or reloading from `deploykit nginx` could throw on an invalid config; configs are
  now tested first and a bad new site is disabled automatically.
- PM2 restarts now use `--update-env` so changed `PORT`/env values take effect.
- `nginx -t` failure output was swallowed (empty error message).
- `curl ifconfig.me` had no timeout and could hang forever; it also could return IPv6.
- `.env` port parsing now handles quotes, `export PORT=…`, and inline comments.
- OS detection no longer depends on `lsb_release` (missing on minimal images).
- Swap setup appended `vm.swappiness` to `/etc/sysctl.conf` repeatedly and failed on filesystems
  without `fallocate` support.
- Step numbers in the output didn't match the order steps ran in (env vs. detection).
- Ctrl+C at a prompt printed a stack trace; it now exits cleanly with code 130.

### Added

- Backup retention: the 5 most recent backups per project are kept (prevents disk exhaustion on
  small droplets).
- `.env` files and `/etc/deploykit/deployments.json` are created with `600` permissions; tokens in
  HTTPS repo URLs are redacted before being saved or printed.
- Detection for Hono, NestJS, Restify, and Vite SPAs in any framework; entry point detection from
  the `start` script.
- Nginx templates: `Referrer-Policy`, `client_max_body_size 25m`, `index.html` served with
  `no-cache` so SPA deploys are picked up immediately, `.well-known` allowed for ACME,
  keep-alive to upstream for non-WebSocket requests, `127.0.0.1` upstream (avoids IPv6 `::1`
  failures). The deprecated `X-XSS-Protection` header was removed.
- ESLint (flat config), `node:test` suite (160 tests, including a real `nginx -t` check when nginx
  is installed), GitHub Actions CI on Node 22 / 24 / 26 with `shellcheck`, `prepublishOnly` check.
- `exports` field in `package.json`; more programmatic exports from `src/index.js`.

### Removed

- ~190 lines of inline Nginx config fallbacks that duplicated the shipped templates.

## [1.2.8] and earlier

See the [commit history](https://github.com/Himansh-u2000/deploy-kit/commits/main).
