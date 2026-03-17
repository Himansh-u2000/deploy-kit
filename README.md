# 🚀 DeployKit

**One-command VPS deployment tool** — automates server setup, Node.js deployment, Nginx, PM2, and SSL on Ubuntu servers.

Go from a **fresh Ubuntu droplet** to a **fully deployed, SSL-secured application** in minutes.

---

## ✨ Features

| Feature | Description |
|---|---|
| 🖥 **System Setup** | Auto-installs Node.js, Nginx, PM2, Certbot, Git + configures swap & firewall |
| 📦 **Smart Detection** | Auto-detects Express, React, Next.js, or static sites from your project |
| 🔐 **Env Management** | Copies `.env.example`, opens nano/vim for editing |
| ⚡ **PM2 Integration** | Start, restart, logs, startup-on-boot, memory limits for low-RAM servers |
| 🌐 **Nginx Config** | Auto-generates reverse proxy or static serving configs with security headers |
| 🔒 **SSL Certificates** | Let's Encrypt via Certbot with DNS verification and auto-renewal |
| ♻️ **Rollback** | Automatic backups before every deploy, one-command rollback |
| 📊 **Status Dashboard** | Server stats, PM2 processes, Nginx status, SSL expiry dates |

---

## 📦 Installation

### Option 1: curl (recommended for fresh servers)

No Node.js required — the installer handles everything:

```bash
curl -fsSL https://raw.githubusercontent.com/Himansh-u2000/deploy-kit/main/install.sh | sudo bash
```

### Option 2: npm (if Node.js is already installed)

```bash
npm install -g deploy-kit
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
  • Install Node.js (choose 18/20/22 LTS), Nginx, PM2, Certbot, Git
  • Configure UFW firewall (ports 22, 80, 443)

[2/7] 📦 Project Setup
  • Paste GitHub repo URL → auto-clone to /var/www/
  • Choose branch, set project name
  • Auto-detect lockfile → npm ci or npm install

[3/7] 🔍 Project Detection
  • Auto-detect: Express, React, Next.js, or static site
  • Prompt for app port (Node.js/Next.js)
  • React: serves pre-built dist/build folder (no build on VPS)

[4/7] 🔐 Environment Variables
  • Copy from .env.example if available
  • Open nano/vim to edit .env

[5/7] ⚡ PM2 Setup
  • Start app with PM2 (memory-limited for 512MB servers)
  • Configure startup on boot
  • Option to view live logs

[6/7] 🌐 Nginx Configuration
  • Enter domain (or use server IP)
  • Auto-generate config (reverse proxy / static / Next.js)
  • Test & reload Nginx

[7/7] 🔒 SSL Certificate
  • DNS verification
  • Certbot with Nginx plugin
  • Auto-renewal configured
```

---

## 🎯 Supported Project Types

| Type | Detection | Deployment |
|---|---|---|
| **Express / Node.js** | `express`, `fastify`, `koa` in deps | PM2 + Nginx reverse proxy |
| **React (CRA/Vite)** | `react` + `vite`/`react-scripts` in deps | Nginx static serving (push pre-built `dist/`) |
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

- **OS**: Ubuntu 18.04+ (20.04, 22.04, 24.04)
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

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 📄 License

MIT License — see [LICENSE](LICENSE) for details.

---

<p align="center">
  Made with ❤️ for developers who just want to ship
</p>
