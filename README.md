# 🚀 DeployKit

**One-command VPS deployment tool** — automates server setup, Node.js deployment, Nginx, PM2, and SSL on Ubuntu servers.

[![npm](https://img.shields.io/npm/v/deploykit-cli)](https://www.npmjs.com/package/deploykit-cli)
[![CI](https://github.com/Himansh-u2000/deploy-kit/actions/workflows/ci.yml/badge.svg)](https://github.com/Himansh-u2000/deploy-kit/actions/workflows/ci.yml)
[![node](https://img.shields.io/node/v/deploykit-cli)](https://nodejs.org)

Go from a **fresh Ubuntu droplet** to a **fully deployed, SSL-secured application** in minutes.

---

## ✨ Features

| Feature | Description |
|---|---|
| 🖥 **System Setup** | Auto-installs Node.js, Nginx, PM2, Certbot, Git + configures swap & firewall |
| 📦 **Smart Detection** | Auto-detects Express/Fastify/Koa/Hono/NestJS, React/Vite, Next.js, fullstack or static sites |
| 🔐 **Env Management** | Copies `.env.example`, opens nano/vim for editing |
| ⚡ **PM2 Integration** | Start, restart, logs, startup-on-boot, memory limits for low-RAM servers |
| 🌐 **Nginx Config** | Auto-generates reverse proxy or static serving configs with security headers, validated with `nginx -t` before reload |
| 🔒 **SSL Certificates** | Let's Encrypt via Certbot with DNS verification and auto-renewal |
| ♻️ **Rollback** | Automatic backups before every deploy (last 5 kept), one-command atomic rollback |
| 📊 **Status Dashboard** | Server stats, PM2 processes, Nginx status, SSL expiry dates |

---

## 📦 Installation

### Option 1: curl (recommended for fresh servers)

No Node.js required — the installer handles everything:

```bash
curl -fsSL https://raw.githubusercontent.com/Himansh-u2000/deploy-kit/main/install.sh | sudo bash
```

### Option 2: npm (if Node.js is already installed)

Requires **Node.js 22.12 or newer**.

```bash
npm install -g deploykit-cli
```

---

## 🚀 Quick Start

```bash
# Full interactive setup (first time)
sudo deploykit init

# Deploy another project
sudo deploykit deploy

# Check server status
deploykit status
```

---

## 📋 Commands

| Command | Description |
|---|---|
| `deploykit init` | Full interactive first-time setup |
| `deploykit deploy` | Deploy a new project or redeploy existing |
| `deploykit status` | Server & app status dashboard |
| `deploykit logs [app]` | Stream PM2 logs |
| `deploykit nginx` | Manage Nginx configurations |
| `deploykit ssl [domain]` | Setup/manage SSL certificates |
| `deploykit rollback [app]` | Rollback to previous deployment |

---

## 🔄 What `deploykit init` Does

```
[1/7] 🔧 System Setup
  • Ubuntu detection + swap configuration (critical for 512MB RAM)
  • apt update & upgrade
  • Install Node.js (choose 22/24/26 LTS — 24 recommended), Nginx, PM2, Certbot, Git
  • Configure UFW firewall (your SSH port — auto-detected — plus 80, 443)

[2/7] 📦 Project Setup
  • Paste GitHub repo URL → auto-clone to /var/www/
  • Choose branch, set project name
  • Auto-detect lockfile → npm ci or npm install

[3/7] 🔐 Environment Variables
  • Copy from .env.example if available (root and client/, server/ etc.)
  • Open $EDITOR / nano / vim to edit .env (created with 600 permissions)

[4/7] 🔍 Project Detection & Build
  • Auto-detect: Express, React/Vite, Next.js, fullstack, or static site
  • Read app port from .env (PORT=..., defaults to 3000)
  • Next.js: `npm run build` on the server
  • React: serves pre-built dist/build folder (no build on VPS)

[5/7] ⚡ PM2 Setup
  • Start app with PM2 (memory-limited for 512MB servers)
  • Configure startup on boot
  • Option to view live logs

[6/7] 🌐 Nginx Configuration
  • Enter domain (or use server IP)
  • Auto-generate config (reverse proxy / static / Next.js)
  • Test & reload Nginx

[7/7] 🔒 SSL Certificate
  • DNS verification (follows CNAMEs, e.g. www → apex)
  • Certbot with Nginx plugin + HTTP → HTTPS redirect
  • Auto-renewal configured
```

---

## 🎯 Supported Project Types

| Type | Detection | Deployment |
|---|---|---|
| **Express / Node.js** | `express`, `fastify`, `koa`, `hono`, `@nestjs/core` in deps (or a `start` script) | PM2 + Nginx reverse proxy |
| **React / Vite SPA** | `react` + `vite`/`react-scripts`, or any `vite` app | Nginx static serving (push pre-built `dist/`) |
| **Fullstack** | `client/` (or `frontend/`) + `server/` (or `backend/`) folders | Static frontend + `/api` proxied to PM2 backend |
| **Next.js** | `next` in deps | `npm run build` + PM2 + Nginx proxy |
| **Static** | `index.html` in root | Nginx static serving |

---

## 💡 React Projects

Since 512MB VPS servers can't handle `npm run build` for React, **push your pre-built `dist/` or `build/` folder** to your repo. DeployKit will detect it and serve it directly via Nginx with:

- Gzip compression
- Asset caching (1 year for hashed files)
- SPA fallback (all routes → `index.html`)

---

## 🖥 Server Requirements

- **OS**: Ubuntu 20.04+ (22.04 / 24.04 recommended). Ubuntu 18.04 is not supported — Node.js 22+ needs glibc 2.28.
- **Node.js**: 22.12+ (installed for you by `install.sh` / `deploykit init`; Node 18 and 20 are end-of-life)
- **RAM**: 512MB+ (swap auto-configured)
- **Access**: Root or sudo
- **Ports**: 22, 80, 443 (auto-configured by UFW)

---

## 🆚 Comparison

| Feature | DeployKit | Manual Setup | Dokku | CapRover |
|---|---|---|---|---|
| Install time | ~2 min | ~30 min | ~5 min | ~10 min |
| Min RAM | 512MB | 512MB | 1GB | 1GB |
| Learning curve | None | High | Medium | Medium |
| SSL setup | One command | Manual | Built-in | Built-in |
| Rollback | ✅ | Manual | ✅ | ✅ |
| Docker required | ❌ | ❌ | ✅ | ✅ |

---

## ⬆️ Upgrading from 1.x

v2 requires **Node.js 22.12+**. If your server still runs Node 18 or 20 (both end-of-life), upgrade Node first:

```bash
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo bash -
sudo apt-get install -y nodejs
sudo npm install -g pm2 deploykit-cli@latest
pm2 update
```

Existing deployments, Nginx configs and backups keep working. New Nginx configs are generated with the updated templates; re-run `deploykit deploy` → *Deploy a new project* for a site if you want its config regenerated. See [CHANGELOG.md](CHANGELOG.md) for details.

---

## 🛠 Development

```bash
git clone https://github.com/Himansh-u2000/deploy-kit.git
cd deploy-kit
npm install
npm run lint     # ESLint
npm test         # node:test unit tests
npm run check    # both (runs automatically before npm publish)
```

---

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 👤 Author

**Himanshu Haldar** — [@Himansh-u2000](https://github.com/Himansh-u2000)

Found a bug or have an idea? [Open an issue](https://github.com/Himansh-u2000/deploy-kit/issues).

---

## 📄 License

MIT License © 2026 Himanshu Haldar — see [LICENSE](LICENSE) for details.

---

<p align="center">
  Made with ❤️ for developers who just want to ship
</p>
