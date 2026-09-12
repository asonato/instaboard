# Instaboard 📸

A local, interactive, and privacy-preserving web dashboard to detect and manage Instagram accounts that don't follow you back, with **Cross-Device Sync (QR Code / Sync Code pairing)** and **Safe Action Pacing**.

![Instaboard Header](https://raw.githubusercontent.com/placeholder/instaboard-banner.png)

---

## ✨ Features

- **Exact Schema Parser**:
  - `following.json`: Parses `relationships_following` root key, extracts username from `title` (or `string_list_data[0].value`), and links from `string_list_data[0].href`.
  - `followers_1.json`: Parses top-level array of users with username from `string_list_data[0].value`.
  - Maps non-followers and sorts alphabetically.
- **Cross-Device Sync (Option B)**:
  - Generates a 6-character **Sync Code** (e.g. `SYNC-TLFF`) and **scannable QR code**.
  - Open on your mobile phone or another browser by scanning the QR code or entering the code. Live 3.5s background polling keeps all paired screens synchronized in real time.
- **Embedded Zero-Config SQLite**:
  - Uses Node.js's built-in `node:sqlite` database engine stored at `data/instaboard.sqlite`. No external database server or cloud subscription required.
- **Safety Banner & Live Hourly Activity Gauge**:
  - Recommends a human pace of **20–30 actions/hour** to prevent Instagram action blocks.
  - Real-time gauge tracks actions completed in the rolling last 60 minutes with visual status indicators (**Safe Pace**, **Moderate**, **Cooldown Alert**).
- **One-Click Tracking**:
  - Click **'Unfollow'** to immediately open the user's profile in a new tab AND mark the account as completed (dimmed, checked off, with an **Undo** option).
  - **'Open Next'** button to rapidly step through pending accounts.
- **Real-Time Search & Filters**:
  - Instant handle filtering (press `/` to focus).
  - Filter tabs for **All**, **Pending**, and **Completed**.
  - Sort by **A-Z**, **Z-A**, or **Follow Date (Newest/Oldest)**.
- **Export Progress**:
  - Download non-followers list and review status as **CSV** or **JSON**.
- **Modern Obsidian Aesthetic**:
  - Sleek dark glassmorphism, Instagram signature sunset gradients, micro-animations, and responsive mobile-first layout.

---

## 🚀 Quick Start

### 1. Prerequisites
- **Node.js**: v22.5.0 or newer (uses native `node:sqlite`).

### 2. Installation
```bash
# Clone or navigate to the directory
cd instaboard

# Install dependencies
npm install
```

### 3. Start the Server
```bash
# Production start
npm start

# Or with live reload during development
npm run dev
```

Open **`http://localhost:3000`** in your browser.

---

## 📱 How to Use

1. **Upload Instagram Export .ZIP (Recommended)**:
   - Drag & drop your downloaded Instagram `.zip` file directly into the dashboard.
   - The dashboard automatically unpacks the archive in your browser memory and extracts `following.json` plus all `followers*.json` files (supporting multi-part follower lists).
   - Alternatively, expand the toggle to upload individual JSON files if preferred.
   - Or click **"Quick Test with Demo Data"** to test with a pre-configured sample dataset.
2. **Review & Unfollow**:
   - Click **'Unfollow'** on any card to open their profile in Instagram and mark them completed.
   - Use **'Open Next'** for a streamlined single-handed review flow.
3. **Sync to Mobile Phone**:
   - Click **'Pair Device'** in the top navigation bar.
   - Scan the QR code with your phone camera or copy the direct link.
   - Both devices will remain in live sync as you unfollow accounts.
4. **Safety Reminders**:
   - Keep your hourly rate under 25 actions/hour using the live safety gauge at the top.

---

## 📂 Project Structure

```text
instaboard/
├── data/
│   └── instaboard.sqlite       # Embedded SQLite database (auto-created)
├── public/
│   ├── index.html              # Modern semantic HTML layout
│   ├── css/
│   │   └── style.css           # Vanilla CSS design system & dark glassmorphism
│   └── js/
│       ├── app.js              # Reactive state, sync polling, and event handlers
│       └── parser.js           # Instagram JSON export parser & comparison logic
├── sample-data/
│   ├── following.json          # Realistic sample following export
│   └── followers_1.json        # Realistic sample followers export
├── src/
│   └── server/
│       └── db.js               # node:sqlite database operations
├── test/
│   └── test-parser.js          # Automated parser validation tests
├── package.json
└── server.js                   # Express server & REST API
```

---

## 🧪 Testing

Run automated parser and zip extraction tests:
```bash
npm test
```

---

## 🐙 Publishing to GitHub

1. **Create a new empty repository on GitHub**:
   - Go to [github.com/new](https://github.com/new).
   - Name it `instaboard` (leave README and .gitignore unchecked since they are already configured here).

2. **Initialize Git and Push**:
   ```bash
   cd instaboard

   # Initialize git repository
   git init

   # Stage all files (respects .gitignore)
   git add .

   # Create initial commit
   git commit -m "feat: initial release of Instaboard dashboard with zip extraction and cross-device sync"

   # Rename branch to main
   git branch -M main

   # Link your GitHub repository
   git remote add origin https://github.com/<YOUR_GITHUB_USERNAME>/instaboard.git

   # Push to GitHub
   git push -u origin main
   ```

---

## 🚢 Deploying to a Remote Server

Instaboard is designed to be self-hosted with zero complex external dependencies (uses Node's native `node:sqlite`).

### Option A: Deploy with Dokploy (Traefik) 🚀

Dokploy is ideal for this project because Traefik handles SSL certificates, reverse proxying, and WebSocket/HTTP connections automatically without any body size limits.

1. **Create Application in Dokploy**:
   - Go to your Dokploy Dashboard -> **Projects** -> Select or Create a Project.
   - Click **Create Service** -> **Application**.
   - Select **GitHub** (or **Git**) and point to your repository (`https://github.com/asonato/instaboard`).
   - Branch: `main`.

2. **Build Configuration**:
   - **Build Type**: `Dockerfile`
   - **Dockerfile Path**: `/Dockerfile` (default)

3. **Port & Networking**:
   - In the **General** tab, set **Port** to: `3000`.

4. **Persistent Storage (Crucial for SQLite)**:
   - In Dokploy, go to the **Mounts / Volumes** tab.
   - Click **Add Mount**:
     - **Mount Type**: `Volume` (or `Bind Mount`)
     - **Host / Volume Name**: `instaboard-data`
     - **Mount Path (Container Path)**: `/app/data`
   - *This ensures your sessions and completed tracking persist across redeployments.*

5. **Environment Variables**:
   - Go to the **Environment** tab and add:
     ```env
     PORT=3000
     NODE_ENV=production
     BASE_URL=https://insta.asonato.com
     ```
   - *(Setting `BASE_URL` to your actual domain guarantees that scannable QR codes and share links point to your live HTTPS domain).*

6. **Traefik Domain & HTTPS (SSL)**:
   - Go to the **Domains** tab in your Dokploy application.
   - Click **Add Domain**:
     - **Host**: `insta.asonato.com`
     - **Path**: `/`
     - **Container Port**: `3000`
     - **HTTPS**: Checked (Traefik will automatically issue a free Let's Encrypt SSL certificate).

7. **Deploy**:
   - Click **Deploy**! Dokploy will build the image, mount the SQLite volume, and Traefik will route traffic with instant HTTPS.

---

### Option B: Deploy with Docker Compose

The easiest and most reliable way to run on any Linux VPS (Ubuntu, Debian, etc.):

1. **Clone your repository on your server**:
   ```bash
   git clone https://github.com/asonato/instaboard.git
   cd instaboard
   ```

2. **Domain is pre-configured in `docker-compose.yml`**:
   ```yaml
   environment:
     - NODE_ENV=production
     - PORT=3000
     - BASE_URL=https://insta.asonato.com
   ```

3. **Start the container**:
   ```bash
   docker compose up -d
   ```
   *Your SQLite database will automatically persist in `./data/instaboard.sqlite` on your server's disk.*

---

### Option C: Deploy with PM2 & Node.js Directly

If running on Ubuntu/Debian VPS without Docker:

1. **Install Node.js 22+ & PM2**:
   ```bash
   # Install Node.js 22 LTS
   curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
   sudo apt-get install -y nodejs

   # Install PM2 process manager
   sudo npm install -g pm2
   ```

2. **Clone and install dependencies**:
   ```bash
   git clone https://github.com/asonato/instaboard.git
   cd instaboard
   npm install --omit=dev
   ```

3. **Start with PM2**:
   ```bash
   # Start daemon
   pm2 start ecosystem.config.cjs

   # Save PM2 state across system reboots
   pm2 save
   pm2 startup
   ```

---

### 🔒 Setting up Nginx Reverse Proxy with SSL (HTTPS)

To expose Instaboard securely on your custom domain with free Let's Encrypt SSL:

1. **Install Nginx & Certbot**:
   ```bash
   sudo apt update
   sudo apt install -y nginx certbot python3-certbot-nginx
   ```

2. **Configure Nginx**:
   Copy [`nginx.conf.example`](nginx.conf.example) to your Nginx sites:
   ```bash
   sudo cp nginx.conf.example /etc/nginx/sites-available/instaboard
   sudo ln -s /etc/nginx/sites-available/instaboard /etc/nginx/sites-enabled/
   ```
   *Edit the file with `sudo nano /etc/nginx/sites-available/instaboard` to put your real domain name.*

3. **Obtain Free SSL Certificate**:
   ```bash
   sudo certbot --nginx -d insta.asonato.com
   sudo systemctl reload nginx
   ```

Done! Your Instaboard dashboard will now be live at `https://insta.asonato.com` with live cross-device sync and automatic SSL encryption.
