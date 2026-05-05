#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import json
import tarfile
from collections import defaultdict
from pathlib import Path

import librosa
import soundfile as sf

AGE_BUCKETS = {
    "teens": "young",
    "twenties": "young",
    "thirties": "middle",
    "fourties": "middle",
    "forties": "middle",
    "fifties": "older",
    "sixties": "older",
    "seventies": "older",
    "eighties": "older",
    "nineties": "older",
}

GENDER_MAP = {
    "male_masculine": "male",
    "male": "male",
    "female_feminine": "female",
    "female": "female",
}

BAD_QUALITY_TAGS = {"short-audio", "long-audio", "speech-rate", "transcription-length"}


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Extract Common Voice Spontaneous Speech clips into local CosyVoice reference pools."
    )
    parser.add_argument("--archive", required=True, help="Path to sps-corpus-*.tar.gz")
    parser.add_argument(
        "--target",
        default="tts_sidecar/reference/open-source/common-voice",
        help="Output folder. Clips are written into <target>/<age_gender>/.",
    )
    parser.add_argument("--per-bucket", type=int, default=3, help="Max clips per age/gender bucket.")
    parser.add_argument("--min-ms", type=int, default=4000)
    parser.add_argument("--max-ms", type=int, default=18000)
    parser.add_argument("--min-votes", type=int, default=1)
    parser.add_argument("--prefer-accent", default="", help="Optional accent substring to prefer.")
    args = parser.parse_args()

    archive = Path(args.archive).expanduser().resolve()
    target = Path(args.target).expanduser().resolve()
    if not archive.exists():
        raise SystemExit(f"Missing archive: {archive}")

    with tarfile.open(archive, "r:gz") as tar:
        tsv_member = find_member(tar, "ss-corpus-en.tsv")
        rows = read_tsv(tar, tsv_member)
        selected = select_rows(rows, args)
        extract_selected(tar, selected, target)

    manifest = {
        "sourceArchive": str(archive),
        "dataset": "Mozilla Common Voice Spontaneous Speech 3.0 English",
        "license": "CC0-1.0; do not attempt to identify speakers.",
        "references": {
            bucket: [
                {
                    "file": item["outputName"],
                    "sourceAudioFile": item["audio_file"],
                    "age": item["age"],
                    "gender": item["gender"],
                    "accents": item.get("accents", ""),
                    "durationMs": safe_int(item.get("duration_ms")),
                    "votes": safe_int(item.get("votes")),
                    "split": item.get("split", ""),
                    "qualityTags": item.get("quality_tags", ""),
                    "transcription": item.get("transcription", ""),
                }
                for item in items
            ]
            for bucket, items in selected.items()
        },
    }
    (target / "references.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n")
    print(json.dumps(manifest, indent=2, ensure_ascii=False))


def find_member(tar: tarfile.TarFile, basename: str) -> tarfile.TarInfo:
    for member in tar.getmembers():
        if Path(member.name).name == basename:
            return member
    raise SystemExit(f"Could not find {basename} in archive")


def read_tsv(tar: tarfile.TarFile, member: tarfile.TarInfo) -> list[dict[str, str]]:
    handle = tar.extractfile(member)
    if handle is None:
        raise SystemExit(f"Could not read {member.name}")
    text = handle.read().decode("utf-8")
    return list(csv.DictReader(text.splitlines(), delimiter="\t"))


def select_rows(rows: list[dict[str, str]], args: argparse.Namespace) -> dict[str, list[dict[str, str]]]:
    by_bucket: dict[str, list[tuple[tuple[int, int, int, int, int], dict[str, str]]]] = defaultdict(list)
    preferred = args.prefer_accent.lower().strip()

    for row in rows:
        bucket = bucket_for_row(row)
        if not bucket:
            continue
        duration = safe_int(row.get("duration_ms"))
        votes = safe_int(row.get("votes"))
        transcription = row.get("transcription", "").strip()
        tags = set(filter(None, row.get("quality_tags", "").split("|")))
        if duration < args.min_ms or duration > args.max_ms:
            continue
        if votes < args.min_votes:
            continue
        if tags & BAD_QUALITY_TAGS:
            continue
        if not transcription or "[silence]" in transcription.lower():
            continue

        accent = row.get("accents", "").lower()
        accent_score = 1 if preferred and preferred in accent else 0
        split_score = {"test": 3, "dev": 2, "train": 1}.get(row.get("split", ""), 0)
        duration_score = -abs(duration - 9000)
        transcript_score = min(len(transcription), 180)
        score = (accent_score, votes, split_score, duration_score, transcript_score)
        by_bucket[bucket].append((score, row))

    selected = {}
    for bucket, scored_rows in by_bucket.items():
        chosen = [row for _, row in sorted(scored_rows, key=lambda item: item[0], reverse=True)[: args.per_bucket]]
        selected[bucket] = chosen
    return selected


def extract_selected(tar: tarfile.TarFile, selected: dict[str, list[dict[str, str]]], target: Path) -> None:
    members = {Path(member.name).name: member for member in tar.getmembers() if member.isfile()}
    for bucket, rows in selected.items():
        out_dir = target / bucket
        out_dir.mkdir(parents=True, exist_ok=True)
        for index, row in enumerate(rows, start=1):
            audio_file = row["audio_file"]
            member = members.get(audio_file)
            if member is None:
                raise SystemExit(f"Missing audio in archive: {audio_file}")
            source = tar.extractfile(member)
            if source is None:
                raise SystemExit(f"Could not read audio: {audio_file}")
            output_name = f"mdc_sps_{index:02d}_{Path(audio_file).stem}.wav"
            row["outputName"] = output_name
            data, sample_rate = sf.read(source, dtype="float32")
            max_samples = int(sample_rate * 8)
            if len(data) > max_samples:
                data = data[:max_samples]
            if sample_rate != 16000:
                data = librosa.resample(data, orig_sr=sample_rate, target_sr=16000)
            sf.write(out_dir / output_name, data, 16000)


def bucket_for_row(row: dict[str, str]) -> str | None:
    age = AGE_BUCKETS.get(row.get("age", "").strip().lower())
    gender = GENDER_MAP.get(row.get("gender", "").strip().lower())
    if not age or not gender:
        return None
    return f"{age}_{gender}"


def safe_int(value: str | None) -> int:
    try:
        return int(float(value or 0))
    except ValueError:
        return 0


if __name__ == "__main__":
    main()
