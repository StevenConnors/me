#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

if [[ "$(uname -s)" != "Darwin" || "$(uname -m)" != "arm64" ]]; then
  echo "This setup targets macOS on Apple Silicon (arm64)." >&2
  exit 1
fi

if ! command -v brew >/dev/null 2>&1; then
  echo "Install Homebrew first: https://brew.sh/" >&2
  exit 1
fi
if ! command -v ffmpeg >/dev/null 2>&1 || ! command -v ffprobe >/dev/null 2>&1; then
  brew install ffmpeg
fi

if ! command -v python3.11 >/dev/null 2>&1; then
  brew install python@3.11
fi

python3.11 -m venv .venv-voice
.venv-voice/bin/python -m pip install --upgrade pip
.venv-voice/bin/python -m pip install -r scripts/requirements-voice.txt

if [[ ! -f scripts/voice.env ]]; then
  cp scripts/voice.env.example scripts/voice.env
  chmod 600 scripts/voice.env
  echo "Created scripts/voice.env. Fill in APP_BASE_URL and VOICE_TRANSCRIBER_API_TOKEN before running the worker."
fi

if [[ "${1:-}" == "--model" ]]; then
  model="${2:-}"
  if [[ -z "$model" ]]; then
    echo "Usage: $0 [--model MODEL]" >&2
    exit 2
  fi
  .venv-voice/bin/python scripts/transcribe.py setup-model --model "$model"
elif [[ $# -gt 0 ]]; then
  echo "Usage: $0 [--model MODEL]" >&2
  exit 2
fi

echo "Voice worker ready. Run: .venv-voice/bin/python scripts/transcribe.py pending"
