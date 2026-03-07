"""Fantasy baseball category evaluation with weighted z-scores.

The same z-score engine is reused for:
- Batters-only pools
- Pitchers-only pools
- Combined batter + pitcher pools
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Iterable, Mapping, Sequence

import numpy as np
import pandas as pd

BATTER_CATEGORIES: tuple[str, ...] = (
    "R",
    "H",
    "2B",
    "3B",
    "HR",
    "RBI",
    "SB",
    "BB",
    "HBP",
    "K",
    "TB",
    "AVG",
    "SLG",
)

PITCHER_CATEGORIES: tuple[str, ...] = (
    "IP",
    "W",
    "L",
    "CG",
    "SHO",
    "SV",
    "BB",
    "K",
    "HLD",
    "TB",
    "ERA",
    "WHIP",
    "QS",
)

PITCHER_PREFIX = "P_"
COMBINED_PITCHER_CATEGORIES: tuple[str, ...] = tuple(
    f"{PITCHER_PREFIX}{category}" for category in PITCHER_CATEGORIES
)
COMBINED_CATEGORIES: tuple[str, ...] = (*BATTER_CATEGORIES, *COMBINED_PITCHER_CATEGORIES)

BATTER_NEGATIVE_CATEGORIES: frozenset[str] = frozenset({"K"})
PITCHER_NEGATIVE_CATEGORIES: frozenset[str] = frozenset({"L", "BB", "TB", "ERA", "WHIP"})
COMBINED_NEGATIVE_CATEGORIES: frozenset[str] = frozenset(
    {
        *BATTER_NEGATIVE_CATEGORIES,
        *(f"{PITCHER_PREFIX}{category}" for category in PITCHER_NEGATIVE_CATEGORIES),
    }
)

# Backward-compatible aliases for batter-only callers.
CATEGORIES: tuple[str, ...] = BATTER_CATEGORIES
NEGATIVE_CATEGORIES: frozenset[str] = BATTER_NEGATIVE_CATEGORIES
WEIGHTS: dict[str, float] = {category: 1.0 for category in CATEGORIES}


def default_weights_for_categories(categories: Sequence[str]) -> dict[str, float]:
    """Return equal default weights for each category in the sequence."""
    return {category: 1.0 for category in categories}


def get_mode_profile(mode: str) -> dict[str, Any]:
    """Return categories and negative categories for a supported mode."""
    normalized_mode = str(mode or "batters").strip().lower()
    if normalized_mode == "pitchers":
        return {
            "mode": "pitchers",
            "categories": PITCHER_CATEGORIES,
            "negative_categories": PITCHER_NEGATIVE_CATEGORIES,
        }
    if normalized_mode == "combined":
        return {
            "mode": "combined",
            "categories": COMBINED_CATEGORIES,
            "negative_categories": COMBINED_NEGATIVE_CATEGORIES,
        }
    return {
        "mode": "batters",
        "categories": BATTER_CATEGORIES,
        "negative_categories": BATTER_NEGATIVE_CATEGORIES,
    }


def load_players_from_json(json_path: str | Path) -> list[dict[str, Any]]:
    """Load player records from a JSON file."""
    path = Path(json_path)
    with path.open("r", encoding="utf-8") as file:
        payload = json.load(file)

    if not isinstance(payload, list):
        raise ValueError("Expected JSON payload to be a list of player records.")

    validated_records: list[dict[str, Any]] = []
    for item in payload:
        if isinstance(item, Mapping):
            validated_records.append(dict(item))

    return validated_records


def _coerce_player_dataframe(
    player_records: Sequence[Mapping[str, Any]],
    categories: Sequence[str] = BATTER_CATEGORIES,
) -> pd.DataFrame:
    """Convert player records into a clean numeric dataframe."""
    if not player_records:
        raise ValueError("No player records were provided.")

    df = pd.DataFrame(player_records).copy()

    if "name" not in df.columns:
        raise ValueError("Each player record must include a 'name' field.")

    df["name"] = df["name"].fillna("Unknown Player").astype(str)

    for category in categories:
        if category not in df.columns:
            df[category] = np.nan
        df[category] = pd.to_numeric(df[category], errors="coerce")

    return df[["name", *categories]]


def calculate_z_scores(
    stats_df: pd.DataFrame,
    categories: Sequence[str] = BATTER_CATEGORIES,
    negative_categories: Iterable[str] = BATTER_NEGATIVE_CATEGORIES,
) -> pd.DataFrame:
    """Calculate per-category z-scores for all players."""
    category_frame = stats_df.loc[:, categories].copy()

    means = category_frame.mean(axis=0, skipna=True)
    stds = category_frame.std(axis=0, skipna=True, ddof=0)

    centered = category_frame.fillna(means).sub(means, axis=1)
    safe_stds = stds.replace(0, np.nan)
    z_scores = centered.div(safe_stds, axis=1).fillna(0.0)

    for category in negative_categories:
        if category in z_scores.columns:
            z_scores[category] = -1.0 * z_scores[category]

    return z_scores.add_prefix("z_")


def _resolve_weights(
    weights: Mapping[str, float] | None,
    categories: Sequence[str] = BATTER_CATEGORIES,
) -> dict[str, float]:
    """Validate and return a complete weight map for all categories."""
    if weights is None:
        return default_weights_for_categories(categories)
    return {category: float(weights.get(category, 1.0)) for category in categories}


def score_and_rank_players(
    player_records: Sequence[Mapping[str, Any]],
    weights: Mapping[str, float] | None = None,
    categories: Sequence[str] = BATTER_CATEGORIES,
    negative_categories: Iterable[str] = BATTER_NEGATIVE_CATEGORIES,
) -> pd.DataFrame:
    """Score and rank players using weighted category z-scores."""
    df = _coerce_player_dataframe(player_records, categories=categories)
    z_scores = calculate_z_scores(
        df,
        categories=categories,
        negative_categories=negative_categories,
    )

    effective_weights = _resolve_weights(weights, categories=categories)
    weighted_total = pd.Series(0.0, index=df.index)
    for category in categories:
        weighted_total += z_scores[f"z_{category}"] * effective_weights[category]

    ranked = pd.concat([df[["name"]], z_scores], axis=1)
    ranked["overall_score"] = weighted_total
    return ranked.sort_values("overall_score", ascending=False, kind="mergesort").reset_index(drop=True)


def rank_players_from_json(
    json_path: str | Path,
    weights: Mapping[str, float] | None = None,
    categories: Sequence[str] = BATTER_CATEGORIES,
    negative_categories: Iterable[str] = BATTER_NEGATIVE_CATEGORIES,
) -> pd.DataFrame:
    """Load JSON player records and return ranked rows."""
    records = load_players_from_json(json_path)
    return score_and_rank_players(
        records,
        weights=weights,
        categories=categories,
        negative_categories=negative_categories,
    )


if __name__ == "__main__":
    demo_players: list[dict[str, Any]] = [
        {
            "name": "Ronald Acuna Jr.",
            "R": 145,
            "H": 217,
            "2B": 35,
            "3B": 4,
            "HR": 41,
            "RBI": 106,
            "SB": 73,
            "BB": 80,
            "HBP": 9,
            "K": 84,
            "TB": 383,
            "AVG": 0.337,
            "SLG": 0.596,
        },
        {
            "name": "Mookie Betts",
            "R": 126,
            "H": 173,
            "2B": 40,
            "3B": 1,
            "HR": 39,
            "RBI": 107,
            "SB": 14,
            "BB": 96,
            "HBP": 8,
            "K": 107,
            "TB": 307,
            "AVG": 0.307,
            "SLG": 0.579,
        },
    ]

    ranked_players = score_and_rank_players(
        demo_players,
        weights=default_weights_for_categories(BATTER_CATEGORIES),
        categories=BATTER_CATEGORIES,
        negative_categories=BATTER_NEGATIVE_CATEGORIES,
    )

    display_columns = ["name", "overall_score", *[f"z_{category}" for category in BATTER_CATEGORIES]]
    pd.set_option("display.width", 200)
    pd.set_option("display.max_columns", None)

    print("Ranked hitters (descending overall_score):")
    print(ranked_players.loc[:, display_columns].to_string(index=False, float_format=lambda x: f"{x:0.3f}"))
