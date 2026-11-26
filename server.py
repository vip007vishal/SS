import os
import re
import shutil
import subprocess
import threading
import uuid
from pathlib import Path
from typing import Dict, Any

import imageio_ffmpeg
import julius
import numpy as np
import soundfile as sf
import torch
from demucs.apply import apply_model
from demucs.pretrained import get_model
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

BASE_DIR = Path(__file__).resolve().parent
JOBS_DIR = BASE_DIR / "_jobs"
JOBS_DIR.mkdir(exist_ok=True)

app = FastAPI(title="RESONIX Neural Backend")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Cache loaded Demucs models in memory so subsequent splits are instant
_MODEL_CACHE: Dict[str, Any] = {}
_MODEL_LOCK = threading.Lock()
_JOBS: Dict[str, Dict[str, Any]] = {}
_CLEANUP_TIMERS: Dict[str, threading.Timer] = {}
_CLEANUP_LOCK = threading.Lock()


def _cancel_scheduled_cleanup(job_id: str):
    with _CLEANUP_LOCK:
        timer = _CLEANUP_TIMERS.pop(job_id, None)
        if timer:
            timer.cancel()


def get_device() -> str:
    return "cuda" if torch.cuda.is_available() else "cpu"


def get_demucs_model(model_name: str):
    valid = {"htdemucs", "htdemucs_ft", "htdemucs_6s"}
    if model_name not in valid:
        model_name = "htdemucs"
    with _MODEL_LOCK:
        if model_name not in _MODEL_CACHE:
            model = get_model(model_name)
            model.to(get_device())
            model.eval()
            _MODEL_CACHE[model_name] = model
        return _MODEL_CACHE[model_name]


def decode_audio_native(file_path: Path) -> tuple[np.ndarray, int]:
    """
    Decode any audio file into float32 numpy array of shape (channels, samples)
    at its exact native sample rate.
    """
    try:
        data, sr = sf.read(str(file_path), dtype="float32", always_2d=True)
        # data shape: (samples, channels) -> (channels, samples)
        return data.T, int(sr)
    except Exception:
        pass

    ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()
    # Probe stream info via ffmpeg stderr
    probe = subprocess.run(
        [ffmpeg_exe, "-i", str(file_path)],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="ignore",
    )
    sr = 44100
    ch = 2
    m_sr = re.search(r"(\d+)\s*Hz", probe.stderr)
    if m_sr:
        sr = int(m_sr.group(1))
    if re.search(r"\bmono\b", probe.stderr, re.IGNORECASE):
        ch = 1
    elif re.search(r"\bstereo\b", probe.stderr, re.IGNORECASE):
        ch = 2

    cmd = [
        ffmpeg_exe,
        "-v", "error",
        "-i", str(file_path),
        "-f", "f32le",
        "-acodec", "pcm_f32le",
        "-ac", str(ch),
        "-ar", str(sr),
        "pipe:1",
    ]
    proc = subprocess.run(cmd, capture_output=True)
    if proc.returncode != 0 or not proc.stdout:
        raise RuntimeError(f"FFmpeg decode failed: {proc.stderr.decode('utf-8', 'ignore')}")

    audio = np.frombuffer(proc.stdout, dtype=np.float32)
    audio = audio.reshape(-1, ch).T.copy()
    return audio, sr


def run_separation_job(job_id: str, input_path: Path, model_name: str, bit_depth: str):
    job = _JOBS[job_id]
    try:
        job["status"] = "processing"
        job["progress"] = 5
        job["stage"] = "Decoding audio at native sample rate..."

        audio_np, orig_sr = decode_audio_native(input_path)
        orig_channels, orig_samples = audio_np.shape
        duration = orig_samples / orig_sr

        job["meta"] = {
            "sampleRate": orig_sr,
            "channels": orig_channels,
            "duration": duration,
        }

        # Convert to torch tensor (channels, samples)
        wav = torch.from_numpy(audio_np)
        if wav.shape[0] == 1:
            wav_stereo = wav.repeat(2, 1)
        elif wav.shape[0] > 2:
            wav_stereo = wav[:2]
        else:
            wav_stereo = wav

        job["progress"] = 12
        job["stage"] = f"Loading Demucs neural model ({model_name})..."
        model = get_demucs_model(model_name)
        model_sr = model.samplerate
        device = get_device()

        # Resample to model_sr for inference if needed
        if orig_sr != model_sr:
            job["stage"] = f"Resampling {orig_sr} Hz -> {model_sr} Hz for neural inference..."
            mix_in = julius.resample_frac(wav_stereo, orig_sr, model_sr)
        else:
            mix_in = wav_stereo

        # Normalize for numerical stability, then restore scale
        ref = mix_in.mean(0)
        ref_mean = ref.mean()
        ref_std = ref.std() + 1e-8
        mix_norm = (mix_in - ref_mean) / ref_std

        total_samples = mix_norm.shape[-1]
        job["progress"] = 20
        job["stage"] = f"Running Demucs ({model_name}) on {device.upper()}..."

        def progress_cb(info: dict):
            if info.get("state") == "end":
                num_models = max(1, info.get("models", 1))
                m_idx = info.get("model_idx_in_bag", 0)
                seg_off = info.get("segment_offset", 0)
                seg_frac = min(1.0, seg_off / max(1, total_samples))
                overall = (m_idx + seg_frac) / num_models
                pct = int(20 + overall * 65)
                job["progress"] = max(job["progress"], min(85, pct))
                job["stage"] = f"Running Demucs ({model_name}) on {device.upper()}... ({int(overall * 100)}%)"

        with torch.no_grad():
            sources = apply_model(
                model,
                mix_norm.unsqueeze(0).to(device),
                shifts=1,
                split=True,
                overlap=0.25,
                progress=False,
                device=device,
                callback=progress_cb,
            )[0]

        sources = sources.cpu() * ref_std + ref_mean

        job["progress"] = 88
        job["stage"] = f"Rendering lossless WAV stems at {orig_sr} Hz..."

        out_dir = JOBS_DIR / job_id / "stems"
        out_dir.mkdir(parents=True, exist_ok=True)
        subtype = "FLOAT" if bit_depth == "32f" else "PCM_16"

        stem_list = []
        vocals_tensor = None
        non_vocals_sum = None

        for idx, stem_name in enumerate(model.sources):
            stem_wav = sources[idx]
            if orig_sr != model_sr:
                stem_wav = julius.resample_frac(stem_wav, model_sr, orig_sr)
            # Match exact original sample count
            if stem_wav.shape[1] > orig_samples:
                stem_wav = stem_wav[:, :orig_samples]
            elif stem_wav.shape[1] < orig_samples:
                pad = torch.zeros((stem_wav.shape[0], orig_samples - stem_wav.shape[1]))
                stem_wav = torch.cat([stem_wav, pad], dim=1)

            if orig_channels == 1:
                stem_out = stem_wav.mean(dim=0, keepdim=True)
            else:
                stem_out = stem_wav

            if stem_name == "vocals":
                vocals_tensor = stem_out
            else:
                non_vocals_sum = stem_out if non_vocals_sum is None else (non_vocals_sum + stem_out)

            out_path = out_dir / f"{stem_name}.wav"
            sf.write(str(out_path), stem_out.numpy().T, orig_sr, subtype=subtype)
            stem_list.append({
                "id": stem_name,
                "url": f"/api/jobs/{job_id}/stems/{stem_name}",
            })

        # Add Instrumental (No Vocals) stem
        if non_vocals_sum is not None:
            inst_path = out_dir / "instrumental.wav"
            sf.write(str(inst_path), non_vocals_sum.numpy().T, orig_sr, subtype=subtype)
            stem_list.append({
                "id": "instrumental",
                "url": f"/api/jobs/{job_id}/stems/instrumental",
            })

        job["stems"] = stem_list
        job["progress"] = 100
        job["stage"] = "Separation complete!"
        job["status"] = "done"

        if job.get("cancelled"):
            shutil.rmtree(JOBS_DIR / job_id, ignore_errors=True)
            _JOBS.pop(job_id, None)

    except Exception as exc:
        job["status"] = "error"
        job["error"] = str(exc)
        job["stage"] = f"Error: {exc}"
        if job.get("cancelled"):
            shutil.rmtree(JOBS_DIR / job_id, ignore_errors=True)
            _JOBS.pop(job_id, None)


@app.get("/api/health")
def health():
    return {
        "ok": True,
        "engine": "demucs",
        "device": get_device(),
        "models": ["htdemucs", "htdemucs_ft", "htdemucs_6s"],
    }


@app.post("/api/split")
async def split_audio(
    file: UploadFile = File(...),
    model: str = Form("htdemucs"),
    bit_depth: str = Form("32f"),
):
    job_id = uuid.uuid4().hex[:12]
    job_dir = JOBS_DIR / job_id
    job_dir.mkdir(parents=True, exist_ok=True)

    ext = Path(file.filename or "audio.wav").suffix or ".wav"
    input_path = job_dir / f"input{ext}"
    content = await file.read()
    input_path.write_bytes(content)

    _JOBS[job_id] = {
        "job_id": job_id,
        "filename": file.filename or "audio.wav",
        "status": "queued",
        "progress": 0,
        "stage": "Queued for Demucs neural separation...",
        "stems": [],
        "meta": None,
        "error": None,
    }

    thread = threading.Thread(
        target=run_separation_job,
        args=(job_id, input_path, model, bit_depth),
        daemon=True,
    )
    thread.start()

    return {"job_id": job_id}


@app.get("/api/jobs/{job_id}")
def get_job(job_id: str):
    _cancel_scheduled_cleanup(job_id)
    job = _JOBS.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return JSONResponse(job)


@app.post("/api/jobs/{job_id}/resplit")
def resplit_job(job_id: str, model: str = Form("htdemucs")):
    _cancel_scheduled_cleanup(job_id)
    job = _JOBS.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    job_dir = JOBS_DIR / job_id
    inputs = list(job_dir.glob("input.*"))
    if not inputs:
        raise HTTPException(status_code=404, detail="Original audio file not found")

    job["status"] = "queued"
    job["progress"] = 0
    job["stage"] = "Queued for Demucs neural separation..."
    job["stems"] = []
    job["error"] = None
    job["cancelled"] = False

    thread = threading.Thread(
        target=run_separation_job,
        args=(job_id, inputs[0], model, "32f"),
        daemon=True,
    )
    thread.start()
    return {"job_id": job_id}


_VALID_FORMATS = {
    "wav": ("audio/wav", "wav"),
    "flac": ("audio/flac", "flac"),
    "mp3": ("audio/mpeg", "mp3"),
    "m4a": ("audio/mp4", "m4a"),
    "ogg": ("audio/ogg", "ogg"),
}


def _transcode_audio(src_wav: Path, export_path: Path, fmt: str, safe_br: str, target_sr: int):
    """Transcode a 32-bit float master WAV to the requested format, bitrate/depth, and sample rate."""
    info = sf.info(str(src_wav))
    orig_sr = info.samplerate
    out_sr = target_sr or orig_sr

    if fmt in ("wav", "flac"):
        data, _ = sf.read(str(src_wav), dtype="float32", always_2d=True)
        if out_sr != orig_sr:
            t_wav = torch.from_numpy(data.T)
            t_wav = julius.resample_frac(t_wav, orig_sr, out_sr)
            data = t_wav.numpy().T
        if fmt == "wav":
            subtype = "FLOAT" if safe_br == "32f" else ("PCM_24" if safe_br == "24" else "PCM_16")
        else:
            subtype = "PCM_24" if safe_br in ("32f", "24") else "PCM_16"
        sf.write(str(export_path), data, out_sr, subtype=subtype)
    else:
        ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()
        codec_map = {
            "mp3": ["-c:a", "libmp3lame"],
            "m4a": ["-c:a", "aac", "-movflags", "+faststart"],
            "ogg": ["-c:a", "libvorbis"],
        }
        br_val = safe_br if safe_br.endswith("k") else "192k"
        cmd = [
            ffmpeg_exe,
            "-y",
            "-v", "error",
            "-i", str(src_wav),
            "-ar", str(out_sr),
            *codec_map[fmt],
            "-b:a", br_val,
            str(export_path),
        ]
        proc = subprocess.run(cmd, capture_output=True)
        if proc.returncode != 0 or not export_path.exists():
            raise HTTPException(
                status_code=500,
                detail=f"Export failed: {proc.stderr.decode('utf-8', 'ignore')}",
            )


def _sanitize_export_params(fmt: str, bitrate: str, sr: int):
    fmt = fmt.lower()
    if fmt not in _VALID_FORMATS:
        raise HTTPException(status_code=400, detail="Unsupported format")
    allowed_srs = {0, 22050, 44100, 48000, 96000}
    target_sr = sr if sr in allowed_srs else 0
    safe_br = bitrate if re.match(r"^(32f|24|16|320k|256k|192k|128k|64k)$", bitrate) else "192k"
    return fmt, safe_br, target_sr


@app.get("/api/jobs/{job_id}/stems/{stem_name}")
def download_stem(
    job_id: str,
    stem_name: str,
    download: int = 0,
    fmt: str = "wav",
    bitrate: str = "32f",
    sr: int = 0,
):
    if not re.match(r"^[a-zA-Z0-9_-]+$", stem_name):
        raise HTTPException(status_code=400, detail="Invalid stem name")

    _cancel_scheduled_cleanup(job_id)
    fmt, safe_br, target_sr = _sanitize_export_params(fmt, bitrate, sr)
    stem_path = JOBS_DIR / job_id / "stems" / f"{stem_name}.wav"
    if not stem_path.exists():
        raise HTTPException(status_code=404, detail="Stem not found")

    job = _JOBS.get(job_id, {})
    base_name = Path(job.get("filename", "track")).stem
    media_type, ext = _VALID_FORMATS[fmt]

    if not download or (fmt == "wav" and target_sr == 0 and safe_br == "32f"):
        headers = {}
        if download:
            headers["Content-Disposition"] = f'attachment; filename="{base_name}_{stem_name}.wav"'
        return FileResponse(str(stem_path), media_type="audio/wav", headers=headers)

    exports_dir = JOBS_DIR / job_id / "exports"
    exports_dir.mkdir(parents=True, exist_ok=True)
    export_path = exports_dir / f"{stem_name}_{fmt}_{safe_br}_{target_sr}.{ext}"

    if not export_path.exists():
        _transcode_audio(stem_path, export_path, fmt, safe_br, target_sr)

    sr_tag = f"_{target_sr}Hz" if target_sr else ""
    headers = {
        "Content-Disposition": f'attachment; filename="{base_name}_{stem_name}_{safe_br}{sr_tag}.{ext}"'
    }
    return FileResponse(str(export_path), media_type=media_type, headers=headers)


@app.get("/api/jobs/{job_id}/combine")
def download_combined_stems(
    job_id: str,
    stems: str,
    fmt: str = "wav",
    bitrate: str = "32f",
    sr: int = 0,
):
    fmt, safe_br, target_sr = _sanitize_export_params(fmt, bitrate, sr)
    stem_names = [s.strip() for s in stems.split(",") if s.strip()]
    if not stem_names:
        raise HTTPException(status_code=400, detail="No stems selected")

    for s in stem_names:
        if not re.match(r"^[a-zA-Z0-9_-]+$", s):
            raise HTTPException(status_code=400, detail=f"Invalid stem name: {s}")

    stems_dir = JOBS_DIR / job_id / "stems"
    stem_paths = []
    for s in stem_names:
        p = stems_dir / f"{s}.wav"
        if not p.exists():
            raise HTTPException(status_code=404, detail=f"Stem not found: {s}")
        stem_paths.append(p)

    mix_data = None
    orig_sr = 44100
    for p in stem_paths:
        data, orig_sr = sf.read(str(p), dtype="float32", always_2d=True)
        mix_data = data if mix_data is None else (mix_data + data)

    peak = float(np.max(np.abs(mix_data)))
    if peak > 1.0:
        mix_data = mix_data / peak

    exports_dir = JOBS_DIR / job_id / "exports"
    exports_dir.mkdir(parents=True, exist_ok=True)
    stem_slug = "-".join(stem_names)
    combined_wav = exports_dir / f"combined_{stem_slug}_master.wav"
    sf.write(str(combined_wav), mix_data, orig_sr, subtype="FLOAT")

    media_type, ext = _VALID_FORMATS[fmt]
    if fmt == "wav" and target_sr == 0 and safe_br == "32f":
        out_path = combined_wav
    else:
        out_path = exports_dir / f"combined_{stem_slug}_{fmt}_{safe_br}_{target_sr}.{ext}"
        if not out_path.exists():
            _transcode_audio(combined_wav, out_path, fmt, safe_br, target_sr)

    job = _JOBS.get(job_id, {})
    base_name = Path(job.get("filename", "track")).stem
    sr_tag = f"_{target_sr}Hz" if target_sr else ""
    headers = {
        "Content-Disposition": f'attachment; filename="{base_name}_combined_{stem_slug}_{safe_br}{sr_tag}.{ext}"'
    }
    return FileResponse(str(out_path), media_type=media_type, headers=headers)


def _delete_job_dir(job_id: str):
    if not re.match(r"^[a-fA-F0-9]+$", job_id):
        raise HTTPException(status_code=400, detail="Invalid job ID")
    _cancel_scheduled_cleanup(job_id)
    job = _JOBS.get(job_id)
    if job and job.get("status") in ("queued", "processing"):
        job["cancelled"] = True
        return {"ok": True, "status": "cleanup_scheduled"}

    job_dir = JOBS_DIR / job_id
    if job_dir.exists():
        shutil.rmtree(job_dir, ignore_errors=True)
    _JOBS.pop(job_id, None)
    return {"ok": True, "status": "deleted"}


@app.post("/api/jobs/{job_id}/schedule-cleanup")
def schedule_cleanup_job(job_id: str):
    if not re.match(r"^[a-fA-F0-9]+$", job_id):
        raise HTTPException(status_code=400, detail="Invalid job ID")
    with _CLEANUP_LOCK:
        old = _CLEANUP_TIMERS.pop(job_id, None)
        if old:
            old.cancel()
        timer = threading.Timer(12.0, _delete_job_dir, args=(job_id,))
        timer.daemon = True
        timer.start()
        _CLEANUP_TIMERS[job_id] = timer
    return {"ok": True, "status": "delayed_cleanup_scheduled"}


@app.post("/api/jobs/{job_id}/cleanup")
def cleanup_job_beacon(job_id: str):
    return _delete_job_dir(job_id)


@app.delete("/api/jobs/{job_id}")
def delete_job(job_id: str):
    return _delete_job_dir(job_id)


# Serve frontend static files
app.mount("/", StaticFiles(directory=str(BASE_DIR), html=True), name="static")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000, timeout_keep_alive=60)
