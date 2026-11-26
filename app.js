(() => {
  "use strict";

  // =========================================================================
  // Stem Metadata Catalog (supports both 4-stem and 6-stem Demucs models)
  // =========================================================================
  const STEM_META = {
    vocals: {
      name: "Vocals",
      desc: "Lead & backing vocals isolated by Demucs",
      color: "#A98EDB",
    },
    drums: {
      name: "Drums / Beats",
      desc: "Kick, snare, hi-hats, cymbals & percussion",
      color: "#D88A52",
    },
    bass: {
      name: "Bass",
      desc: "Bass guitar, 808s & sub-bass frequencies",
      color: "#568FE8",
    },
    guitar: {
      name: "Guitar",
      desc: "Acoustic & electric guitar tracks",
      color: "#CCA24B",
    },
    piano: {
      name: "Piano / Keys",
      desc: "Piano, keys & melodic keyboard parts",
      color: "#8E84C9",
    },
    other: {
      name: "Instruments / Other",
      desc: "Synths, strings, brass & remaining accompaniment",
      color: "#4EA898",
    },
    instrumental: {
      name: "Instrumental (No Vocals)",
      desc: "Full backing mix with vocals removed",
      color: "#C97896",
      defaultMuted: true,
    },
  };

  // =========================================================================
  // DOM Elements
  // =========================================================================
  const $ = (id) => document.getElementById(id);

  const landingScreen = $("landingScreen");
  const workspaceScreen = $("workspaceScreen");
  const dropzone = $("dropzone");
  const fileInput = $("fileInput");
  const browseBtn = $("browseBtn");
  const demoBtn = $("demoBtn");
  const controlsBar = $("controlsBar");
  const metaName = $("metaName");
  const metaRate = $("metaRate");
  const metaChannels = $("metaChannels");
  const metaDuration = $("metaDuration");
  const metaFormat = $("metaFormat");
  const modeSelect = $("modeSelect");
  const bitDepthSelect = null; // unused — export handled by exportQuality
  const splitBtn = $("splitBtn");
  const resetBtn = $("resetBtn");
  const progressWrap = $("progressWrap");
  const progressStage = $("progressStage");
  const progressPct = $("progressPct");
  const progressFill = $("progressFill");
  const stemsSummary = $("stemsSummary");
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
    dts: {
      label: "Bitrate",
      options: [
        { value: "1536k", text: "1536 kbps (DTS Studio Master)" },
        { value: "768k", text: "768 kbps (DTS Core)" },
        { value: "512k", text: "512 kbps (High)" },
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
        { value: "512k", text: "512 kbps (Ultra)" },
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
        { value: "512k", text: "512 kbps (Ultra)" },
        { value: "320k", text: "320 kbps (Extreme)" },
        { value: "256k", text: "256 kbps (High)" },
        { value: "192k", text: "192 kbps (Standard)" },
        { value: "128k", text: "128 kbps (Medium)" },
        { value: "64k", text: "64 kbps (Low / Small)" },
      ],
    },
  };

  // =========================================================================
  // Custom Designed Dropdowns
  // =========================================================================
  const CHEVRON_SVG = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>`;
  const CHECK_SVG = `<svg class="rx-select-check" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;

  function closeAllCustomSelects(exceptEl = null) {
    document.querySelectorAll(".rx-select.open").forEach((el) => {
      if (el !== exceptEl) {
        el.classList.remove("open");
        el.querySelector(".rx-select-trigger")?.setAttribute("aria-expanded", "false");
      }
    });
  }

  document.addEventListener("click", (e) => {
    if (!e.target.closest(".rx-select")) closeAllCustomSelects();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeAllCustomSelects();
  });

  function enhanceSelect(selectEl) {
    if (!selectEl || selectEl.dataset.rxEnhanced) return;
    selectEl.dataset.rxEnhanced = "1";

    const wrapper = document.createElement("div");
    wrapper.className = "rx-select";
    selectEl.parentNode.insertBefore(wrapper, selectEl);
    wrapper.appendChild(selectEl);
    selectEl.classList.add("rx-select-native");
    selectEl.tabIndex = -1;

    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = "rx-select-trigger";
    trigger.setAttribute("aria-haspopup", "listbox");
    trigger.setAttribute("aria-expanded", "false");
    trigger.innerHTML = `<span class="rx-select-label"></span><span class="rx-select-arrow" aria-hidden="true">${CHEVRON_SVG}</span>`;

    const menu = document.createElement("div");
    menu.className = "rx-select-menu";
    menu.setAttribute("role", "listbox");

    wrapper.appendChild(trigger);
    wrapper.appendChild(menu);

    const labelSpan = trigger.querySelector(".rx-select-label");

    const syncUI = () => {
      const opts = Array.from(selectEl.options);
      const selectedOpt = opts[selectEl.selectedIndex] || opts[0];
      labelSpan.textContent = selectedOpt ? selectedOpt.textContent : "";

      menu.innerHTML = "";
      for (const opt of opts) {
        const item = document.createElement("button");
        item.type = "button";
        item.className = "rx-select-opt" + (opt.value === selectEl.value ? " selected" : "");
        item.setAttribute("role", "option");
        item.setAttribute("aria-selected", opt.value === selectEl.value ? "true" : "false");
        item.innerHTML = `<span>${opt.textContent}</span>${CHECK_SVG}`;
        item.addEventListener("click", (e) => {
          e.stopPropagation();
          if (selectEl.value !== opt.value) {
            selectEl.value = opt.value;
            selectEl.dispatchEvent(new Event("change", { bubbles: true }));
          }
          syncUI();
          closeAllCustomSelects();
        });
        menu.appendChild(item);
      }
    };

    trigger.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const willOpen = !wrapper.classList.contains("open");
      closeAllCustomSelects(wrapper);
      wrapper.classList.toggle("open", willOpen);
      trigger.setAttribute("aria-expanded", willOpen ? "true" : "false");
    });

    selectEl.addEventListener("change", syncUI);
    const obs = new MutationObserver(syncUI);
    obs.observe(selectEl, { childList: true, subtree: true });
    selectEl._rxSync = syncUI;
    syncUI();
  }

  [modeSelect, exportFormat, exportQuality, exportSampleRate].forEach(enhanceSelect);

  function refreshExportQualityOptions() {
    const fmt = exportFormat.value;
    const cfg = QUALITY_OPTIONS[fmt] || QUALITY_OPTIONS.wav;
    exportQualityLabel.textContent = cfg.label;
    exportQuality.innerHTML = cfg.options
      .map((o) => `<option value="${o.value}">${o.text}</option>`)
      .join("");
    exportQuality._rxSync?.();
    const extUpper = fmt.toUpperCase();
    downloadAllBtn.textContent = `Download Selected Stems (${extUpper})`;
    downloadCombinedBtn.textContent = `Download Combined Mix (${extUpper})`;
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
  const LOCAL_BACKEND_FALLBACK = "http://127.0.0.1:8000";
  let API_BASE =
    window.location.protocol === "file:" ||
    ((window.location.hostname === "127.0.0.1" || window.location.hostname === "localhost") && window.location.port !== "8000")
      ? LOCAL_BACKEND_FALLBACK
      : "";

  function apiUrl(path) {
    if (!path) return path;
    if (/^https?:\/\//i.test(path)) return path;
    return `${API_BASE}${path.startsWith("/") ? path : `/${path}`}`;
  }

  async function resolveApiBase() {
    if (API_BASE) return API_BASE;
    try {
      const res = await fetch("/api/health");
      if (res.ok) {
        const data = await res.json();
        if (data && data.ok) {
          API_BASE = "";
          return API_BASE;
        }
      }
    } catch (_) {}
    try {
      const res = await fetch(`${LOCAL_BACKEND_FALLBACK}/api/health`);
      if (res.ok) {
        const data = await res.json();
        if (data && data.ok) {
          API_BASE = LOCAL_BACKEND_FALLBACK;
          return API_BASE;
        }
      }
    } catch (_) {}
    return API_BASE;
  }

  function setEngineStatus(text) {
    if (engineStatus) engineStatus.textContent = text;
  }

  async function checkBackend() {
    try {
      await resolveApiBase();
      const res = await fetch(apiUrl("/api/health"));
      if (res.ok) {
        const data = await res.json();
        setEngineStatus(`Demucs AI Ready (${String(data.device || "cpu").toUpperCase()})`);
        return;
      }
    } catch (_) {}
    setEngineStatus("Backend Offline — Run server.py");
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

  function getFileFormatLabel(name) {
    const m = /\.([^/.]+)$/.exec(name || "");
    return m ? m[1].toUpperCase() : "AUDIO";
  }

  function showScreen(screen) {
    const isWorkspace = screen === "workspace";
    if (landingScreen) landingScreen.hidden = isWorkspace;
    if (workspaceScreen) workspaceScreen.hidden = !isWorkspace;
    if (!isWorkspace) {
      if (dropzone) dropzone.hidden = false;
      if (progressWrap) progressWrap.hidden = true;
      if (mixerPanel) mixerPanel.hidden = true;
    }
  }

  function setProgress(pct, stageText) {
    progressWrap.hidden = false;
    progressFill.style.width = `${Math.min(100, Math.max(0, pct))}%`;
    progressPct.textContent = `${Math.round(pct)}%`;
    if (stageText) progressStage.textContent = stageText;
  }

  const SESSION_KEY = "resonix_job";

  function saveJobSession(jobId, fileName, model) {
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({ jobId, fileName, model }));
    } catch (_) {}
  }

  function clearJobSession() {
    try {
      sessionStorage.removeItem(SESSION_KEY);
    } catch (_) {}
  }

  function cleanupCurrentJob(useBeacon = false, delayed = false) {
    if (!currentJobId) return;
    const jobId = currentJobId;
    const endpoint = delayed ? "schedule-cleanup" : "cleanup";
    const url = apiUrl(`/api/jobs/${jobId}/${endpoint}`);
    if (!delayed) {
      currentJobId = null;
      clearJobSession();
    }
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

    showScreen("workspace");
    controlsBar.hidden = false;
    metaName.textContent = file.name;
    metaName.title = file.name;
    if (metaFormat) metaFormat.textContent = getFileFormatLabel(file.name);
    metaRate.textContent = "Detecting...";
    metaChannels.textContent = "Detecting...";
    metaDuration.textContent = "Detecting...";
    if (stemsSummary) stemsSummary.textContent = "Analyzing audio and preparing stem separation…";

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
  async function fetchWithRetry(url, options = {}, maxRetries = 5, baseDelayMs = 500) {
    let lastErr;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fetch(url, options);
      } catch (err) {
        lastErr = err;
        if (attempt < maxRetries) {
          await new Promise((r) => setTimeout(r, baseDelayMs * (attempt + 1)));
        }
      }
    }
    throw lastErr;
  }

  async function pollAndLoadJob(jobId) {
    await resolveApiBase();
    while (true) {
      const pollRes = await fetchWithRetry(apiUrl(`/api/jobs/${jobId}`));
      if (pollRes.status === 404) {
        const notFound = new Error("Job not found or expired.");
        notFound.isNotFound = true;
        throw notFound;
      }
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

      await new Promise((r) => setTimeout(r, 600));
    }
  }

  async function runSeparation() {
    if (!currentFile && !currentJobId) return;
    stopPlayback();

    splitBtn.disabled = true;
    resetBtn.disabled = true;
    downloadAllBtn.disabled = true;
    downloadCombinedBtn.disabled = true;
    showScreen("workspace");
    mixerPanel.hidden = true;
    if (stemsSummary) stemsSummary.textContent = "Separating audio stems with Demucs…";
    setProgress(3, currentFile ? "Uploading audio to Demucs neural backend..." : "Re-running Demucs neural separation...");
    setEngineStatus("Uploading & Splitting...");

    try {
      await resolveApiBase();
      const formData = new FormData();
      formData.append("model", modeSelect.value);
      let endpoint = "/api/split";
      if (currentFile) {
        formData.append("file", currentFile);
        formData.append("bit_depth", "32f");
      } else {
        endpoint = `/api/jobs/${currentJobId}/resplit`;
      }

      const uploadRes = await fetch(apiUrl(endpoint), {
        method: "POST",
        body: formData,
      });

      if (!uploadRes.ok) {
        throw new Error(`Upload failed (${uploadRes.status})`);
      }

      const { job_id } = await uploadRes.json();
      currentJobId = job_id;
      saveJobSession(job_id, metaName.textContent || `${sourceFileName}.wav`, modeSelect.value);

      await pollAndLoadJob(job_id);

      progressWrap.hidden = true;
      setEngineStatus("Demucs Stems Ready");
    } catch (err) {
      console.error(err);
      progressWrap.hidden = true;
      setEngineStatus("Separation Error");
      if (stemsSummary) stemsSummary.textContent = `Separation failed: ${err.message}`;
      alert(`Separation failed: ${err.message}\n\nMake sure the Python server (server.py) is running.`);
    } finally {
      splitBtn.disabled = false;
      resetBtn.disabled = false;
      const hasStems = activeStems.length > 0 && !mixerPanel.hidden;
      downloadAllBtn.disabled = !hasStems;
      downloadCombinedBtn.disabled = !hasStems;
    }
  }

  async function restoreSession() {
    let saved = null;
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      if (raw) saved = JSON.parse(raw);
    } catch (_) {}
    if (!saved || !saved.jobId) return;

    currentJobId = saved.jobId;
    sourceFileName = stripExtension(saved.fileName || "track");
    if (saved.model && modeSelect.querySelector(`option[value="${saved.model}"]`)) {
      modeSelect.value = saved.model;
      modeSelect._rxSync?.();
    }

    showScreen("workspace");
    controlsBar.hidden = false;
    metaName.textContent = saved.fileName || "Restored Track";
    metaName.title = saved.fileName || "Restored Track";
    if (metaFormat) metaFormat.textContent = getFileFormatLabel(saved.fileName);
    metaRate.textContent = "Restoring...";
    metaChannels.textContent = "Restoring...";
    metaDuration.textContent = "Restoring...";
    splitBtn.disabled = true;
    resetBtn.disabled = true;
    downloadAllBtn.disabled = true;
    downloadCombinedBtn.disabled = true;
    if (stemsSummary) stemsSummary.textContent = "Restoring previous stem separation session…";
    setProgress(92, "Restoring separated stems...");
    setEngineStatus("Restoring Session...");

    try {
      await pollAndLoadJob(saved.jobId);
      progressWrap.hidden = true;
      setEngineStatus("Demucs Stems Ready");
    } catch (err) {
      console.warn("Could not restore previous session:", err);
      clearJobSession();
      currentJobId = null;
      showScreen("landing");
      checkBackend();
    } finally {
      splitBtn.disabled = false;
      resetBtn.disabled = false;
      const hasStems = activeStems.length > 0 && !mixerPanel.hidden;
      downloadAllBtn.disabled = !hasStems;
      downloadCombinedBtn.disabled = !hasStems;
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
      const res = await fetchWithRetry(apiUrl(item.url));
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
          <canvas class="stem-wave-canvas" height="52"></canvas>
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
    }

    mixerPanel.hidden = false;
    for (const stem of activeStems) {
      const st = stemState[stem.id];
      if (st?.waveCanvas && stemBuffers[stem.id]) {
        drawWaveform(st.waveCanvas, stemBuffers[stem.id], stem.color);
      }
    }
    if (stemsSummary) {
      stemsSummary.textContent = `${activeStems.length} stems ready · Select tracks for batch or combined export · Click waveform to seek`;
    }
    downloadAllBtn.disabled = false;
    downloadCombinedBtn.disabled = false;
    updateStemGains();
  }

  function drawWaveform(canvas, audioBuffer, color) {
    const parent = canvas.parentElement;
    const width = (canvas.width = parent.clientWidth || 600);
    const height = (canvas.height = parent.clientHeight || 40);
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

  const MASTER_ICON_PLAY = `<svg id="playIcon" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 4 20 12 6 20 6 4"/></svg>`;
  const MASTER_ICON_PAUSE = `<svg id="pauseIcon" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>`;

  function updateTransportIcons() {
    if (playPauseBtn) {
      playPauseBtn.innerHTML = isPlaying ? MASTER_ICON_PAUSE : MASTER_ICON_PLAY;
      playPauseBtn.classList.toggle("playing", isPlaying);
      playPauseBtn.setAttribute("aria-label", isPlaying ? "Pause" : "Play");
      playPauseBtn.title = isPlaying ? "Pause (Space)" : "Play (Space)";
    }
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
      const h = (spectrumCanvas.height = spectrumCanvas.clientHeight || 34);
      const sCtx = spectrumCanvas.getContext("2d");
      sCtx.clearRect(0, 0, w, h);

      const barCount = freqData.length;
      const barW = w / barCount;
      for (let i = 0; i < barCount; i++) {
        const val = freqData[i] / 255;
        const barH = val * (h - 6);
        const alpha = 0.35 + val * 0.6;
        sCtx.fillStyle = val > 0.72
          ? `rgba(118, 168, 242, ${alpha.toFixed(2)})`
          : `rgba(86, 143, 232, ${alpha.toFixed(2)})`;
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
    a.href = apiUrl(`${stem.url}?download=1&fmt=${encodeURIComponent(fmt)}&bitrate=${encodeURIComponent(br)}&sr=${encodeURIComponent(sr)}`);
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
    cleanupCurrentJob(false, false);
    stopPlayback();
    currentFile = null;
    stemBuffers = {};
    activeStems = [];
    stemsList.innerHTML = "";
    showScreen("landing");
    checkBackend();
  });

  window.addEventListener("pagehide", () => cleanupCurrentJob(true, true));
  window.addEventListener("beforeunload", () => cleanupCurrentJob(true, true));
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && isPlaying && audioCtx && audioCtx.state === "suspended") {
      audioCtx.resume().catch(() => {});
    }
  });

  restoreSession();

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
    a.href = apiUrl(`/api/jobs/${currentJobId}/combine?stems=${encodeURIComponent(stemsParam)}&fmt=${encodeURIComponent(fmt)}&bitrate=${encodeURIComponent(br)}&sr=${encodeURIComponent(sr)}`);
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

  let resizeTimer = null;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (mixerPanel.hidden || !activeStems.length) return;
      for (const s of activeStems) {
        const st = stemState[s.id];
        const buf = stemBuffers[s.id];
        if (st?.waveCanvas && buf) drawWaveform(st.waveCanvas, buf, s.color);
      }
    }, 150);
  });

  // =========================================================================
  // Animated Studio Soundscape Canvas (Landing Screen)
  // =========================================================================
  (function initLandingBackground() {
    const canvas = $("landingBgCanvas");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let rafId = null;
    let t = 0;

    const waves = [
      { amp: 44, freq: 0.0042, speed: 0.018, phase: 0.0, yRatio: 0.60, color: "rgba(86, 143, 232, 0.28)", width: 1.8 },
      { amp: 32, freq: 0.0056, speed: 0.024, phase: 1.7, yRatio: 0.62, color: "rgba(128, 174, 241, 0.20)", width: 1.3 },
      { amp: 24, freq: 0.0072, speed: 0.014, phase: 3.1, yRatio: 0.58, color: "rgba(86, 143, 232, 0.14)", width: 1.0 },
      { amp: 18, freq: 0.0031, speed: 0.011, phase: 4.5, yRatio: 0.50, color: "rgba(166, 177, 191, 0.08)", width: 0.9 },
    ];

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(window.innerWidth * dpr);
      canvas.height = Math.floor(window.innerHeight * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function drawFrame() {
      const w = window.innerWidth;
      const h = window.innerHeight;
      ctx.clearRect(0, 0, w, h);

      // Subtle animated spectrum bars along the lower field
      const barCount = Math.max(36, Math.floor(w / 22));
      const barStep = w / barCount;
      const baseLine = h * 0.72;
      for (let i = 0; i < barCount; i++) {
        const nx = i / barCount;
        const edgeFade = Math.sin(nx * Math.PI);
        const energy =
          0.5 +
          0.3 * Math.sin(i * 0.35 + t * 1.6) +
          0.2 * Math.cos(i * 0.18 - t * 1.1);
        const barH = Math.max(4, energy * 84 * edgeFade);
        ctx.fillStyle = `rgba(86, 143, 232, ${(0.075 * edgeFade).toFixed(3)})`;
        ctx.fillRect(i * barStep + barStep * 0.25, baseLine - barH, Math.max(2, barStep * 0.42), barH);
      }

      // Layered harmonic waveform ribbons
      for (const wave of waves) {
        const grad = ctx.createLinearGradient(0, 0, w, 0);
        grad.addColorStop(0, "rgba(86, 143, 232, 0)");
        grad.addColorStop(0.2, wave.color);
        grad.addColorStop(0.5, wave.color);
        grad.addColorStop(0.8, wave.color);
        grad.addColorStop(1, "rgba(86, 143, 232, 0)");

        ctx.beginPath();
        ctx.strokeStyle = grad;
        ctx.lineWidth = wave.width;

        const baseY = h * wave.yRatio;
        for (let x = 0; x <= w; x += 6) {
          const nx = x / w;
          const env = Math.sin(nx * Math.PI);
          const y =
            baseY +
            Math.sin(x * wave.freq + t * wave.speed * 60 + wave.phase) * wave.amp * env +
            Math.cos(x * wave.freq * 0.55 - t * wave.speed * 35) * (wave.amp * 0.38) * env;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    }

    function loop() {
      if (landingScreen && landingScreen.hidden) {
        rafId = null;
        return;
      }
      t += 0.016;
      drawFrame();
      rafId = requestAnimationFrame(loop);
    }

    function start() {
      resize();
      if (reducedMotion) {
        drawFrame();
        return;
      }
      if (!rafId && (!landingScreen || !landingScreen.hidden)) {
        rafId = requestAnimationFrame(loop);
      }
    }

    window.addEventListener("resize", () => {
      if (!landingScreen || !landingScreen.hidden) {
        resize();
        if (reducedMotion) drawFrame();
      }
    });

    if (landingScreen) {
      const obs = new MutationObserver(() => {
        if (!landingScreen.hidden) start();
      });
      obs.observe(landingScreen, { attributes: true, attributeFilter: ["hidden"] });
    }

    start();
  })();
})();
