#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VENV_DIR="$ROOT_DIR/.venv-cosyvoice"
PYTHON_BIN="${PYTHON_BIN:-python3.11}"
COSYVOICE_REPO="${COSYVOICE_REPO:-$ROOT_DIR/third_party/CosyVoice}"
COSYVOICE_MODEL_DIR="${COSYVOICE_MODEL_DIR:-$ROOT_DIR/third_party/CosyVoice/pretrained_models/Fun-CosyVoice3-0.5B}"
COSYVOICE_REFERENCE_AUDIO="${COSYVOICE_REFERENCE_AUDIO:-$ROOT_DIR/tts_sidecar/reference/default.wav}"

if [ ! -d "$VENV_DIR" ]; then
  "$PYTHON_BIN" -m venv "$VENV_DIR"
fi

"$VENV_DIR/bin/python" -m pip install --upgrade pip
"$VENV_DIR/bin/python" -m pip install "setuptools<81" wheel
"$VENV_DIR/bin/python" -m pip install numpy==1.26.4
"$VENV_DIR/bin/python" -m pip install --no-build-isolation -r "$COSYVOICE_REPO/requirements.txt"
"$VENV_DIR/bin/python" -m pip install -r "$ROOT_DIR/tts_sidecar/requirements.txt"

export COSYVOICE_REPO
export COSYVOICE_MODEL_DIR
export COSYVOICE_REFERENCE_AUDIO

exec "$VENV_DIR/bin/python" -m uvicorn tts_sidecar.server:app \
  --host 127.0.0.1 \
  --port "${COSYVOICE_PORT:-7860}" \
  --app-dir "$ROOT_DIR"
