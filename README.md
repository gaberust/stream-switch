# Stream Switch

Stream Switch is a simple web dashboard for managing live streams to YouTube. 
It lets your team start and stop YouTube Live broadcasts with a single button click — no YouTube Studio access required.

An administrator connects a YouTube account, configures your video sources and stream titles once, 
and then any authorized team member can go live from any device with a web browser.

---

## Table of Contents

1. [How It Works](#how-it-works)
2. [What You'll Need](#what-youll-need)
3. [Step 1 — Set Up Google OAuth2](#step-1--set-up-google-oauth2)
4. [Step 2 — Prepare Your Configuration File](#step-2--prepare-your-configuration-file)
5. [Step 3 — Deploy with Docker](#step-3--deploy-with-docker)
6. [Step 4 — First-Time App Setup](#step-4--first-time-app-setup)
7. [Going Live (Day-to-Day Use)](#going-live-day-to-day-use)
8. [Managing Users](#managing-users)
9. [Running Behind a Reverse Proxy](#running-behind-a-reverse-proxy-nginx--caddy)
10. [Updating Stream Switch](#updating-stream-switch)
11. [Troubleshooting](#troubleshooting)

---

## How It Works

```
Camera / Encoder  →  Stream Switch  →  YouTube Live
```

Stream Switch sits between your video source (a camera encoder, OBS, or a media server like MediaMTX) and YouTube. 
When you press **Go Live**, it starts an `ffmpeg` process that reads from your source and pushes the video to YouTube's 
servers. When you press **Stop**, it ends the broadcast cleanly.

The app handles creating the YouTube broadcast, waiting for the stream to go active, transitioning it live, 
and ending it — all automatically.

---

## What You'll Need

Before you start, make sure you have:

- **A computer or server to run Stream Switch on.** This can be a dedicated machine on your local network, a Raspberry Pi 4+, a cloud server (like a DigitalOcean Droplet or AWS EC2 instance), or even a spare laptop. It needs to be running while you're streaming.
- **Docker Desktop** (or Docker Engine on Linux) installed on that computer. Download it at [https://www.docker.com/get-started](https://www.docker.com/get-started).
- **A Google account** that owns or manages the YouTube channel you want to stream to.
- **Your video source URL.** This is the RTSP or RTMP address of your camera encoder, OBS, or media server (e.g. `rtsp://192.168.1.50:8554/live`).

---

## Step 1 — Set Up Google OAuth2

Stream Switch connects to YouTube on your behalf using Google's secure sign-in system (OAuth2). You need to create a "credential" in Google Cloud that gives Stream Switch permission to create and manage YouTube broadcasts.

This takes about 10 minutes. Follow each step carefully.

### 1.1 — Create a Google Cloud Project

1. Go to [https://console.cloud.google.com](https://console.cloud.google.com) and sign in with your Google account.
2. At the top of the page, click the project dropdown (it may say **"Select a project"** or show an existing project name).
3. In the window that appears, click **"New Project"** in the top-right corner.
4. Give your project a name (e.g. `Stream Switch`) and click **"Create"**.
5. Wait a moment, then make sure your new project is selected in the dropdown at the top.

### 1.2 — Enable the YouTube Data API

1. In the left-hand menu, click **"APIs & Services"** → **"Library"**.
2. In the search box, type `YouTube Data API v3` and press Enter.
3. Click the **"YouTube Data API v3"** result.
4. Click the blue **"Enable"** button.

### 1.3 — Configure the OAuth Consent Screen

1. In the left-hand menu, click **"APIs & Services"** → **"OAuth consent screen"**.
2. For **User Type**, select **"External"** and click **"Create"**.
3. Fill in the required fields:
   - **App name:** `Stream Switch` (or your channel name, etc.)
   - **User support email:** Your email address
   - **Developer contact information:** Your email address
4. Click **"Save and Continue"** through the **Scopes** and **Test users** pages without changing anything.
5. On the **Summary** page, click **"Back to Dashboard"**.

> **Note:** Your app will be in "Testing" mode, which means only accounts you add as test users can connect. See [Step 1.5](#15--add-a-test-user) below.

### 1.4 — Create OAuth2 Credentials

1. In the left-hand menu, click **"APIs & Services"** → **"Credentials"**.
2. Click **"+ Create Credentials"** at the top and choose **"OAuth client ID"**.
3. For **Application type**, select **"Web application"**.
4. Give it a name (e.g. `Stream Switch`).
5. Under **"Authorized redirect URIs"**, click **"+ Add URI"** and enter:

   ```
   http://YOUR-SERVER-ADDRESS:3000/api/youtube/callback
   ```

   Replace `YOUR-SERVER-ADDRESS` with the IP address or domain name of the computer that will run Stream Switch. For example:
   - On your local network: `http://192.168.1.100:3000/api/youtube/callback`
   - On a cloud server with a domain: `https://streamswitch.yourchurch.com/api/youtube/callback`

   > **Important:** This address must exactly match what you'll put in your `.env` file in [Step 2](#step-2--prepare-your-configuration-file). If they don't match, the YouTube connection will fail with an error.

6. Click **"Create"**.
7. A dialog will appear showing your **Client ID** and **Client Secret**. Click the copy icon next to each and save them somewhere safe — you'll need them in the next step.

### 1.5 — Add a Test User

Because the app is in Testing mode, only approved Google accounts can authorize it.

1. In the left-hand menu, click **"APIs & Services"** → **"OAuth consent screen"**.
2. Scroll down to the **"Test users"** section and click **"+ Add Users"**.
3. Enter the Gmail address of the Google account that owns the YouTube channel you want to stream to.
4. Click **"Save"**.

> You can add up to 100 test users. For some teams, Testing mode is sufficient — you don't need to go through Google's app verification process.

---

## Step 2 — Prepare Your Configuration File

Create a file called `.env` in your Stream Switch folder (you will create this folder in Step 3). Copy the contents below into it and fill in the values:

```
# A long, random secret used to sign session cookies.
# Generate one with: openssl rand -base64 32
SESSION_SECRET=

# YouTube OAuth2 credentials — from Step 1.4 above.
YOUTUBE_CLIENT_ID=
YOUTUBE_CLIENT_SECRET=

# The full URL of your server followed by /api/youtube/callback
# Must match exactly what you entered in Google Cloud Console.
# Example: http://192.168.1.100:3000/api/youtube/callback
YOUTUBE_REDIRECT_URI=http://localhost:3000/api/youtube/callback

# Set to true if running behind nginx, Caddy, or another HTTPS reverse proxy.
TRUST_PROXY=false

# 0.0.0.0 = accessible from any network interface (default)
# 127.0.0.1 = only accessible from localhost
BIND_HOST=0.0.0.0
```

**Generating a SESSION_SECRET:** Run this command in a terminal and paste the output as the value:

```
openssl rand -base64 32
```

Or use any password generator to create a string of 32+ random characters.

**Example completed `.env` file:**
```
SESSION_SECRET=K8mP2xQ9vR4nL7wE1jY6uA3sD0hF5cB+gN=
YOUTUBE_CLIENT_ID=123456789-abc123.apps.googleusercontent.com
YOUTUBE_CLIENT_SECRET=GOCSPX-xxxxxxxxxxxxxxxxxxxx
YOUTUBE_REDIRECT_URI=http://192.168.1.100:3000/api/youtube/callback
TRUST_PROXY=false
BIND_HOST=0.0.0.0
```

---

## Step 3 — Deploy with Docker

Open a terminal (Command Prompt or PowerShell on Windows, Terminal on Mac/Linux) and create a new folder for Stream Switch:

```bash
mkdir stream-switch && cd stream-switch
```

There are two ways to deploy — choose one:

---

### Option A — Pre-built image from Docker Hub (recommended)

This option requires no code download. You only need two files in your folder: `docker-compose.yml` and `.env`.

**1. Create `docker-compose.yml`** with the following contents:

```yaml
services:
  app:
    image: gaberust/stream-switch:latest
    ports:
      - "${BIND_HOST:-0.0.0.0}:3000:3000"
    volumes:
      - db-data:/data
    env_file:
      - .env
    environment:
      NODE_ENV: production
      DATABASE_PATH: /data/stream-switch.db
      BIND_HOST: '0.0.0.0'
    restart: unless-stopped

volumes:
  db-data:
```

**2. Create `.env`** using the template from [Step 2](#step-2--prepare-your-configuration-file) and fill in your values.

**3. Start the app:**

```bash
docker compose up -d
```

Docker will pull the pre-built image and start the app in the background.

---

### Option B — Build from source

Use this option if you have cloned the repository and want to build the image yourself.

Navigate to the Stream Switch folder, then run:

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

This will:
- Download the necessary base images (first run only — takes a few minutes)
- Build the application
- Start it in the background

---

### Verify it's running

```bash
docker compose ps
```

You should see the `app` service listed with a status of `running`.

### Open the app

Open a web browser and go to:

```
http://YOUR-SERVER-ADDRESS:3000
```

You should see the Stream Switch login page.

---

## Step 4 — First-Time App Setup

### 4.1 — Log In as Admin

The default administrator account is:

| Username | Password   |
|----------|------------|
| `admin`  | `changeme` |

**Change this password immediately** after logging in (see [Managing Users](#managing-users)).

### 4.2 — Connect Your YouTube Account

1. Click **"Settings"** in the navigation.
2. In the **"YouTube Account"** section, click **"Connect YouTube Account"**.
3. You'll be redirected to Google's sign-in page. Sign in with the Google account that owns your YouTube channel.
4. Google will ask if you want to allow Stream Switch to manage your YouTube broadcasts — click **"Allow"** (or **"Continue"** depending on the screen).
5. You'll be redirected back to Stream Switch. The Settings page should now show your YouTube channel name.

> If you see an error, double-check that your `YOUTUBE_REDIRECT_URI` in `.env` exactly matches the URI you registered in Google Cloud Console, and that the Google account you signed in with is listed as a test user.

### 4.3 — Set Your Default Video Source

1. In **Settings**, find the **"Default Source"** section.
2. Enter the URL of your video source in the **"Source URL"** field (e.g. `rtsp://192.168.1.50:8554/live`).
3. Leave **"FFmpeg Args"** as `-c copy` unless you need to transcode your video.
4. Click **"Save"**.

### 4.4 — Create Your First Stream

A "stream" in Stream Switch is a named preset that defines what to broadcast and how it should appear on YouTube.

1. In **Settings**, find the **"Streams"** section and click **"Add Stream"**.
2. Fill in the details:
   - **Name:** A short label for your team (e.g. `Sunday Morning Service`)
   - **YouTube Title:** The title that will appear on YouTube (e.g. `Sunday Worship - January 5`)
   - **Privacy:** Start with `Private` or `Unlisted` while you're testing, then switch to `Public` when ready
3. Click **"Save"**.

You can create multiple streams (e.g. one for Sunday services, one for Wednesday Bible study).

---

## Going Live (Day-to-Day Use)

1. Make sure your camera or encoder is running and sending video to your source URL.
2. Open Stream Switch in a browser and log in.
3. On the **Dashboard**, find the stream you want to go live with.
4. Click **"Go Live"**. The button will show **"Starting…"** for a moment, then the status will change to **"Live"** once YouTube confirms the stream is active.
5. A small link icon will appear — click it to open the YouTube broadcast and verify the video looks correct.
6. When the service is over, click **"Stop"**. The YouTube broadcast will be ended automatically.

---

## Managing Users

Any team member who needs to start or stop streams should have their own account. You can manage users from the **"Users"** page (admin only).

### Add a user

1. Go to **"Users"** in the navigation.
2. Enter a username and password for the new team member, then click **"Add User"**.
3. Share their login details with them and ask them to change their password in **Settings → Change Password**.

### Remove a user

Click the **trash icon** next to their name on the Users page.

### Make someone an admin

Admins can configure streams, connect YouTube accounts, and manage users. Toggle the **"Admin"** switch next to a user's name to grant or revoke admin access.

---

## Running Behind a Reverse Proxy (nginx / Caddy)

If you're deploying on a server with a domain name and want HTTPS, you'll run a reverse proxy in front of Stream Switch. This is recommended for any internet-facing deployment.

### Additional `.env` settings

Add these to your `.env` file:

```
TRUST_PROXY=true
BIND_HOST=127.0.0.1
```

`TRUST_PROXY=true` enables secure (HTTPS-only) session cookies and tells the app to read the real client IP from the proxy's headers. `BIND_HOST=127.0.0.1` makes the app only accessible from the same machine, so all traffic must go through the proxy.

### Caddy (recommended — handles HTTPS automatically)

Install Caddy on your server, then create a file called `Caddyfile` with:

```
yourdomain.com {
    reverse_proxy localhost:3000
}
```

Caddy will automatically obtain and renew an SSL certificate. Start it with `caddy run`.

### nginx

Install nginx and create a site config (e.g. `/etc/nginx/sites-available/stream-switch`):

```nginx
server {
    listen 80;
    server_name yourdomain.com;

    location / {
        proxy_pass         http://127.0.0.1:3000;
        proxy_http_version 1.1;

        # Required for WebSocket (live status updates)
        proxy_set_header   Upgrade    $http_upgrade;
        proxy_set_header   Connection "upgrade";

        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
    }
}
```

Then enable it and add HTTPS with Certbot:

```bash
sudo ln -s /etc/nginx/sites-available/stream-switch /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d yourdomain.com
```

> **Important:** After switching to HTTPS, update `YOUTUBE_REDIRECT_URI` in your `.env` to use `https://` and update the matching URI in Google Cloud Console. Then restart the app.

---

## Updating Stream Switch

Your database (users, streams, history) is stored in a Docker volume and is preserved across updates.

### Option A — Docker Hub image

In your Stream Switch folder:

```bash
docker compose pull
docker compose up -d
```

### Option B — Build from source

```bash
# Pull the latest code
git pull

# Rebuild and restart
docker compose -f docker-compose.prod.yml up -d --build
```

---

## Troubleshooting

### "Invalid credentials" when logging in
Make sure you're using the correct username and password. The default is `admin` / `changeme`. If you've forgotten your password, see [Resetting the Admin Password](#resetting-the-admin-password) below.

### YouTube connection fails with an error
- Check that `YOUTUBE_REDIRECT_URI` in `.env` exactly matches the URI in Google Cloud Console — even a missing `http://` or a trailing slash will cause it to fail.
- Check that the Google account you're connecting with has been added as a test user in Google Cloud Console.
- Restart the app after any changes to `.env`:
  - Docker Hub: `docker compose restart` (from your Stream Switch folder)
  - Build from source: `docker compose -f docker-compose.prod.yml restart`

### Stream stays "Starting…" and never goes live
- Verify your camera or encoder is running and accessible at the source URL you configured.
- Check the stream's error message on the Dashboard — it will show the last line of ffmpeg output, which usually explains what went wrong.
- Common causes: the source URL is wrong, the camera is off, or a firewall is blocking the connection.

### Stream shows an error immediately after starting
- Make sure ffmpeg can reach your source URL from the server running Stream Switch.
- If using an IP address, confirm the server and the camera are on the same network.

### The app is unreachable in the browser
- Confirm Docker is running:
  - Docker Hub: `docker compose ps` (from your Stream Switch folder)
  - Build from source: `docker compose -f docker-compose.prod.yml ps`
- Check that port 3000 is not blocked by a firewall on the server.
- On cloud servers, you may need to open port 3000 in your provider's firewall/security group settings.

### Resetting the Admin Password

If you're locked out, you can reset the admin password by running a command inside the container:

```bash
docker compose -f docker-compose.prod.yml exec app node -e "
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const db = new Database('/data/stream-switch.db');
const hash = bcrypt.hashSync('newpassword', 10);
db.prepare('UPDATE users SET password_hash = ? WHERE username = ?').run(hash, 'admin');
console.log('Password reset to: newpassword');
"
```

Then log in with the password `newpassword` and immediately change it in Settings.

---

## For Developers

To run Stream Switch locally in development mode with hot-reloading:

```bash
docker compose up
```

This starts both the Vite dev server (port 5173) and the backend (port 3000) with live reload on code changes.

To run the test suite:

```bash
cd backend && npm test
```
