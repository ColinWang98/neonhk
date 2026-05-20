# CosyVoice 3 local sidecar

This service keeps CosyVoice 3 out of the Next.js process. The app calls:

```txt
POST http://127.0.0.1:7860/tts
```

and receives:

```json
{
  "audioUrl": "http://127.0.0.1:7860/audio/example.wav",
  "durationMs": 12000
}
```

## Expected request

```json
{
  "text": "Schema narrative text...",
  "voiceHint": "Cantonese leaning, reflective, everyday rhythm",
  "voiceProfile": {
    "accent": "cantonese-leaning",
    "englishFluency": "conversational",
    "age": "older",
    "pace": "slow",
    "tone": "reflective",
    "cantoneseRatio": 0.35
  },
  "language": "zh-HK-en-mixed",
  "format": "wav"
}
```

For Shanxi dialect / Shanxi Mandarin testing, use:

```json
{
  "text": "哎呀，这个街角我一看就晓得咋走。先看清楚招牌，再往边上一站，别挡住后头的人。",
  "voiceProfile": {
    "accent": "shanxi",
    "englishFluency": "conversational",
    "gender": "female",
    "age": "middle",
    "pace": "normal",
    "tone": "casual",
    "cantoneseRatio": 0
  },
  "language": "zh-HK-en-mixed",
  "format": "wav"
}
```

## Environment

```bash
COSYVOICE_REPO=/absolute/path/to/CosyVoice
COSYVOICE_MODEL_DIR=FunAudioLLM/Fun-CosyVoice3-0.5B-2512
COSYVOICE_REFERENCE_AUDIO=/absolute/path/to/reference.wav
COSYVOICE_PUBLIC_BASE_URL=http://127.0.0.1:7860
```

CosyVoice 3 needs a reference audio file for persona-style local generation. Use a short audio clip you have permission to use. Do not use another person's voice without explicit consent.

For Shanxi voice style, add reference clips under `tts_sidecar/reference/shanxi`, preferably grouped by `age_gender` such as `middle_female/sample.wav`. If no Shanxi clip exists, the sidecar can still request a Shanxi delivery, but it will be less reliable because it falls back to the default reference voice.

## Start

```bash
./scripts/start-cosyvoice3-sidecar.sh
```

The script creates `.venv-cosyvoice`, installs the sidecar requirements, and starts FastAPI on port `7860`. It expects the official CosyVoice repository and its model/runtime dependencies to be installed separately.
