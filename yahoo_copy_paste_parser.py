"""Parse Yahoo-style fantasy baseball copy/paste text into scored player records.

Supports three modes:
- batters
- pitchers
- combined (batters + pitchers in one scoring pool)
"""

from __future__ import annotations

import argparse
import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Mapping, Sequence

import numpy as np
import pandas as pd

from hitter_category_ranker import (
    BATTER_CATEGORIES,
    BATTER_NEGATIVE_CATEGORIES,
    COMBINED_CATEGORIES,
    COMBINED_PITCHER_CATEGORIES,
    COMBINED_NEGATIVE_CATEGORIES,
    PITCHER_CATEGORIES,
    PITCHER_NEGATIVE_CATEGORIES,
    PITCHER_PREFIX,
    calculate_z_scores,
    default_weights_for_categories,
)

TEAM_POSITION_PATTERN = re.compile(r"^(?P<team>[A-Z]{2,4})\s*-\s*(?P<position>[A-Za-z0-9,/]+)\b")
NUMBER_PATTERN = re.compile(r"^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$")
PERCENT_PATTERN = re.compile(r"^[+-]?(?:\d+(?:\.\d+)?|\.\d+)%$")

NOTE_MARKERS = (
    "No new player Notes",
    "No new Player Notes",
    "New Player Note",
    "Player Note",
    "No new player Note",
    "Video Forecast",
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
        "Pitchers",
    }
)

ALL_BASE_CATEGORIES: tuple[str, ...] = tuple(dict.fromkeys((*BATTER_CATEGORIES, *PITCHER_CATEGORIES)))
PLAYER_TYPES = ("batter", "pitcher")


@dataclass(frozen=True)
class CombinedRankingConfig:
    """Settings for cross-pool combined ranking normalization.

    Why this exists:
    Batters and pitchers occupy different roster volumes in a mixed league.
    Replacement-level adjustment puts both player types on a comparable value
    baseline before deriving one shared ranking score.
    """

    teams: int = 12
    hitters_per_team: int = 14
    pitchers_per_team: int = 9
    pitcher_weight: float = 1.0
    use_percentile: bool = False


DEFAULT_COMBINED_RANKING_CONFIG = CombinedRankingConfig()


def _categories_for_mode(mode: str) -> tuple[str, ...]:
    normalized_mode = str(mode or "batters").strip().lower()
    if normalized_mode == "pitchers":
        return PITCHER_CATEGORIES
    if normalized_mode == "combined":
        return COMBINED_CATEGORIES
    return BATTER_CATEGORIES


def _negative_categories_for_mode(mode: str) -> frozenset[str]:
    normalized_mode = str(mode or "batters").strip().lower()
    if normalized_mode == "pitchers":
        return PITCHER_NEGATIVE_CATEGORIES
    if normalized_mode == "combined":
        return COMBINED_NEGATIVE_CATEGORIES
    return BATTER_NEGATIVE_CATEGORIES


def _normalize_mode(mode: str) -> str:
    normalized_mode = str(mode or "batters").strip().lower()
    if normalized_mode in {"batters", "pitchers", "combined"}:
        return normalized_mode
    return "batters"


def infer_player_type(position: str | None) -> str:
    """Infer whether a row is batter/pitcher from Yahoo position text."""
    position_tokens = (
        str(position or "")
        .upper()
        .replace(" ", "")
        .split(",")
    )
    expanded_tokens: list[str] = []
    for token in position_tokens:
        expanded_tokens.extend(part for part in token.split("/") if part)

    if any(token in {"SP", "RP", "P"} for token in expanded_tokens):
        return "pitcher"
    return "batter"


def _normalize_lines(raw_text: str) -> list[str]:
    normalized = raw_text.replace("\ufeff", "")
    return [line.strip() for line in normalized.splitlines() if line.strip()]


def _clean_name(raw_name: str) -> str:
    cleaned = raw_name
    for marker in NOTE_MARKERS:
        cleaned = cleaned.replace(marker, "")
    cleaned = cleaned.replace("DTD", "")
    cleaned = cleaned.replace("IR", "")
    return re.sub(r"\s{2,}", " ", cleaned).strip()


def _looks_like_name(candidate: str) -> bool:
    if not candidate:
        return False
    if candidate in NON_NAME_VALUES:
        return False
    if TEAM_POSITION_PATTERN.match(candidate):
        return False
    if NUMBER_PATTERN.match(candidate):
        return False
    if PERCENT_PATTERN.match(candidate):
        return False
    return bool(re.search(r"[A-Za-z]", candidate))


def _extract_player_name(lines: Sequence[str], team_line_index: int) -> str:
    for offset in (2, 1, 3, 4):
        idx = team_line_index - offset
        if idx < 0:
            continue
        candidate = _clean_name(lines[idx])
        if _looks_like_name(candidate):
            return candidate
    return "Unknown Player"


def _find_next_team_line_index(lines: Sequence[str], start_index: int) -> int:
    for idx in range(start_index, len(lines)):
        if TEAM_POSITION_PATTERN.match(lines[idx]):
            return idx
    return len(lines)


def _extract_numeric_values_in_player_block(
    lines: Sequence[str],
    block_start_index: int,
    block_end_index: int,
) -> list[float]:
    player_tokens = list(lines[block_start_index:block_end_index])

    percent_idx = None
    for idx, token in enumerate(player_tokens):
        if PERCENT_PATTERN.match(token):
            percent_idx = idx
            break

    scan_tokens = player_tokens[percent_idx + 1 :] if percent_idx is not None else player_tokens
    numeric_values = [float(token) for token in scan_tokens if NUMBER_PATTERN.match(token)]
    return numeric_values


def _map_values_to_categories(values: Sequence[float], categories: Sequence[str]) -> dict[str, float]:
    expected = len(categories)
    mapped_values = list(values)

    if len(mapped_values) > expected:
        mapped_values = mapped_values[-expected:]
    if len(mapped_values) < expected:
        mapped_values.extend([np.nan] * (expected - len(mapped_values)))

    return {
        category: float(value) if pd.notna(value) else np.nan
        for category, value in zip(categories, mapped_values)
    }


def parse_yahoo_copy_paste(
    raw_text: str,
    mode: str = "batters",
) -> list[dict[str, Any]]:
    """Parse Yahoo copy/paste text into typed batter/pitcher records."""
    normalized_mode = _normalize_mode(mode)
    lines = _normalize_lines(raw_text)
    parsed_records: list[dict[str, Any]] = []

    for idx, line in enumerate(lines):
        match = TEAM_POSITION_PATTERN.match(line)
        if not match:
            continue

        row_end_index = _find_next_team_line_index(lines, idx + 1)
        numeric_values = _extract_numeric_values_in_player_block(lines, idx + 1, row_end_index)

        position = match.group("position")
        detected_type = infer_player_type(position)

        if normalized_mode == "batters" and detected_type != "batter":
            continue
        if normalized_mode == "pitchers" and detected_type != "pitcher":
            continue

        row_categories = BATTER_CATEGORIES if detected_type == "batter" else PITCHER_CATEGORIES
        stat_map = _map_values_to_categories(numeric_values, row_categories)

        record: dict[str, Any] = {
            "name": _extract_player_name(lines, idx),
            "team": match.group("team"),
            "position": position,
            "player_type": detected_type,
            **stat_map,
        }
        parsed_records.append(record)

    return parsed_records


def _player_identity_key(record: Mapping[str, Any]) -> tuple[str, str, str, str]:
    name = str(record.get("name", "")).strip().lower()
    team = str(record.get("team", "")).strip().upper()
    position = str(record.get("position", "")).strip().upper()
    player_type = str(record.get("player_type", "")).strip().lower()
    if player_type not in PLAYER_TYPES:
        player_type = infer_player_type(position)
    return (name, team, position, player_type)


def _sanitize_record_for_database(record: Mapping[str, Any]) -> dict[str, Any]:
    raw_name = str(record.get("name", "Unknown Player")).replace("\ufeff", "")
    position = str(record.get("position", "NA")).strip().upper()
    player_type = str(record.get("player_type", "")).strip().lower()
    if player_type not in PLAYER_TYPES:
        player_type = infer_player_type(position)

    cleaned: dict[str, Any] = {
        "name": raw_name.strip(),
        "team": str(record.get("team", "NA")).strip().upper(),
        "position": position,
        "player_type": player_type,
    }

    for category in ALL_BASE_CATEGORIES:
        value = pd.to_numeric(record.get(category), errors="coerce")
        cleaned[category] = float(value) if pd.notna(value) else np.nan

    return cleaned


def load_records_json(json_path: str | Path) -> list[dict[str, Any]]:
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
    merged: dict[tuple[str, str, str, str], dict[str, Any]] = {}

    for record in existing_records:
        cleaned = _sanitize_record_for_database(record)
        merged[_player_identity_key(cleaned)] = cleaned

    for record in incoming_records:
        cleaned = _sanitize_record_for_database(record)
        merged[_player_identity_key(cleaned)] = cleaned

    return list(merged.values())


def write_records_json(records: Sequence[Mapping[str, Any]], output_path: str | Path) -> None:
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


def _scale_scores_to_100(raw_scores: pd.Series) -> pd.Series:
    min_score = raw_scores.min(skipna=True)
    max_score = raw_scores.max(skipna=True)

    if pd.isna(min_score) or pd.isna(max_score):
        return pd.Series(50.0, index=raw_scores.index)

    if np.isclose(max_score, min_score):
        return pd.Series(50.0, index=raw_scores.index)

    return ((raw_scores - min_score) / (max_score - min_score)) * 100.0


def _replacement_cutoffs(config: CombinedRankingConfig) -> dict[str, int]:
    return {
        "batter": max(int(config.teams * config.hitters_per_team), 1),
        "pitcher": max(int(config.teams * config.pitchers_per_team), 1),
    }


def _replacement_score_for_type(
    records_df: pd.DataFrame,
    player_type: str,
    score_column: str,
    cutoff_rank: int,
) -> float:
    subset = records_df.loc[records_df["player_type"] == player_type, [score_column]].copy()
    if subset.empty:
        return 0.0

    ordered = subset.sort_values(score_column, ascending=False, kind="mergesort").reset_index(drop=True)
    cutoff_index = min(max(cutoff_rank - 1, 0), len(ordered) - 1)
    value = pd.to_numeric(ordered.at[cutoff_index, score_column], errors="coerce")
    return float(value) if pd.notna(value) else 0.0


def _percentile_scores_desc(values: pd.Series) -> pd.Series:
    total = len(values)
    if total <= 1:
        return pd.Series(50.0, index=values.index)

    ranks = values.rank(method="average", ascending=False)
    return ((total - ranks) / (total - 1)) * 100.0


def _apply_combined_adjustments(
    scored_df: pd.DataFrame,
    config: CombinedRankingConfig,
) -> pd.DataFrame:
    adjusted = scored_df.copy()
    adjusted["player_type"] = (
        adjusted.get("player_type", "batter")
        .fillna("batter")
        .astype(str)
        .str.lower()
    )

    cutoffs = _replacement_cutoffs(config)
    replacement_by_type = {
        player_type: _replacement_score_for_type(
            records_df=adjusted,
            player_type=player_type,
            score_column="z_score_total",
            cutoff_rank=cutoffs[player_type],
        )
        for player_type in PLAYER_TYPES
    }

    adjusted["replacement_z"] = adjusted["player_type"].map(replacement_by_type).fillna(0.0)
    adjusted["value_over_replacement"] = adjusted["z_score_total"] - adjusted["replacement_z"]

    if not np.isclose(config.pitcher_weight, 1.0):
        pitcher_mask = adjusted["player_type"] == "pitcher"
        adjusted.loc[pitcher_mask, "value_over_replacement"] = (
            adjusted.loc[pitcher_mask, "value_over_replacement"] * float(config.pitcher_weight)
        )

    if config.use_percentile:
        adjusted["overall_z"] = _percentile_scores_desc(adjusted["value_over_replacement"])
        return adjusted

    mean = adjusted["value_over_replacement"].mean(skipna=True)
    std = adjusted["value_over_replacement"].std(skipna=True, ddof=0)
    if pd.isna(std) or np.isclose(std, 0.0):
        adjusted["overall_z"] = 0.0
        return adjusted

    adjusted["overall_z"] = (adjusted["value_over_replacement"] - mean) / std
    return adjusted


def _resolve_weights(
    categories: Sequence[str],
    weights: Mapping[str, float] | None = None,
) -> dict[str, float]:
    resolved = default_weights_for_categories(categories)
    if not weights:
        return resolved
    for category, value in weights.items():
        if category in resolved:
            resolved[category] = float(value)
    return resolved


def _records_for_mode(
    records: Sequence[Mapping[str, Any]],
    mode: str,
) -> list[dict[str, Any]]:
    normalized_mode = _normalize_mode(mode)
    if normalized_mode == "combined":
        return [_sanitize_record_for_database(record) for record in records]

    wanted_type = "pitcher" if normalized_mode == "pitchers" else "batter"
    filtered = []
    for record in records:
        cleaned = _sanitize_record_for_database(record)
        if cleaned.get("player_type") == wanted_type:
            filtered.append(cleaned)
    return filtered


def _prepare_records_for_scoring(
    records: Sequence[Mapping[str, Any]],
    mode: str,
) -> list[dict[str, Any]]:
    normalized_mode = _normalize_mode(mode)
    prepared: list[dict[str, Any]] = []

    for raw_record in records:
        record = _sanitize_record_for_database(raw_record)
        if normalized_mode != "combined":
            prepared.append(record)
            continue

        expanded = dict(record)
        if record.get("player_type") == "pitcher":
            for category in BATTER_CATEGORIES:
                expanded[category] = np.nan
            for category in PITCHER_CATEGORIES:
                expanded[f"{PITCHER_PREFIX}{category}"] = record.get(category, np.nan)
        else:
            for category in COMBINED_PITCHER_CATEGORIES:
                expanded[category] = np.nan
        prepared.append(expanded)

    return prepared


def _position_tokens(position: Any) -> list[str]:
    tokens = (
        str(position or "")
        .upper()
        .split(",")
    )
    expanded: list[str] = []
    for token in tokens:
        expanded.extend(part.strip() for part in token.split("/") if part.strip())
    return expanded


def _mode_pitcher_category_key(base_category: str, mode: str) -> str:
    normalized_mode = _normalize_mode(mode)
    if normalized_mode == "combined":
        return f"{PITCHER_PREFIX}{base_category}"
    return base_category


def add_overall_scores(
    records: Sequence[Mapping[str, Any]],
    mode: str = "batters",
    weights: Mapping[str, float] | None = None,
    include_z_scores: bool = False,
    combined_config: CombinedRankingConfig | None = None,
) -> list[dict[str, Any]]:
    if not records:
        return []

    normalized_mode = _normalize_mode(mode)
    categories = _categories_for_mode(normalized_mode)
    negative_categories = _negative_categories_for_mode(normalized_mode)
    scoring_records = _prepare_records_for_scoring(records, normalized_mode)

    df = pd.DataFrame(scoring_records).copy()
    if "player_type" not in df.columns:
        position_series = df["position"] if "position" in df.columns else pd.Series("", index=df.index)
        df["player_type"] = position_series.map(infer_player_type)
    df["player_type"] = (
        df["player_type"]
        .fillna("batter")
        .astype(str)
        .str.lower()
    )

    # Safety filter: mode-specific pools should never mix player types.
    if normalized_mode == "batters":
        df = df.loc[df["player_type"] == "batter"].reset_index(drop=True)
    elif normalized_mode == "pitchers":
        df = df.loc[df["player_type"] == "pitcher"].reset_index(drop=True)

    # In combined mode, isolate category pools by player type.
    if normalized_mode == "combined":
        pitcher_mask = df["player_type"] == "pitcher"
        for category in BATTER_CATEGORIES:
            if category not in df.columns:
                df[category] = np.nan
            df.loc[pitcher_mask, category] = np.nan
        for category in COMBINED_PITCHER_CATEGORIES:
            if category not in df.columns:
                df[category] = np.nan
            df.loc[~pitcher_mask, category] = np.nan

    for category in categories:
        if category not in df.columns:
            df[category] = np.nan
        df[category] = pd.to_numeric(df[category], errors="coerce")

    score_frame = df[["name", *categories]].copy()
    z_scores = calculate_z_scores(
        score_frame,
        categories=categories,
        negative_categories=negative_categories,
    )

    player_type_series = (
        df.get("player_type", pd.Series("batter", index=df.index))
        .fillna("batter")
        .astype(str)
        .str.lower()
    )
    position_series = df.get("position", pd.Series("", index=df.index))
    is_pitcher = player_type_series == "pitcher"
    is_starting_pitcher = position_series.map(_position_tokens).map(lambda tokens: "SP" in tokens) & is_pitcher

    ip_category = _mode_pitcher_category_key("IP", normalized_mode)
    sv_category = _mode_pitcher_category_key("SV", normalized_mode)
    hld_category = _mode_pitcher_category_key("HLD", normalized_mode)

    ip_col = f"z_{ip_category}"
    sv_col = f"z_{sv_category}"
    hld_col = f"z_{hld_category}"

    if ip_col in z_scores.columns:
        z_scores.loc[is_pitcher, ip_col] = 0.0
    if sv_col in z_scores.columns:
        z_scores.loc[is_starting_pitcher, sv_col] = 0.0
    if hld_col in z_scores.columns:
        z_scores.loc[is_starting_pitcher, hld_col] = 0.0

    resolved_weights = _resolve_weights(categories=categories, weights=weights)
    weighted_total = pd.Series(0.0, index=df.index)
    for category in categories:
        weighted_total += z_scores[f"z_{category}"] * resolved_weights[category]

    scored = df.copy()
    scored["z_score_total"] = weighted_total

    ranking_metric = scored["z_score_total"]
    if normalized_mode == "combined":
        active_combined_config = combined_config or DEFAULT_COMBINED_RANKING_CONFIG
        scored = _apply_combined_adjustments(scored, config=active_combined_config)
        ranking_metric = scored["overall_z"]

    scaled_scores = _scale_scores_to_100(ranking_metric)
    scored["overall_score"] = scaled_scores.round(2)

    if include_z_scores:
        scored = pd.concat([scored, z_scores], axis=1)

    scored = scored.sort_values("overall_score", ascending=False, kind="mergesort").reset_index(drop=True)
    return scored.to_dict(orient="records")


def build_category_leaderboards(
    records: Sequence[Mapping[str, Any]],
    mode: str,
    top_n: int = 10,
) -> dict[str, list[dict[str, Any]]]:
    if not records:
        return {}

    categories = _categories_for_mode(mode)
    negative_categories = _negative_categories_for_mode(mode)
    df = pd.DataFrame(records).copy()
    leaders: dict[str, list[dict[str, Any]]] = {}

    for category in categories:
        if category not in df.columns:
            continue
        working = df.copy()
        working[category] = pd.to_numeric(working[category], errors="coerce")
        working = working.dropna(subset=[category])
        if working.empty:
            continue

        ascending = category in negative_categories
        top_rows = working.sort_values(category, ascending=ascending, kind="mergesort").head(top_n)
        leaders[category] = [
            {
                "name": str(row.get("name", "Unknown Player")),
                "team": str(row.get("team", "NA")),
                "position": str(row.get("position", "NA")),
                "value": float(row.get(category)),
            }
            for _, row in top_rows.iterrows()
        ]

    return leaders


def write_rankings_txt(records: Sequence[Mapping[str, Any]], output_path: str | Path) -> None:
    lines = ["Rank | Name | Position | Team | Type | Overall Score (0-100)"]
    for idx, record in enumerate(records, start=1):
        name = str(record.get("name", "Unknown Player"))
        position = str(record.get("position", "NA"))
        team = str(record.get("team", "NA"))
        player_type = str(record.get("player_type", "NA"))
        score = record.get("overall_score")
        if isinstance(score, (int, float, np.integer, np.floating)):
            score_text = f"{float(score):.2f}"
        else:
            score_text = "NA"
        lines.append(f"{idx:>2}. {name} | {position} | {team} | {player_type} | {score_text}")

    path = Path(output_path)
    path.write_text("\n".join(lines), encoding="utf-8")


def write_category_leaders_txt(
    category_leaders: Mapping[str, Sequence[Mapping[str, Any]]],
    output_path: str | Path,
) -> None:
    lines: list[str] = []
    for category, leaders in category_leaders.items():
        lines.append(f"[{category}]")
        for idx, leader in enumerate(leaders, start=1):
            name = str(leader.get("name", "Unknown Player"))
            team = str(leader.get("team", "NA"))
            position = str(leader.get("position", "NA"))
            value = leader.get("value")
            value_text = f"{float(value):.3f}" if isinstance(value, (int, float, np.integer, np.floating)) else "NA"
            lines.append(f"{idx:>2}. {name} | {team} | {position} | {value_text}")
        lines.append("")

    path = Path(output_path)
    path.write_text("\n".join(lines).strip() + "\n", encoding="utf-8")


def _read_paste_block_from_stdin(end_marker: str = "END") -> str:
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
    mode: str,
    include_z_scores: bool,
    output_json_path: str | Path,
    output_txt_path: str | Path,
    output_leaders_path: str | Path,
) -> list[dict[str, Any]]:
    scored_records = add_overall_scores(
        records=source_records,
        mode=mode,
        include_z_scores=include_z_scores,
    )
    write_records_json(scored_records, output_json_path)
    write_rankings_txt(scored_records, output_txt_path)

    leaders = build_category_leaderboards(scored_records, mode=mode, top_n=10)
    write_category_leaders_txt(leaders, output_leaders_path)

    print(f"Wrote {len(scored_records)} scored player records to {output_json_path}")
    print(f"Wrote ranking text file to {output_txt_path}")
    print(f"Wrote category leaderboards to {output_leaders_path}")
    return scored_records


def _run_interactive_mode(args: argparse.Namespace) -> None:
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
            parsed_records = parse_yahoo_copy_paste(raw_text, mode=args.mode)
            print(f"Parsed {len(parsed_records)} player rows from pasted block.")

            if parsed_records:
                database_records = merge_player_records(database_records, parsed_records)
                write_records_json(database_records, args.db)
                print(f"Database updated: {args.db} ({len(database_records)} unique players)")

                mode_records = _records_for_mode(database_records, mode=args.mode)
                _run_scoring_pipeline(
                    source_records=mode_records,
                    mode=args.mode,
                    include_z_scores=args.include_z_scores,
                    output_json_path=args.output,
                    output_txt_path=args.output_txt,
                    output_leaders_path=args.output_leaders,
                )

        answer = input("Add another pasted block? [y/N]: ").strip().lower()
        if answer not in {"y", "yes"}:
            break


def _build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Parse Yahoo copy/paste text (batters/pitchers) and export scored rankings."
    )
    parser.add_argument(
        "--input",
        type=str,
        default=None,
        help="Path to a text file containing copied player rows. If omitted, uses interactive paste mode.",
    )
    parser.add_argument(
        "--mode",
        type=str,
        choices=("batters", "pitchers", "combined"),
        default="batters",
        help="Scoring mode: batters, pitchers, or combined.",
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
        help="Output ranking TXT path.",
    )
    parser.add_argument(
        "--output-leaders",
        type=str,
        default="category_leaders.txt",
        help="Output category leaderboard TXT path.",
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
        help="Merge parsed input players into master database, then score from the selected mode pool.",
    )
    parser.add_argument(
        "--interactive",
        action="store_true",
        help="Interactive mode: paste player rows in terminal and optionally add more batches.",
    )
    return parser


def main() -> None:
    parser = _build_arg_parser()
    args = parser.parse_args()

    if args.interactive or not args.input:
        _run_interactive_mode(args)
        return

    raw_text = Path(args.input).read_text(encoding="utf-8")
    parsed_records = parse_yahoo_copy_paste(raw_text, mode=args.mode)

    if args.update_db:
        existing_records = load_records_json(args.db)
        merged_records = merge_player_records(existing_records, parsed_records)
        write_records_json(merged_records, args.db)
        source_records = _records_for_mode(merged_records, mode=args.mode)
    else:
        source_records = _records_for_mode(parsed_records, mode=args.mode)

    _run_scoring_pipeline(
        source_records=source_records,
        mode=args.mode,
        include_z_scores=args.include_z_scores,
        output_json_path=args.output,
        output_txt_path=args.output_txt,
        output_leaders_path=args.output_leaders,
    )

    if args.update_db:
        print(f"Database updated: {args.db} ({len(source_records)} rows in selected mode)")


if __name__ == "__main__":
    main()
