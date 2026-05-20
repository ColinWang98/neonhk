from __future__ import annotations

import os
import random
import sys
import uuid
import hashlib
from pathlib import Path
from typing import Literal

import numpy as np
import soundfile as sf
import torch
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field


ROOT = Path(__file__).resolve().parent
OUTPUT_DIR = Path(os.getenv("COSYVOICE_OUTPUT_DIR", ROOT / "generated")).resolve()
CACHE_DIR = Path(os.getenv("COSYVOICE_CACHE_DIR", ROOT / "cache")).resolve()
REFERENCE_AUDIO = os.getenv("COSYVOICE_REFERENCE_AUDIO", str(ROOT / "reference" / "default.wav"))
MODEL_DIR = os.getenv("COSYVOICE_MODEL_DIR", "FunAudioLLM/Fun-CosyVoice3-0.5B-2512")
COSYVOICE_REPO = os.getenv("COSYVOICE_REPO")
BASE_URL = os.getenv("COSYVOICE_PUBLIC_BASE_URL", "http://127.0.0.1:7860")

OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
CACHE_DIR.mkdir(parents=True, exist_ok=True)

app = FastAPI(title="HK Spatial Story CosyVoice 3 Sidecar")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000", "http://localhost:3001", "http://127.0.0.1:3001"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.mount("/audio", StaticFiles(directory=str(OUTPUT_DIR)), name="audio")

_cosyvoice = None


class VoiceProfile(BaseModel):
    accent: Literal["hong-kong-english", "cantonese-leaning", "shanxi", "neutral-british", "neutral"] = "hong-kong-english"
    englishFluency: Literal["limited", "conversational", "fluent"] = "conversational"
    gender: Literal["male", "female"] = "female"
    age: Literal["young", "middle", "older"] = "middle"
    pace: Literal["slow", "normal", "fast"] = "normal"
    tone: Literal["reflective", "casual", "documentary", "warm"] = "reflective"
    cantoneseRatio: float = Field(default=0.25, ge=0, le=1)


class TtsRequest(BaseModel):
    text: str
    voiceHint: str | None = None
    voiceProfile: VoiceProfile | None = None
    language: Literal["zh-HK-en-mixed"] = "zh-HK-en-mixed"
    format: Literal["wav"] = "wav"
    referenceAudioPath: str | None = None
    referenceText: str = "This is a reference voice for a Hong Kong spatial story narrator."


@app.get("/health")
def health():
    return {
        "ok": True,
        "modelDir": MODEL_DIR,
        "cosyvoiceRepo": COSYVOICE_REPO,
        "referenceAudio": REFERENCE_AUDIO,
        "modelLoaded": _cosyvoice is not None,
    }


@app.post("/tts")
def generate_tts(request: TtsRequest):
    if not request.text.strip():
        raise HTTPException(status_code=400, detail="text is required")

    reference_path = resolve_reference_audio(request)
    if not reference_path.exists():
        raise HTTPException(
            status_code=503,
            detail=(
                "CosyVoice 3 needs a reference audio file for local persona voice generation. "
                f"Set COSYVOICE_REFERENCE_AUDIO or pass referenceAudioPath. Missing: {reference_path}"
            ),
        )
    prepared_reference_path = prepare_reference_audio(reference_path)

    cosyvoice = get_cosyvoice()
    instruction = build_instruction(request)
    chunks = []

    try:
        generator = cosyvoice.inference_instruct2(
            request.text,
            instruction,
            str(prepared_reference_path),
            stream=False,
        )
        for chunk in generator:
            audio = chunk.get("tts_speech")
            if audio is not None:
                chunks.append(audio)
    except AttributeError as exc:
        raise HTTPException(
            status_code=500,
            detail="Installed CosyVoice package does not expose inference_instruct2. Check CosyVoice 3 installation.",
        ) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"CosyVoice generation failed: {exc}") from exc

    if not chunks:
        raise HTTPException(status_code=500, detail="CosyVoice returned no audio chunks")

    audio = torch.cat(chunks, dim=-1)

    filename = f"{uuid.uuid4()}.wav"
    output_path = OUTPUT_DIR / filename
    sf.write(output_path, audio.squeeze().cpu().numpy(), cosyvoice.sample_rate)

    return {
        "audioUrl": f"{BASE_URL.rstrip('/')}/audio/{filename}",
        "durationMs": int(audio.shape[-1] / cosyvoice.sample_rate * 1000),
        "voiceInstruction": instruction,
        "referenceAudio": str(reference_path),
        "preparedReferenceAudio": str(prepared_reference_path),
        "referencePoolSize": reference_pool_size(request, reference_path),
    }


def prepare_reference_audio(reference_path: Path, target_sample_rate: int = 16000, max_seconds: float = 8.0) -> Path:
    stat = reference_path.stat()
    cache_key = hashlib.sha256(
        f"{reference_path.resolve()}:{stat.st_mtime_ns}:{stat.st_size}:{target_sample_rate}:{max_seconds}".encode("utf-8")
    ).hexdigest()[:20]
    output_path = CACHE_DIR / f"reference_{cache_key}.wav"
    if output_path.exists():
        return output_path

    audio, sample_rate = load_audio(reference_path)
    if audio.ndim > 1:
        audio = np.mean(audio, axis=1)
    audio = audio.astype(np.float32)

    if sample_rate != target_sample_rate:
        import librosa

        audio = librosa.resample(audio, orig_sr=sample_rate, target_sr=target_sample_rate)

    max_samples = int(target_sample_rate * max_seconds)
    if audio.shape[0] > max_samples:
        audio = audio[:max_samples]

    peak = float(np.max(np.abs(audio))) if audio.size else 0.0
    if peak > 0.98:
        audio = audio / peak * 0.98

    sf.write(output_path, audio, target_sample_rate, subtype="PCM_16")
    return output_path


def load_audio(reference_path: Path) -> tuple[np.ndarray, int]:
    try:
        audio, sample_rate = sf.read(reference_path, always_2d=False)
        return audio, sample_rate
    except Exception:
        import librosa

        audio, sample_rate = librosa.load(reference_path, sr=None, mono=False)
        if audio.ndim > 1:
            audio = np.transpose(audio)
        return audio, sample_rate


def resolve_reference_audio(request: TtsRequest) -> Path:
    if request.referenceAudioPath:
        return Path(request.referenceAudioPath).expanduser().resolve()

    if request.voiceProfile:
        preset_base = f"{request.voiceProfile.age}_{request.voiceProfile.gender}"
        for candidates in reference_candidate_groups(request.voiceProfile, preset_base):
            existing = [candidate.resolve() for candidate in candidates if candidate.exists()]
            if existing:
                return random.choice(existing)

    return Path(REFERENCE_AUDIO).expanduser().resolve()


def reference_candidates(directory: Path) -> list[Path]:
    if not directory.exists():
        return []
    candidates: list[Path] = []
    for suffix in ("*.wav", "*.flac", "*.mp3"):
        candidates.extend(directory.glob(suffix))
    return sorted(candidates)


def reference_candidate_groups(profile: VoiceProfile, preset_base: str) -> list[list[Path]]:
    shanxi = ROOT / "reference" / "shanxi"
    common_voice_en = ROOT / "reference" / "open-source" / "common-voice"
    common_voice_zh_hk = ROOT / "reference" / "open-source" / "common-voice-zh-HK"

    if profile.accent == "shanxi":
        return [
            reference_candidates(shanxi / preset_base),
            reference_candidates(shanxi),
            [
                shanxi / f"{preset_base}.wav",
                shanxi / f"{preset_base}.flac",
                shanxi / f"{preset_base}.mp3",
            ],
            reference_candidates(ROOT / "reference" / "open-source" / "reference-pool" / preset_base),
            reference_candidates(common_voice_en / preset_base),
            [
                ROOT / "reference" / "default.wav",
            ],
        ]

    language_pool_order = (
        [common_voice_zh_hk, common_voice_en]
        if profile.accent == "cantonese-leaning" or profile.cantoneseRatio >= 0.5
        else [common_voice_en, common_voice_zh_hk]
    )

    groups = [reference_candidates(pool / preset_base) for pool in language_pool_order]
    groups.extend(
        [
            reference_candidates(ROOT / "reference" / "open-source" / "reference-pool" / preset_base),
            [
                common_voice_en / f"{preset_base}.mp3",
                common_voice_en / f"{preset_base}.wav",
                common_voice_en / f"{preset_base}.flac",
                common_voice_zh_hk / f"{preset_base}.wav",
                common_voice_zh_hk / f"{preset_base}.flac",
                ROOT / "reference" / "open-source" / "clean-english" / f"{preset_base}.flac",
                ROOT / "reference" / "open-source" / "clean-english" / f"{preset_base}.wav",
                ROOT / "reference" / "open-source" / "crema-d" / f"{preset_base}.wav",
            ],
        ]
    )
    return groups


def reference_pool_size(request: TtsRequest, reference_path: Path) -> int:
    if not request.voiceProfile:
        return 1
    preset_base = f"{request.voiceProfile.age}_{request.voiceProfile.gender}"
    for directory in (
        ROOT / "reference" / "shanxi" / preset_base,
        ROOT / "reference" / "shanxi",
        ROOT / "reference" / "open-source" / "common-voice" / preset_base,
        ROOT / "reference" / "open-source" / "common-voice-zh-HK" / preset_base,
        ROOT / "reference" / "open-source" / "reference-pool" / preset_base,
    ):
        candidates = [candidate for candidate in reference_candidates(directory) if candidate.exists()]
        if reference_path in [candidate.resolve() for candidate in candidates]:
            return len(candidates)
    return 1


def get_cosyvoice():
    global _cosyvoice
    if _cosyvoice is not None:
        return _cosyvoice

    if COSYVOICE_REPO:
        repo = Path(COSYVOICE_REPO).expanduser().resolve()
        sys.path.insert(0, str(repo))
        sys.path.insert(0, str(repo / "third_party" / "Matcha-TTS"))

    try:
        from cosyvoice.cli.cosyvoice import CosyVoice3
    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail=(
                "CosyVoice 3 is not installed. Clone FunAudioLLM/CosyVoice, install its requirements, "
                "and set COSYVOICE_REPO to that checkout."
            ),
        ) from exc

    _cosyvoice = CosyVoice3(MODEL_DIR)
    return _cosyvoice


def build_instruction(request: TtsRequest) -> str:
    if request.voiceProfile:
        profile = request.voiceProfile
        if profile.accent == "shanxi":
            return ensure_end_of_prompt(build_shanxi_instruction(profile))
        parts = [
            "You are a helpful assistant.",
            f"Use a {profile.age} {profile.tone} narrator voice.",
            f"Voice gender: {profile.gender}.",
            f"Accent style: {profile.accent}.",
            f"English fluency: {profile.englishFluency}.",
            f"Speaking pace: {profile.pace}.",
            f"Use Cantonese lightly with an approximate ratio of {profile.cantoneseRatio:.0%}.",
            "Keep the voice natural for a Hong Kong bilingual spatial story.",
        ]
        return ensure_end_of_prompt(" ".join(parts))

    if request.voiceHint:
        return ensure_end_of_prompt(request.voiceHint)

    return ensure_end_of_prompt(
        "You are a helpful assistant. Use a calm Hong Kong bilingual narrator voice with natural English and Cantonese rhythm."
    )


def build_shanxi_instruction(profile: VoiceProfile) -> str:
    parts = [
        "You are a helpful assistant.",
        f"Use a {profile.age} {profile.tone} narrator voice.",
        f"Voice gender: {profile.gender}.",
        "Accent style: Shanxi Mandarin / 山西话 influence.",
        "Use a natural northern Chinese rhythm with Shanxi local color.",
        "Keep the speech grounded and everyday, not comic, exaggerated, or theatrical.",
        "If the text is Mandarin, speak it with a Shanxi-flavored Mandarin delivery.",
        "If the text contains Shanxi dialect wording, preserve the local wording as naturally as possible.",
        "Avoid Cantonese rhythm and Hong Kong bilingual pronunciation for this voice.",
        f"English fluency: {profile.englishFluency}.",
        f"Speaking pace: {profile.pace}.",
    ]
    if profile.cantoneseRatio > 0:
        parts.append("Ignore Cantonese mixing unless the input text itself contains Cantonese.")
    return " ".join(parts)


def ensure_end_of_prompt(instruction: str) -> str:
    if "<|endofprompt|>" in instruction:
        return instruction
    return f"{instruction.strip()}<|endofprompt|>"
