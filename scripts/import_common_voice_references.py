#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import json
import shutil
from pathlib import Path


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
        description="Select Common Voice English clips as CosyVoice reference presets."
    )
    parser.add_argument(
        "--source",
        required=True,
        help="Extracted Common Voice English folder containing validated.tsv/train.tsv and clips/.",
    )
    parser.add_argument(
        "--split",
        default="validated.tsv",
        help="Metadata TSV to read. Defaults to validated.tsv.",
    )
    parser.add_argument(
        "--target",
        default="tts_sidecar/reference/open-source/common-voice",
        help="Output folder for age_gender.mp3 presets.",
    )
    parser.add_argument(
        "--preferred-accent",
        default="Hong Kong English",
        help="Prefer this accent when present. Use empty string to disable.",
    )
    args = parser.parse_args()

    source = Path(args.source).expanduser().resolve()
    target = Path(args.target).expanduser().resolve()
    metadata_path = source / args.split
    clips_dir = source / "clips"

    if not metadata_path.exists():
        raise SystemExit(f"Missing metadata TSV: {metadata_path}")
    if not clips_dir.exists():
        raise SystemExit(f"Missing clips directory: {clips_dir}")

    target.mkdir(parents=True, exist_ok=True)
    selected = choose_rows(metadata_path, clips_dir, args.preferred_accent.strip())

    manifest = {"source": str(source), "split": args.split, "references": []}
    for preset, row in selected.items():
        source_clip = clips_dir / row["path"]
        suffix = source_clip.suffix.lower() or ".mp3"
        output = target / f"{preset}{suffix}"
        shutil.copyfile(source_clip, output)
        manifest["references"].append(
            {
                "preset": preset,
                "path": str(output),
                "common_voice_path": row.get("path"),
                "age": row.get("age"),
                "gender": row.get("gender"),
                "accent": row.get("accent"),
                "sentence": row.get("sentence"),
                "up_votes": row.get("up_votes"),
                "down_votes": row.get("down_votes"),
            }
        )

    (target / "references.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n")
    print(json.dumps(manifest, indent=2, ensure_ascii=False))


def choose_rows(metadata_path: Path, clips_dir: Path, preferred_accent: str) -> dict[str, dict[str, str]]:
    targets = {
        "young_male",
        "young_female",
        "middle_male",
        "middle_female",
        "older_male",
        "older_female",
    }
    candidates: dict[str, list[tuple[tuple[int, int, int], dict[str, str]]]] = {target: [] for target in targets}

    with metadata_path.open("r", encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle, delimiter="\t")
        for row in reader:
            preset = preset_for_row(row)
            if preset not in candidates:
                continue

            clip = clips_dir / row.get("path", "")
            sentence = row.get("sentence", "")
            if not clip.exists() or not sentence:
                continue
            if len(sentence) < 40 or len(sentence) > 180:
                continue

            up_votes = safe_int(row.get("up_votes"))
            down_votes = safe_int(row.get("down_votes"))
            if down_votes > 0:
                continue

            accent = row.get("accent", "")
            accent_score = 1 if preferred_accent and accent == preferred_accent else 0
            score = (accent_score, up_votes, len(sentence))
            candidates[preset].append((score, row))

    selected = {}
    for preset, rows in candidates.items():
        if rows:
            selected[preset] = sorted(rows, key=lambda item: item[0], reverse=True)[0][1]
    return selected


def preset_for_row(row: dict[str, str]) -> str | None:
    age = AGE_BUCKETS.get(row.get("age", "").strip().lower())
    gender = GENDER_MAP.get(row.get("gender", "").strip().lower())
    if not age or not gender:
        return None
    return f"{age}_{gender}"


def safe_int(value: str | None) -> int:
    try:
        return int(value or 0)
    except ValueError:
        return 0


if __name__ == "__main__":
    main()
