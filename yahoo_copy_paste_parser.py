"""Parse Yahoo-style hitter table copy/paste text into scored JSON records.

This module is designed for copy/paste text exported from a fantasy baseball
table view where each player row includes:
- Player name
- Team and position (for example "NYY - OF")
- H/AB split (for example "1.18/3.56")
- Category stats: R, H, 2B, 3B, HR, RBI, SB, BB, HBP, K, TB, AVG, SLG

It outputs JSON-ready records with parsed metadata and a computed
`overall_score` based on weighted z-scores.
"""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Any, Mapping, Sequence

import numpy as np
import pandas as pd

from hitter_category_ranker import CATEGORIES, WEIGHTS, calculate_z_scores

TEAM_POSITION_PATTERN = re.compile(r"^(?P<team>[A-Z]{2,4})\s*-\s*(?P<position>[A-Za-z0-9,/]+)\b")
H_AB_PATTERN = re.compile(
    r"^(?P<h>[+-]?(?:\d+(?:\.\d+)?|\.\d+))/(?P<ab>[+-]?(?:\d+(?:\.\d+)?|\.\d+))$"
)
NUMBER_PATTERN = re.compile(r"^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$")

NOTE_MARKERS = (
    "No new player Notes",
    "No new Player Notes",
    "New Player Note",
    "Player Note",
    "No new player Note",
)

NON_NAME_VALUES = frozenset(
    {
        "FA",
        "DTD",
        "IR",
        "IL",
        "OUT",
        "O",
        "Q",
        "NA",
        "Rankings",
        "Trends",
        "Batters",
    }
)

# Small inline demo snippet in the same shape as a typical user copy/paste.
DEMO_RAW_TEXT = """
Aaron Judge
Aaron JudgePlayer Note
NYY - OF
FA
1.0
1
1
100%
1.18/3.56
0.90
1.18
0.20
0.01
0.35
0.75
0.08
0.82
0.05
1.05
2.45
.331
.688
Shohei Ohtani (Batter)
Shohei Ohtani (Batter)Player Note
LAD - Util
FA
1.0
2
2
100%
1.09/3.87
0.92
1.09
0.16
0.06
0.35
0.65
0.13
0.69
0.02
1.18
2.41
.282
.622
"""


def _normalize_lines(raw_text: str) -> list[str]:
    """Return stripped, non-empty lines from raw copy/paste text."""
    normalized = raw_text.replace("\ufeff", "")
    return [line.strip() for line in normalized.splitlines() if line.strip()]


def _clean_name(raw_name: str) -> str:
    """Remove note/status fragments from a player-name candidate."""
    cleaned = raw_name
    for marker in NOTE_MARKERS:
        cleaned = cleaned.replace(marker, "")
    cleaned = cleaned.replace("DTD", "")
    return re.sub(r"\s{2,}", " ", cleaned).strip()


def _looks_like_name(candidate: str) -> bool:
    """Check whether a token is likely to be a player name."""
    if not candidate:
        return False
    if candidate in NON_NAME_VALUES:
        return False
    if TEAM_POSITION_PATTERN.match(candidate):
        return False
    if H_AB_PATTERN.match(candidate):
        return False
    if NUMBER_PATTERN.match(candidate):
        return False
    if candidate.endswith("%"):
        return False
    return bool(re.search(r"[A-Za-z]", candidate))


def _extract_player_name(lines: Sequence[str], team_line_index: int) -> str:
    """Find the nearest valid player name before a team-position line."""
    for offset in (2, 1, 3, 4):
        idx = team_line_index - offset
        if idx < 0:
            continue
        candidate = _clean_name(lines[idx])
        if _looks_like_name(candidate):
            return candidate
    return "Unknown Player"


def _find_h_ab_index(lines: Sequence[str], start_index: int) -> int | None:
    """Find the line index containing H/AB after a player header."""
    max_scan = min(len(lines), start_index + 25)
    for idx in range(start_index, max_scan):
        value = lines[idx]
        if TEAM_POSITION_PATTERN.match(value):
            return None
        if H_AB_PATTERN.match(value):
            return idx
    return None


def _collect_category_values(lines: Sequence[str], start_index: int) -> list[float]:
    """Collect numeric category values following the H/AB token."""
    values: list[float] = []
    idx = start_index
    while idx < len(lines) and len(values) < len(CATEGORIES):
        token = lines[idx]
        if TEAM_POSITION_PATTERN.match(token):
            break
        if NUMBER_PATTERN.match(token):
            values.append(float(token))
        idx += 1
    return values


def parse_yahoo_hitter_copy_paste(raw_text: str) -> list[dict[str, Any]]:
    """Parse Yahoo-style copy/paste text into hitter records.

    Returns:
        List of dictionaries containing:
        - name
        - team
        - position
        - category stats defined in CATEGORIES

    Notes:
        Most copied categories are per-game values in this view. AVG and SLG are
        already seasonal rate stats. Since z-score normalization is scale-invariant,
        scoring remains valid as long as all players are on the same basis.
    """
    lines = _normalize_lines(raw_text)
    parsed_records: list[dict[str, Any]] = []

    for idx, line in enumerate(lines):
        match = TEAM_POSITION_PATTERN.match(line)
        if not match:
            continue

        h_ab_idx = _find_h_ab_index(lines, idx + 1)
        if h_ab_idx is None:
            continue

        if H_AB_PATTERN.match(lines[h_ab_idx]) is None:
            continue

        category_values = _collect_category_values(lines, h_ab_idx + 1)
        if len(category_values) < len(CATEGORIES):
            category_values.extend([np.nan] * (len(CATEGORIES) - len(category_values)))

        record: dict[str, Any] = {
            "name": _extract_player_name(lines, idx),
            "team": match.group("team"),
            "position": match.group("position"),
        }

        for category, value in zip(CATEGORIES, category_values):
            record[category] = float(value) if pd.notna(value) else np.nan

        parsed_records.append(record)

    return parsed_records


def _resolve_weights(weights: Mapping[str, float] | None) -> dict[str, float]:
    """Resolve category weights with defaults for missing categories."""
    resolved = {category: float(WEIGHTS.get(category, 1.0)) for category in CATEGORIES}
    if weights:
        for category, value in weights.items():
            if category in resolved:
                resolved[category] = float(value)
    return resolved


def _scale_scores_to_100(raw_scores: pd.Series) -> pd.Series:
    """Scale raw scores to a 0-100 range using min-max normalization."""
    min_score = raw_scores.min(skipna=True)
    max_score = raw_scores.max(skipna=True)

    if pd.isna(min_score) or pd.isna(max_score):
        return pd.Series(50.0, index=raw_scores.index)

    if np.isclose(max_score, min_score):
        return pd.Series(50.0, index=raw_scores.index)

    return ((raw_scores - min_score) / (max_score - min_score)) * 100.0


def add_overall_scores(
    records: Sequence[Mapping[str, Any]],
    weights: Mapping[str, float] | None = None,
    include_z_scores: bool = False,
) -> list[dict[str, Any]]:
    """Compute weighted z-score totals, scale to 0-100, and return ranked records."""
    if not records:
        return []

    df = pd.DataFrame(records).copy()
    for category in CATEGORIES:
        if category not in df.columns:
            df[category] = np.nan
        df[category] = pd.to_numeric(df[category], errors="coerce")

    score_frame = df[["name", *CATEGORIES]].copy()
    z_scores = calculate_z_scores(score_frame, categories=CATEGORIES)

    resolved_weights = _resolve_weights(weights)
    weighted_total = pd.Series(0.0, index=df.index)
    for category in CATEGORIES:
        weighted_total += z_scores[f"z_{category}"] * resolved_weights[category]

    scaled_scores = _scale_scores_to_100(weighted_total)

    scored = df.copy()
    scored["z_score_total"] = weighted_total
    scored["overall_score"] = scaled_scores.round(2)

    if include_z_scores:
        scored = pd.concat([scored, z_scores], axis=1)

    scored = scored.sort_values("overall_score", ascending=False, kind="mergesort").reset_index(drop=True)
    return scored.to_dict(orient="records")


def parse_text_to_scored_records(
    raw_text: str,
    weights: Mapping[str, float] | None = None,
    include_z_scores: bool = False,
) -> list[dict[str, Any]]:
    """Parse copy/paste text and return scored player records."""
    records = parse_yahoo_hitter_copy_paste(raw_text)
    return add_overall_scores(records, weights=weights, include_z_scores=include_z_scores)


def _player_identity_key(record: Mapping[str, Any]) -> tuple[str, str, str]:
    """Build a stable dedupe key for a player record."""
    name = str(record.get("name", "")).strip().lower()
    team = str(record.get("team", "")).strip().upper()
    position = str(record.get("position", "")).strip().upper()
    return (name, team, position)


def _sanitize_record_for_database(record: Mapping[str, Any]) -> dict[str, Any]:
    """Keep only canonical database fields and coerce stat values to float/NaN."""
    raw_name = str(record.get("name", "Unknown Player")).replace("\ufeff", "")
    cleaned: dict[str, Any] = {
        "name": raw_name.strip(),
        "team": str(record.get("team", "NA")).strip().upper(),
        "position": str(record.get("position", "NA")).strip().upper(),
    }

    for category in CATEGORIES:
        value = pd.to_numeric(record.get(category), errors="coerce")
        cleaned[category] = float(value) if pd.notna(value) else np.nan

    return cleaned


def load_records_json(json_path: str | Path) -> list[dict[str, Any]]:
    """Load a JSON array of player records, returning [] if file does not exist."""
    path = Path(json_path)
    if not path.exists():
        return []

    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, list):
        return []

    records: list[dict[str, Any]] = []
    for item in payload:
        if isinstance(item, dict):
            records.append(_sanitize_record_for_database(item))
    return records


def merge_player_records(
    existing_records: Sequence[Mapping[str, Any]],
    incoming_records: Sequence[Mapping[str, Any]],
) -> list[dict[str, Any]]:
    """Merge records by (name, team, position), where incoming rows overwrite existing."""
    merged: dict[tuple[str, str, str], dict[str, Any]] = {}

    for record in existing_records:
        cleaned = _sanitize_record_for_database(record)
        merged[_player_identity_key(cleaned)] = cleaned

    for record in incoming_records:
        cleaned = _sanitize_record_for_database(record)
        merged[_player_identity_key(cleaned)] = cleaned

    return list(merged.values())


def write_records_json(records: Sequence[Mapping[str, Any]], output_path: str | Path) -> None:
    """Write scored player records to JSON."""
    json_ready: list[dict[str, Any]] = []
    for record in records:
        cleaned_record: dict[str, Any] = {}
        for key, value in record.items():
            if isinstance(value, (float, np.floating)) and np.isnan(value):
                cleaned_record[key] = None
            elif isinstance(value, np.floating):
                cleaned_record[key] = float(value)
            elif isinstance(value, np.integer):
                cleaned_record[key] = int(value)
            else:
                cleaned_record[key] = value
        json_ready.append(cleaned_record)

    path = Path(output_path)
    path.write_text(json.dumps(json_ready, indent=2, ensure_ascii=False), encoding="utf-8")


def write_rankings_txt(records: Sequence[Mapping[str, Any]], output_path: str | Path) -> None:
    """Write descending rankings as plain text."""
    lines = ["Rank | Name | Position | Team | Overall Score (0-100)"]
    for idx, record in enumerate(records, start=1):
        name = str(record.get("name", "Unknown Player"))
        position = str(record.get("position", "NA"))
        team = str(record.get("team", "NA"))
        score = record.get("overall_score")
        if isinstance(score, (int, float, np.integer, np.floating)):
            score_text = f"{float(score):.2f}"
        else:
            score_text = "NA"
        lines.append(f"{idx:>2}. {name} | {position} | {team} | {score_text}")

    path = Path(output_path)
    path.write_text("\n".join(lines), encoding="utf-8")


def _build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Parse Yahoo hitter copy/paste text and export scored JSON records."
    )
    parser.add_argument(
        "--input",
        type=str,
        default=None,
        help="Path to a text file containing copied player rows. If omitted, uses inline demo text.",
    )
    parser.add_argument(
        "--output",
        type=str,
        default="players_scored.json",
        help="Output JSON file path.",
    )
    parser.add_argument(
        "--include-z-scores",
        action="store_true",
        help="Include per-category z-score columns in the output JSON.",
    )
    parser.add_argument(
        "--output-txt",
        type=str,
        default="players_ranked.txt",
        help="Output ranking TXT path (name, position, team, overall score).",
    )
    parser.add_argument(
        "--db",
        type=str,
        default="players_database.json",
        help="Master database JSON path used with --update-db.",
    )
    parser.add_argument(
        "--update-db",
        action="store_true",
        help="Merge parsed input players into master database, then score from the full database.",
    )
    parser.add_argument(
        "--interactive",
        action="store_true",
        help="Interactive mode: paste player rows directly in terminal and optionally add more batches.",
    )
    return parser


def _read_paste_block_from_stdin(end_marker: str = "END") -> str:
    """Read a multi-line paste block from stdin until end_marker is entered."""
    print(f"Paste player rows now. Enter '{end_marker}' on a new line when finished.")
    lines: list[str] = []
    while True:
        try:
            line = input()
        except EOFError:
            break
        if line.strip().upper() == end_marker.upper():
            break
        lines.append(line)
    return "\n".join(lines).strip()


def _run_scoring_pipeline(
    source_records: Sequence[Mapping[str, Any]],
    include_z_scores: bool,
    output_json_path: str | Path,
    output_txt_path: str | Path,
) -> list[dict[str, Any]]:
    """Score source records and write JSON/TXT ranking outputs."""
    scored_records = add_overall_scores(
        records=source_records,
        weights=WEIGHTS,
        include_z_scores=include_z_scores,
    )
    write_records_json(scored_records, output_json_path)
    write_rankings_txt(scored_records, output_txt_path)
    print(f"Wrote {len(scored_records)} scored player records to {output_json_path}")
    print(f"Wrote ranking text file to {output_txt_path}")
    return scored_records


def _run_interactive_mode(args: argparse.Namespace) -> None:
    """Run interactive terminal workflow for repeated paste-and-merge operations."""
    database_records = load_records_json(args.db)
    if database_records:
        print(f"Loaded existing database: {args.db} ({len(database_records)} players)")
    else:
        print(f"Starting new database: {args.db}")

    while True:
        raw_text = _read_paste_block_from_stdin(end_marker="END")
        if not raw_text:
            print("No paste content received.")
        else:
            parsed_records = parse_yahoo_hitter_copy_paste(raw_text)
            print(f"Parsed {len(parsed_records)} player rows from pasted block.")

            if parsed_records:
                database_records = merge_player_records(database_records, parsed_records)
                write_records_json(database_records, args.db)
                print(f"Database updated: {args.db} ({len(database_records)} unique players)")

                _run_scoring_pipeline(
                    source_records=database_records,
                    include_z_scores=args.include_z_scores,
                    output_json_path=args.output,
                    output_txt_path=args.output_txt,
                )

        answer = input("Add another pasted block? [y/N]: ").strip().lower()
        if answer not in {"y", "yes"}:
            break


def main() -> None:
    """CLI entry point."""
    parser = _build_arg_parser()
    args = parser.parse_args()

    if args.interactive or not args.input:
        _run_interactive_mode(args)
        return

    raw_text = Path(args.input).read_text(encoding="utf-8")

    parsed_records = parse_yahoo_hitter_copy_paste(raw_text)

    source_records: list[dict[str, Any]]
    if args.update_db:
        existing_records = load_records_json(args.db)
        source_records = merge_player_records(existing_records, parsed_records)
        write_records_json(source_records, args.db)
    else:
        source_records = parsed_records

    _run_scoring_pipeline(
        source_records=source_records,
        include_z_scores=args.include_z_scores,
        output_json_path=args.output,
        output_txt_path=args.output_txt,
    )
    if args.update_db:
        print(f"Database updated: {args.db} ({len(source_records)} unique players)")


if __name__ == "__main__":
    main()
