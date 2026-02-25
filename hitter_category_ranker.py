"""Fantasy baseball hitter evaluation with category-based z-scores.

Why z-scores are a strong fit for categories leagues:
Z-scores put every category on the same standardized scale, so counting
stats (for example HR) and rate stats (for example AVG, SLG) can be summed
fairly. This makes cross-category player comparison straightforward and
supports transparent weighting when league settings change.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Iterable, Mapping, Sequence

import numpy as np
import pandas as pd

CATEGORIES: tuple[str, ...] = (
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

NEGATIVE_CATEGORIES: frozenset[str] = frozenset({"K"})

WEIGHTS: dict[str, float] = {category: 1.0 for category in CATEGORIES}


def load_players_from_json(json_path: str | Path) -> list[dict[str, Any]]:
    """Load player records from a JSON file.

    Args:
        json_path: Path to a JSON file containing a list of player dictionaries.

    Returns:
        List of dictionaries with player statistics.

    Raises:
        ValueError: If the file content is not a list of records.
    """
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
    categories: Sequence[str] = CATEGORIES,
) -> pd.DataFrame:
    """Convert player records into a clean numeric dataframe.

    Missing category values are preserved as NaN initially and handled during
    z-score computation.
    """
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
    categories: Sequence[str] = CATEGORIES,
    negative_categories: Iterable[str] = NEGATIVE_CATEGORIES,
) -> pd.DataFrame:
    """Calculate per-category z-scores for all players.

    Formula:
        z = (player_value - league_mean) / league_std

    Behavior:
    - Missing values are imputed with league mean (neutral z-score impact).
    - Categories with zero standard deviation produce z-score 0.0 for all players.
    - Negative categories (for example strikeouts) are sign-inverted so that
      larger values reduce player value.
    """
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
    categories: Sequence[str] = CATEGORIES,
) -> dict[str, float]:
    """Validate and return a complete weight map for all categories."""
    if weights is None:
        return {category: float(WEIGHTS[category]) for category in categories}

    resolved = {category: float(weights.get(category, 1.0)) for category in categories}
    return resolved


def score_and_rank_players(
    player_records: Sequence[Mapping[str, Any]],
    weights: Mapping[str, float] | None = None,
) -> pd.DataFrame:
    """Score and rank players using weighted category z-scores.

    Overall formula:
        score = sum(z_score[category] * WEIGHTS[category])

    Returns:
        DataFrame sorted by overall_score descending, including per-category
        z-score columns for transparency.
    """
    df = _coerce_player_dataframe(player_records)
    z_scores = calculate_z_scores(df, categories=CATEGORIES, negative_categories=NEGATIVE_CATEGORIES)

    effective_weights = _resolve_weights(weights, categories=CATEGORIES)
    weighted_total = pd.Series(0.0, index=df.index)

    for category in CATEGORIES:
        weighted_total += z_scores[f"z_{category}"] * effective_weights[category]

    ranked = pd.concat([df[["name"]], z_scores], axis=1)
    ranked["overall_score"] = weighted_total

    return ranked.sort_values("overall_score", ascending=False, kind="mergesort").reset_index(drop=True)


def rank_players_from_json(
    json_path: str | Path,
    weights: Mapping[str, float] | None = None,
) -> pd.DataFrame:
    """Convenience wrapper to load JSON data and return ranked players."""
    records = load_players_from_json(json_path)
    return score_and_rank_players(records, weights=weights)


if __name__ == "__main__":
    # Small inline demo dataset.
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
        {
            "name": "Julio Rodriguez",
            "R": 102,
            "H": 180,
            "2B": 37,
            "3B": 2,
            "HR": 32,
            "RBI": 103,
            "SB": 37,
            "BB": 56,
            "HBP": 2,
            "K": 175,
            "TB": 306,
            "AVG": 0.275,
            "SLG": 0.485,
        },
        {
            "name": "Kyle Tucker",
            "R": 97,
            "H": 176,
            "2B": 29,
            "3B": 1,
            "HR": 29,
            "RBI": 112,
            "SB": 30,
            "BB": 74,
            "HBP": 13,
            "K": 104,
            "TB": 293,
            "AVG": 0.284,
            "SLG": 0.517,
        },
        {
            "name": "Bobby Witt Jr.",
            "R": 97,
            "H": 177,
            "2B": 28,
            "3B": 11,
            "HR": 30,
            "RBI": 96,
            "SB": 49,
            "BB": 57,
            "HBP": 11,
            "K": 130,
            "TB": 315,
            "AVG": 0.276,
            "SLG": 0.495,
        },
        {
            "name": "Partial Data Player",
            "R": 88,
            "H": None,
            "2B": 20,
            "3B": 3,
            "HR": 22,
            "RBI": 78,
            "SB": 18,
            "BB": 65,
            "HBP": None,
            "K": 160,
            "TB": 250,
            "AVG": 0.261,
            "SLG": None,
        },
    ]

    ranked_players = score_and_rank_players(demo_players, weights=WEIGHTS)

    display_columns = ["name", "overall_score", *[f"z_{category}" for category in CATEGORIES]]
    pd.set_option("display.width", 200)
    pd.set_option("display.max_columns", None)

    print("Ranked hitters (descending overall_score):")
    print(ranked_players.loc[:, display_columns].to_string(index=False, float_format=lambda x: f"{x:0.3f}"))
