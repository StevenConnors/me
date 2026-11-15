#!/usr/bin/env python3
"""Fetch and transcribe voice recordings with local Apple MLX Whisper."""

from __future__ import annotations

import argparse
import json
import math
import os
import re
import shutil
import subprocess
import sys
import tempfile
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_ENV_FILE = ROOT / "scripts" / "voice.env"
RECOVERY_DIR = ROOT / ".voice-transcripts-pending"
DEFAULT_MODEL = "mlx-community/whisper-medium-mlx"
MODEL_ALIASES = {
    "small": "mlx-community/whisper-small-mlx",
    "medium": "mlx-community/whisper-medium-mlx",
    "large-v3": "mlx-community/whisper-large-v3-mlx",
    "turbo": "mlx-community/whisper-large-v3-turbo",
    "large-v3-turbo": "mlx-community/whisper-large-v3-turbo",
}
ID_RE = re.compile(r"^[a-fA-F0-9]{24}$")
MAX_AUDIO_BYTES = 250 * 1024 * 1024
MAX_LIMIT = 100
HEARTBEAT_SECONDS = 60
USER_AGENT = "voice-memo-local-transcriber/1.0"


class CliError(Exception):
    pass


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise CliError("The application redirected a request; refusing to forward credentials.")


def load_env_file(path: Path) -> None:
    """Load simple KEY=VALUE lines without overriding the caller's environment."""
    if not path.exists():
        return
    for number, raw in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("export "):
            line = line[7:].lstrip()
        if "=" not in line:
            raise CliError(f"Invalid environment line {number} in {path}.")
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip()
        if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", key):
            raise CliError(f"Invalid environment variable name on line {number} in {path}.")
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
            value = value[1:-1]
        os.environ.setdefault(key, value)


def api_base(value: str) -> tuple[str, str]:
    parsed = urllib.parse.urlsplit(value.strip())
    if parsed.scheme not in {"https", "http"} or not parsed.hostname:
        raise CliError("APP_BASE_URL must be an absolute HTTPS URL.")
    loopback = parsed.hostname.lower() in {"localhost", "127.0.0.1", "::1"}
    if parsed.scheme != "https" and not loopback:
        raise CliError("APP_BASE_URL must use HTTPS except for localhost development.")
    if parsed.username or parsed.password or parsed.query or parsed.fragment:
        raise CliError("APP_BASE_URL must not contain credentials, a query, or a fragment.")
    origin = urllib.parse.urlunsplit((parsed.scheme, parsed.netloc, "", "", ""))
    prefix = parsed.path.rstrip("/")
    return origin, prefix


class Api:
    def __init__(self, base_url: str, token: str):
        self.origin, self.prefix = api_base(base_url)
        self.token = token
        self.opener = urllib.request.build_opener(NoRedirect())

    def redact(self, value: str) -> str:
        return value.replace(self.token, "[redacted]") if self.token else value

    def url(self, path: str, query: dict[str, str] | None = None) -> str:
        full = self.origin + self.prefix + path
        return full + ("?" + urllib.parse.urlencode(query) if query else "")

    def request(self, method: str, path: str, payload: dict[str, Any] | None = None,
                query: dict[str, str] | None = None, timeout: int = 45):
        url = self.url(path, query)
        headers = {"Authorization": f"Bearer {self.token}", "User-Agent": USER_AGENT,
                   "Accept": "application/json"}
        data = None
        if payload is not None:
            data = json.dumps(payload, ensure_ascii=False, allow_nan=False).encode("utf-8")
            headers["Content-Type"] = "application/json"
        req = urllib.request.Request(url, data=data, headers=headers, method=method)
        try:
            response = self.opener.open(req, timeout=timeout)
        except urllib.error.HTTPError as exc:
            body = exc.read(4096).decode("utf-8", "replace")
            try:
                error = json.loads(body).get("error")
                detail = error.get("message") if isinstance(error, dict) else error
                detail = detail or json.loads(body).get("message")
            except (ValueError, AttributeError):
                detail = ""
            raise CliError(self.redact(f"{method} {path} failed with HTTP {exc.code}" + (f": {detail}" if detail else "."))) from None
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            raise CliError(self.redact(f"Could not reach {method} {path}: {exc.reason if isinstance(exc, urllib.error.URLError) else exc}")) from None
        return response

    def json(self, method: str, path: str, payload: dict[str, Any] | None = None,
             query: dict[str, str] | None = None, attempts: int = 1):
        last_error = None
        for attempt in range(attempts):
            try:
                with self.request(method, path, payload, query) as response:
                    body = response.read(8 * 1024 * 1024 + 1)
                if len(body) > 8 * 1024 * 1024:
                    raise CliError(f"{method} {path} returned an oversized response.")
                try:
                    return json.loads(body.decode("utf-8")) if body else {}
                except (UnicodeDecodeError, ValueError):
                    raise CliError(f"{method} {path} returned invalid JSON.") from None
            except CliError as exc:
                last_error = exc
                if attempt + 1 < attempts:
                    time.sleep(min(2 ** attempt, 4))
        raise last_error or CliError(f"{method} {path} failed.")

    def download(self, recording_id: str, destination: Path, expected_size: int | None) -> None:
        path = f"/api/voice/recordings/{recording_id}/audio"
        received = 0
        try:
            with self.request("GET", path, timeout=120) as response:
                content_type = response.headers.get_content_type().lower()
                if not content_type.startswith("audio/") and content_type not in {"application/octet-stream", "video/mp4"}:
                    raise CliError(f"Audio endpoint returned unexpected content type {content_type!r}.")
                with destination.open("wb") as out:
                    os.chmod(destination, 0o600)
                    while True:
                        block = response.read(1024 * 1024)
                        if not block:
                            break
                        received += len(block)
                        if received > MAX_AUDIO_BYTES:
                            raise CliError("Audio exceeds the application's 250 MiB upload limit.")
                        out.write(block)
                    out.flush()
                    os.fsync(out.fileno())
        except OSError as exc:
            raise CliError(f"Could not save downloaded audio: {exc}") from None
        if received == 0:
            raise CliError("Audio download was empty.")
        if expected_size is not None and received != expected_size:
            raise CliError(f"Downloaded {received} bytes, but recording metadata says {expected_size}.")


class Heartbeat:
    def __init__(self, api: Api, recording_id: str, claim_id: str):
        self.api, self.recording_id, self.claim_id = api, recording_id, claim_id
        self.stop_event = threading.Event()
        self.error: str | None = None
        self.thread = threading.Thread(target=self._run, name="voice-claim-heartbeat", daemon=True)

    def start(self):
        self.thread.start()

    def _run(self):
        while not self.stop_event.wait(HEARTBEAT_SECONDS):
            try:
                self.api.json("POST", f"/api/voice/recordings/{self.recording_id}/heartbeat",
                              {"claimId": self.claim_id}, attempts=2)
            except CliError as exc:
                self.error = str(exc)
                self.stop_event.set()

    def check(self):
        if self.error:
            raise CliError(f"Recording claim heartbeat failed: {self.error}")

    def close(self):
        self.stop_event.set()
        if self.thread.is_alive():
            self.thread.join(timeout=2)


def safe_id(value: str) -> str:
    if not ID_RE.fullmatch(value):
        raise CliError("Recording ID must be a 24-character MongoDB ObjectId.")
    return value.lower()


def choose_recordings(api: Api, args) -> list[dict[str, Any]]:
    if args.recording_id:
        recording_id = safe_id(args.recording_id)
        data = api.json("GET", f"/api/voice/recordings/{recording_id}")
        if not isinstance(data, dict):
            raise CliError("Recording detail response must be a JSON object.")
        rec = data.get("recording", data)
        if not isinstance(rec, dict) or str(rec.get("_id", rec.get("id", ""))).lower() != recording_id:
            raise CliError("Recording detail response did not match the requested ID.")
        return [rec]

    limit = args.limit if args.limit is not None else (MAX_LIMIT if args.all else 1)
    page_limit = min(MAX_LIMIT, limit)
    data = api.json("GET", "/api/voice/recordings/pending", query={"limit": str(page_limit)})
    page = data.get("recordings") if isinstance(data, dict) else None
    if not isinstance(page, list):
        raise CliError("Pending recordings response must contain a recordings array.")
    return [item for item in page if isinstance(item, dict)][:page_limit]


def ensure_tools() -> tuple[str, str]:
    ffmpeg = shutil.which("ffmpeg")
    ffprobe = shutil.which("ffprobe")
    if not ffmpeg or not ffprobe:
        raise CliError("ffmpeg and ffprobe are required. Install them with: brew install ffmpeg")
    return ffmpeg, ffprobe


def audio_duration(path: Path, ffprobe: str) -> float:
    try:
        result = subprocess.run([ffprobe, "-v", "error", "-show_entries", "format=duration",
                                 "-of", "default=noprint_wrappers=1:nokey=1", str(path)],
                                check=True, capture_output=True, text=True, timeout=60)
        duration = float(result.stdout.strip())
    except (subprocess.CalledProcessError, ValueError, subprocess.TimeoutExpired, OSError):
        raise CliError("ffprobe could not read this audio file; confirm it is a valid Voice Memo.") from None
    if not math.isfinite(duration) or duration <= 0:
        raise CliError("Audio duration is invalid.")
    return duration


def transcribe(audio_path: Path, model: str, language: str) -> dict[str, Any]:
    try:
        import mlx_whisper
    except ImportError:
        raise CliError("mlx-whisper is not installed. Run: ./scripts/setup-voice.sh") from None
    options: dict[str, Any] = {"path_or_hf_repo": model, "task": "transcribe", "word_timestamps": False}
    if language != "auto":
        options["language"] = language
    try:
        result = mlx_whisper.transcribe(str(audio_path), **options)
    except Exception as exc:  # noqa: BLE001 - preserve useful model/runtime diagnostics
        raise CliError(f"Local Whisper inference failed: {exc}") from None
    text = result.get("text") if isinstance(result, dict) else None
    if not isinstance(text, str) or not text.strip():
        raise CliError("Whisper returned an empty transcript.")
    segments = []
    for raw in result.get("segments", []):
        if not isinstance(raw, dict):
            continue
        start, end, segment_text = raw.get("start"), raw.get("end"), raw.get("text")
        if (isinstance(start, (float, int)) and isinstance(end, (float, int)) and
                math.isfinite(start) and math.isfinite(end) and 0 <= start <= end and
                isinstance(segment_text, str)):
            segments.append({"start": float(start), "end": float(end), "text": segment_text.strip()})
    detected = result.get("language")
    if detected not in {"en", "ja"}:
        detected = language if language != "auto" else (detected if isinstance(detected, str) else None)
    return {"text": text.strip(), "language": detected, "segments": segments}


def failure(api: Api, recording_id: str, claim_id: str, message: str) -> str | None:
    try:
        api.json("POST", f"/api/voice/recordings/{recording_id}/failure",
                 {"claimId": claim_id, "error": message[:1000]}, attempts=1)
        return None
    except CliError as exc:
        return str(exc)


def save_recovery(recording_id: str, payload: dict[str, Any], force: bool = False) -> Path:
    RECOVERY_DIR.mkdir(mode=0o700, parents=True, exist_ok=True)
    os.chmod(RECOVERY_DIR, 0o700)
    target = RECOVERY_DIR / f"{recording_id}-{payload['claimId']}.json"
    tmp = target.with_suffix(".tmp")
    with tmp.open("w", encoding="utf-8") as out:
        os.chmod(tmp, 0o600)
        json.dump({"recordingId": recording_id, "payload": payload, "force": force}, out,
                  ensure_ascii=False, indent=2, allow_nan=False)
        out.write("\n")
        out.flush()
        os.fsync(out.fileno())
    tmp.replace(target)
    return target


def submit_transcript(api: Api, recording_id: str, payload: dict[str, Any]) -> None:
    path = f"/api/voice/recordings/{recording_id}/transcription"
    # A timeout may occur after commit. Repeat exactly the same claim and transcript; the API is idempotent.
    api.json("POST", path, payload, attempts=3)


def process_recording(api: Api, recording: dict[str, Any], args, model: str, ffprobe: str) -> bool:
    rid = safe_id(str(recording.get("_id", recording.get("id", ""))))
    filename = str(recording.get("originalFilename") or recording.get("filename") or "voice memo")
    if recording.get("status") not in {"pending", "failed", "processing", "completed", None}:
        raise CliError(f"Recording {rid} has an unknown state.")
    if recording.get("status") == "failed" and not args.force:
        raise CliError(f"Recording {rid} previously failed. Retry this one ID with --force.")
    print(f"[{rid}] Claiming {filename}")
    try:
        claim = api.json("POST", f"/api/voice/recordings/{rid}/claim", {"force": bool(args.force)})
    except CliError as exc:
        if "HTTP 409" in str(exc):
            print(f"[{rid}] Skipped: another worker owns the active claim.")
            return False
        raise
    claim_data = claim.get("recording", {}) if isinstance(claim, dict) else {}
    claim_id = claim.get("claimId") if isinstance(claim, dict) else None
    claim_id = claim_id or claim_data.get("claimId")
    if not isinstance(claim_id, str) or not claim_id:
        raise CliError(f"[{rid}] Claim response did not include a claim ID.")

    heartbeat = Heartbeat(api, rid, claim_id)
    heartbeat.start()
    keep_path: Path | None = None
    submission_started = False
    recovery_path: Path | None = None
    audio_path: Path | None = None
    try:
        size = recording.get("byteSize", recording.get("size"))
        if size is not None and (not isinstance(size, int) or size <= 0 or size > MAX_AUDIO_BYTES):
            raise CliError("Recording metadata has an invalid or excessive byte size.")
        if args.keep_audio:
            cache = ROOT / ".voice-audio-cache"
            cache.mkdir(mode=0o700, exist_ok=True)
            os.chmod(cache, 0o700)
            keep_path = cache / f"{rid}-{Path(filename).name}"
            fd, temp_name = tempfile.mkstemp(prefix=f"{rid}-", suffix=Path(filename).suffix or ".audio", dir=cache)
            os.close(fd)
            audio_path = Path(temp_name)
            os.chmod(audio_path, 0o600)
        else:
            fd, temp_name = tempfile.mkstemp(prefix="voice-memo-", suffix=Path(filename).suffix or ".audio")
            os.close(fd)
            audio_path = Path(temp_name)
            os.chmod(audio_path, 0o600)
        try:
            print(f"[{rid}] Downloading original audio…")
            api.download(rid, audio_path, size)
            heartbeat.check()
            duration = audio_duration(audio_path, ffprobe)
            print(f"[{rid}] Transcribing locally with {model} ({args.language})…")
            result = transcribe(audio_path, model, args.language)
            heartbeat.check()
            payload = {"claimId": claim_id, "text": result["text"], "model": model,
                       "durationSeconds": duration, "segments": result["segments"]}
            if result["language"]:
                payload["language"] = result["language"]
            try:
                recovery_path = save_recovery(rid, payload, force=bool(args.force))
            except OSError as exc:
                raise CliError(f"Could not safely save a local recovery payload; transcript was not submitted: {exc}") from None
            submission_started = True
            try:
                submit_transcript(api, rid, payload)
            except CliError as exc:
                raise CliError(f"Transcript submission failed: {exc}. Saved the exact payload to {recovery_path}; retry with `python scripts/transcribe.py retry {recovery_path}`.") from None
            recovery_path.unlink(missing_ok=True)
            print(f"[{rid}] Completed ({len(result['text'])} characters).")
            if keep_path:
                final_path = keep_path
                if audio_path != final_path:
                    audio_path.replace(final_path)
                print(f"[{rid}] Kept audio at {final_path}")
            return True
        finally:
            if audio_path.exists() and not args.keep_audio:
                audio_path.unlink()
            elif audio_path.exists() and args.keep_audio and keep_path is None:
                audio_path.unlink()
    except KeyboardInterrupt:
        message = "Transcription interrupted by user."
        report_error = None if submission_started else failure(api, rid, claim_id, message)
        if submission_started and recovery_path:
            print(f"[{rid}] Submission may have completed; retry safely with `python scripts/transcribe.py retry {recovery_path}`.", file=sys.stderr)
        raise CliError(message + (f" Failure report also failed: {report_error}" if report_error else "")) from None
    except CliError as exc:
        message = str(exc)
        report_error = None if submission_started else failure(api, rid, claim_id, message)
        if report_error:
            message += f" Failure report also failed: {report_error}"
        raise CliError(f"[{rid}] {message}") from None
    finally:
        heartbeat.close()
        if args.keep_audio and keep_path is not None and audio_path is not None and audio_path.exists():
            try:
                audio_path.replace(keep_path)
                print(f"[{rid}] Kept audio at {keep_path}")
            except OSError as exc:
                print(f"[{rid}] Could not move kept audio to {keep_path}: {exc}", file=sys.stderr)


def retry_recovery(api: Api, path: Path) -> int:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        rid = safe_id(data["recordingId"])
        payload = data["payload"]
        if not isinstance(payload, dict) or payload.get("claimId") is None:
            raise ValueError("missing claimId")
        force = bool(data.get("force", False))
    except (OSError, ValueError, KeyError, TypeError):
        raise CliError(f"Invalid recovery file: {path}") from None
    detail_response = api.json("GET", f"/api/voice/recordings/{rid}")
    if not isinstance(detail_response, dict):
        raise CliError("Recording detail response must be a JSON object.")
    current = detail_response.get("recording", {})
    if not isinstance(current, dict):
        raise CliError("Recording detail response did not contain a recording object.")
    if current.get("status") == "completed":
        same = (current.get("transcriptText") == payload.get("text") and
                current.get("transcriptionModel") == payload.get("model") and
                current.get("transcriptLanguage") == payload.get("language") and
                current.get("durationSeconds") == payload.get("durationSeconds") and
                current.get("segments", []) == payload.get("segments", []))
        if same:
            path.unlink()
            print(f"[{rid}] Transcript was already accepted; removed the recovery file.")
            return 0
        raise CliError(f"[{rid}] Recording already has a different completed transcript; recovery was left unchanged. Review it before starting a fresh --force run.")
    try:
        submit_transcript(api, rid, payload)
    except CliError as original:
        # If the previous claim expired, atomically claim the pending/expired/failed item.
        # A live processing claim remains protected by the API and cannot be stolen.
        try:
            claim = api.json("POST", f"/api/voice/recordings/{rid}/claim", {"force": force or current.get("status") == "failed"})
        except CliError:
            raise original
        claim_id = claim.get("claimId")
        if not isinstance(claim_id, str):
            raise CliError("Recovery claim response did not include a claim ID.")
        payload["claimId"] = claim_id
        data["payload"] = payload
        tmp = path.with_suffix(".tmp")
        with tmp.open("w", encoding="utf-8") as out:
            os.chmod(tmp, 0o600)
            json.dump(data, out, ensure_ascii=False, indent=2, allow_nan=False)
            out.write("\n")
            out.flush()
            os.fsync(out.fileno())
        tmp.replace(path)
        submit_transcript(api, rid, payload)
    path.unlink()
    print(f"[{rid}] Recovery transcript submitted.")
    return 0


def setup_model(model: str) -> int:
    try:
        import mlx_whisper  # noqa: F401
    except ImportError:
        raise CliError("mlx-whisper is not installed. Run: ./scripts/setup-voice.sh") from None
    try:
        from huggingface_hub import snapshot_download
        snapshot_download(MODEL_ALIASES.get(model, model))
    except Exception as exc:  # noqa: BLE001
        raise CliError(f"Could not download model {model}: {exc}") from None
    print(f"Model downloaded and cached: {MODEL_ALIASES.get(model, model)}")
    return 0


def parse_args(argv: list[str]):
    parser = argparse.ArgumentParser(description="Transcribe pending Voice Memos on this Mac using local MLX Whisper.")
    parser.add_argument("--env-file", type=Path, default=DEFAULT_ENV_FILE,
                        help=f"configuration file (default: {DEFAULT_ENV_FILE.relative_to(ROOT)})")
    sub = parser.add_subparsers(dest="command", required=True)
    pending = sub.add_parser("pending", help="transcribe pending recordings")
    pending.add_argument("--id", dest="recording_id", help="transcribe one recording by MongoDB ObjectId")
    pending.add_argument("--all", action="store_true", help="drain pending recordings until none remain")
    pending.add_argument("--limit", type=int, help="process at most N recordings (combine with --all to bound a drain)")
    pending.add_argument("--model", default=None, help="model alias, Hugging Face model, or local path")
    pending.add_argument("--language", choices=("auto", "en", "ja"), default="auto")
    pending.add_argument("--force", action="store_true", help="retranscribe a completed recording; requires --id")
    pending.add_argument("--keep-audio", action="store_true", help="keep downloaded audio in a private local cache")
    setup = sub.add_parser("setup-model", help="download a model before transcribing")
    setup.add_argument("--model", default=None)
    retry = sub.add_parser("retry", help="resubmit a saved transcript payload")
    retry.add_argument("recovery_file", type=Path)
    args = parser.parse_args(argv)
    if args.command == "pending":
        if args.limit is not None and (args.limit < 1 or args.limit > 10000):
            parser.error("--limit must be between 1 and 10000")
        if args.recording_id and (args.all or args.limit is not None):
            parser.error("--id cannot be combined with --all or --limit")
        if args.force and not args.recording_id:
            parser.error("--force requires --id")
    return parser, args


def main(argv: list[str] | None = None) -> int:
    parser, args = parse_args(argv or sys.argv[1:])
    try:
        load_env_file(args.env_file)
        model = getattr(args, "model", None) or os.getenv("WHISPER_MODEL") or DEFAULT_MODEL
        model = MODEL_ALIASES.get(model, model)
        if args.command == "setup-model":
            return setup_model(model)
        base_url = os.getenv("APP_BASE_URL", "").strip()
        token = os.getenv("VOICE_TRANSCRIBER_API_TOKEN", "")
        if not base_url:
            raise CliError(f"APP_BASE_URL is missing. Set it in {args.env_file} or the shell environment.")
        if len(token) < 32:
            raise CliError(f"VOICE_TRANSCRIBER_API_TOKEN must contain at least 32 characters; set it in {args.env_file}.")
        api = Api(base_url, token)
        if args.command == "retry":
            return retry_recovery(api, args.recovery_file)
        if args.language not in {"auto", "en", "ja"}:
            raise CliError("Language must be auto, en, or ja.")
        _, ffprobe = ensure_tools()
        if args.recording_id:
            recordings = choose_recordings(api, args)
            if recordings and recordings[0].get("status") == "completed" and not args.force:
                print(f"[{args.recording_id}] Already completed; use --force to replace its transcript.")
                return 0
            if not recordings:
                print("No recording selected.")
                return 0
        else:
            recordings = choose_recordings(api, args)
        if not recordings:
            print("No pending recordings.")
            return 0
        succeeded = 0
        failed = 0
        attempted = 0
        seen: set[str] = set()
        target = args.limit if args.limit is not None else (None if args.all else 1)
        while recordings and (target is None or attempted < target):
            for recording in recordings:
                recording_id = safe_id(str(recording.get("_id", recording.get("id", ""))))
                if recording_id in seen:
                    continue
                seen.add(recording_id)
                attempted += 1
                try:
                    succeeded += bool(process_recording(api, recording, args, model, ffprobe))
                except CliError as exc:
                    print(str(exc), file=sys.stderr)
                    failed += 1
                    if not args.all and args.limit is None:
                        break
                if target is not None and attempted >= target:
                    break
            if not args.all and args.limit is None:
                break
            remaining = target - attempted if target is not None else MAX_LIMIT
            if remaining <= 0:
                break
            batch = min(MAX_LIMIT, remaining)
            response = api.json("GET", "/api/voice/recordings/pending", query={"limit": str(batch)})
            page = response.get("recordings") if isinstance(response, dict) else None
            if not isinstance(page, list):
                raise CliError("Pending recordings response must contain a recordings array.")
            recordings = [item for item in page if isinstance(item, dict) and str(item.get("_id", item.get("id", ""))).lower() not in seen]
        print(f"Finished: {succeeded} completed, {failed} failed or skipped.")
        return 1 if failed else 0
    except CliError as exc:
        print(str(exc), file=sys.stderr)
        return 2
    except KeyboardInterrupt:
        print("Interrupted.", file=sys.stderr)
        return 130


if __name__ == "__main__":
    raise SystemExit(main())
