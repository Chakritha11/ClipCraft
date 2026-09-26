// ClipCraft Pro • Studio Application State & Controller
let project = null;
let activeRatio = '9:16';
let captionPreset = 'mrbeast';
let captionColor = 'gold';
let captionPosition = 'bottom';
let captionFontSize = 15;
let targetDuration = 45;
let targetClipCount = 6;
let whisperModel = 'tiny';
let clipPreviewRange = null; // { start, end }
let renderedHistory = [];
let ytInspectTimeout = null;
let currentWatermark = '';
let currentSortMode = 'popularity';

const $ = id => document.getElementById(id);

// --- Toast System ---
function toast(msg, icon = '✦') {
  const t = $('toast');
  const m = $('toastMsg');
  if (!t || !m) return;
  m.textContent = `${icon} ${msg}`;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 3200);
}

// --- Time Formatting Utilities ---
function formatTime(seconds) {
  if (isNaN(seconds) || seconds < 0) return '00:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function escapeHtml(str) {
  return (str || '').replace(/[&<>"']/g, m => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  }[m]));
}

// --- Clean Subtitle Text (Strip Unneeded Symbols & Tags) ---
function cleanSubtitleText(txt) {
  if (!txt) return '';
  return txt
    .replace(/<[^>]+>/g, '') // Strip HTML tags
    .replace(/\[(?:Music|Applause|Laughter|Cheering|Audio|Sound|Silence|Noise|Snicker|Giggle|Sigh)[^\]]*\]/gi, '') // Strip sound tags
    .replace(/\((?:Music|Applause|Laughter|Cheering|Audio|Sound|Silence|Noise)[^\)]*\)/gi, '')
    .replace(/[♪♫►▶»«_~*^]+/g, ' ') // Strip weird symbols
    .replace(/>>+/g, ' ')
    .replace(/\?{2,}/g, '?')
    .replace(/!{2,}/g, '!')
    .replace(/\.{2,}/g, '...')
    .replace(/\s+/g, ' ')
    .trim();
}

// --- Contextual Sentence Emojis (Selective & Rare Only) ---
function getSentenceEndEmoji(sentence) {
  if (!sentence) return '';
  const low = sentence.toLowerCase();
  
  if (low.includes('million') || low.includes('billion') || low.includes('$') || low.includes('dollar') || low.includes('crypto') || low.includes('jackpot') || low.includes('wealth')) return '💰';
  if (low.includes('danger') || low.includes('warning') || low.includes('hazard') || low.includes('toxic') || low.includes('dont do this') || low.includes("don't do this")) return '⚠️';
  if (low.includes('mindblown') || low.includes('mind-blowing') || low.includes('unbelievable') || low.includes('jaw-dropping')) return '🤯';
  if (low.includes('champion') || low.includes('world record') || low.includes('gold medal') || low.includes('first place')) return '🏆';
  if (low.includes('viral trend') || low.includes('hyped up')) return '🔥';
  if (low.includes('top secret') || low.includes('nobody knows') || low.includes('confidential')) return '🤫';
  
  return ''; // Clean, legible text without unnecessary emojis
}

// --- Reset / New Project ---
function resetNewProject() {
  project = null;
  clipPreviewRange = null;
  
  const video = $('stageVideo');
  video.pause();
  video.removeAttribute('src');
  video.load();
  video.style.display = 'none';
  
  $('stageEmpty').style.display = 'flex';
  $('topVideoTitle').textContent = 'No video loaded';
  $('topVideoSpecs').textContent = 'Import a YouTube link or drop a video on the left';
  $('curTimecode').textContent = '00:00';
  $('totTimecode').textContent = '00:00';
  $('videoScrubber').value = 0;
  
  $('ytUrlInput').value = '';
  $('ytPreviewCard').classList.remove('show');
  $('clipCounterBadge').textContent = '0';
  
  $('clipsListContainer').innerHTML = `
    <div class="stage-empty-state" style="position:static; padding:40px;">
      <div class="empty-graphic">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polygon points="10 8 16 12 10 16 10 8"></polygon></svg>
      </div>
      <div class="empty-title">Ready for Your First Video</div>
      <div class="empty-desc">Import any YouTube link or drop a video to extract viral clips and voice-matched captions automatically.</div>
    </div>
  `;
  
  $('transcriptContainer').innerHTML = `
    <div class="stage-empty-state" style="position:static; padding:30px;">
      <div class="empty-desc">No transcript loaded. Import a video to inspect timestamps.</div>
    </div>
  `;
  
  hidePipeline();
  toast('New project started. Ready for your video! ✦');
}

// --- Source Tabs Switching ---
function switchSourceTab(type) {
  $('tabYtBtn').classList.toggle('active', type === 'yt');
  $('tabUploadBtn').classList.toggle('active', type === 'upload');
  $('sourcePanelYt').classList.toggle('active', type === 'yt');
  $('sourcePanelUpload').classList.toggle('active', type === 'upload');
}

// --- Workspace Tabs Switching ---
function switchWorkTab(btnId, panelId) {
  document.querySelectorAll('.work-tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.work-panel').forEach(p => p.classList.remove('active'));
  
  const b = $(btnId);
  const p = $(panelId);
  if (b) b.classList.add('active');
  if (p) p.classList.add('active');
}

// --- Recipe Controls ---
function onDurSliderChange(val) {
  targetDuration = parseInt(val, 10);
  $('durValBadge').textContent = `${targetDuration} sec`;
}

function selectClipCount(count, btn) {
  targetClipCount = count;
  document.querySelectorAll('#clipCountPills .pill-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
}

// --- Aspect Ratio Controls ---
function setAspectRatio(ratio, btn) {
  activeRatio = ratio;
  document.querySelectorAll('.ratio-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');

  const bezel = $('stageBezel');
  const island = $('dynamicIsland');
  bezel.classList.remove('ratio-1-1', 'ratio-16-9', 'ratio-4-5');
  
  if (ratio === '1:1') {
    bezel.classList.add('ratio-1-1');
    island.style.display = 'none';
  } else if (ratio === '4:5') {
    bezel.classList.add('ratio-4-5');
    island.style.display = 'none';
  } else if (ratio === '16:9') {
    bezel.classList.add('ratio-16-9');
    island.style.display = 'none';
  } else {
    // 9:16
    island.style.display = 'block';
  }
  toast(`Aspect ratio framing: ${ratio}`);
}

// --- Creator Watermark Handle ---
function updateLiveWatermark(val) {
  currentWatermark = val.trim();
  const el = $('liveWatermarkOverlay');
  if (currentWatermark) {
    el.textContent = currentWatermark;
    el.style.display = 'block';
  } else {
    el.style.display = 'none';
  }
}

// --- Pipeline Progress Control ---
function showPipeline(text, step = 'Step 1/3', pct = 30) {
  const card = $('pipelineProgressCard');
  card.classList.add('show');
  $('pipelineStatusText').innerHTML = `<span class="pulse-dot"></span> ${text}`;
  $('pipelineStepBadge').textContent = step;
  $('pipelineBar').style.width = `${pct}%`;
}

function hidePipeline() {
  $('pipelineProgressCard').classList.remove('show');
}

// --- YouTube Link Auto-Inspection ---
$('ytUrlInput').addEventListener('input', e => {
  const url = e.target.value.trim();
  clearTimeout(ytInspectTimeout);
  if (!url || (!url.includes('youtube.com') && !url.includes('youtu.be') && !url.startsWith('http'))) {
    $('ytPreviewCard').classList.remove('show');
    return;
  }
  ytInspectTimeout = setTimeout(() => inspectYouTubeUrl(url), 500);
});

async function inspectYouTubeUrl(url) {
  try {
    const res = await fetch('/api/inspect-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    });
    if (!res.ok) return;
    const data = await res.json();
    if (data.success) {
      $('ytPreviewThumb').src = data.thumbnail || '';
      $('ytPreviewTitle').textContent = data.title || 'YouTube Video';
      $('ytPreviewChannel').textContent = `${data.uploader || 'Creator'} • ${data.formatted_duration || ''}`;
      $('ytPreviewDur').textContent = data.formatted_duration || '0:00';
      $('ytSubBadge').style.display = data.has_subtitles ? 'inline-flex' : 'none';
      $('ytPreviewCard').classList.add('show');
    }
  } catch (err) {
    console.log('Inspect error:', err);
  }
}

// --- Import YouTube URL Flow ---
async function importYouTubeUrl() {
  const url = $('ytUrlInput').value.trim();
  if (!url) {
    toast('Please paste a YouTube or video URL first!', '⚠️');
    return;
  }

  const importBtn = $('btnImportYt');
  const importText = $('importBtnText');
  importBtn.disabled = true;
  importText.textContent = 'Importing…';
  showPipeline('Downloading video & audio streams…', 'Step 1/3', 35);

  try {
    const res = await fetch('/api/import-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.detail || 'Import failed');
    }

    showPipeline('Merging streams & processing subtitles…', 'Step 2/3', 75);
    project = data;
    loadProjectIntoStudio(data);
    hidePipeline();

    if (data.has_native_transcript) {
      toast(`Imported with ${data.segment_count} voice captions!`, '⚡');
      drawClips();
      drawTranscript();
    } else {
      toast('Video imported! Click "Craft Viral Clips" to analyze.', '🎬');
    }

  } catch (err) {
    hidePipeline();
    toast(err.message, '❌');
  } finally {
    importBtn.disabled = false;
    importText.textContent = 'Import';
  }
}

// --- Drag & Drop File Upload ---
const dropArea = $('dropArea');
const fileInput = $('fileInput');

fileInput.onchange = e => {
  if (e.target.files.length) uploadFile(e.target.files[0]);
};

dropArea.ondragover = e => {
  e.preventDefault();
  dropArea.classList.add('drag-over');
};
dropArea.ondragleave = () => dropArea.classList.remove('drag-over');
dropArea.ondrop = e => {
  e.preventDefault();
  dropArea.classList.remove('drag-over');
  if (e.dataTransfer.files.length) uploadFile(e.dataTransfer.files[0]);
};

async function uploadFile(file) {
  if (!file) return;
  showPipeline(`Uploading ${file.name}…`, 'Step 1/2', 45);

  const fd = new FormData();
  fd.append('file', file);

  try {
    const res = await fetch('/api/upload', {
      method: 'POST',
      body: fd
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Upload failed');
    
    project = data;
    loadProjectIntoStudio(data);
    hidePipeline();
    toast(`Loaded ${file.name} ✦`);
  } catch (err) {
    hidePipeline();
    toast(err.message, '❌');
  }
}

// --- Load Project into Studio Stage ---
function loadProjectIntoStudio(data) {
  $('topVideoTitle').textContent = data.name || 'Video Project';
  $('topVideoSpecs').textContent = `${formatTime(data.duration)} duration • Ready for clipping`;
  
  const video = $('stageVideo');
  video.src = data.url;
  video.style.display = 'block';
  $('stageEmpty').style.display = 'none';

  video.onloadedmetadata = () => {
    $('totTimecode').textContent = formatTime(video.duration);
    $('videoScrubber').max = video.duration || 100;
  };

  $('engineStatusText').textContent = 'Project Active • Ready';
  switchWorkTab('clipsTabBtn', 'clipsPanel');
}

// --- Video Player Controls & Live Subtitle Engine ---
const stageVideo = $('stageVideo');

function togglePlayPause() {
  if (!stageVideo.src) return;
  if (stageVideo.paused) {
    stageVideo.play();
  } else {
    stageVideo.pause();
  }
}

stageVideo.onplay = () => {
  $('playIcon').style.display = 'none';
  $('pauseIcon').style.display = 'block';
};

stageVideo.onpause = () => {
  $('playIcon').style.display = 'block';
  $('pauseIcon').style.display = 'none';
};

function skipVideo(delta) {
  if (!stageVideo.src) return;
  stageVideo.currentTime = Math.max(0, Math.min(stageVideo.duration, stageVideo.currentTime + delta));
}

function onScrubVideo(val) {
  if (!stageVideo.src) return;
  stageVideo.currentTime = parseFloat(val);
}

function setPlaybackSpeed(speed) {
  if (stageVideo) stageVideo.playbackRate = parseFloat(speed);
}

// --- Synchronize Subtitles with Voice Cadence ---
stageVideo.ontimeupdate = () => {
  const cur = stageVideo.currentTime;
  $('curTimecode').textContent = formatTime(cur);
  $('videoScrubber').value = cur;

  // Clip preview loop check
  if (clipPreviewRange && cur >= clipPreviewRange.end) {
    stageVideo.currentTime = clipPreviewRange.start;
  }

  // Live Hook Banner (Active for first 3.2s of current clip or video)
  const hookBanner = $('liveHookBanner');
  const isHookActive = $('toggleHookBanner').checked && 
    (clipPreviewRange ? (cur - clipPreviewRange.start < 3.2) : (cur < 3.2));
  if (isHookActive) {
    hookBanner.classList.add('show');
  } else {
    hookBanner.classList.remove('show');
  }

  // Live Subtitle Overlay Text Sync
  if (!project || !project.segments || !project.segments.length) {
    $('liveSubOverlay').style.display = 'none';
    return;
  }

  // Find matching segment
  const seg = project.segments.find(s => cur >= s.start && cur <= s.end);
  if (seg) {
    const rawClean = cleanSubtitleText(seg.text);
    if (!rawClean) {
      $('liveSubOverlay').style.display = 'none';
      return;
    }

    const segDur = Math.max(0.4, seg.end - seg.start);
    const words = rawClean.split(' ');
    
    // If long segment, calculate voice-matched sub-chunk (3-5 words)
    let displayChunk = rawClean;
    if (words.length > 5 && segDur > 2.2) {
      const chunkSize = 4;
      const totalChunks = Math.ceil(words.length / chunkSize);
      const elapsed = cur - seg.start;
      const currentChunkIdx = Math.min(totalChunks - 1, Math.floor((elapsed / segDur) * totalChunks));
      const chunkWords = words.slice(currentChunkIdx * chunkSize, (currentChunkIdx + 1) * chunkSize);
      displayChunk = chunkWords.join(' ');
      
      // If it's the final chunk of the sentence, check for rare contextual emoji
      if (currentChunkIdx === totalChunks - 1) {
        const emoji = getSentenceEndEmoji(rawClean);
        const cleanChunk = displayChunk.replace(/[.!?,;]+$/, '');
        displayChunk = emoji ? `${cleanChunk} ${emoji}` : cleanChunk;
      }
    } else {
      const emoji = getSentenceEndEmoji(rawClean);
      const cleanChunk = displayChunk.replace(/[.!?,;]+$/, '');
      displayChunk = emoji ? `${cleanChunk} ${emoji}` : cleanChunk;
    }

    $('liveSubOverlay').style.display = 'block';
    $('liveSubText').textContent = displayChunk;
  } else {
    $('liveSubOverlay').style.display = 'none';
  }
};

// --- AI Magic Analysis Trigger ---
async function startAIAnalysis() {
  if (!project) {
    toast('Please import a video or YouTube link first!', '⚠️');
    return;
  }

  const btn = $('btnAnalyze');
  btn.disabled = true;
  btn.innerHTML = `<span class="pulse-dot"></span> Analyzing Voice & Virality…`;
  
  const model = $('whisperModelSelect').value;
  showPipeline(`Running Speech Recognition (${model})…`, 'Step 1/3', 30);

  try {
    const res = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: project.id,
        target: targetDuration,
        count: targetClipCount,
        model: model,
        force_whisper: false
      })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Analysis failed');

    showPipeline('Ranking viral popularity scores…', 'Step 2/3', 85);
    project.segments = data.segments;
    project.clips = data.clips;

    drawClips();
    drawTranscript();
    hidePipeline();

    toast(`Ranked ${data.clips.length} viral clips by Popularity Score! 🔥`, '✦');
    switchWorkTab('clipsTabBtn', 'clipsPanel');

  } catch (err) {
    hidePipeline();
    toast(err.message, '❌');
  } finally {
    btn.disabled = false;
    btn.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"></path>
      </svg>
      CRAFT VIRAL CLIPS
    `;
  }
}

// --- Sorting Toggle ---
function onClipSortChange(mode) {
  currentSortMode = mode;
  drawClips();
  toast(`Clips sorted by: ${mode === 'popularity' ? 'Popularity Score' : (mode === 'chrono' ? 'Timeline' : 'Duration')}`);
}

// --- Render Smart Clips Panel (Sorted strictly descending by popularity) ---
function drawClips() {
  const container = $('clipsListContainer');
  let clips = project ? (project.clips || []) : [];
  $('clipCounterBadge').textContent = clips.length;

  if (!clips.length) {
    container.innerHTML = `
      <div class="stage-empty-state" style="position:static; padding:40px;">
        <div class="empty-graphic">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polygon points="10 8 16 12 10 16 10 8"></polygon></svg>
        </div>
        <div class="empty-title">Ready for Your First Video</div>
        <div class="empty-desc">Import any YouTube link or drop a video to extract viral clips and voice-matched captions automatically.</div>
      </div>
    `;
    return;
  }

  // Sort based on current mode (Default: Popularity descending)
  let sorted = [...clips];
  if (currentSortMode === 'popularity') {
    sorted.sort((a, b) => (b.popularity_score || b.score) - (a.popularity_score || a.score));
  } else if (currentSortMode === 'duration') {
    sorted.sort((a, b) => b.duration - a.duration);
  } else if (currentSortMode === 'chrono') {
    sorted.sort((a, b) => a.start - b.start);
  }

  container.innerHTML = sorted.map((c, i) => {
    const popScore = c.popularity_score || c.score || 85;
    const scoreColorClass = popScore >= 88 ? '' : 'score-medium';
    const rankTitle = i === 0 ? '🔥 #1 Most Popular' : (i === 1 ? '⚡ #2 Highly Viral' : `#${i + 1} Trending`);
    const reasonsHtml = (c.reasons || ['Viral Retention Hook']).map(r => `<span class="reason-badge">${escapeHtml(r)}</span>`).join('');
    
    // Clean text and attach emoji
    const cleanText = cleanSubtitleText(c.text);
    const endEmoji = getSentenceEndEmoji(cleanText);

    return `
      <div class="clip-card" id="clipCard_${i}">
        <!-- Virality & Popularity Gauge -->
        <div class="virality-gauge">
          <span class="gauge-score ${scoreColorClass}">${popScore}%</span>
          <span class="gauge-label">POPULARITY</span>
        </div>

        <!-- Clip Details -->
        <div class="clip-details">
          <div class="clip-title-row">
            <span class="control-badge" style="background:#362618; color:var(--accent-light); font-weight:800; border:1px solid #4f3925;">${rankTitle}</span>
            <span class="clip-name">${escapeHtml(c.title)}</span>
            <span class="clip-dur-badge">${c.duration}s</span>
            <span class="time-range-badge">${formatTime(c.start)} → ${formatTime(c.end)}</span>
          </div>

          <div class="clip-snippet">"${escapeHtml(cleanText)} ${endEmoji}"</div>

          <div class="clip-tags-row">
            ${reasonsHtml}
            <span class="reason-badge" style="background:#261d15; border-color:#3d2f21; color:#84a98c;">⚡ AI Voice Clarity (Loudnorm)</span>
            <span style="font-size:11px; color:var(--beige-taupe);">${c.wpm || 140} WPM • ${c.word_count || 30} words</span>
          </div>
        </div>

        <!-- Actions -->
        <div class="clip-actions">
          <button class="btn-preview-clip" onclick="previewClipByObject('${c.id}')">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
            Preview
          </button>
          
          <button class="btn-export-clip" id="btnExport_${c.id}" onclick="exportClipById('${c.id}')">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
            Export MP4
          </button>

          <button class="btn-copy-pack" onclick="copyViralityPackById('${c.id}')" title="Copy Title, Description, and Hashtags">
            📋 Copy Pack
          </button>
        </div>
      </div>
    `;
  }).join('');
}

// --- Preview a Specific Clip ---
function previewClipByObject(clipId) {
  if (!project || !project.clips) return;
  const clip = project.clips.find(x => x.id === clipId);
  if (!clip) return;

  document.querySelectorAll('.clip-card').forEach(c => c.classList.remove('active-preview'));
  
  clipPreviewRange = { start: clip.start, end: clip.end };
  stageVideo.currentTime = clip.start;
  stageVideo.play();

  // Set top hook text with emoji
  const cleanHook = cleanSubtitleText(clip.hook || clip.title);
  const hookEmoji = getSentenceEndEmoji(cleanHook);
  const formattedHook = cleanHook + ' ' + hookEmoji;
  
  $('liveHookBannerText').textContent = formattedHook;
  $('hookCustomTextInput').value = formattedHook;

  toast(`Previewing: ${clip.title} • Looping 🔁`);
}

// --- 1-Click Virality Pack Copy ---
function copyViralityPackById(clipId) {
  if (!project || !project.clips) return;
  const c = project.clips.find(x => x.id === clipId);
  if (!c) return;
  
  const tags = (c.hashtags || ['#shorts', '#viral', '#trending']).join(' ');
  const cleanTitle = cleanSubtitleText(c.title);
  const cleanHook = cleanSubtitleText(c.hook);
  const text = `${cleanTitle}\n\n${cleanHook}\n\n${tags}`;
  
  navigator.clipboard.writeText(text).then(() => {
    toast('Virality Content Pack copied to clipboard! 📋');
  }).catch(() => {
    toast('Copy failed, permission denied', '⚠️');
  });
}

// --- Export & Render Single Clip ---
async function exportClipById(clipId) {
  if (!project || !project.clips) return;
  const c = project.clips.find(x => x.id === clipId);
  if (!c) return;
  
  const btn = $(`btnExport_${clipId}`);
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<span class="pulse-dot"></span> Rendering…`;
  }
  toast(`Crafting ${activeRatio} MP4 with voice-matched subtitles & audio normalization! 🎬`);

  try {
    const res = await fetch('/api/render', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: project.id,
        start: c.start,
        end: c.end,
        ratio: activeRatio,
        captions: $('burnCaptionsCheck').checked,
        preset: captionPreset,
        hook: $('toggleHookBanner').checked ? $('hookCustomTextInput').value : '',
        position: captionPosition,
        color: captionColor,
        font_size: captionFontSize,
        watermark: currentWatermark
      })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Render failed');

    // Add to history
    renderedHistory.unshift({
      id: data.id,
      url: data.url,
      file: data.file,
      title: c.title,
      duration: c.duration,
      ratio: activeRatio,
      time: new Date().toLocaleTimeString()
    });
    updateExportHistoryUI();

    // Trigger instant browser download
    const a = document.createElement('a');
    a.href = data.url;
    a.download = data.file;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    toast(`Clip exported successfully! Downloaded ${data.file} ✦`, '🚀');

  } catch (err) {
    toast(err.message, '❌');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
        Export MP4
      `;
    }
  }
}

// --- Batch Export All Clips ---
async function batchExportAllClips() {
  if (!project || !project.clips || !project.clips.length) {
    toast('No clips to export. Please import and craft clips first!', '⚠️');
    return;
  }

  const btn = $('btnBatchExportHeader');
  btn.disabled = true;
  btn.innerHTML = `<span class="pulse-dot"></span> Batch Rendering…`;
  toast(`Queueing batch export for all ${project.clips.length} clips…`);

  try {
    const res = await fetch('/api/batch-render', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: project.id,
        ratio: activeRatio,
        captions: $('burnCaptionsCheck').checked,
        preset: captionPreset,
        position: captionPosition,
        color: captionColor,
        font_size: captionFontSize,
        watermark: currentWatermark
      })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Batch render failed');

    (data.results || []).forEach(r => {
      renderedHistory.unshift({
        id: r.id,
        url: r.url,
        file: r.file,
        title: `Clip (${r.duration}s)`,
        duration: r.duration,
        ratio: r.ratio,
        time: new Date().toLocaleTimeString()
      });
    });
    updateExportHistoryUI();
    switchWorkTab('historyTabBtn', 'historyPanel');
    toast(`Batch completed! Rendered ${data.count} clips into the Vault! 🚀`);

  } catch (err) {
    toast(err.message, '❌');
  } finally {
    btn.disabled = false;
    btn.innerHTML = `
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
        <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"></path>
      </svg>
      Batch Export All
    `;
  }
}

// --- Export History Vault UI ---
function updateExportHistoryUI() {
  const container = $('historyClipsContainer');
  $('exportBadgeCount').textContent = `(${renderedHistory.length})`;

  if (!renderedHistory.length) {
    container.innerHTML = `
      <div class="stage-empty-state" style="position:static; padding:40px; grid-column:1/-1;">
        <div class="empty-graphic">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
        </div>
        <div class="empty-title">Export Vault Empty</div>
        <div class="empty-desc">Rendered clips will appear here with direct download links.</div>
      </div>
    `;
    return;
  }

  container.innerHTML = renderedHistory.map((item, i) => `
    <div class="history-card">
      <div class="history-video-box">
        <video src="${item.url}" controls preload="metadata"></video>
      </div>
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <b style="font-size:13px; color:var(--beige-cream);">${escapeHtml(item.title)}</b>
        <span class="clip-dur-badge">${item.duration}s • ${item.ratio}</span>
      </div>
      <div style="display:flex; gap:8px;">
        <a href="${item.url}" download="${item.file}" class="btn-primary" style="flex:1; text-decoration:none; padding:7px 10px; font-size:11px;">
          ⬇ Download MP4
        </a>
      </div>
    </div>
  `).join('');
}

// --- Interactive Transcript ---
function drawTranscript() {
  const container = $('transcriptContainer');
  const segs = project ? (project.segments || []) : [];
  const query = ($('transcriptSearchInput').value || '').toLowerCase();

  const filtered = segs.filter(s => cleanSubtitleText(s.text).toLowerCase().includes(query));

  if (!filtered.length) {
    container.innerHTML = `
      <div class="stage-empty-state" style="position:static; padding:30px;">
        <div class="empty-desc">No matching phrases found.</div>
      </div>
    `;
    return;
  }

  container.innerHTML = filtered.map((s, i) => {
    const cleanText = cleanSubtitleText(s.text);
    const emoji = getSentenceEndEmoji(cleanText);
    const formatted = emoji ? `${cleanText} ${emoji}` : cleanText;

    return `
      <div class="transcript-row" onclick="seekTranscript(${s.start})">
        <span class="transcript-time">${formatTime(s.start)}</span>
        <span class="transcript-content">${highlightQuery(escapeHtml(formatted), query)}</span>
        <button class="btn-clip-sentence" onclick="event.stopPropagation(); craftSentenceClip(${s.start}, ${s.end}, '${escapeHtml(cleanText.replace(/'/g, ''))}')">
          ✂ Craft Clip
        </button>
      </div>
    `;
  }).join('');
}

function filterTranscriptList() {
  drawTranscript();
}

function highlightQuery(text, query) {
  if (!query) return text;
  const regex = new RegExp(`(${query})`, 'gi');
  return text.replace(regex, '<mark style="background:var(--accent-primary); color:#120e0b; font-weight:700; border-radius:2px; padding:0 2px;">$1</mark>');
}

function seekTranscript(time) {
  clipPreviewRange = null;
  stageVideo.currentTime = time;
  stageVideo.play();
  toast(`Seeked to ${formatTime(time)}`);
}

// --- Custom Clip From Sentence ---
async function craftSentenceClip(start, end, text) {
  if (!project) return;
  const padStart = Math.max(0, start - 1.0);
  const padEnd = Math.min(stageVideo.duration || end + 25, end + 25);
  
  try {
    const res = await fetch('/api/custom-clip', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: project.id,
        start: padStart,
        end: padEnd,
        title: text.slice(0, 45)
      })
    });
    const d = await res.json();
    if (!res.ok) throw new Error(d.detail || 'Custom clip creation failed');

    project.clips.unshift(d.clip);
    drawClips();
    switchWorkTab('clipsTabBtn', 'clipsPanel');
    toast('Custom moment crafted from transcript! ✂');
    previewClipByObject(d.clip.id);
  } catch (err) {
    toast(err.message, '❌');
  }
}

function exportSrtTranscript() {
  if (!project || !project.segments || !project.segments.length) {
    return toast('No transcript to export!', '⚠️');
  }
  let srtContent = '';
  project.segments.forEach((s, idx) => {
    const a = formatTime(s.start) + ',000';
    const b = formatTime(s.end) + ',000';
    const clean = cleanSubtitleText(s.text);
    const emoji = getSentenceEndEmoji(clean);
    const line = emoji ? `${clean} ${emoji}` : clean;
    srtContent += `${idx + 1}\n00:${a} --> 00:${b}\n${line}\n\n`;
  });

  const blob = new Blob([srtContent], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${project.name || 'transcript'}.srt`;
  a.click();
  URL.revokeObjectURL(url);
  toast('Transcript exported as SRT! 📄');
}

// --- Caption Lab Styling System ---
function setCaptionStyle(preset, card) {
  captionPreset = preset;
  document.querySelectorAll('#stylePresetsContainer .style-card').forEach(c => c.classList.remove('active'));
  if (card) card.classList.add('active');

  $('activeStyleLabel').textContent = preset.toUpperCase();
  applyLiveCaptionOverlayStyle();
  toast(`Caption style set to: ${preset.toUpperCase()} ✨`);
}

function setCaptionColor(color, dot) {
  captionColor = color;
  document.querySelectorAll('.color-dot').forEach(d => d.classList.remove('active'));
  if (dot) dot.classList.add('active');

  applyLiveCaptionOverlayStyle();
  toast(`Subtitle accent color: ${color.toUpperCase()}`);
}

function setCaptionPosition(pos, btn) {
  captionPosition = pos;
  document.querySelectorAll('.caption-studio-grid .pill-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');

  const overlay = $('liveSubOverlay');
  if (pos === 'top') {
    overlay.style.top = '70px';
    overlay.style.bottom = 'auto';
  } else if (pos === 'center') {
    overlay.style.top = '50%';
    overlay.style.bottom = 'auto';
    overlay.style.transform = 'translateY(-50%)';
  } else {
    overlay.style.top = 'auto';
    overlay.style.bottom = '70px';
    overlay.style.transform = 'none';
  }
  toast(`Subtitles positioned at: ${pos.toUpperCase()}`);
}

// --- Dynamic Caption Text Size Controls ---
function onCaptionSizeChange(val) {
  captionFontSize = parseInt(val, 10);
  const badge = $('captionSizeBadge');
  if (badge) {
    let label = 'Medium';
    if (captionFontSize <= 12) label = 'Compact';
    else if (captionFontSize <= 15) label = 'Default';
    else if (captionFontSize <= 19) label = 'Large';
    else label = 'Hero';
    badge.textContent = `${captionFontSize} px (${label})`;
  }

  // Update pill buttons active state
  document.querySelectorAll('#captionSizePills .pill-btn').forEach(b => {
    if (b.textContent.includes(`${captionFontSize}px`)) {
      b.classList.add('active');
    } else {
      b.classList.remove('active');
    }
  });

  applyLiveCaptionOverlayStyle();
}

function setCaptionSizePreset(size, btn) {
  captionFontSize = parseInt(size, 10);
  const slider = $('captionSizeSlider');
  if (slider) slider.value = size;

  if (btn && btn.parentElement) {
    btn.parentElement.querySelectorAll('.pill-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  }

  const badge = $('captionSizeBadge');
  if (badge) {
    let label = 'Medium';
    if (size <= 12) label = 'Compact';
    else if (size <= 15) label = 'Default';
    else if (size <= 19) label = 'Large';
    else label = 'Hero';
    badge.textContent = `${size} px (${label})`;
  }

  applyLiveCaptionOverlayStyle();
  toast(`Caption size: ${size}px`);
}

function applyLiveCaptionOverlayStyle() {
  const el = $('liveSubText');
  if (!el) return;

  const colorHex = {
    gold: '#dfa067',
    cream: '#f7f2ea',
    caramel: '#c58f58',
    green: '#84a98c',
    white: '#ffffff'
  }[captionColor] || '#dfa067';

  const fs = captionFontSize || 15;

  // Apply visual styling matching ffmpeg preset with user-adjusted font size
  if (captionPreset === 'mrbeast') {
    el.style.fontFamily = 'Impact, -apple-system, sans-serif';
    el.style.fontSize = `${fs + 1}px`;
    el.style.color = colorHex;
    el.style.textShadow = '-1.5px -1.5px 0 #000, 1.5px -1.5px 0 #000, -1.5px 1.5px 0 #000, 1.5px 1.5px 0 #000';
    el.style.background = 'transparent';
  } else if (captionPreset === 'tiktok') {
    el.style.fontFamily = 'Arial, -apple-system, sans-serif';
    el.style.fontSize = `${fs}px`;
    el.style.fontWeight = '800';
    el.style.color = '#ffffff';
    el.style.textShadow = '-1.5px -1.5px 0 #000, 1.5px -1.5px 0 #000, -1.5px 1.5px 0 #000, 1.5px 1.5px 0 #000';
    el.style.background = 'transparent';
  } else if (captionPreset === 'karaoke') {
    el.style.fontFamily = 'Arial, -apple-system, sans-serif';
    el.style.fontSize = `${fs}px`;
    el.style.fontWeight = '800';
    el.style.color = '#e5ac74';
    el.style.textShadow = '0 0 6px rgba(229,172,116,0.8), -1px -1px 0 #000, 1px 1px 0 #000';
    el.style.background = 'transparent';
  } else if (captionPreset === 'cyber') {
    el.style.fontFamily = 'Trebuchet MS, -apple-system, sans-serif';
    el.style.fontSize = `${fs}px`;
    el.style.fontWeight = '800';
    el.style.color = colorHex;
    el.style.textShadow = '-1.5px -1.5px 0 #332211, 1.5px 1.5px 0 #000';
    el.style.background = 'transparent';
  } else if (captionPreset === 'clean') {
    el.style.fontFamily = 'Helvetica, -apple-system, sans-serif';
    el.style.fontSize = `${Math.max(10, fs - 2)}px`;
    el.style.fontWeight = '600';
    el.style.color = '#f7f2ea';
    el.style.textShadow = 'none';
    el.style.background = 'rgba(18, 14, 11, 0.85)';
  } else if (captionPreset === 'minimal') {
    el.style.fontFamily = 'Arial, -apple-system, sans-serif';
    el.style.fontSize = `${Math.max(9, fs - 3)}px`;
    el.style.fontWeight = '500';
    el.style.color = '#ded0bd';
    el.style.textShadow = '1px 1px 3px rgba(0, 0, 0, 0.9)';
    el.style.background = 'transparent';
  }
}

function toggleHookBannerDisplay(checked) {
  $('liveHookBanner').style.display = checked ? 'block' : 'none';
}

function updateLiveHookBanner(text) {
  $('liveHookBannerText').textContent = text.toUpperCase();
}

// Initial check on load
window.addEventListener('DOMContentLoaded', () => {
  applyLiveCaptionOverlayStyle();
  fetch('/api/health')
    .then(r => r.json())
    .then(d => {
      if (d.ok) {
        $('engineStatusText').textContent = 'Local AI Core • Active';
      }
    })
    .catch(() => {});
});
