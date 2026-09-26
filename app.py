from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from pathlib import Path
import subprocess, uuid, json, re, shutil, os, sys

# Initialize static ffmpeg so ffmpeg and ffprobe are in PATH
try:
    import static_ffmpeg
    static_ffmpeg.add_paths()
except Exception as e:
    print("Notice: static_ffmpeg not initialized:", e)

ROOT = Path(__file__).parent.resolve()
DATA = ROOT / 'data'
UP = DATA / 'uploads'
OUT = DATA / 'outputs'
UP.mkdir(parents=True, exist_ok=True)
OUT.mkdir(parents=True, exist_ok=True)

app = FastAPI(title='ClipCraft AI Pro')
app.mount('/static', StaticFiles(directory=ROOT / 'static'), name='static')
app.mount('/media', StaticFiles(directory=DATA), name='media')

PROJECTS = {}

def get_duration(p):
    try:
        r = subprocess.run(
            ['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', str(p)],
            capture_output=True, text=True, check=True
        )
        val = r.stdout.strip()
        return float(val) if val else 0.0
    except Exception as e:
        print("Duration error:", e)
        return 0.0

def fmt_time(t):
    t = max(0, t)
    m, s = divmod(int(t), 60)
    h, m = divmod(m, 60)
    return f'{h:02}:{m:02}:{s:02}' if h else f'{m:02}:{s:02}'

def srt_time(t):
    t = max(0, t)
    ms = int(round((t - int(t)) * 1000))
    if ms >= 1000:
        t += 1
        ms = 0
    h = int(t // 3600)
    m = int((t % 3600) // 60)
    s = int(t % 60)
    return f'{h:02}:{m:02}:{s:02},{ms:03}'

import html

def clean_subtitle_text(txt: str) -> str:
    """Removes HTML tags, music brackets, noise markers, and unnecessary symbols."""
    if not txt:
        return ""
    txt = html.unescape(txt)
    txt = re.sub(r'<[^>]+>', '', txt)
    txt = re.sub(r'\[(?:Music|Applause|Laughter|Cheering|Audio|Sound|Silence|Noise|Snicker|Giggle|Sigh)[^\]]*\]', '', txt, flags=re.IGNORECASE)
    txt = re.sub(r'\((?:Music|Applause|Laughter|Cheering|Audio|Sound|Silence|Noise)[^\)]*\)', '', txt, flags=re.IGNORECASE)
    txt = re.sub(r'[♪♫►▶»«_~*^]+', ' ', txt)
    txt = re.sub(r'>>+', ' ', txt)
    txt = re.sub(r'\?{2,}', '?', txt)
    txt = re.sub(r'!{2,}', '!', txt)
    txt = re.sub(r'\.{2,}', '...', txt)
    txt = re.sub(r'\s+', ' ', txt).strip()
    return txt

def get_sentence_end_emoji(sentence: str) -> str:
    """Intelligently assigns a contextual emoji to sentence conclusions."""
    low = sentence.lower()
    if any(w in low for w in ['secret', 'truth', 'whisper', 'hidden', 'nobody knows']):
        return '🤫'
    if any(w in low for w in ['money', 'dollar', 'million', 'billion', 'rich', 'cash', 'crypto', 'profit', 'sales', 'cost']):
        return '💰'
    if any(w in low for w in ['warning', 'danger', 'mistake', 'wrong', 'fail', 'avoid', 'stop', 'never', 'risk']):
        return '⚠️'
    if any(w in low for w in ['shocking', 'insane', 'crazy', 'unbelievable', 'omg', 'impossible', 'mindblown']):
        return '🤯'
    if any(w in low for w in ['best', 'win', 'goat', 'champion', 'first', 'number one', 'epic', 'legendary']):
        return '🏆'
    if any(w in low for w in ['fire', 'lit', 'viral', 'trend', 'trending', 'hype']):
        return '🔥'
    if any(w in low for w in ['smart', 'idea', 'genius', 'hack', 'tip', 'learn', 'method', 'brain', 'logic']):
        return '💡'
    if any(w in low for w in ['love', 'favorite', 'heart', 'amazing', 'beautiful', 'elephant', 'animal', 'zoo']):
        return '✨'
    if any(w in low for w in ['funny', 'laugh', 'lol', 'hilarious', 'joke']):
        return '😂'
    if sentence.strip().endswith('?') or any(w in low for w in ['why', 'how', 'what if', 'guess what']):
        return '🤔'
    if sentence.strip().endswith('!'):
        return '⚡'
    return '✨'

def generate_voice_matched_subtitles(segs, clip_start, clip_end, out_srt_path, custom_text=""):
    """
    Generates clean, voice-matched subtitles with 3-5 word speech chunks
    and contextual emojis at the end of sentences.
    """
    entries = []
    
    if custom_text:
        text = clean_subtitle_text(custom_text)
        emoji = get_sentence_end_emoji(text)
        entries.append((0.0, max(1.2, clip_end - clip_start), f"{text} {emoji}"))
    else:
        relevant = [s for s in segs if s['end'] >= clip_start and s['start'] <= clip_end]
        for s in relevant:
            raw_text = clean_subtitle_text(s.get('text', ''))
            if not raw_text:
                continue
            seg_start = max(0.0, s['start'] - clip_start)
            seg_end = min(clip_end - clip_start, s['end'] - clip_start)
            seg_dur = max(0.5, seg_end - seg_start)
            
            words = raw_text.split()
            if len(words) <= 5 or seg_dur <= 2.2:
                emoji = get_sentence_end_emoji(raw_text)
                clean_sentence = re.sub(r'[.!?,;]+$', '', raw_text).strip()
                entries.append((seg_start, seg_end, f"{clean_sentence} {emoji}"))
            else:
                chunk_size = 4
                word_chunks = [words[i:i + chunk_size] for i in range(0, len(words), chunk_size)]
                num_chunks = len(word_chunks)
                step = seg_dur / num_chunks
                for c_idx, chunk in enumerate(word_chunks):
                    c_start = seg_start + (c_idx * step)
                    c_end = min(seg_end, c_start + step)
                    c_clean = re.sub(r'[.!?,;]+$', '', ' '.join(chunk)).strip()
                    if c_idx == num_chunks - 1:
                        emoji = get_sentence_end_emoji(raw_text)
                        entries.append((c_start, c_end, f"{c_clean} {emoji}"))
                    else:
                        entries.append((c_start, c_end, c_clean))
                        
    with out_srt_path.open('w', encoding='utf-8') as f:
        for idx, (a, b, txt) in enumerate(entries, 1):
            f.write(f"{idx}\n{srt_time(a)} --> {srt_time(b)}\n{txt}\n\n")

def parse_vtt_or_srt(sub_path: Path):
    """Parse downloaded VTT or SRT subtitle file into clean standard segments."""
    if not sub_path.exists():
        return []
    lines = sub_path.read_text(encoding='utf-8', errors='ignore').splitlines()
    segments = []
    time_pat = re.compile(r'(\d{2}):(\d{2}):(\d{2})[,\.](\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})[,\.](\d{3})')
    time_pat_short = re.compile(r'(\d{2}):(\d{2})[,\.](\d{3})\s*-->\s*(\d{2}):(\d{2})[,\.](\d{3})')
    
    current_start = None
    current_end = None
    current_text = []

    def to_secs(h, m, s, ms):
        return int(h) * 3600 + int(m) * 60 + int(s) + int(ms) / 1000.0

    for line in lines:
        line = line.strip()
        if not line or line.startswith('WEBVTT') or line.startswith('NOTE') or line.isdigit():
            if current_start is not None and current_text:
                txt = clean_subtitle_text(' '.join(current_text))
                if txt and (not segments or segments[-1]['text'] != txt):
                    segments.append({'start': round(current_start, 2), 'end': round(current_end, 2), 'text': txt})
                current_start = None
                current_text = []
            continue
            
        m = time_pat.search(line)
        if m:
            if current_start is not None and current_text:
                txt = clean_subtitle_text(' '.join(current_text))
                if txt and (not segments or segments[-1]['text'] != txt):
                    segments.append({'start': round(current_start, 2), 'end': round(current_end, 2), 'text': txt})
            current_start = to_secs(m.group(1), m.group(2), m.group(3), m.group(4))
            current_end = to_secs(m.group(5), m.group(6), m.group(7), m.group(8))
            current_text = []
            continue
            
        m2 = time_pat_short.search(line)
        if m2:
            if current_start is not None and current_text:
                txt = clean_subtitle_text(' '.join(current_text))
                if txt and (not segments or segments[-1]['text'] != txt):
                    segments.append({'start': round(current_start, 2), 'end': round(current_end, 2), 'text': txt})
            current_start = to_secs(0, m2.group(1), m2.group(2), m2.group(3))
            current_end = to_secs(0, m2.group(4), m2.group(5), m2.group(6))
            current_text = []
            continue

        if current_start is not None:
            clean = clean_subtitle_text(line)
            if clean:
                current_text.append(clean)

    if current_start is not None and current_text:
        txt = clean_subtitle_text(' '.join(current_text))
        if txt and (not segments or segments[-1]['text'] != txt):
            segments.append({'start': round(current_start, 2), 'end': round(current_end, 2), 'text': txt})

    return segments

def make_candidates(segs, target=45, count=6):
    """Virality and popularity heuristic discovery engine, strictly sorted descending by popularity."""
    if not segs:
        return []
        
    viral_cues = [
        'secret', 'never', 'best', 'worst', 'crazy', 'insane', 'why', 'how', 'mistake',
        'actually', 'imagine', 'problem', 'important', 'wait', 'truth', 'warning', 'hack',
        'money', 'million', 'billion', 'method', 'nobody', 'stop', 'listen', 'believe',
        'rule', 'first', 'finally', 'game changer', 'revealed', 'watch', 'shocking'
    ]
    
    cand = []
    n = len(segs)
    
    for i in range(n):
        start = segs[i]['start']
        end = start
        texts = []
        j = i
        while j < n and (end - start) < target * 1.15:
            end = segs[j]['end']
            texts.append(segs[j]['text'])
            j += 1
            
        dur = end - start
        if dur < max(8, target * 0.45):
            continue
            
        text = ' '.join(texts).strip()
        low = text.lower()
        
        # Calculate popularity score
        cue_matches = [w for w in viral_cues if w in low]
        cue_score = min(28, len(cue_matches) * 5)
        question_score = min(12, text.count('?') * 6)
        exclamation_score = min(8, text.count('!') * 4)
        
        word_count = len(text.split())
        words_per_sec = word_count / max(dur, 1)
        pacing_score = 10 if 2.0 <= words_per_sec <= 3.8 else 5
        
        score = 58 + cue_score + question_score + exclamation_score + pacing_score
        score = min(99, max(64, score))
        
        # Hook & Emoji
        first_sentence = text.split('.')[0].split('?')[0].split('!')[0].strip()
        clean_first = clean_subtitle_text(first_sentence)
        emoji = get_sentence_end_emoji(clean_first or text)
        
        if len(clean_first) < 14:
            hook = ((text[:72] + '...') if len(text) > 72 else text) + f" {emoji}"
        else:
            hook = f"{clean_first[:72]} {emoji}"

        reasons = []
        if cue_matches:
            reasons.append(f"Trigger: {', '.join(cue_matches[:2]).title()}")
        if '?' in text:
            reasons.append("High Curiosity Hook")
        if words_per_sec >= 2.5:
            reasons.append("Punchy Fast Cadence")
        else:
            reasons.append("High Retention Arc")

        clean_title = re.sub(r'[^a-zA-Z0-9\s]', '', clean_first or hook).strip()[:50]
        
        cand.append({
            'id': str(uuid.uuid4())[:8],
            'start': round(start, 2),
            'end': round(end, 2),
            'duration': round(dur, 1),
            'score': score,
            'popularity_score': score,
            'text': text,
            'hook': hook,
            'title': (clean_title or 'Must Watch Highlight') + f" {emoji}",
            'reasons': reasons,
            'hashtags': ['#shorts', '#viral', '#trending', '#fyp', '#clipcraft'],
            'word_count': word_count,
            'wpm': round(words_per_sec * 60)
        })

    cand.sort(key=lambda x: x['score'], reverse=True)
    
    # Pick diverse candidates without excessive overlap
    chosen = []
    for c in cand:
        if all(abs(c['start'] - x['start']) > max(10, target * 0.45) for x in chosen):
            chosen.append(c)
        if len(chosen) >= count:
            break
            
    # STRICTLY SORT DESCENDING BY POPULARITY (MORE POPULAR TO LESS)
    chosen.sort(key=lambda x: x['score'], reverse=True)
    for idx, c in enumerate(chosen, 1):
        c['rank'] = f'#{idx}'
        c['popularity_tier'] = 'Ultra Viral' if c['score'] >= 90 else ('High Popularity' if c['score'] >= 78 else 'Trending')
        
    return chosen

@app.get('/')
def home():
    return FileResponse(ROOT / 'static' / 'index.html')


@app.post('/api/upload')
async def upload(file: UploadFile = File(...)):
    pid = str(uuid.uuid4())[:10]
    ext = Path(file.filename or 'video.mp4').suffix or '.mp4'
    p = UP / f'{pid}{ext}'
    with p.open('wb') as f:
        shutil.copyfileobj(file.file, f)
    d = get_duration(p)
    PROJECTS[pid] = {
        'id': pid,
        'path': str(p),
        'name': file.filename or 'Uploaded Video',
        'duration': d,
        'segments': [],
        'clips': [],
        'rendered_clips': [],
        'thumbnail': None
    }
    return {
        'id': pid,
        'name': file.filename,
        'duration': d,
        'url': f'/media/uploads/{p.name}',
        'formatted_duration': fmt_time(d)
    }

class URLInspect(BaseModel):
    url: str

@app.post('/api/inspect-url')
def inspect_url(x: URLInspect):
    """Fast inspection of YouTube or web video URL without downloading the entire video."""
    url = x.url.strip()
    if not url:
        raise HTTPException(400, 'Please provide a valid video URL.')
    
    try:
        import yt_dlp
        ydl_opts = {
            'quiet': True,
            'skip_download': True,
            'no_warnings': True,
            'js_runtimes': {'node': {}}
        }
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
            title = info.get('title', 'Unknown Title')
            duration = info.get('duration', 0)
            thumbnail = info.get('thumbnail', '')
            uploader = info.get('uploader') or info.get('channel', 'Creator')
            view_count = info.get('view_count', 0)
            subtitles = info.get('subtitles') or info.get('automatic_captions') or {}
            has_subs = bool('en' in subtitles or any(k.startswith('en') for k in subtitles.keys()))
            
            return {
                'success': True,
                'title': title,
                'duration': duration,
                'formatted_duration': fmt_time(duration),
                'thumbnail': thumbnail,
                'uploader': uploader,
                'view_count': f"{view_count:,}" if view_count else None,
                'has_subtitles': has_subs,
                'url': url
            }
    except Exception as e:
        msg = str(e)
        if 'Unsupported URL' in msg:
            raise HTTPException(400, 'Unsupported URL. Please enter a valid YouTube or video link.')
        raise HTTPException(400, f'Inspection failed: {msg[-300:]}')

class URLIn(BaseModel):
    url: str
    target_quality: str = '1080'

@app.post('/api/import-url')
def import_url(x: URLIn):
    """High-reliability YouTube & web video import pipeline with subtitle extraction."""
    url = x.url.strip()
    if not url:
        raise HTTPException(400, 'Please provide a URL.')
    
    pid = str(uuid.uuid4())[:10]
    out_template = str(UP / f'{pid}.%(ext)s')
    
    try:
        import yt_dlp
        ydl_opts = {
            'format': 'bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=1080]+bestaudio/best[height<=1080]/best',
            'outtmpl': out_template,
            'merge_output_format': 'mp4',
            'writesubtitles': True,
            'writeautomaticsub': True,
            'subtitleslangs': ['en', 'en-US', 'en-orig'],
            'subtitlesformat': 'vtt/srt',
            'quiet': False,
            'no_warnings': False,
            'js_runtimes': {'node': {}},
            'noplaylist': True
        }
        
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=True)
            title = info.get('title') or 'Imported Video'
            uploader = info.get('uploader') or info.get('channel') or ''
            thumbnail = info.get('thumbnail') or ''
            
    except Exception as e:
        err_msg = str(e)
        print("yt-dlp import error:", err_msg)
        raise HTTPException(400, f'YouTube Import Failed: {err_msg[-400:]}')

    # Find the resulting mp4 or video file
    files = list(UP.glob(f'{pid}.mp4'))
    if not files:
        files = list(UP.glob(f'{pid}.*'))
        # Exclude subtitles from video file selection
        files = [f for f in files if f.suffix.lower() not in ['.vtt', '.srt', '.json', '.part', '.ytdl']]
        
    if not files:
        raise HTTPException(500, 'Import completed but no playable video file was produced.')
        
    video_path = files[0]
    dur = get_duration(video_path)
    
    # Check for downloaded subtitles
    sub_files = list(UP.glob(f'{pid}.*.vtt')) + list(UP.glob(f'{pid}.*.srt'))
    extracted_segments = []
    if sub_files:
        try:
            extracted_segments = parse_vtt_or_srt(sub_files[0])
            print(f"Extracted {len(extracted_segments)} segments from native YouTube subtitles.")
        except Exception as e:
            print("Subtitle parse error:", e)

    PROJECTS[pid] = {
        'id': pid,
        'path': str(video_path),
        'name': title,
        'duration': dur,
        'uploader': uploader,
        'thumbnail': thumbnail,
        'segments': extracted_segments,
        'clips': make_candidates(extracted_segments, 45, 6) if extracted_segments else [],
        'rendered_clips': []
    }
    
    return {
        'id': pid,
        'name': title,
        'duration': dur,
        'formatted_duration': fmt_time(dur),
        'url': f'/media/uploads/{video_path.name}',
        'uploader': uploader,
        'thumbnail': thumbnail,
        'has_native_transcript': len(extracted_segments) > 0,
        'segment_count': len(extracted_segments),
        'clips': PROJECTS[pid]['clips']
    }

class Analyze(BaseModel):
    id: str
    target: int = 45
    count: int = 6
    model: str = 'tiny'
    force_whisper: bool = False

@app.post('/api/analyze')
def analyze(x: Analyze):
    """Transcription and magic moment heuristic pipeline."""
    pr = PROJECTS.get(x.id)
    if not pr:
        raise HTTPException(404, 'Project not found')
        
    segs = pr.get('segments', [])
    
    # If segments already extracted from YouTube subtitles and force_whisper is False, we can use them!
    if segs and not x.force_whisper:
        clips = make_candidates(segs, x.target, x.count)
        pr['clips'] = clips
        return {
            'segments': segs,
            'clips': clips,
            'source': 'native_captions',
            'duration': pr['duration']
        }
        
    # Run faster-whisper
    try:
        from faster_whisper import WhisperModel
        # Use tiny, base, or small
        model_name = x.model if x.model in ['tiny', 'base', 'small'] else 'tiny'
        model = WhisperModel(model_name, device='cpu', compute_type='int8')
        segments_gen, info = model.transcribe(pr['path'], vad_filter=True)
        segs = [{'start': round(s.start, 2), 'end': round(s.end, 2), 'text': s.text.strip()} for s in segments_gen]
    except Exception as e:
        raise HTTPException(500, f'Whisper transcription error: {str(e)}')
        
    pr['segments'] = segs
    clips = make_candidates(segs, x.target, x.count)
    pr['clips'] = clips
    return {
        'segments': segs,
        'clips': clips,
        'source': 'whisper',
        'model': x.model,
        'duration': pr['duration']
    }

class CustomClip(BaseModel):
    id: str
    start: float
    end: float
    title: str = ''

@app.post('/api/custom-clip')
def custom_clip(x: CustomClip):
    """Allows user to create a custom clip from any segment in transcript or player."""
    pr = PROJECTS.get(x.id)
    if not pr:
        raise HTTPException(404, 'Project not found')
        
    dur = round(x.end - x.start, 1)
    if dur <= 1:
        raise HTTPException(400, 'Clip duration must be at least 1.5 seconds.')
        
    matching_segs = [s['text'] for s in pr.get('segments', []) if s['end'] >= x.start and s['start'] <= x.end]
    full_text = ' '.join(matching_segs).strip() or 'Custom selected moment'
    
    clip_id = str(uuid.uuid4())[:8]
    clip = {
        'id': clip_id,
        'start': round(x.start, 2),
        'end': round(x.end, 2),
        'duration': dur,
        'score': 88,
        'text': full_text,
        'hook': x.title or (full_text[:65] if full_text else 'Custom Moment'),
        'title': x.title or (full_text[:50] if full_text else 'Custom Moment'),
        'reasons': ['Custom Crafted Segment'],
        'hashtags': ['#shorts', '#viral', '#highlight', '#clipcraft'],
        'word_count': len(full_text.split()),
        'wpm': round(len(full_text.split()) / max(dur, 1) * 60)
    }
    
    pr.setdefault('clips', []).append(clip)
    return {'clip': clip, 'total_clips': len(pr['clips'])}

class Render(BaseModel):
    id: str
    start: float
    end: float
    ratio: str = '9:16'
    captions: bool = True
    preset: str = 'mrbeast'
    hook: str = ''
    position: str = 'bottom'
    color: str = 'gold'
    custom_text: str = ''
    watermark: str = ''

@app.post('/api/render')
def render(x: Render):
    """High-quality video rendering with burned-in subtitles, warm aesthetics, watermark, and custom ratios."""
    pr = PROJECTS.get(x.id)
    if not pr:
        raise HTTPException(404, 'Project not found')
        
    rid = str(uuid.uuid4())[:8]
    srt = OUT / f'{rid}.srt'
    out = OUT / f'{rid}.mp4'
    
    # Build clean voice-matched SRT file with sentence-ending emojis
    generate_voice_matched_subtitles(pr.get('segments', []), x.start, x.end, srt, custom_text=x.custom_text)
            
    dims = {'9:16': (1080, 1920), '1:1': (1080, 1080), '16:9': (1920, 1080), '4:5': (1080, 1350)}
    w, h = dims.get(x.ratio, (1080, 1920))
    
    # Intelligent Minimal Video Edits:
    # 1. Base scale & crop to target aspect ratio
    # 2. Subtle professional color enhancement (depth and skin-tone pop)
    vf_filters = [
        f"scale={w}:{h}:force_original_aspect_ratio=increase,crop={w}:{h}",
        "eq=saturation=1.06:contrast=1.03"
    ]
    
    # MarginV positioning
    pos_margin = {
        'bottom': 160 if x.ratio in ['9:16', '4:5'] else 90,
        'center': int(h / 2) - 40,
        'top': h - 220
    }.get(x.position, 160)
    
    # Presets mapping for ASS / SRT styles
    # PrimaryColour in ASS is &HAABBGGRR (Hex)
    color_map = {
        'gold': '&H0073A3D4&',    # Warm Golden Honey
        'caramel': '&H0067A0DF&', # Warm Caramel Amber
        'cream': '&H00EAF2F7&',   # Oatmeal Cream
        'yellow': '&H0000FFFF&',  # Classic Vibrant Yellow
        'green': '&H008CA984&',   # Sage Earthy Green
        'white': '&H00FFFFFF&'    # Pure White
    }
    primary = color_map.get(x.color, '&H0073A3D4&')
    
    styles = {
        'mrbeast': f"Fontname=Segoe UI Emoji,Fontsize=26,Bold=1,Outline=3.5,OutlineColour=&H00000000&,PrimaryColour={primary},Alignment=2,MarginV={pos_margin}",
        'karaoke': f"Fontname=Segoe UI Emoji,Fontsize=23,Bold=1,Outline=2.5,OutlineColour=&H00000000&,PrimaryColour={primary},Alignment=2,MarginV={pos_margin}",
        'tiktok': f"Fontname=Segoe UI Emoji,Fontsize=22,Bold=1,Outline=2.5,OutlineColour=&H00000000&,PrimaryColour=&H00FFFFFF&,Alignment=2,MarginV={pos_margin}",
        'cyber': f"Fontname=Segoe UI Emoji,Fontsize=23,Bold=1,Outline=2.5,OutlineColour=&H00332211&,PrimaryColour={primary},Alignment=2,MarginV={pos_margin}",
        'clean': f"Fontname=Segoe UI Emoji,Fontsize=18,Bold=0,Outline=1.5,OutlineColour=&H40000000&,PrimaryColour=&H00EAF2F7&,Alignment=2,MarginV={pos_margin}",
        'minimal': f"Fontname=Segoe UI Emoji,Fontsize=16,Bold=0,Outline=1,OutlineColour=&H80000000&,PrimaryColour=&H00DED0BD&,Alignment=2,MarginV={pos_margin}"
    }
    style_str = styles.get(x.preset, styles['mrbeast'])
    
    if x.captions:
        vf_filters.append(f"subtitles={srt.name}:force_style='{style_str}'")
        
    if x.hook:
        safe_hook = re.sub(r'[\'":\\]', '', x.hook)[:80]
        banner_y = 140 if x.ratio in ['9:16', '4:5'] else 60
        vf_filters.append(
            f"drawbox=y={banner_y - 20}:color=black@0.7:width=iw:height=100:t=fill:enable='between(t,0,3.8)',"
            f"drawtext=text='{safe_hook}':fontsize=42:fontcolor=#f7f2ea:borderw=3:bordercolor=black:x=(w-text_w)/2:y={banner_y}:enable='between(t,0,3.8)'"
        )
        
    if x.watermark:
        safe_mark = re.sub(r'[\'":\\]', '', x.watermark)[:35]
        vf_filters.append(
            f"drawtext=text='{safe_mark}':fontsize=26:fontcolor=white@0.8:borderw=2:bordercolor=black@0.6:x=w-text_w-36:y=36"
        )
        
    vf = ','.join(vf_filters)
    
    cmd = [
        'ffmpeg', '-y',
        '-ss', str(x.start),
        '-to', str(x.end),
        '-i', pr['path'],
        '-vf', vf,
        '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11', # Intelligent audio normalization for speech clarity
        '-c:v', 'libx264',
        '-preset', 'veryfast',
        '-crf', '22',
        '-c:a', 'aac',
        '-b:a', '192k',
        '-movflags', '+faststart',
        str(out.name)
    ]

    
    # Execute ffmpeg inside OUT directory so relative SRT paths resolve flawlessly
    r = subprocess.run(cmd, cwd=str(OUT), capture_output=True, text=True)
    if r.returncode != 0:
        print("FFmpeg render error:", r.stderr[-800:])
        raise HTTPException(500, f"Render failed: {r.stderr[-600:]}")
        
    rendered_info = {
        'id': rid,
        'url': f'/media/outputs/{out.name}',
        'file': out.name,
        'duration': round(x.end - x.start, 1),
        'ratio': x.ratio,
        'preset': x.preset,
        'hook': x.hook,
        'watermark': x.watermark
    }
    pr.setdefault('rendered_clips', []).append(rendered_info)
    
    return rendered_info

class BatchRender(BaseModel):
    id: str
    ratio: str = '9:16'
    captions: bool = True
    preset: str = 'mrbeast'
    position: str = 'bottom'
    color: str = 'gold'
    watermark: str = ''

@app.post('/api/batch-render')
def batch_render(x: BatchRender):
    pr = PROJECTS.get(x.id)
    if not pr:
        raise HTTPException(404, 'Project not found')
    clips = pr.get('clips', [])
    if not clips:
        raise HTTPException(400, 'No clips found to render')
    
    results = []
    for c in clips:
        req = Render(
            id=x.id,
            start=c['start'],
            end=c['end'],
            ratio=x.ratio,
            captions=x.captions,
            preset=x.preset,
            hook=c.get('hook', ''),
            position=x.position,
            color=x.color,
            watermark=x.watermark
        )
        try:
            res = render(req)
            results.append(res)
        except Exception as e:
            print("Batch item failed:", e)
    return {'results': results, 'count': len(results)}


@app.get('/api/sample')
def load_sample():
    """Loads a pre-installed demo video so the user can test the studio immediately."""
    sample_file = UP / 'test_yt_jNQXAC9IVRw.mp4'
    if not sample_file.exists():
        raise HTTPException(404, 'Sample file not found. Upload or import a video.')
        
    pid = 'sample_demo'
    d = get_duration(sample_file)
    segs = [
        {'start': 0.0, 'end': 3.2, 'text': 'Alright, so here we are in front of the elephants.'},
        {'start': 3.2, 'end': 9.8, 'text': "The cool thing about these guys is that they have really, really, really long trunks."},
        {'start': 9.8, 'end': 14.5, 'text': "And that's cool, and that's pretty much all there is to say."}
    ]
    PROJECTS[pid] = {
        'id': pid,
        'path': str(sample_file),
        'name': 'Me at the zoo (Demo Sample)',
        'duration': d or 19.0,
        'segments': segs,
        'clips': make_candidates(segs, 10, 2),
        'rendered_clips': [],
        'thumbnail': None
    }
    return {
        'id': pid,
        'name': 'Me at the zoo (Demo Sample)',
        'duration': d or 19.0,
        'formatted_duration': fmt_time(d or 19.0),
        'url': f'/media/uploads/{sample_file.name}',
        'segments': segs,
        'clips': PROJECTS[pid]['clips']
    }

@app.get('/api/health')
def health():
    return {
        'ok': True,
        'ffmpeg': bool(shutil.which('ffmpeg')),
        'ffprobe': bool(shutil.which('ffprobe')),
        'ytdlp': bool(shutil.which('yt-dlp')),
        'node': bool(shutil.which('node'))
    }

if __name__ == '__main__':
    import uvicorn
    uvicorn.run(app, host='127.0.0.1', port=8000)
