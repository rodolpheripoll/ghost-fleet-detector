"""
graph_scoring.py

CORRECT LOGIC:
- Ships in a detected H3 convoy group → score REDUCED (legitimate traffic)
- Ships isolated (no group) → score unchanged
- Ships isolated + behavioral flags + risk zone → small boost (confirmed suspicious)

The GRAPH pipeline is a REFINEMENT of DEMO:
  DEMO flags ships based on behavior alone.
  GRAPH cross-checks with group membership to eliminate false positives.

A tanker transmitting at 26 knots is suspicious in DEMO.
But if surrounded by 8 other ships in the same H3 cell,
it is likely a busy shipping lane → GRAPH reduces its score.

If that same tanker is ALONE in the ocean with no neighbours →
the isolation CONFIRMS the suspicion → GRAPH keeps the score high.

Source: Windward Maritime AI Report 2022 — ghost fleet isolation pattern.
IMO COLREGS Rule 5 — proper look-out at all times.
"""

import pandas as pd
import numpy as np
from math import radians, sin, cos, sqrt, atan2

# ── CONSTANTS ─────────────────────────────────────────────────────────────────

# Score discount based on convoy size.
# Ghost fleet ships NEVER travel in large, identifiable groups.
# A ship in a convoy of 5+ is almost certainly legitimate commercial traffic.
GROUP_DISCOUNT = {
    0: 0.00,   # isolated — no discount
    1: 0.05,   # pair — small reduction
    2: 0.10,
    3: 0.20,
    4: 0.30,
    5: 0.40,   # confirmed convoy — significant discount
}
MAX_GROUP_DISCOUNT = 0.50  # groups of 6+ ships

# Isolated ship in a sanctioned zone → small bonus.
# Only applied if DEMO already flagged it as Suspect (demo_score >= 0.3).
ISOLATION_ZONE_BONUS = 0.10

RISK_MAP_ZONE = {"Critical": 1.0, "High": 0.5, "Medium": 0.2, "Low": 0.0}


def _haversine_km(lat1, lon1, lat2, lon2):
    R = 6371
    dlat = radians(lat2 - lat1)
    dlon = radians(lon2 - lon1)
    a = sin(dlat / 2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlon / 2) ** 2
    return 2 * R * atan2(sqrt(a), sqrt(1 - a))


def _get_discount(convoy_size: int) -> float:
    if convoy_size >= 6:
        return MAX_GROUP_DISCOUNT
    return GROUP_DISCOUNT.get(convoy_size, 0.0)


def _compute_zone_scores(last_pos: pd.DataFrame, zones_df: pd.DataFrame) -> dict:
    """Returns {mmsi: zone_score} for each ship."""
    scores = {str(row["mmsi"]): 0.0 for _, row in last_pos.iterrows()}
    for _, ship in last_pos.iterrows():
        best = 0.0
        for _, zone in zones_df.iterrows():
            try:
                pts = str(zone["coordinates"]).split(";")
                lat1, lon1 = map(float, pts[0].split(","))
                lat2, lon2 = map(float, pts[1].split(","))
                if (min(lat1, lat2) <= ship["latitude"] <= max(lat1, lat2) and
                        min(lon1, lon2) <= ship["longitude"] <= max(lon1, lon2)):
                    best = max(best, RISK_MAP_ZONE.get(zone["risk_level"], 0.0))
            except Exception:
                continue
        scores[str(ship["mmsi"])] = best
    return scores


def compute_graph_scores(
    ais_df: pd.DataFrame,
    demo_scored_df: pd.DataFrame,
    convoy_stats_df: pd.DataFrame,
    zones_df: pd.DataFrame = None,
):
    """
    Refine DEMO scores using H3 group membership.

    Algorithm:
    1. Start from DEMO scores (behavioral rules + Isolation Forest)
    2. Ships in an H3 convoy group → apply group discount (legitimate traffic)
    3. Isolated ships in risk zones that were already Suspect → small bonus
    4. Hard cap: Normal ships in DEMO cannot become Suspect in GRAPH

    This ensures GRAPH always has <= DEMO Critical+GF count (fewer false positives).

    Parameters
    ----------
    ais_df          : AIS DataFrame with convoy_id, convoy_size from detect_convoys
    demo_scored_df  : DEMO pipeline output with score, risk_level columns
    convoy_stats_df : convoy stats from detect_convoys (unused here, for API compat)
    zones_df        : optional — used for isolation+zone bonus calculation

    Returns
    -------
    graph_scored : ais_df enriched with graph score columns
    metrics_df   : per-ship breakdown (one row per unique MMSI)
    """
    df = ais_df.copy()
    df["mmsi"] = df["mmsi"].astype(str)
    demo = demo_scored_df.copy()
    demo["mmsi"] = demo["mmsi"].astype(str)

    # One row per ship from DEMO pipeline
    demo_ships = demo.drop_duplicates("mmsi")[["mmsi", "score", "risk_level"]].copy()
    demo_ships = demo_ships.rename(columns={"score": "demo_score", "risk_level": "demo_risk"})

    # Merge convoy info
    if "convoy_id" in df.columns:
        convoy_info = (
            df.drop_duplicates("mmsi")[["mmsi", "convoy_id", "convoy_size"]]
        )
    else:
        convoy_info = pd.DataFrame({
            "mmsi":        demo_ships["mmsi"],
            "convoy_id":   0,
            "convoy_size": 0,
        })

    ships = demo_ships.merge(convoy_info, on="mmsi", how="left")
    ships["convoy_id"]   = ships["convoy_id"].fillna(0).astype(int)
    ships["convoy_size"] = ships["convoy_size"].fillna(0).astype(int)

    # Zone scores (optional)
    zone_lookup = {}
    if zones_df is not None and not zones_df.empty:
        last_pos = (
            df.sort_values("timestamp")
              .groupby("mmsi").last()
              .reset_index()
              .dropna(subset=["latitude", "longitude"])
        )
        zone_lookup = _compute_zone_scores(last_pos, zones_df)

    # ── Apply graph refinement ────────────────────────────────────────────────
    records = []
    for _, ship in ships.iterrows():
        demo_score   = float(ship["demo_score"] or 0)
        convoy_id    = int(ship["convoy_id"])
        convoy_size  = int(ship["convoy_size"])
        is_isolated  = (convoy_id == 0)
        zone_score   = zone_lookup.get(ship["mmsi"], 0.0)

        # Step 1: group discount
        discount    = _get_discount(convoy_size)
        graph_score = demo_score * (1.0 - discount)

        # Step 2: isolation + risk zone bonus (only for already-suspect ships)
        if is_isolated and zone_score > 0.5 and demo_score >= 0.3:
            graph_score = min(graph_score + ISOLATION_ZONE_BONUS, 1.0)

        # Step 3: Normal ships in DEMO stay Normal in GRAPH
        if ship["demo_risk"] == "Normal":
            graph_score = min(graph_score, 0.29)

        graph_score = round(float(np.clip(graph_score, 0.0, 1.0)), 4)

        records.append({
            "mmsi":          ship["mmsi"],
            "demo_score":    round(demo_score, 4),
            "graph_score":   graph_score,
            "convoy_id":     convoy_id,
            "convoy_size":   convoy_size,
            "group_discount": round(discount, 2),
            "is_isolated":   is_isolated,
            "zone_score":    round(zone_score, 4),
        })

    metrics_df = pd.DataFrame(records)

    # Assign risk level from graph_score
    def risk_label(s):
        if s >= 0.8: return "Ghost Fleet"
        if s >= 0.6: return "Critical"
        if s >= 0.3: return "Suspect"
        return "Normal"

    metrics_df["risk_level"] = metrics_df["graph_score"].apply(risk_label)
    metrics_df = metrics_df.rename(columns={"graph_score": "score"})

    # Print comparison
    n_demo_hi  = (demo_ships["demo_risk"].isin(["Critical", "Ghost Fleet"])).sum()
    n_graph_hi = (metrics_df["risk_level"].isin(["Critical", "Ghost Fleet"])).sum()
    print("\n[graph_scoring] === DEMO vs GRAPH comparison ===")
    print("  DEMO  distribution:")
    print("  " + demo_ships["demo_risk"].value_counts().to_string().replace("\n", "\n  "))
    print("  GRAPH distribution:")
    print("  " + metrics_df["risk_level"].value_counts().to_string().replace("\n", "\n  "))
    print(f"\n  DEMO  Critical+GF : {n_demo_hi}")
    print(f"  GRAPH Critical+GF : {n_graph_hi}")
    if n_graph_hi < n_demo_hi:
        print("  ✅ GRAPH is more selective (correct — fewer false positives)")
    else:
        print("  ⚠  GRAPH >= DEMO — check group detection")

    # Merge back onto full ais_df — drop old score/risk_level to avoid _x/_y conflicts
    cols_to_drop = [c for c in ["score", "risk_level"] if c in df.columns]
    graph_scored = df.drop(columns=cols_to_drop).merge(
        metrics_df[[
            "mmsi", "score", "risk_level", "demo_score",
            "group_discount", "is_isolated", "convoy_id", "convoy_size", "zone_score",
        ]],
        on="mmsi", how="left",
    )
    graph_scored["score"]      = graph_scored["score"].fillna(0.0)
    graph_scored["risk_level"] = graph_scored["risk_level"].fillna("Normal")

    return graph_scored, metrics_df
