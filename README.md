# ClipCraft Studio Pro • AI Short-Form Video Suite

A modern, local-first AI clipping suite crafted for short-form video creators. Transform long-form videos and YouTube links into viral 9:16 Shorts, Reels, and TikToks with voice-matched animated captions, popularity scoring, and intelligent studio color/audio enhancements.

## 🌟 Key Features
- **YouTube Link & File Import**: Direct YouTube metadata inspection, high-speed stream download via `yt-dlp`, and automatic native voice subtitle extraction.
- **Voice-Matched Subtitles**: Speech cadence alignment into readable 3–5 word lines with clean text (no annoying symbols or noise tags) and smart contextual emojis (`🤫`, `💰`, `⚠️`, `🤯`, `🏆`, `🔥`, `💡`, `✨`, `🤔`, `⚡`) placed at the end of thoughts.
- **Popularity Score & Descending Ranking**: Algorithmic scoring evaluating hook clarity, speech cadence (WPM), viral keywords, and question hooks. Clips are strictly sorted and ranked from highest viral potential to lowest.
- **Intelligent Minimal Video Edits**:
  - Broadcast-standard audio loudness normalization (`EBU R128 / loudnorm` at -16 LUFS) for crystal-clear creator speech.
  - Subtle color vibrancy and contrast pop (`eq=saturation=1.06:contrast=1.03`) for high-retention feeds.
  - Watermark handle burning (`@handle`) and dynamic multi-aspect ratio rendering (`9:16`, `1:1`, `16:9`, `4:5`).
- **Luxury Brown & Beige UI**: Handcrafted Warm Walnut and Oatmeal Beige interface designed for video editors and creators.
- **Batch Export**: Render and export all viral clips in a single click with instant ZIP bundling.

## Requirements
- Python 3.10–3.13
- FFmpeg (bundled or available on PATH via `static-ffmpeg`)

## Quickstart
```bash
python -m venv .venv
# Windows: .venv\Scripts\activate
# macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
python app.py
```
Open **http://127.0.0.1:8000** in your browser.
