# 🚀 Cloud Deployment & YouTube Bot-Check Guide

## 1. Why YouTube Shows "Sign in to confirm you're not a bot" on Cloud / Vercel

When you deploy ClipCraft to cloud platforms like **Vercel**, **AWS Lambda**, **Render**, or **Railway**, web requests to YouTube originate from datacenter IP addresses (e.g., Amazon AWS `us-east-1`). 

YouTube aggressively blocks datacenter IP ranges with an anti-bot challenge:
```text
ERROR: [youtube] gTKS8SAwUzE: Sign in to confirm you're not a bot. Use --cookies-from-browser or --cookies for the authentication.
```

---

## 2. Solutions to Fix & Bypass This

### Option A: The Instant Solution — Direct File Upload (Zero Restrictions)
- Click the **"Upload File"** tab in the ClipCraft studio.
- Drag & drop your video (`.mp4`, `.mov`, `.webm`).
- **Why it works**: Direct file uploads bypass YouTube's servers completely. The video is processed with full Whisper AI acoustic alignment and FFmpeg GPU/CPU acceleration with 0 bot checks!

---

### Option B: Provide YouTube Cookies to Cloud (Vercel / Render / Railway)
If you want to import YouTube links directly on your cloud deployment, you can authenticate `yt-dlp` using your session cookies:

1. **Export YouTube Cookies**:
   - In Chrome, Edge, or Brave, install the extension **"Get cookies.txt LOCALLY"** (or any Netscape-compatible cookie exporter).
   - Go to [youtube.com](https://www.youtube.com) and ensure you are logged in.
   - Click the extension icon and click **"Export"** to download your cookies text.

2. **Add to Vercel Environment Variables**:
   - Go to your **Vercel Dashboard** &rarr; Select your **ClipCraft** Project.
   - Go to **Settings** &rarr; **Environment Variables**.
   - Add a new variable:
     - **Key**: `YOUTUBE_COOKIES`
     - **Value**: Paste the exported cookies text (or base64 encoded string).
   - Click **Save** and **Redeploy**.

3. **Or Add a `cookies.txt` File**:
   - If hosting on a VPS or Render, place the exported file as `cookies.txt` in the root folder. ClipCraft automatically detects and loads it.
   - *(Note: `cookies.txt` is in `.gitignore` so your personal login token won't be pushed to public GitHub).*

---

### Option C: Run Locally (Best Performance & 100% Free)
Residential home internet IPs are **never blocked** by YouTube's datacenter filters. Running locally also unlocks unlimited processing time and local GPU acceleration:

```bash
git clone https://github.com/Chakritha11/ClipCraft.git
cd ClipCraft
python -m venv .venv

# On Windows:
.venv\Scripts\activate
# On macOS / Linux:
source .venv/bin/activate

pip install -r requirements.txt
python app.py
```
Open **http://127.0.0.1:8000** in your browser.

---

## 3. Important Notice on Vercel Serverless Limits

Vercel is primarily built for web frontends and lightweight serverless APIs. Note the following architecture constraints:
- **Execution Timeout**: Vercel Hobby tier functions time out after **10 to 15 seconds**. Downloading a 20-minute video, running Faster-Whisper, and encoding 1080p 60fps MP4 with FFmpeg usually takes 30–90 seconds.
- **Disk Limit**: Vercel only provides 512 MB in `/tmp`.

### Recommended Cloud Platforms for ClipCraft
If you want a dedicated cloud server that can process large video files without timeouts:
1. **Render.com** (Web Service with Python environment or Docker)
2. **Railway.app** (Full persistent container support)
3. **Fly.io** or a $5/mo VPS (Hetzner, DigitalOcean, Linode)
