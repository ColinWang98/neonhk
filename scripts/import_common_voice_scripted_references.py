#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import json
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


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Extract Common Voice scripted speech clips into local CosyVoice reference pools."
    )
    parser.add_argument("--source", required=True, help="Locale folder containing validated.tsv and clips/.")
    parser.add_argument(
        "--target",
        default="tts_sidecar/reference/open-source/common-voice-zh-HK",
        help="Output folder. Clips are written into <target>/<age_gender>/.",
    )
    parser.add_argument("--split", default="validated.tsv")
    parser.add_argument("--per-bucket", type=int, default=3)
    parser.add_argument("--min-ms", type=int, default=3500)
    parser.add_argument("--max-ms", type=int, default=9000)
    parser.add_argument("--max-reference-ms", type=int, default=8000)
    parser.add_argument("--min-chars", type=int, default=8)
    parser.add_argument("--min-up-votes", type=int, default=2)
    parser.add_argument("--max-down-votes", type=int, default=0)
    parser.add_argument("--prefer-accent", default="香港")
    args = parser.parse_args()

    source = Path(args.source).expanduser().resolve()
    target = Path(args.target).expanduser().resolve()
    tsv_path = source / args.split
    clips_dir = source / "clips"
    durations = load_durations(source / "clip_durations.tsv")

    if not tsv_path.exists():
        raise SystemExit(f"Missing TSV: {tsv_path}")
    if not clips_dir.exists():
        raise SystemExit(f"Missing clips dir: {clips_dir}")

    rows = list(csv.DictReader(tsv_path.open(encoding="utf-8"), delimiter="\t"))
    selected = select_rows(rows, durations, args)
    extract_selected(selected, clips_dir, target, args.max_reference_ms)

    manifest = {
        "source": str(source),
        "dataset": "Mozilla Common Voice Scripted Speech 25.0 zh-HK",
        "license": "CC0-1.0; do not attempt to identify speakers.",
        "references": {
            bucket: [
                {
                    "file": item["outputName"],
                    "sourceAudioFile": item["path"],
                    "age": item["age"],
                    "gender": item["gender"],
                    "accents": item.get("accents", ""),
                    "durationMs": durations.get(item["path"]),
                    "upVotes": safe_int(item.get("up_votes")),
                    "downVotes": safe_int(item.get("down_votes")),
                    "sentence": item.get("sentence", ""),
                }
                for item in items
            ]
            for bucket, items in selected.items()
        },
    }
    target.mkdir(parents=True, exist_ok=True)
    (target / "references.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n")
    print(json.dumps(manifest, indent=2, ensure_ascii=False))


def load_durations(path: Path) -> dict[str, int]:
    if not path.exists():
        return {}
    with path.open(encoding="utf-8") as handle:
        return {
            row["clip"]: safe_int(row["duration[ms]"])
            for row in csv.DictReader(handle, delimiter="\t")
            if row.get("clip")
        }


def select_rows(rows: list[dict[str, str]], durations: dict[str, int], args: argparse.Namespace) -> dict[str, list[dict[str, str]]]:
    by_bucket: dict[str, list[tuple[tuple[int, int, int, int, int], dict[str, str]]]] = defaultdict(list)
    preferred = args.prefer_accent.strip()

    for row in rows:
        bucket = bucket_for_row(row)
        if not bucket:
            continue
        duration = durations.get(row.get("path", ""), 0)
        if duration < args.min_ms or duration > args.max_ms:
            continue
        if safe_int(row.get("up_votes")) < args.min_up_votes:
            continue
        if safe_int(row.get("down_votes")) > args.max_down_votes:
            continue
        sentence = row.get("sentence", "").strip()
        if not sentence:
            continue
        if len(sentence) < args.min_chars or is_too_short_for_reference(sentence):
            continue

        accent = row.get("accents", "")
        accent_score = 1 if preferred and preferred in accent else 0
        vote_score = safe_int(row.get("up_votes"))
        duration_score = -abs(duration - 6000)
        sentence_score = min(len(sentence), 40)
        score = (accent_score, vote_score, duration_score, sentence_score, -safe_int(row.get("down_votes")))
        by_bucket[bucket].append((score, row))

    selected = {}
    for bucket, scored_rows in by_bucket.items():
        selected[bucket] = [
            row for _, row in sorted(scored_rows, key=lambda item: item[0], reverse=True)[: args.per_bucket]
        ]
    return selected


def extract_selected(selected: dict[str, list[dict[str, str]]], clips_dir: Path, target: Path, max_reference_ms: int) -> None:
    for bucket, rows in selected.items():
        out_dir = target / bucket
        out_dir.mkdir(parents=True, exist_ok=True)
        for index, row in enumerate(rows, start=1):
            source = clips_dir / row["path"]
            if not source.exists():
                raise SystemExit(f"Missing clip: {source}")
            output_name = f"zhhk_{index:02d}_{source.stem}.wav"
            row["outputName"] = output_name
            data, sample_rate = sf.read(str(source), dtype="float32")
            max_samples = int(sample_rate * max_reference_ms / 1000)
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


def is_too_short_for_reference(sentence: str) -> bool:
    stripped = sentence.strip()
    if len(stripped) <= 2:
        return True
    digits_and_cjk_numbers = set("0123456789零一二三四五六七八九十百千萬亿億兩幾")
    return all(char in digits_and_cjk_numbers for char in stripped)


if __name__ == "__main__":
    main()
