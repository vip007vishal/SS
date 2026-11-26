(() => {
  "use strict";

  // =========================================================================
  // Stem Metadata Catalog (supports both 4-stem and 6-stem Demucs models)
  // =========================================================================
  const STEM_META = {
    vocals: {
      name: "Vocals",
      desc: "Lead & backing vocals isolated by Demucs",
      color: "#c084fc",
    },
    drums: {
      name: "Drums / Beats",
      desc: "Kick, snare, hi-hats, cymbals & percussion",
      color: "#fb923c",
    },
    bass: {
      name: "Bass",
      desc: "Bass guitar, 808s & sub-bass frequencies",
      color: "#38bdf8",
    },
    guitar: {
      name: "Guitar",
      desc: "Acoustic & electric guitar tracks",
      color: "#facc15",
    },
    piano: {
      name: "Piano / Keys",
      desc: "Piano, keys & melodic keyboard parts",
      color: "#a78bfa",
    },
    other: {
      name: "Instruments / Other",
      desc: "Synths, strings, brass & remaining accompaniment",
      color: "#34d399",
    },
    instrumental: {
      name: "Instrumental (No Vocals)",
      desc: "Full backing mix with vocals removed",
      color: "#f472b6",
      defaultMuted: true,
    },
  };

  // =========================================================================
  // DOM Elements
  // =========================================================================
  const $ = (id) => document.getElementById(id);

  const dropzone = $("dropzone");
  const fileInput = $("fileInput");
  const browseBtn = $("browseBtn");
  const demoBtn = $("demoBtn");
  const controlsBar = $("controlsBar");
  const metaName = $("metaName");
  const metaRate = $("metaRate");
  const metaChannels = $("metaChannels");
  const metaDuration = $("metaDuration");
  const modeSelect = $("modeSelect");
  const bitDepthSelect = null; // unused — export handled by exportQuality
  const splitBtn = $("splitBtn");
  const resetBtn = $("resetBtn");
  const progressWrap = $("progressWrap");
  const progressStage = $("progressStage");
  const progressPct = $("progressPct");
  const progressFill = $("progressFill");
  const engineStatus = $("engineStatus");

  const mixerPanel = $("mixerPanel");
  const playPauseBtn = $("playPauseBtn");
  const playIcon = $("playIcon");
  const pauseIcon = $("pauseIcon");
  const stopBtn = $("stopBtn");
  const loopBtn = $("loopBtn");
  const currentTimeEl = $("currentTime");
  const totalTimeEl = $("totalTime");
  const seekSlider = $("seekSlider");
  const masterVolume = $("masterVolume");
  const masterVolText = $("masterVolText");
  const downloadAllBtn = $("downloadAllBtn");
  const downloadCombinedBtn = $("downloadCombinedBtn");
  const exportFormat = $("exportFormat");
  const exportQuality = $("exportQuality");
  const exportQualityLabel = $("exportQualityLabel");
  const exportSampleRate = $("exportSampleRate");
  const spectrumCanvas = $("spectrumCanvas");
  const stemsList = $("stemsList");

  const QUALITY_OPTIONS = {
    wav: {
      label: "Bit Depth",
      options: [
        { value: "32f", text: "32-bit Float (Studio Master)" },
        { value: "24", text: "24-bit PCM (Pro Mastering)" },
        { value: "16", text: "16-bit PCM (CD Standard)" },
      ],
    },
    flac: {
      label: "Bit Depth",
      options: [
        { value: "24", text: "24-bit Lossless" },
        { value: "16", text: "16-bit Lossless" },
      ],
    },
    mp3: {
      label: "Bitrate",
      options: [
        { value: "320k", text: "320 kbps (Extreme)" },
        { value: "256k", text: "256 kbps (High)" },
        { value: "192k", text: "192 kbps (Standard)" },
        { value: "128k", text: "128 kbps (Medium)" },
        { value: "64k", text: "64 kbps (Low / Small)" },
      ],
    },
    m4a: {
      label: "Bitrate",
      options: [
        { value: "320k", text: "320 kbps (Extreme)" },
        { value: "256k", text: "256 kbps (High)" },
        { value: "192k", text: "192 kbps (Standard)" },
        { value: "128k", text: "128 kbps (Medium)" },
        { value: "64k", text: "64 kbps (Low / Small)" },
      ],
    },
    ogg: {
      label: "Bitrate",
      options: [
        { value: "320k", text: "320 kbps (Extreme)" },
        { value: "192k", text: "192 kbps (High)" },
        { value: "128k", text: "128 kbps (Standard)" },
        { value: "64k", text: "64 kbps (Low / Small)" },
      ],
    },
  };

  function refreshExportQualityOptions() {
    const fmt = exportFormat.value;
    const cfg = QUALITY_OPTIONS[fmt] || QUALITY_OPTIONS.wav;
    exportQualityLabel.textContent = cfg.label;
    exportQuality.innerHTML = cfg.options
      .map((o) => `<option value="${o.value}">${o.text}</option>`)
      .join("");
    const extUpper = fmt.toUpperCase();
    downloadAllBtn.textContent = `Download Selected (${extUpper}s)`;
    downloadCombinedBtn.textContent = `Download Combined (${extUpper})`;
    document.querySelectorAll('[data-action="download"] span').forEach((el) => {
      el.textContent = extUpper;
    });
  }

  exportFormat.addEventListener("change", refreshExportQualityOptions);
  refreshExportQualityOptions();

  // =========================================================================
  // Application State
  // =========================================================================
  let audioCtx = null;
  let masterGain = null;
  let analyser = null;

  let currentFile = null; // File or Blob for backend upload
  let sourceFileName = "track";
  let sourceDuration = 0;
  let activeStems = []; // [{ id, name, desc, color, url, defaultMuted }]
  let stemBuffers = {}; // { stemId: AudioBuffer }
  let stemState = {}; // { stemId: { volume, muted, solo, gainNode, sourceNode, ... } }
  let currentJobId = null;

  let isPlaying = false;
  let isLooping = false;
  let playStartTime = 0;
  let pauseOffset = 0;
  let animFrameId = null;

  // =========================================================================
  // Backend Health Check
  // =========================================================================
  async function checkBackend() {
    try {
      const res = await fetch("/api/health");
      if (res.ok) {
        const data = await res.json();
        engineStatus.textContent = `Demucs AI Ready (${String(data.device || "cpu").toUpperCase()})`;
        return;
      }
    } catch (_) {}
    engineStatus.textContent = "Backend Offline — Run server.py";
  }
  checkBackend();

  // =========================================================================
  // Helpers
  // =========================================================================
  function getAudioContext(preferredSampleRate) {
    if (!audioCtx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      audioCtx = preferredSampleRate
        ? new Ctx({ sampleRate: preferredSampleRate })
        : new Ctx();
      masterGain = audioCtx.createGain();
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.82;
      masterGain.connect(analyser);
      analyser.connect(audioCtx.destination);
    }
    return audioCtx;
  }

  function formatTime(sec) {
    if (!isFinite(sec) || sec < 0) sec = 0;
    const mins = Math.floor(sec / 60);
    const secs = Math.floor(sec % 60);
    const cs = Math.floor((sec % 1) * 100);
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
  }

  function stripExtension(name) {
    return name.replace(/\.[^/.]+$/, "");
  }

  function setProgress(pct, stageText) {
    progressWrap.hidden = false;
    progressFill.style.width = `${Math.min(100, Math.max(0, pct))}%`;
    progressPct.textContent = `${Math.round(pct)}%`;
    if (stageText) progressStage.textContent = stageText;
  }

  function cleanupCurrentJob(useBeacon = false) {
    if (!currentJobId) return;
    const url = `/api/jobs/${currentJobId}/cleanup`;
    currentJobId = null;
    if (useBeacon && navigator.sendBeacon) {
      navigator.sendBeacon(url);
    } else {
      fetch(url, { method: "POST", keepalive: true }).catch(() => {});
    }
  }

  // =========================================================================
  // File Loading & Preview Metadata
  // =========================================================================
  async function handleFile(file) {
    if (!file) return;
    cleanupCurrentJob(false);
    stopPlayback();
    mixerPanel.hidden = true;
    currentFile = file;
    sourceFileName = stripExtension(file.name);

    dropzone.hidden = true;
    controlsBar.hidden = false;
    metaName.textContent = file.name;
    metaRate.textContent = "Detecting...";
    metaChannels.textContent = "Detecting...";
    metaDuration.textContent = "Detecting...";

    try {
      const arrayBuffer = await file.arrayBuffer();
      const ctx = getAudioContext();
      const decoded = await ctx.decodeAudioData(arrayBuffer.slice(0));
      metaRate.textContent = `${decoded.sampleRate} Hz`;
      metaChannels.textContent =
        decoded.numberOfChannels === 1 ? "1 (Mono)" : `${decoded.numberOfChannels} (Stereo)`;
      metaDuration.textContent = formatTime(decoded.duration);
      sourceDuration = decoded.duration;
      totalTimeEl.textContent = formatTime(decoded.duration);
    } catch (_) {
      metaRate.textContent = "Native (Server Decode)";
      metaChannels.textContent = "Auto";
      metaDuration.textContent = "Auto";
    }

    // Automatically start Python Demucs separation immediately on upload
    await runSeparation();
  }

  // =========================================================================
  // Synthetic Demo Track Generator (WAV Blob for Demucs Testing)
  // =========================================================================
  function generateDemoTrack() {
    stopPlayback();
    mixerPanel.hidden = true;
    const sr = 44100;
    const duration = 8.0;
    const length = Math.floor(sr * duration);
    const L = new Float32Array(length);
    const R = new Float32Array(length);

    const bpm = 120;
    const beatSec = 60 / bpm;
    const sixteenth = beatSec / 4;
    const bassNotes = [55.0, 55.0, 65.41, 49.0];
    const leadNotes = [
      { t: 0.0, d: 0.9, f: 440 },
      { t: 1.0, d: 0.45, f: 523.25 },
      { t: 1.5, d: 0.45, f: 493.88 },
      { t: 2.0, d: 1.4, f: 392.0 },
      { t: 4.0, d: 0.9, f: 440 },
      { t: 5.0, d: 0.9, f: 587.33 },
      { t: 6.0, d: 1.6, f: 523.25 },
    ];

    let seed = 1337;
    const rand = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 1073741823.5 - 1;
    };

    for (let i = 0; i < length; i++) {
      const t = i / sr;
      const barIdx = Math.floor(t / (beatSec * 4)) % 4;
      const beatPhase = t % beatSec;
      const sixteenthPhase = t % sixteenth;

      const kickEnv = Math.exp(-beatPhase * 18);
      const kick = Math.sin(2 * Math.PI * (50 + 110 * Math.exp(-beatPhase * 35)) * beatPhase) * kickEnv * 0.55;

      const snareTime = (t + beatSec) % (beatSec * 2);
      const snareEnv = snareTime < 0.22 ? Math.exp(-snareTime * 22) : 0;
      const snare = (rand() * 0.65 + Math.sin(2 * Math.PI * 185 * snareTime) * 0.35) * snareEnv * 0.42;

      const hat = rand() * Math.exp(-sixteenthPhase * 45) * 0.16;

      const bassFreq = bassNotes[barIdx];
      const eighthPhase = t % (beatSec / 2);
      const bass =
        (Math.sin(2 * Math.PI * bassFreq * t) * 0.7 + Math.sin(4 * Math.PI * bassFreq * t) * 0.25) *
        Math.exp(-eighthPhase * 3.2) *
        0.42;

      const chordRoot = bassNotes[barIdx] * 4;
      const padL =
        (Math.sin(2 * Math.PI * chordRoot * t) +
          0.7 * Math.sin(2 * Math.PI * (chordRoot * 1.2) * t + 0.4) +
          0.6 * Math.sin(2 * Math.PI * (chordRoot * 1.5) * t + 1.1)) *
        0.09;
      const padR =
        (Math.sin(2 * Math.PI * chordRoot * t + 1.5) +
          0.7 * Math.sin(2 * Math.PI * (chordRoot * 1.2) * t + 2.1) +
          0.6 * Math.sin(2 * Math.PI * (chordRoot * 1.5) * t + 2.8)) *
        0.09;

      let vocal = 0;
      for (const note of leadNotes) {
        if (t >= note.t && t < note.t + note.d) {
          const nt = t - note.t;
          const env = Math.min(1, nt / 0.04) * Math.min(1, (note.d - nt) / 0.08);
          const f0 = note.f * (1 + 0.008 * Math.sin(2 * Math.PI * 5.5 * nt));
          vocal +=
            (Math.sin(2 * Math.PI * f0 * nt) * 0.5 +
              Math.sin(2 * Math.PI * f0 * 2 * nt) * 0.35 +
              Math.sin(2 * Math.PI * f0 * 3 * nt) * 0.18) *
            env *
            0.25;
        }
      }

      L[i] = Math.max(-0.98, Math.min(0.98, kick + snare + hat * 0.8 + bass + padL + vocal));
      R[i] = Math.max(-0.98, Math.min(0.98, kick + snare + hat * 1.2 + bass - padR + vocal));
    }

    const wavBlob = encodeFloatWavFromChannels([L, R], sr);
    const demoFile = new File([wavBlob], "synthetic-demo-120bpm.wav", { type: "audio/wav" });
    handleFile(demoFile);
  }

  function encodeFloatWavFromChannels(channels, sampleRate) {
    const numCh = channels.length;
    const length = channels[0].length;
    const dataSize = length * numCh * 4;
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);
    const writeStr = (off, str) => {
      for (let i = 0; i < str.length; i++) view.setUint8(off + i, str.charCodeAt(i));
    };
    writeStr(0, "RIFF");
    view.setUint32(4, 36 + dataSize, true);
    writeStr(8, "WAVE");
    writeStr(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 3, true);
    view.setUint16(22, numCh, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * numCh * 4, true);
    view.setUint16(32, numCh * 4, true);
    view.setUint16(34, 32, true);
    writeStr(36, "data");
    view.setUint32(40, dataSize, true);
    let offset = 44;
    for (let i = 0; i < length; i++) {
      for (let ch = 0; ch < numCh; ch++) {
        view.setFloat32(offset, channels[ch][i], true);
        offset += 4;
      }
    }
    return new Blob([buffer], { type: "audio/wav" });
  }

  // =========================================================================
  // Neural Separation via Python Demucs Backend
  // =========================================================================
  async function runSeparation() {
    if (!currentFile) return;
    stopPlayback();

    splitBtn.disabled = true;
    resetBtn.disabled = true;
    mixerPanel.hidden = true;
    setProgress(3, "Uploading audio to Demucs neural backend...");
    engineStatus.textContent = "Uploading & Splitting...";

    try {
      const formData = new FormData();
      formData.append("file", currentFile);
      formData.append("model", modeSelect.value);
      formData.append("bit_depth", "32f");

      const uploadRes = await fetch("/api/split", {
        method: "POST",
        body: formData,
      });

      if (!uploadRes.ok) {
        throw new Error(`Upload failed (${uploadRes.status})`);
      }

      const { job_id } = await uploadRes.json();
      currentJobId = job_id;

      // Poll job progress
      while (true) {
        await new Promise((r) => setTimeout(r, 600));
        const pollRes = await fetch(`/api/jobs/${job_id}`);
        if (!pollRes.ok) throw new Error("Lost connection to separation job.");
        const job = await pollRes.json();

        setProgress(job.progress || 0, job.stage || "Processing...");

        if (job.meta) {
          metaRate.textContent = `${job.meta.sampleRate} Hz`;
          metaChannels.textContent =
            job.meta.channels === 1 ? "1 (Mono)" : `${job.meta.channels} (Stereo)`;
          metaDuration.textContent = formatTime(job.meta.duration);
          sourceDuration = job.meta.duration;
          totalTimeEl.textContent = formatTime(job.meta.duration);
        }

        if (job.status === "error") {
          throw new Error(job.error || "Neural separation failed.");
        }

        if (job.status === "done") {
          setProgress(96, "Loading lossless WAV stems into studio mixer...");
          await loadSeparatedStems(job.stems, job.meta?.sampleRate);
          break;
        }
      }

      progressWrap.hidden = true;
      engineStatus.textContent = "Demucs Stems Ready";
    } catch (err) {
      console.error(err);
      progressWrap.hidden = true;
      engineStatus.textContent = "Separation Error";
      alert(`Separation failed: ${err.message}\n\nMake sure the Python server (server.py) is running.`);
    } finally {
      splitBtn.disabled = false;
      resetBtn.disabled = false;
    }
  }

  async function loadSeparatedStems(stemItems, nativeSampleRate) {
    const ctx = getAudioContext(nativeSampleRate || undefined);
    stemBuffers = {};
    activeStems = [];

    // Fetch & decode stem WAVs sequentially to keep browser memory smooth and show progress
    for (let i = 0; i < stemItems.length; i++) {
      const item = stemItems[i];
      const meta = STEM_META[item.id];
      const label = meta ? meta.name : item.id;
      setProgress(
        90 + ((i + 1) / stemItems.length) * 9,
        `Loading ${label} (${i + 1}/${stemItems.length}) into mixer...`
      );
      const res = await fetch(item.url);
      if (!res.ok) throw new Error(`Failed to fetch stem ${item.id}`);
      const buf = await res.arrayBuffer();
      const decoded = await ctx.decodeAudioData(buf);
      stemBuffers[item.id] = decoded;
      if (!sourceDuration) sourceDuration = decoded.duration;
    }

    // Preserve display order
    const preferredOrder = ["vocals", "drums", "bass", "guitar", "piano", "other", "instrumental"];
    const sorted = [...stemItems].sort(
      (a, b) => preferredOrder.indexOf(a.id) - preferredOrder.indexOf(b.id)
    );

    activeStems = sorted.map((item) => {
      const meta = STEM_META[item.id] || {
        name: item.id.toUpperCase(),
        desc: "Separated stem",
        color: "#60a5fa",
      };
      return {
        id: item.id,
        url: item.url,
        ...meta,
      };
    });

    totalTimeEl.textContent = formatTime(sourceDuration);
    buildMixerUI();
  }

  // =========================================================================
  // Mixer UI & Waveform Rendering
  // =========================================================================
  const ICON_PLAY = `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 4 20 12 6 20 6 4"/></svg>`;
  const ICON_PAUSE = `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>`;
  const ICON_DOWNLOAD = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`;

  function buildMixerUI() {
    stemsList.innerHTML = "";
    stemState = {};
    pauseOffset = 0;
    seekSlider.value = 0;
    currentTimeEl.textContent = formatTime(0);

    for (const stem of activeStems) {
      const row = document.createElement("div");
      row.className = "stem-row" + (stem.defaultMuted ? " muted" : "");
      row.style.setProperty("--stem-color", stem.color);

      row.innerHTML = `
        <input type="checkbox" class="stem-cb" data-action="select" ${stem.defaultMuted ? "" : "checked"} title="Include in batch / combined download" />
        <div class="stem-left">
          <button type="button" class="stem-play-btn" data-action="track-play" title="Play / Pause ${stem.name}">
            ${ICON_PLAY}
          </button>
          <div class="stem-info">
            <div class="stem-name-row">
              <span class="stem-name">${stem.name}</span>
              <div class="ms-group">
                <button type="button" class="ms-btn ${stem.defaultMuted ? "mute-active" : ""}" data-action="mute" title="Mute">M</button>
                <button type="button" class="ms-btn" data-action="solo" title="Solo">S</button>
              </div>
            </div>
            <span class="stem-desc">${stem.desc}</span>
          </div>
        </div>

        <div class="stem-wave-wrap" title="Click to seek">
          <canvas class="stem-wave-canvas" height="54"></canvas>
          <div class="stem-playhead"></div>
        </div>

        <div class="stem-controls">
          <div class="stem-vol-row">
            <input type="range" min="0" max="150" value="100" data-action="volume" aria-label="${stem.name} volume" />
            <span class="mono stem-vol-val">100%</span>
          </div>
          <button type="button" class="btn-dl" data-action="download" title="Download stem">
            ${ICON_DOWNLOAD}
            <span>${exportFormat.value.toUpperCase()}</span>
          </button>
        </div>
      `;

      const waveCanvas = row.querySelector(".stem-wave-canvas");
      const playheadEl = row.querySelector(".stem-playhead");
      const waveWrap = row.querySelector(".stem-wave-wrap");
      const selectCb = row.querySelector('[data-action="select"]');
      const trackPlayBtn = row.querySelector('[data-action="track-play"]');
      const muteBtn = row.querySelector('[data-action="mute"]');
      const soloBtn = row.querySelector('[data-action="solo"]');
      const volSlider = row.querySelector('[data-action="volume"]');
      const volReadout = row.querySelector(".mono.stem-vol-val, .mono.vol-readout");
      const downloadBtn = row.querySelector('[data-action="download"]');

      stemState[stem.id] = {
        volume: 1.0,
        muted: Boolean(stem.defaultMuted),
        solo: false,
        selected: !stem.defaultMuted,
        gainNode: null,
        sourceNode: null,
        rowEl: row,
        selectCb,
        trackPlayBtn,
        muteBtn,
        soloBtn,
        waveCanvas,
        playheadEl,
      };

      selectCb.addEventListener("change", () => {
        stemState[stem.id].selected = selectCb.checked;
      });

      trackPlayBtn.addEventListener("click", () => {
        const st = stemState[stem.id];
        const anySolo = activeStems.some((s) => stemState[s.id]?.solo);
        const isAudible = !st.muted && (!anySolo || st.solo);

        if (isPlaying && isAudible) {
          // If this is the only audible track, pause master; otherwise mute/pause just this track
          const audibleCount = activeStems.filter((s) => {
            const o = stemState[s.id];
            return o && !o.muted && (!anySolo || o.solo);
          }).length;

          if (audibleCount <= 1) {
            pausePlayback();
          } else {
            if (anySolo) st.solo = false;
            else st.muted = true;
            updateStemGains();
          }
        } else {
          // Unmute / bring this track in and start playback if paused
          st.muted = false;
          if (anySolo) st.solo = true;
          updateStemGains();
          if (!isPlaying) startPlayback(pauseOffset);
        }
      });

      muteBtn.addEventListener("click", () => {
        stemState[stem.id].muted = !stemState[stem.id].muted;
        updateStemGains();
      });

      soloBtn.addEventListener("click", () => {
        stemState[stem.id].solo = !stemState[stem.id].solo;
        updateStemGains();
      });

      volSlider.addEventListener("input", (e) => {
        const val = Number(e.target.value);
        stemState[stem.id].volume = val / 100;
        volReadout.textContent = `${val}%`;
        updateStemGains();
      });

      downloadBtn.addEventListener("click", () => downloadStemWav(stem));

      waveWrap.addEventListener("click", (e) => {
        if (!sourceDuration) return;
        const rect = waveWrap.getBoundingClientRect();
        const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        seekTo(ratio * sourceDuration);
      });

      stemsList.appendChild(row);
      drawWaveform(waveCanvas, stemBuffers[stem.id], stem.color);
    }

    mixerPanel.hidden = false;
    updateStemGains();
  }

  function drawWaveform(canvas, audioBuffer, color) {
    const width = (canvas.width = canvas.parentElement.clientWidth || 600);
    const height = canvas.height;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, width, height);

    const data = audioBuffer.getChannelData(0);
    const step = Math.max(1, Math.floor(data.length / width));
    const mid = height / 2;

    ctx.fillStyle = color;
    ctx.globalAlpha = 0.85;

    for (let x = 0; x < width; x++) {
      let min = 1.0;
      let max = -1.0;
      const start = x * step;
      for (let i = 0; i < step; i++) {
        const val = data[start + i];
        if (val !== undefined) {
          if (val < min) min = val;
          if (val > max) max = val;
        }
      }
      const yTop = mid + min * mid * 0.92;
      const yBot = mid + max * mid * 0.92;
      const barH = Math.max(1, yBot - yTop);
      ctx.fillRect(x, yTop, 1, barH);
    }
    ctx.globalAlpha = 1.0;
  }

  function updateStemGains() {
    const anySolo = activeStems.some((s) => stemState[s.id]?.solo);

    for (const s of activeStems) {
      const st = stemState[s.id];
      if (!st) continue;
      const effectiveMuted = st.muted || (anySolo && !st.solo);
      const trackPlaying = isPlaying && !effectiveMuted;

      st.muteBtn.classList.toggle("mute-active", st.muted);
      st.soloBtn.classList.toggle("solo-active", st.solo);
      st.rowEl.classList.toggle("muted", effectiveMuted);
      if (st.trackPlayBtn) {
        st.trackPlayBtn.classList.toggle("playing", trackPlaying);
        st.trackPlayBtn.innerHTML = trackPlaying ? ICON_PAUSE : ICON_PLAY;
      }

      if (st.gainNode && audioCtx) {
        st.gainNode.gain.setTargetAtTime(effectiveMuted ? 0 : st.volume, audioCtx.currentTime, 0.015);
      }
    }
  }

  // =========================================================================
  // Synchronized Multi-Track Playback
  // =========================================================================
  async function startPlayback(offsetSec = 0) {
    if (!activeStems.length) return;
    const ctx = getAudioContext();
    if (ctx.state === "suspended") await ctx.resume();

    stopNodesOnly();

    const duration = sourceDuration;
    const clampedOffset = Math.max(0, Math.min(offsetSec, Math.max(0, duration - 0.01)));
    const startWhen = ctx.currentTime + 0.02;

    for (const s of activeStems) {
      const st = stemState[s.id];
      const buf = stemBuffers[s.id];
      if (!st || !buf) continue;

      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = isLooping;

      const gain = ctx.createGain();
      src.connect(gain);
      gain.connect(masterGain);

      st.sourceNode = src;
      st.gainNode = gain;
      src.start(startWhen, clampedOffset);
    }

    const firstSrc = stemState[activeStems[0].id]?.sourceNode;
    if (firstSrc) {
      firstSrc.onended = () => {
        if (isPlaying && !isLooping) {
          const elapsed = ctx.currentTime - playStartTime;
          if (elapsed >= duration - 0.05) {
            stopPlayback();
          }
        }
      };
    }

    playStartTime = startWhen - clampedOffset;
    pauseOffset = clampedOffset;
    isPlaying = true;
    updateStemGains();
    updateTransportIcons();
    startRenderLoop();
  }

  function stopNodesOnly() {
    for (const s of activeStems) {
      const st = stemState[s.id];
      if (st?.sourceNode) {
        try {
          st.sourceNode.onended = null;
          st.sourceNode.stop();
          st.sourceNode.disconnect();
        } catch (_) {}
        st.sourceNode = null;
      }
      if (st?.gainNode) {
        st.gainNode.disconnect();
        st.gainNode = null;
      }
    }
  }

  function pausePlayback() {
    if (!isPlaying || !audioCtx) return;
    pauseOffset = (audioCtx.currentTime - playStartTime) % sourceDuration;
    stopNodesOnly();
    isPlaying = false;
    updateTransportIcons();
    cancelAnimationFrame(animFrameId);
  }

  function stopPlayback() {
    stopNodesOnly();
    isPlaying = false;
    pauseOffset = 0;
    updateTransportIcons();
    cancelAnimationFrame(animFrameId);
    updatePlayheadUI(0);
  }

  function seekTo(sec) {
    if (!sourceDuration) return;
    const clamped = Math.max(0, Math.min(sec, sourceDuration));
    pauseOffset = clamped;
    updatePlayheadUI(clamped);
    if (isPlaying) {
      startPlayback(clamped);
    }
  }

  function updateTransportIcons() {
    playIcon.hidden = isPlaying;
    pauseIcon.hidden = !isPlaying;
    updateStemGains();
  }

  function updatePlayheadUI(currentSec) {
    const duration = sourceDuration || 1;
    const pct = Math.min(100, Math.max(0, (currentSec / duration) * 100));
    currentTimeEl.textContent = formatTime(currentSec);
    seekSlider.value = Math.round((pct / 100) * 1000);
    for (const s of activeStems) {
      const st = stemState[s.id];
      if (st?.playheadEl) {
        st.playheadEl.style.left = `${pct}%`;
      }
    }
  }

  function startRenderLoop() {
    cancelAnimationFrame(animFrameId);
    const freqData = new Uint8Array(analyser.frequencyBinCount);

    const tick = () => {
      if (!isPlaying || !audioCtx || !sourceDuration) return;
      let current = audioCtx.currentTime - playStartTime;
      if (isLooping) current = current % sourceDuration;
      updatePlayheadUI(current);

      analyser.getByteFrequencyData(freqData);
      const w = (spectrumCanvas.width = spectrumCanvas.clientWidth || 800);
      const h = spectrumCanvas.height;
      const sCtx = spectrumCanvas.getContext("2d");
      sCtx.clearRect(0, 0, w, h);

      const barCount = freqData.length;
      const barW = w / barCount;
      for (let i = 0; i < barCount; i++) {
        const val = freqData[i] / 255;
        const barH = val * (h - 6);
        const hue = 250 - val * 70;
        sCtx.fillStyle = `hsla(${hue}, 85%, 65%, 0.9)`;
        sCtx.fillRect(i * barW, h - barH, Math.max(1, barW - 1), barH);
      }

      animFrameId = requestAnimationFrame(tick);
    };
    animFrameId = requestAnimationFrame(tick);
  }

  function downloadStemWav(stem) {
    const fmt = exportFormat.value;
    const br = exportQuality.value;
    const sr = exportSampleRate.value;
    const a = document.createElement("a");
    a.href = `${stem.url}?download=1&fmt=${encodeURIComponent(fmt)}&bitrate=${encodeURIComponent(br)}&sr=${encodeURIComponent(sr)}`;
    a.download = `${sourceFileName}_${stem.id}.${fmt}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  // =========================================================================
  // Event Listeners
  // =========================================================================
  browseBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    fileInput.click();
  });

  demoBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    generateDemoTrack();
  });

  dropzone.addEventListener("click", () => fileInput.click());
  dropzone.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      fileInput.click();
    }
  });

  dropzone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropzone.classList.add("drag-over");
  });
  dropzone.addEventListener("dragleave", () => dropzone.classList.remove("drag-over"));
  dropzone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropzone.classList.remove("drag-over");
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  });

  fileInput.addEventListener("change", (e) => {
    if (e.target.files[0]) handleFile(e.target.files[0]);
    fileInput.value = "";
  });

  splitBtn.addEventListener("click", runSeparation);

  resetBtn.addEventListener("click", () => {
    cleanupCurrentJob(false);
    stopPlayback();
    currentFile = null;
    stemBuffers = {};
    activeStems = [];
    controlsBar.hidden = true;
    mixerPanel.hidden = true;
    progressWrap.hidden = true;
    dropzone.hidden = false;
    checkBackend();
  });

  window.addEventListener("pagehide", () => cleanupCurrentJob(true));
  window.addEventListener("beforeunload", () => cleanupCurrentJob(true));

  playPauseBtn.addEventListener("click", () => {
    if (isPlaying) pausePlayback();
    else startPlayback(pauseOffset);
  });

  stopBtn.addEventListener("click", stopPlayback);

  loopBtn.addEventListener("click", () => {
    isLooping = !isLooping;
    loopBtn.classList.toggle("active", isLooping);
    for (const s of activeStems) {
      if (stemState[s.id]?.sourceNode) {
        stemState[s.id].sourceNode.loop = isLooping;
      }
    }
  });

  seekSlider.addEventListener("input", (e) => {
    if (!sourceDuration) return;
    const sec = (Number(e.target.value) / 1000) * sourceDuration;
    seekTo(sec);
  });

  masterVolume.addEventListener("input", (e) => {
    const val = Number(e.target.value);
    masterVolText.textContent = `${val}%`;
    if (masterGain && audioCtx) {
      masterGain.gain.setTargetAtTime(val / 100, audioCtx.currentTime, 0.015);
    }
  });

  function getSelectedStems() {
    return activeStems.filter((s) => stemState[s.id]?.selected);
  }

  downloadAllBtn.addEventListener("click", () => {
    const selected = getSelectedStems();
    if (!selected.length) {
      alert("Select at least one stem checkbox to download.");
      return;
    }
    selected.forEach((s, idx) => {
      setTimeout(() => downloadStemWav(s), idx * 250);
    });
  });

  downloadCombinedBtn.addEventListener("click", () => {
    const selected = getSelectedStems();
    if (!selected.length || !currentJobId) {
      alert("Select at least one stem checkbox to download as a combined track.");
      return;
    }
    const fmt = exportFormat.value;
    const br = exportQuality.value;
    const sr = exportSampleRate.value;
    const stemsParam = selected.map((s) => s.id).join(",");
    const a = document.createElement("a");
    a.href = `/api/jobs/${currentJobId}/combine?stems=${encodeURIComponent(stemsParam)}&fmt=${encodeURIComponent(fmt)}&bitrate=${encodeURIComponent(br)}&sr=${encodeURIComponent(sr)}`;
    a.download = `${sourceFileName}_combined.${fmt}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  });

  window.addEventListener("keydown", (e) => {
    if (e.code === "Space" && !mixerPanel.hidden && document.activeElement.tagName !== "BUTTON") {
      e.preventDefault();
      if (isPlaying) pausePlayback();
      else startPlayback(pauseOffset);
    }
  });
})();
